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

// Import Middleware
import { whitelistMiddleware, securityHeadersMiddleware } from './server/middleware/security';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure environment
dotenv.config();

/**
 * Global State & Cache Configuration
 */
const authorizedDomains = new Set<string>(['dnsd1.space', 'localhost', '127.0.0.1']);
const playlistCache = new CacheManager<any>(30); // 30 minutes cache

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
  app.use(compression()); // Habilitar Gzip/Brotli para respostas grandes
  app.use(securityHeadersMiddleware);

  /**
   * API Route: Fetch and parse M3U playlist
   */
  app.get('/api/playlist', async (req, res) => {
    const playlistUrl = (req.query.url as string) || process.env.PLAYLIST_URL || '';
    
    if (!playlistUrl) {
      return res.status(400).json({ error: 'Playlist URL not provided.' });
    }

    // Attempt to serve from cache
    const cachedData = playlistCache.get(playlistUrl);
    if (cachedData) return res.json(cachedData);
    
    try {
      console.log('[API] Fetching playlist:', playlistUrl.substring(0, 50) + '...');
      
      const response = await axios.get(playlistUrl, { 
        timeout: 45000, // Reduced from 60s for better user experience
        headers: {
          'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
          'Accept': '*/*'
        },
        validateStatus: () => true
      });
      
      if (response.status !== 200) {
        return res.status(response.status).json({ 
          error: 'Upstream server error', 
          status: response.status 
        });
      }

      if (!response.data || typeof response.data !== 'string') {
        return res.status(500).json({ error: 'Invalid playlist content' });
      }

      // Delegate parsing to parser service
      const categories = M3UParserService.parse(response.data, (url) => {
        try { authorizedDomains.add(new URL(url).hostname); } catch (e) {}
      });

      // Update cache
      playlistCache.set(playlistUrl, categories);

      res.json(categories);
    } catch (error: any) {
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
   * API Route: Streaming Proxy (Chunked with pipe)
   */
  app.all('/api/stream', (req, res) => {
    const streamUrl = req.query.url as string;
    if (!streamUrl) return res.status(400).send('URL is required');

    // Delegate streaming to proxy service
    StreamProxyService.proxy(streamUrl, req, res, authorizedDomains);
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
