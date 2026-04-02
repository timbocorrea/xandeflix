import 'dotenv/config';
import express from 'express';
import path from 'path';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import cors from 'cors';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'url';

// Import Services

import { CacheManager } from './server/services/CacheManager.js';
import { AdminService } from './server/services/AdminService.js';
import { AuthSessionService } from './server/services/AuthSessionService.js';
import { PlayerTelemetryService } from './server/services/PlayerTelemetryService.js';
import { TMDBService } from './server/services/TMDBService.js';

// Import Middleware
import { whitelistMiddleware, securityHeadersMiddleware } from './server/middleware/security.js';
import { adminAuthMiddleware } from './server/middleware/adminAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMPILED_SERVER_MARKER = `${path.sep}dist${path.sep}server${path.sep}`;
const isCompiledServerRuntime = __filename.includes(COMPILED_SERVER_MARKER);
const isProductionRuntime =
  process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL) || isCompiledServerRuntime;

// Debug environment
console.log(`[CONFIG] ALLOW_ALL_DOMAINS: ${process.env.ALLOW_ALL_DOMAINS}`);
console.log(`[CONFIG] NODE_ENV: ${process.env.NODE_ENV || (isProductionRuntime ? 'production' : 'development')}`);
console.log(`[SECURITY] Mode: ${isProductionRuntime && process.env.ALLOW_ALL_DOMAINS !== 'true' ? 'STRICT' : 'BYPASS'}`);

/**
 * Global State & Cache Configuration
 */
const authorizedDomains = new Set<string>(['dnsd1.space']);
if (!isProductionRuntime || process.env.ALLOW_ALL_DOMAINS === 'true') {
  authorizedDomains.add('localhost');
  authorizedDomains.add('127.0.0.1');
}

// Seed whitelist from environment (additional domains)
if (process.env.AUTHORIZED_DOMAINS) {
  process.env.AUTHORIZED_DOMAINS.split(',').forEach(dom => {
    const d = dom.trim().toLowerCase();
    if (d) {
       authorizedDomains.add(d);
       console.log(`[SECURITY] Manually whitelisted domain: ${d}`);
    }
  });
}
function getRequestAuthToken(req: express.Request): string | undefined {
  const token = req.headers['x-auth-token'] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  return Array.isArray(token) ? token[0] : token;
}

function getProxyRequestAuthToken(req: express.Request): string | undefined {
  const headerToken = getRequestAuthToken(req);
  if (headerToken) {
    return headerToken;
  }

  const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  return queryToken || undefined;
}

function registerAuthorizedDomainFromUrl(targetUrl: string) {
  try {
    const hostname = new URL(targetUrl).hostname.toLowerCase();
    if (!authorizedDomains.has(hostname)) {
      authorizedDomains.add(hostname);
      console.log(`[SECURITY] Whitelisted domain: ${hostname}`);
    }
  } catch {
    // Ignore invalid URLs here; validation happens at call sites.
  }
}

function isAllowedPlaylistUrl(targetUrl: string): boolean {
  if (process.env.ALLOW_ALL_DOMAINS === 'true') return true;
  try {
    const hostname = new URL(targetUrl).hostname.toLowerCase();
    return authorizedDomains.has(hostname);
  } catch {
    return false;
  }
}

function isRemoteHttpUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getUrlHostLabel(targetUrl: string): string {
  try {
    return new URL(targetUrl).host.toLowerCase();
  } catch {
    return 'invalid-url';
  }
}

function isSameRemoteHost(leftUrl: string, rightUrl: string): boolean {
  try {
    return new URL(leftUrl).hostname.toLowerCase() === new URL(rightUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
}

function extractUrlTvgFromM3u(rawText: string): string | null {
  const firstNonEmptyLine = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstNonEmptyLine || !firstNonEmptyLine.toUpperCase().startsWith('#EXTM3U')) {
    return null;
  }

  const match = firstNonEmptyLine.match(/\burl-tvg=(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
  return (match?.[1] || match?.[2] || match?.[3] || '').trim() || null;
}

async function resolveAuthorizedUserResourceUrl(
  requestedUrl: string,
  userPlaylistUrl: string,
): Promise<string | null> {
  if (!requestedUrl) {
    return userPlaylistUrl;
  }

  if (!isRemoteHttpUrl(requestedUrl)) {
    return null;
  }

  if (requestedUrl === userPlaylistUrl || isAllowedPlaylistUrl(requestedUrl)) {
    return requestedUrl;
  }

  try {
    const response = await axios.get(userPlaylistUrl, {
      timeout: 15000,
      responseType: 'text',
      headers: {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
        'Accept': '*/*',
      }
    });

    const epgUrl = extractUrlTvgFromM3u(typeof response.data === 'string' ? response.data : '');
    if (epgUrl && epgUrl === requestedUrl && isRemoteHttpUrl(epgUrl)) {
      registerAuthorizedDomainFromUrl(epgUrl);
      return epgUrl;
    }
  } catch (error) {
    console.warn(
      `[SECURITY] Failed to validate requested proxy URL against user playlist host ${getUrlHostLabel(userPlaylistUrl)}:`,
      error,
    );
  }

  return null;
}

async function isKnownManagedPlaylistUrl(targetUrl: string): Promise<boolean> {
  const normalizedTarget = targetUrl.trim();
  if (!normalizedTarget) return false;

  try {
    const users = await AdminService.listUsers();
    return users.some((user) => (user.playlistUrl || '').trim() === normalizedTarget);
  } catch (error) {
    console.warn('[SECURITY] Failed to verify managed playlist URL:', error);
    return false;
  }
}

async function isKnownManagedPlaylistHost(targetUrl: string): Promise<boolean> {
  try {
    const targetHost = new URL(targetUrl).hostname.toLowerCase();
    const users = await AdminService.listUsers();

    return users.some((user) => {
      if (!user.playlistUrl) {
        return false;
      }

      try {
        return new URL(user.playlistUrl).hostname.toLowerCase() === targetHost;
      } catch {
        return false;
      }
    });
  } catch (error) {
    console.warn('[SECURITY] Failed to verify managed playlist host:', error);
    return false;
  }
}

function serializeUser(user: {
  id: string;
  name: string;
  username: string;
  playlistUrl: string;
  isBlocked: boolean;
  lastAccess?: string;
  adultPassword?: string;
  adultTotpSecret?: string;
  adultTotpEnabled?: boolean;
}) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    playlistUrl: user.playlistUrl,
    isBlocked: user.isBlocked,
    lastAccess: user.lastAccess,
    adultAccess: AdminService.getAdultAccessSummary(user),
  };
}

async function getAuthenticatedUser(req: express.Request) {
  const session = AuthSessionService.getSession(getRequestAuthToken(req));
  return getAuthenticatedUserFromSession(session);
}

async function getAuthenticatedUserFromSession(
  session: ReturnType<typeof AuthSessionService.getSession>,
) {
  if (!session || session.role !== 'user' || !session.userId) {
    return { session: null, user: null };
  }

  const user = await AdminService.getUserById(session.userId);
  if (!user || user.isBlocked) {
    return { session, user: null };
  }

  if (user.playlistUrl) {
    registerAuthorizedDomainFromUrl(user.playlistUrl);
  }

  return { session, user };
}

async function fetchRemoteText(targetUrl: string): Promise<{ text: string; finalUrl: string }> {
  const response = await axios.get(targetUrl, {
    timeout: 20000,
    responseType: 'text',
    maxRedirects: 5,
    headers: {
      'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
      'Accept': '*/*',
    },
  });

  const finalUrl = ((response.request as any)?.res?.responseUrl as string | undefined) || targetUrl;
  return {
    text: typeof response.data === 'string' ? response.data : '',
    finalUrl,
  };
}

function extractPlaylistReferences(rawText: string, baseUrl: string): string[] {
  const references = new Set<string>();
  const uriAttributeRegex = /\bURI=(?:"([^"]+)"|'([^']+)'|([^,\s]+))/gi;

  const pushResolvedUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    try {
      const resolved = new URL(trimmed, baseUrl).toString();
      if (isRemoteHttpUrl(resolved)) {
        references.add(resolved);
      }
    } catch {
      // Ignore malformed child URLs from provider playlists.
    }
  };

  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (!trimmed.startsWith('#')) {
      pushResolvedUrl(trimmed);
      continue;
    }

    uriAttributeRegex.lastIndex = 0;
    let match: RegExpExecArray | null = null;
    while ((match = uriAttributeRegex.exec(trimmed)) !== null) {
      pushResolvedUrl(match[1] || match[2] || match[3] || '');
    }
  }

  return Array.from(references);
}

async function playlistReferencesChildUrl(parentUrl: string, childUrl: string): Promise<boolean> {
  try {
    const normalizedChild = new URL(childUrl).toString();
    const { text, finalUrl } = await fetchRemoteText(parentUrl);
    const references = extractPlaylistReferences(text, finalUrl);
    return references.includes(normalizedChild);
  } catch (error) {
    console.warn(
      `[SECURITY] Failed to validate child media URL against parent host ${getUrlHostLabel(parentUrl)}:`,
      error,
    );
    return false;
  }
}

async function resolveAuthorizedChildMediaUrl(
  requestedUrl: string,
  options: {
    rootUrl?: string;
    parentUrl?: string;
    isDirectlyAuthorized: (url: string) => Promise<boolean>;
  },
): Promise<string | null> {
  if (!requestedUrl || !isRemoteHttpUrl(requestedUrl)) {
    return null;
  }

  if (await options.isDirectlyAuthorized(requestedUrl)) {
    return requestedUrl;
  }

  const rootUrl = options.rootUrl?.trim();
  if (!rootUrl || !isRemoteHttpUrl(rootUrl) || !(await options.isDirectlyAuthorized(rootUrl))) {
    return null;
  }

  const parentUrl = options.parentUrl && isRemoteHttpUrl(options.parentUrl)
    ? options.parentUrl.trim()
    : rootUrl;

  if (parentUrl !== rootUrl) {
    const parentAuthorized = await playlistReferencesChildUrl(rootUrl, parentUrl);
    if (!parentAuthorized) {
      return null;
    }
  }

  const childAuthorized = await playlistReferencesChildUrl(parentUrl, requestedUrl);
  return childAuthorized ? requestedUrl : null;
}

async function resolveAuthorizedUserMediaUrl(
  requestedUrl: string,
  userPlaylistUrl: string,
  rootUrl?: string,
  parentUrl?: string,
): Promise<string | null> {
  const resolvedUrl = await resolveAuthorizedChildMediaUrl(requestedUrl, {
    rootUrl,
    parentUrl,
    isDirectlyAuthorized: async (candidateUrl) =>
      isSameRemoteHost(candidateUrl, userPlaylistUrl) || isAllowedPlaylistUrl(candidateUrl),
  });

  if (resolvedUrl) {
    return resolvedUrl;
  }

  // Direct VOD entries often point to a CDN host different from the playlist host.
  // For native app playback, allow the media URL when it is explicitly referenced
  // by the authenticated user's own M3U playlist.
  const referencedByUserPlaylist = await playlistReferencesChildUrl(userPlaylistUrl, requestedUrl);
  return referencedByUserPlaylist ? requestedUrl : null;
}

async function resolveAuthorizedAdminMediaUrl(
  requestedUrl: string,
  rootUrl?: string,
  parentUrl?: string,
): Promise<string | null> {
  return resolveAuthorizedChildMediaUrl(requestedUrl, {
    rootUrl,
    parentUrl,
    isDirectlyAuthorized: async (candidateUrl) =>
      isAllowedPlaylistUrl(candidateUrl) ||
      await isKnownManagedPlaylistUrl(candidateUrl) ||
      await isKnownManagedPlaylistHost(candidateUrl),
  });
}

function buildProxyMediaPath(
  targetUrl: string,
  token: string,
  options?: {
    rootUrl?: string;
    parentUrl?: string;
  },
): string {
  const params = new URLSearchParams({
    url: targetUrl,
    token,
  });

  if (options?.rootUrl) {
    params.set('root', options.rootUrl);
  }

  if (options?.parentUrl) {
    params.set('parent', options.parentUrl);
  }

  return `/api/proxy-media?${params.toString()}`;
}

function rewriteHlsPlaylist(
  rawText: string,
  baseUrl: string,
  token: string,
  options?: {
    rootUrl?: string;
    parentUrl?: string;
  },
): string {
  const rootUrl = options?.rootUrl || baseUrl;
  const parentUrl = options?.parentUrl || baseUrl;
  const uriAttributeRegex = /\bURI=(?:"([^"]+)"|'([^']+)'|([^,\s]+))/gi;

  const proxify = (value: string) => {
    const absoluteUrl = new URL(value, baseUrl).toString();
    return buildProxyMediaPath(absoluteUrl, token, {
      rootUrl,
      parentUrl,
    });
  };

  return rawText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }

      if (!trimmed.startsWith('#')) {
        try {
          return proxify(trimmed);
        } catch {
          return line;
        }
      }

      return line.replace(uriAttributeRegex, (match, quoted, singleQuoted, bare) => {
        const rawValue = quoted || singleQuoted || bare || '';
        if (!rawValue) {
          return match;
        }

        try {
          return `URI="${proxify(rawValue)}"`;
        } catch {
          return match;
        }
      });
    })
    .join('\n');
}

function isHlsResponse(contentType: unknown, targetUrl: string): boolean {
  const normalizedType = String(contentType || '').toLowerCase();
  const normalizedUrl = targetUrl.toLowerCase();

  return (
    normalizedType.includes('application/vnd.apple.mpegurl') ||
    normalizedType.includes('application/x-mpegurl') ||
    normalizedType.includes('audio/mpegurl') ||
    normalizedUrl.includes('.m3u8')
  );
}

function copyUpstreamMediaHeaders(res: express.Response, headers: Record<string, unknown>) {
  const passthroughHeaders = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'cache-control',
    'etag',
    'last-modified',
    'expires',
  ];

  for (const headerName of passthroughHeaders) {
    const headerValue = headers[headerName];
    if (typeof headerValue === 'string' && headerValue.length > 0) {
      res.setHeader(headerName, headerValue);
    }
  }
}


// Seed whitelist from environment
if (process.env.PLAYLIST_URL) {
  try {
    const url = new URL(process.env.PLAYLIST_URL);
    registerAuthorizedDomainFromUrl(url.toString());
  } catch (e) {
    console.warn('[SECURITY] Invalid PLAYLIST_URL in environment.');
  }
}

// Initialize AdminService (load users.json)
AdminService.initialize();

// =============================================
// EXPRESS APP — All routes registered SYNCHRONOUSLY
// =============================================
const app = express();

// Apply base middlewares
app.use(cors());
app.use(express.json());

// Apply rate limiting to all API routes
// We use a relatively high limit (2000) because browsing a large IPTV catalog 
// triggers many metadata/TMDB lookups from the UI.
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 2000, 
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => process.env.NODE_ENV === 'development' || req.path.includes('/proxy-media'),
});
app.use('/api', apiLimiter);

// Rota de Teste (Ping)
app.get('/api/ping', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));



app.use(compression());
app.use(securityHeadersMiddleware);

/**
 * API Route: Proxy playlist content to avoid CORS issues
 */
app.get('/api/proxy-playlist', async (req, res) => {
  try {
    const session = AuthSessionService.getSession(getRequestAuthToken(req));
    if (!session) {
      return res.status(401).json({ error: 'Sessão inválida ou não autorizado' });
    }

    const requestedUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    let playlistUrl = requestedUrl;
    if (session.role === 'user') {
      const { user } = await getAuthenticatedUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Sessao invalida ou nao autorizado' });
      }

      const resolvedUserUrl = await resolveAuthorizedUserResourceUrl(requestedUrl, user.playlistUrl);
      if (!resolvedUserUrl) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'A URL solicitada nao esta autorizada para este usuario.',
        });
      }

      playlistUrl = resolvedUserUrl;
    }

    if (!playlistUrl) {
      return res.status(400).json({ error: 'URL da playlist é obrigatória' });
    }

    if (!isRemoteHttpUrl(playlistUrl)) {
      return res.status(400).json({ error: 'URL da playlist invalida' });
    }

    if (session.role === 'admin') {
      const isKnownPlaylist = await isKnownManagedPlaylistUrl(playlistUrl);
      if (!isAllowedPlaylistUrl(playlistUrl) && !isKnownPlaylist) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'A URL solicitada nao esta autorizada para uso no proxy.',
        });
      }

      if (isKnownPlaylist) {
        registerAuthorizedDomainFromUrl(playlistUrl);
      }
    } else if (!isAllowedPlaylistUrl(playlistUrl)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'A URL da playlist do usuario nao esta autorizada.',
      });
    }

    console.log(`[PROXY] Buscando conteudo para host ${getUrlHostLabel(playlistUrl)} [Role: ${session.role}]`);

    const response = await axios.get(playlistUrl, {
      timeout: 30000,
      responseType: 'text',
      headers: {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
        'Accept': '*/*',
      }
    });

    if (typeof response.data === 'string') {
      const epgUrl = extractUrlTvgFromM3u(response.data);
      if (epgUrl && isRemoteHttpUrl(epgUrl)) {
        registerAuthorizedDomainFromUrl(epgUrl);
      }
    }

    res.header('Content-Type', 'text/plain');
    res.send(response.data);
  } catch (error: any) {
    console.error('[PROXY] Erro ao buscar playlist remota:', error.message);
    res.status(500).json({ error: 'Falha ao buscar conteúdo remoto', details: error.message });
  }
});

app.get(['/api/proxy-media', '/api/proxy-media/stream.mp4', '/api/proxy-media/stream.m3u8'], async (req, res) => {
  try {
    const session = AuthSessionService.getSession(getProxyRequestAuthToken(req));
    if (!session) {
      return res.status(401).json({ error: 'Sessao invalida ou nao autorizado' });
    }

    const requestedUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const rootUrl = typeof req.query.root === 'string' ? req.query.root.trim() : '';
    const parentUrl = typeof req.query.parent === 'string' ? req.query.parent.trim() : '';
    const proxyToken = getProxyRequestAuthToken(req) || '';

    if (!requestedUrl) {
      return res.status(400).json({ error: 'URL da midia e obrigatoria' });
    }

    if (!isRemoteHttpUrl(requestedUrl)) {
      return res.status(400).json({ error: 'URL da midia invalida' });
    }

    let mediaUrl = requestedUrl;

    if (session.role === 'user') {
      const { user } = await getAuthenticatedUserFromSession(session);
      if (!user) {
        return res.status(401).json({ error: 'Sessao invalida ou nao autorizado' });
      }

      const resolvedUserUrl = await resolveAuthorizedUserMediaUrl(
        requestedUrl,
        user.playlistUrl,
        rootUrl,
        parentUrl,
      );

      if (!resolvedUserUrl) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'A URL de midia solicitada nao esta autorizada para este usuario.',
        });
      }

      mediaUrl = resolvedUserUrl;
    } else {
      const resolvedAdminUrl = await resolveAuthorizedAdminMediaUrl(requestedUrl, rootUrl, parentUrl);
      if (!resolvedAdminUrl) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'A URL de midia solicitada nao esta autorizada para uso no proxy.',
        });
      }

      mediaUrl = resolvedAdminUrl;
    }

    const upstreamHeaders: Record<string, string> = {
      'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
      'Accept': typeof req.headers.accept === 'string' ? req.headers.accept : '*/*',
      'Accept-Encoding': 'identity',
    };

    if (typeof req.headers.range === 'string' && req.headers.range.trim()) {
      upstreamHeaders.Range = req.headers.range;
    }

    const upstreamResponse = await axios.get(mediaUrl, {
      timeout: 0,
      responseType: 'stream',
      maxRedirects: 5,
      decompress: false, // Prevent Axios from stripping Content-Length
      validateStatus: () => true,
      headers: upstreamHeaders,
    });

    const finalResponseUrl = ((upstreamResponse.request as any)?.res?.responseUrl as string | undefined) || mediaUrl;
    const contentType = upstreamResponse.headers['content-type'];

    if (isHlsResponse(contentType, finalResponseUrl)) {
      const chunks: Buffer[] = [];
      for await (const chunk of upstreamResponse.data as AsyncIterable<Buffer | string>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const rewrittenPlaylist = rewriteHlsPlaylist(
        Buffer.concat(chunks).toString('utf8'),
        finalResponseUrl,
        proxyToken,
        {
          rootUrl: rootUrl || requestedUrl,
          parentUrl: requestedUrl,
        },
      );

      res.status(upstreamResponse.status);
      res.setHeader('Content-Type', typeof contentType === 'string' ? contentType : 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(rewrittenPlaylist);
    }

    res.status(upstreamResponse.status);
    copyUpstreamMediaHeaders(res, upstreamResponse.headers as Record<string, unknown>);

    const upstreamStream = upstreamResponse.data as NodeJS.ReadableStream;
    upstreamStream.on('error', (error) => {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Falha ao transmitir midia remota', details: String(error) });
      } else {
        res.end();
      }
    });

    res.on('close', () => {
      if ('destroy' in upstreamStream && typeof upstreamStream.destroy === 'function') {
        upstreamStream.destroy();
      }
    });

    upstreamStream.pipe(res);
  } catch (error: any) {
    console.error('[PROXY-MEDIA] Erro ao transmitir midia remota:', error.message);
    res.status(500).json({ error: 'Falha ao transmitir midia remota', details: error.message });
  }
});

/**
 * API Route: Get metadata for a specific media from TMDB
 */
app.get('/api/metadata', async (req, res) => {
  const { title, type } = req.query;

  if (!title || !type) {
    return res.status(400).json({ error: 'Title and Type (movie/series) are required parameters.' });
  }

  console.log(`[TMDB] Metadata search: "${title}" (${type})`);

  try {
    const metadata = await TMDBService.searchMedia(title as string, type as 'movie' | 'series');
    console.log(`[TMDB] ${metadata ? 'Match' : 'No result'} for: "${title}"`);
    res.json(metadata);
  } catch (error: any) {
    console.error(`[TMDB] API Processing Error for "${title}": ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch metadata', details: error.message });
  }
});

/**
 * API Route: Diagnostic helper
 */
app.get('/api/diagnostic', whitelistMiddleware(authorizedDomains), async (req, res) => {
  const session = AuthSessionService.getSession(getRequestAuthToken(req));
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let testUrl = req.query.url as string || process.env.PLAYLIST_URL || '';


  try {
    console.log('[DIAGNOSTIC] Probing:', testUrl.substring(0, 50) + '...');
    const startTime = Date.now();

    const response = await axios.get(testUrl, {
      timeout: 10000,
      validateStatus: () => true,
      maxRedirects: 3
    });

    res.json({
      status: response.status,
      duration: `${Date.now() - startTime}ms`,
      url: testUrl,
      success: response.status >= 200 && response.status < 400,
      message: 'Conexão estabelecida com sucesso.'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * API Route: Authentication
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, token } = req.body;
    if (!identifier) return res.status(400).json({ error: 'Identifier is required' });

    const result = await AdminService.authenticate(identifier, token);
    if (result) {
      const sessionToken = AuthSessionService.issueSession(result.type, result.data?.id);
      if (result.type === 'user' && result.data?.playlistUrl) {
        registerAuthorizedDomainFromUrl(result.data.playlistUrl);
      }

      const responseBody = {
        ...result,
        sessionToken,
        data: result.data
          ? serializeUser(result.data)
          : undefined,
      };

      res.json(responseBody);
    } else {
      res.status(401).json({ error: 'Credenciais inválidas ou acesso bloqueado.' });
    }
  } catch (e: any) {
    console.error('[AUTH] Login error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const { user } = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json(serializeUser(user));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/session', async (req, res) => {
  try {
    const session = AuthSessionService.getSession(getRequestAuthToken(req));
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (session.role === 'admin') {
      return res.json({ role: 'admin' });
    }

    if (!session.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { user } = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json({
      role: 'user',
      data: serializeUser(user),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/user/adult-access/unlock', async (req, res) => {
  try {
    const { user } = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { password } = req.body || {};
    const adultAccess = await AdminService.verifyAdultAccess(user.id, password || '');
    res.json({ ok: true, adultAccess });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/user/adult-access/password', async (req, res) => {
  try {
    const { user } = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { newPassword, currentPassword, totpCode } = req.body || {};
    const adultAccess = await AdminService.setAdultPassword(
      user.id,
      newPassword || '',
      currentPassword,
      totpCode,
    );

    res.json({ ok: true, adultAccess });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/user/adult-access/totp/setup', async (req, res) => {
  try {
    const { user } = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { adultPassword } = req.body || {};
    const setup = await AdminService.beginAdultTotpSetup(user.id, adultPassword || '');
    res.json({ ok: true, ...setup });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/user/adult-access/totp/verify', async (req, res) => {
  try {
    const { user } = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { adultPassword, pendingSecret, code } = req.body || {};
    const adultAccess = await AdminService.confirmAdultTotpSetup(
      user.id,
      adultPassword || '',
      pendingSecret || '',
      code || '',
    );

    res.json({ ok: true, adultAccess });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/user/adult-access/totp/disable', async (req, res) => {
  try {
    const { user } = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { adultPassword, code } = req.body || {};
    const adultAccess = await AdminService.disableAdultTotp(user.id, adultPassword || '', code || '');
    res.json({ ok: true, adultAccess });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/player-telemetry', async (req, res) => {
  try {
    const body = req.body || {};
    const session = AuthSessionService.getSession(getRequestAuthToken(req) || body.authToken);
    const result = await PlayerTelemetryService.record(body, session);
    res.status(202).json(result);
  } catch (e: any) {
    console.error('[TELEMETRY] Erro ao registrar resumo do player:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Admin API Routes
 */
app.get('/api/admin/users', adminAuthMiddleware, async (req, res) => {
  try {
    const users = await AdminService.listUsers();
    res.json(users.map((user) => AdminService.toPublicUser(user)));
  } catch (e: any) {
    console.error('[API] Erro detalhado ao listar usuários no Admin:', e);
    res.status(500).json({ 
      error: e.message || 'Erro interno no servidor (Provável falha de conexão com o Banco)',
      details: e.details || null,
      hint: 'Verifique se as variáveis VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY estão configuradas na Vercel.'
    });
  }
});

app.get('/api/admin/player-telemetry', adminAuthMiddleware, async (req, res) => {
  try {
    const hours = Number(req.query.hours || 24);
    const summary = await PlayerTelemetryService.getSummary(hours);
    res.json(summary);
  } catch (e: any) {
    console.error('[ADMIN-API] Erro ao buscar telemetria do player:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/user/add', adminAuthMiddleware, async (req, res) => {
  try {
    const { name, playlistUrl, username, password } = req.body;
    const user = await AdminService.addUser(name, playlistUrl, username, password);
    if (user.playlistUrl) {
      registerAuthorizedDomainFromUrl(user.playlistUrl);
    }
    res.status(201).json(AdminService.toPublicUser(user));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/user/status', adminAuthMiddleware, async (req, res) => {
  try {
    const { userId, blocked } = req.body;
    const success = await AdminService.toggleUserStatus(userId, blocked);
    if (success) res.sendStatus(200);
    else res.status(404).send('User not found');
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/user/update', adminAuthMiddleware, async (req, res) => {
  try {
    const { userId, ...data } = req.body;
    const success = await AdminService.updateUser(userId, data);
    if (success && data.playlistUrl) {
      registerAuthorizedDomainFromUrl(data.playlistUrl);
    }
    if (success) res.sendStatus(200);
    else res.status(404).send('User not found');
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/user/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const success = await AdminService.deleteUser(req.params.id);
    if (success) res.sendStatus(200);
    else res.status(404).send('User not found');
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * API Route: Save hidden categories for a user.
 * Note: Client-side decentralization means the Admin Panel now fetches
 * and parses the .m3u itself to show the category list.
 */
app.post('/api/admin/user/:id/hiddenCategories', adminAuthMiddleware, async (req, res) => {
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: 'categories must be an array' });
    }
    const success = await AdminService.updateHiddenCategories(req.params.id, categories);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Usuário não encontrado ou erro ao salvar no banco' });
    }
  } catch (err: any) {
    console.error(`[ADMIN] Erro ao salvar categorias ocultas:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/user/:id/categoryOverrides', adminAuthMiddleware, async (req, res) => {
  try {
    const { overrides } = req.body;
    if (typeof overrides !== 'object' || overrides === null) {
      return res.status(400).json({ error: 'overrides must be an object' });
    }
    const success = await AdminService.updateCategoryOverrides(req.params.id, overrides);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Usuário não encontrado ou erro ao salvar no banco' });
    }
  } catch (err: any) {
    console.error(`[ADMIN] Erro ao salvar overrides de categorias:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/user/:id/mediaOverrides', adminAuthMiddleware, async (req, res) => {
  try {
    const { overrides } = req.body;
    if (typeof overrides !== 'object' || overrides === null) {
      return res.status(400).json({ error: 'overrides must be an object' });
    }
    const success = await AdminService.updateMediaOverrides(req.params.id, overrides);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Usuário não encontrado ou erro ao salvar no banco' });
    }
  } catch (err: any) {
    console.error(`[ADMIN] Erro ao salvar overrides de mídia:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/globalMediaOverride', adminAuthMiddleware, async (req, res) => {
  try {
    const { itemTitle, override } = req.body;
    if (!itemTitle || !override) {
      return res.status(400).json({ error: 'itemTitle and override required' });
    }
    const success = await AdminService.updateGlobalMediaOverride(itemTitle, override);
    res.json({ success });
  } catch (err: any) {
    console.error(`[ADMIN] Erro ao salvar override global:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Middleware de Erro Global
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[FATAL ERROR]', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

// Export for Vercel serverless
export default app;

// =============================================
// LOCAL DEV SERVER — only runs locally
// =============================================
async function startLocalServer() {
  if (process.env.VERCEL) return; // Skip on Vercel

  const PORT = Number(process.env.PORT || 3000);

  // In development, use Vite middleware for HMR
  if (!isProductionRuntime) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Xandeflix running: http://localhost:${PORT}`);
    console.log(`[SERVER] Mode: ${isProductionRuntime ? 'production' : 'development'}`);
  });
}

const isDirectExecution = (() => {
  const entryFile = process.argv[1];
  if (!entryFile) return false;

  try {
    return path.resolve(entryFile) === __filename;
  } catch {
    return false;
  }
})();

if (isDirectExecution) {
  startLocalServer();
}
