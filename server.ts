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
import { M3UParserService } from './server/services/M3UParserService.js';
import { StreamProxyService } from './server/services/StreamProxyService.js';
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

const PLAYLIST_RETRY_ATTEMPTS = 3;
const PLAYLIST_RETRY_BACKOFF_MS = 2000;
const playlistHttpClient = axios.create({
  timeout: 45000,
  responseType: 'text',
  headers: {
    'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
  },
  maxRedirects: 5,
});

axiosRetry(playlistHttpClient, {
  retries: PLAYLIST_RETRY_ATTEMPTS,
  shouldResetTimeout: true,
  retryCondition: (error) => {
    const status = error.response?.status;
    return error.code === 'ECONNABORTED' || !status || status >= 500;
  },
  retryDelay: (retryCount, error) => {
    const delay = PLAYLIST_RETRY_BACKOFF_MS * 2 ** (retryCount - 1);
    const targetUrl = error.config?.url || 'unknown-url';
    console.log(
      `[RETRY] Playlist fetch failed for ${targetUrl.substring(0, 40)}... Retrying in ${delay}ms. (${PLAYLIST_RETRY_ATTEMPTS - retryCount} left)`,
    );
    return delay;
  },
});

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
const playlistCache = new CacheManager<any>(30); // 30 minutes cache
const pendingRequests = new Map<string, Promise<any>>();

function getRequestAuthToken(req: express.Request): string | undefined {
  const token = req.headers['x-auth-token'] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  return Array.isArray(token) ? token[0] : token;
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

function serializeUser(user: {
  id: string;
  name: string;
  username: string;
  playlistUrl: string;
  isBlocked: boolean;
  lastAccess?: string;
}) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    playlistUrl: user.playlistUrl,
    isBlocked: user.isBlocked,
    lastAccess: user.lastAccess,
  };
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
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', apiLimiter);

// Rota de Teste (Ping)
app.get('/api/ping', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// API Route: Streaming Proxy - MUST BE ABOVE COMPRESSION
// We don't want to compress media streams as it adds overhead and breaks chunked encoding playback
app.all('/api/stream', (req, res) => {
  req.setTimeout(0);
  res.setTimeout(0);
  const streamUrl = req.query.url as string;
  if (!streamUrl) return res.status(400).send('URL is required');

  // Use StreamProxyService
  StreamProxyService.proxy(streamUrl, req, res, authorizedDomains);
});

app.use(compression());
app.use(securityHeadersMiddleware);

/**
 * API Route: Fetch and parse M3U playlist
 */
app.get('/api/playlist', async (req, res) => {
  const session = AuthSessionService.getSession(getRequestAuthToken(req));
  let playlistUrl = '';
  let hiddenCategories: string[] = [];
  let categoryOverrides: Record<string, string> = {};
  let mediaOverrides: Record<string, any> = {};
  console.log(`[API] Playlist request. Session: ${JSON.stringify(session)}`);
  
  if (session?.role === 'user' && session.userId) {
    const user = await AdminService.getUserById(session.userId);
    console.log(`[API] Found user in session: ${user?.username} (ID: ${session.userId}). Playlist in DB: ${user?.playlistUrl}`);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.isBlocked) {
      return res.status(401).json({ error: 'User blocked' });
    }

    playlistUrl = user.playlistUrl || '';
    hiddenCategories = user.hiddenCategories || [];
    categoryOverrides = user.categoryOverrides || {};
    mediaOverrides = user.mediaOverrides || {};
    if (playlistUrl) {
      registerAuthorizedDomainFromUrl(playlistUrl);
    }
  } else {
    playlistUrl = (req.query.url as string) || process.env.PLAYLIST_URL || '';
    console.log(`[API] No user session found or user is admin. Fallback URL: ${playlistUrl}`);
  }

  if (!playlistUrl) {
    return res.status(400).json({ error: 'Playlist URL not provided.' });
  }

  const sendFilteredCategories = async (categories: any[]) => {
    let result = categories;
    
    if (hiddenCategories.length > 0) {
      result = result.filter(c => !hiddenCategories.includes(c.id));
    }
    
    if (Object.keys(categoryOverrides).length > 0) {
      result = result.map(c => 
        categoryOverrides[c.id] ? { ...c, type: categoryOverrides[c.id] } : c
      );
    }
    
    // Apply User-Specific Media Overrides (High Priority)
    if (Object.keys(mediaOverrides).length > 0) {
      result = result.map(c => ({
        ...c,
        items: c.items?.map((i: any) => 
          mediaOverrides[i.url] ? { ...i, ...mediaOverrides[i.url] } : i
        )
      }));
    }

    // Apply Global Media Overrides (Low Priority - only if no user override exists)
    const globals = await AdminService.getGlobalMediaOverrides();
    if (Object.keys(globals).length > 0) {
      result = result.map(c => ({
        ...c,
        items: c.items?.map((i: any) => {
          const normalizedTitle = AdminService.normalizeTitleForMatching(i.title || '');
          const globalMatch = globals[normalizedTitle];
          // Only apply global if item was NOT already overridden by this user
          if (globalMatch && !mediaOverrides[i.url]) {
            return { ...i, ...globalMatch };
          }
          return i;
        })
      }));
    }
    
    return res.json(result);
  };

  // Auto-register playlist domain (URLs come from DB or env, so they are trusted)
  registerAuthorizedDomainFromUrl(playlistUrl);

  // Attempt to serve from cache or pending request queue
  const cachedData = playlistCache.get(playlistUrl);
  if (cachedData) {
    // BUG FIX: When serving from cache, we must re-register the domains in authorizedDomains
    // since the Set is in-memory and might have been reset on server restart
    console.log('[API] Serving playlist from cache. Re-registering domains...');
    cachedData.forEach((cat: any) => {
      cat.items.forEach((item: any) => {
        if (item.videoUrl && item.videoUrl.includes('url=')) {
          try {
            const urlMatch = item.videoUrl.match(/url=([^&]+)/);
            if (urlMatch) {
              const original = decodeURIComponent(urlMatch[1]);
              registerAuthorizedDomainFromUrl(original);
            }
          } catch (e) {}
        }
        
        if (item.qualities) {
          item.qualities.forEach((q: any) => {
             if (q.url && q.url.includes('url=')) {
                try {
                  const urlMatch = q.url.match(/url=([^&]+)/);
                  if (urlMatch) registerAuthorizedDomainFromUrl(decodeURIComponent(urlMatch[1]));
                } catch (e) {}
             } else if (q.url && q.url.startsWith('http')) {
                registerAuthorizedDomainFromUrl(q.url);
             }
          });
        }
      });
    });
    return await sendFilteredCategories(cachedData);
  }

  if (pendingRequests.has(playlistUrl)) {
    console.log('[API] Coalescing request for URL:', playlistUrl.substring(0, 50) + '...');
    try {
      const data = await pendingRequests.get(playlistUrl);
      return await sendFilteredCategories(data);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed in previous attempt', details: error.message });
    }
  }

  // Create new fetch promise
  const fetchPromise = (async () => {
    console.log(`[API] Fetching playlist for user: ${playlistUrl.substring(0, 50)}...`);

    let response;
    try {
      response = await playlistHttpClient.get<string>(playlistUrl);
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`Upstream server error: ${error.response.status} ${error.response.statusText || ''}`);
      }

      throw new Error(error.message || 'Playlist request failed');
    }

    console.log(`[API] Playlist server responded with status: ${response.status}`);

    if (!response.data || typeof response.data !== 'string') {
      throw new Error('Invalid or empty playlist content');
    }

    // Check for common M3U header to verify content
    if (!response.data.includes('#EXTM3U')) {
      console.warn('[API] Warning: Playlist content does not start with #EXTM3U');
    }

    // Delegate parsing to parser service
    const categories = M3UParserService.parse(response.data, (url) => {
      registerAuthorizedDomainFromUrl(url);
    });

    console.log(`[API] Successfully parsed ${categories.length} categories.`);

    // Update cache
    playlistCache.set(playlistUrl, categories);
    return categories;
  })();

  // Store the promise in the pending queue
  pendingRequests.set(playlistUrl, fetchPromise);

  try {
    const categories = await fetchPromise;
    pendingRequests.delete(playlistUrl);
    return await sendFilteredCategories(categories);
  } catch (error: any) {
    pendingRequests.delete(playlistUrl);
    console.error('[API] Playlist error:', error.message);
    res.status(500).json({ error: 'Failed to fetch playlist', details: error.message });
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

  // Extract real URL if proxy was passed
  if (testUrl.startsWith('/api/stream')) {
    const urlParams = new URL(testUrl, 'http://localhost:3000').searchParams;
    testUrl = urlParams.get('url') || testUrl;
  }

  try {
    console.log('[DIAGNOSTIC] Probing:', testUrl.substring(0, 50) + '...');
    const startTime = Date.now();

    const response = await axios.get(testUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
        'Range': 'bytes=0-1024'
      },
      validateStatus: () => true,
      maxRedirects: 5
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
        
        // Limpa cache no backend ao logar para garantir dados 100% atualizados ("limpar vestigios")
        const pUrl = result.data.playlistUrl;
        if (playlistCache.has(pUrl)) playlistCache.delete(pUrl);
        if (pendingRequests.has(pUrl)) pendingRequests.delete(pUrl);
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
    const session = AuthSessionService.getSession(getRequestAuthToken(req));
    if (!session || session.role !== 'user' || !session.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await AdminService.getUserById(session.userId);
    if (!user || user.isBlocked) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (user.playlistUrl) {
      registerAuthorizedDomainFromUrl(user.playlistUrl);
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

    const user = await AdminService.getUserById(session.userId);
    if (!user || user.isBlocked) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (user.playlistUrl) {
      registerAuthorizedDomainFromUrl(user.playlistUrl);
    }

    res.json({
      role: 'user',
      data: serializeUser(user),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
    res.json(users);
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
    res.status(201).json(user);
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

app.get('/api/admin/user/:id/categories', adminAuthMiddleware, async (req, res) => {
  try {
    const user = await AdminService.getUserById(req.params.id);
    if (!user) return res.status(404).send('Usuário não encontrado');
    if (!user.playlistUrl) return res.json([]);

    let categories = playlistCache.get(user.playlistUrl);
    
    // Fallback: If not cached, fetch and parse (lightweight version without keeping items in memory)
    if (!categories) {
      console.log(`[ADMIN-API] Fetching playlist to preview categories for user ${user.username}`);
      let m3uContent = '';
      
      const isTestEnv = !!process.env.TEST_M3U_PATH;
      if (isTestEnv && user.playlistUrl === process.env.PLAYLIST_URL) {
        const fs = await import('fs');
        const path = await import('path');
        m3uContent = fs.readFileSync(path.resolve(process.cwd(), process.env.TEST_M3U_PATH as string), 'utf-8');
      } else {
        const response = await playlistHttpClient.get(user.playlistUrl);
        m3uContent = response.data;
      }
      categories = M3UParserService.parse(m3uContent, () => {});
    }

    // Map to a lightweight summary format so we don't send 50MB of JSON to the admin panel
    const summary = categories.map((cat: any) => ({
      id: cat.id,
      title: cat.title,
      type: cat.type,
      itemCount: cat.items ? cat.items.length : 0,
      // Send more details but limit count to avoid crashing the browser with huge playlists
      items: cat.items ? cat.items.slice(0, 1000).map((i: any) => ({
        title: i.title,
        url: i.url,
        thumbnail: i.thumbnail,
        description: i.description,
        type: i.type
      })) : []
    }));

    res.json(summary);
  } catch (e: any) {
    console.error(`[ADMIN-API] Error fetching categories for user ${req.params.id}:`, e.message);
    res.status(500).json({ error: 'Erro ao carregar lista de categorias' });
  }
});

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
