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

// Import Middleware
import { whitelistMiddleware, securityHeadersMiddleware } from './server/middleware/security';
import { adminAuthMiddleware } from './server/middleware/adminAuth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure environment
dotenv.config();

/**
 * Global State & Cache Configuration
 */
const authorizedDomains = new Set<string>(['dnsd1.space', 'localhost', '127.0.0.1']);
const playlistCache = new CacheManager<any>(30); // 30 minutes cache
const pendingRequests = new Map<string, Promise<any>>();


// Seed whitelist from environment
if (process.env.PLAYLIST_URL) {
  try {
    const url = new URL(process.env.PLAYLIST_URL);
    authorizedDomains.add(url.hostname);
  } catch (e) {
    console.warn('[SECURITY] Invalid PLAYLIST_URL in environment.');
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Apply base middlewares
  app.use(cors());
  
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
    const playlistUrl = (req.query.url as string) || process.env.PLAYLIST_URL || '';
    
    if (!playlistUrl) {
      return res.status(400).json({ error: 'Playlist URL not provided.' });
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
        try { 
          const hostname = new URL(url).hostname;
          if (!authorizedDomains.has(hostname)) {
            authorizedDomains.add(hostname);
            console.log(`[SECURITY] Whitelisted new domain: ${hostname}`);
          }
        } catch (e) {}
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
   * API Route: Diagnostic helper
   */
  app.get('/api/diagnostic', whitelistMiddleware(authorizedDomains), async (req, res) => {
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
        res.json(result);
      } else {
        res.status(401).json({ error: 'Credenciais inválidas ou acesso bloqueado.' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      const userId = req.query.id as string;
      if (!userId) return res.status(400).send('ID is required');
      const users = await AdminService.listUsers();
      const user = users.find(u => u.id === userId && !u.isBlocked);
      if (user) res.json(user);
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Xandeflix running: http://localhost:${PORT}`);
    console.log(`[SERVER] Mode: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
