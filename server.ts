import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';
import cors from 'cors';
import compression from 'compression';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Import Services
import { M3UParserService } from './server/services/M3UParserService';
import { StreamProxyService } from './server/services/StreamProxyService';
import { CacheManager } from './server/services/CacheManager';
import { AdminService } from './server/services/AdminService';
import { AuthSessionService } from './server/services/AuthSessionService';
import { TMDBService } from './server/services/TMDBService';

// Import Middleware
import { whitelistMiddleware, securityHeadersMiddleware } from './server/middleware/security';
import { adminAuthMiddleware } from './server/middleware/adminAuth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure environment: load .env, then .env.example as fallback for missing vars
dotenv.config();
dotenv.config({ path: path.join(__dirname, '.env.example'), override: false });

/**
 * Global State & Cache Configuration
 */
const authorizedDomains = new Set<string>(['dnsd1.space']);
if (process.env.NODE_ENV !== 'production') {
  authorizedDomains.add('localhost');
  authorizedDomains.add('127.0.0.1');
}
const playlistCache = new CacheManager<any>(30); // 30 minutes cache
const pendingRequests = new Map<string, Promise<any>>();

// Axios helper with retry logic
async function fetchWithRetry(url: string, options: any, retries = 3, backoff = 1000) {
  try {
    return await axios.get(url, options);
  } catch (error: any) {
    if (retries > 0 && (!error.response || error.response.status >= 500)) {
      console.log(`[RETRY] Fetch failed for ${url.substring(0, 40)}... Retrying in ${backoff}ms. (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw error;
  }
}

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
  try {
    const hostname = new URL(targetUrl).hostname.toLowerCase();
    return authorizedDomains.has(hostname);
  } catch {
    return false;
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

const app = express();

export async function configApp() {
  const PORT = Number(process.env.PORT || 3000);

  console.log('[DEBUG] Iniciando servidor Xandeflix...');
  console.log('[DEBUG] Supabase URL configurada:', !!process.env.VITE_SUPABASE_URL);

  // Apply base middlewares
  app.use(cors());
  app.use((req, res, next) => {
    console.log(`[SERVER] ${req.method} ${req.path}`);
    next();
  });

  // Rota de Teste (Ping)
  app.get('/api/ping', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  
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

    if (session?.role === 'user' && session.userId) {
      const users = await AdminService.listUsers();
      const user = users.find(u => u.id === session.userId && !u.isBlocked);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      playlistUrl = user.playlistUrl || '';
      if (playlistUrl) {
        registerAuthorizedDomainFromUrl(playlistUrl);
      }
    } else {
      playlistUrl = (req.query.url as string) || process.env.PLAYLIST_URL || '';
    }
    
    if (!playlistUrl) {
      return res.status(400).json({ error: 'Playlist URL not provided.' });
    }

    if (!isAllowedPlaylistUrl(playlistUrl)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'O domínio solicitado não está autorizado.'
      });
    }

    // Attempt to serve from cache or pending request queue
    const cachedData = playlistCache.get(playlistUrl);
    if (cachedData) return res.json(cachedData);
    
    if (pendingRequests.has(playlistUrl)) {
      console.log('[API] Coalescing request for URL:', playlistUrl.substring(0, 50) + '...');
      try {
        const data = await pendingRequests.get(playlistUrl);
        return res.json(data);
      } catch (error: any) {
        return res.status(500).json({ error: 'Failed in previous attempt', details: error.message });
      }
    }
    
    // Create new fetch promise
      const fetchPromise = (async () => {
      console.log(`[API] Fetching playlist for user: ${playlistUrl.substring(0, 50)}...`);
      
      const response = await axios.get(playlistUrl, { 
        timeout: 45000,
        responseType: 'text', // Force response as text for M3U content
        headers: {
          'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18', // Many IPTV panels require VLC UA
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate, br'
        },
        validateStatus: () => true,
        maxRedirects: 5,
      });
      
      console.log(`[API] Playlist server responded with status: ${response.status}`);

      if (response.status !== 200) {
        throw new Error(`Upstream server error: ${response.status} ${response.statusText || ''}`);
      }

      if (!response.data || typeof response.data !== 'string') {
        throw new Error('Invalid or empty playlist content');
      }

      // Check for common M3U header to verify content
      if (!response.data.includes('#EXTM3U')) {
        console.warn('[API] Warning: Playlist content does not start with #EXTM3U');
        // We try to parse it anyway, but log the warning
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
      res.json(categories);
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

    try {
      const metadata = await TMDBService.searchMedia(title as string, type as 'movie' | 'series');
      res.json(metadata);
    } catch (error: any) {
      console.error('[API] Metadata error:', error.message);
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
  app.post('/api/auth/login', express.json(), async (req, res) => {
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
            ? {
                id: result.data.id,
                name: result.data.name,
                username: result.data.username,
                playlistUrl: result.data.playlistUrl,
                isBlocked: result.data.isBlocked,
                lastAccess: result.data.lastAccess,
              }
            : undefined,
        };

        res.json(responseBody);
      } else {
        res.status(401).json({ error: 'Credenciais inválidas ou acesso bloqueado.' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      const session = AuthSessionService.getSession(getRequestAuthToken(req));
      if (!session || session.role !== 'user' || !session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const users = await AdminService.listUsers();
      const user = users.find(u => u.id === session.userId && !u.isBlocked);
      if (user) {
        if (user.playlistUrl) {
          registerAuthorizedDomainFromUrl(user.playlistUrl);
        }
        res.json({
          id: user.id,
          name: user.name,
          username: user.username,
          playlistUrl: user.playlistUrl,
          isBlocked: user.isBlocked,
          lastAccess: user.lastAccess,
        });
      }
      else res.status(404).send('User not found');
    } catch (e: any) {
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
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/user/add', adminAuthMiddleware, express.json(), async (req, res) => {
    try {
      const { name, playlistUrl, username, password } = req.body;
      const user = await AdminService.addUser(name, playlistUrl, username, password);
      res.status(201).json(user);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/user/status', adminAuthMiddleware, express.json(), async (req, res) => {
    try {
      const { userId, blocked } = req.body;
      const success = await AdminService.toggleUserStatus(userId, blocked);
      if (success) res.sendStatus(200);
      else res.status(404).send('User not found');
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/admin/user/update', adminAuthMiddleware, express.json(), async (req, res) => {
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

  /**
   * Static Assets & Vite Configuration
   */
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  // No Vercel, o Vercel mesmo gerencia a porta, então só ouvimos localmente
  if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[SERVER] Xandeflix running: http://localhost:${PORT}`);
      console.log(`[SERVER] Mode: ${process.env.NODE_ENV || 'development'}`);
    });
  }
}

// Inicializa a configuração e exporta para o servidor
configApp();
export default app;
