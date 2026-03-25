import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());

  // API Route to fetch and parse M3U playlist
  app.get('/api/playlist', async (req, res) => {
    // Get URL from query parameter or use the default one
    const playlistUrl = (req.query.url as string) || 'http://dnsd1.space/get.php?username=952279118&password=823943744&type=m3u_plus&output=mpegts';
    
    try {
      console.log('Fetching playlist from:', playlistUrl);
      const response = await axios.get(playlistUrl, { 
        timeout: 60000, // Increased to 60s
        headers: {
          'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
          'Accept': '*/*'
        },
        validateStatus: () => true // Don't throw on any status code
      });
      
      if (response.status !== 200) {
        console.error(`Upstream server returned status ${response.status}`);
        return res.status(response.status).json({ 
          error: 'Upstream server error', 
          details: `Server returned status ${response.status}`,
          status: response.status
        });
      }

      const m3uContent = response.data;
      if (!m3uContent || typeof m3uContent !== 'string') {
        console.error('Invalid playlist content received');
        return res.status(500).json({ error: 'Invalid playlist content' });
      }

      console.log(`Playlist received. Length: ${m3uContent.length} characters.`);
      
      // Log the first part of the playlist to help diagnose issues with small/invalid lists
      if (m3uContent.length < 2000) {
        console.log('Small playlist content:', m3uContent);
      } else {
        console.log('Playlist start:', m3uContent.substring(0, 200));
      }

      // Simple M3U Parser
      const lines = m3uContent.split(/\r?\n/);
      const items = [];
      let currentItem: any = null;

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.toUpperCase().startsWith('#EXTINF:')) {
          // Format: #EXTINF:<duration> <attributes>,<name>
          const commaIndex = line.indexOf(',');
          let name = 'Canal Sem Nome';
          let attributes = '';
          
          if (commaIndex !== -1) {
            const infoPart = line.substring(0, commaIndex);
            name = line.substring(commaIndex + 1).trim();
            attributes = infoPart.substring(infoPart.indexOf(':') + 1).trim();
          } else {
            attributes = line.substring(line.indexOf(':') + 1).trim();
          }
            
          const logoMatch = attributes.match(/tvg-logo="([^"]*)"/i);
          const groupMatch = attributes.match(/group-title="([^"]*)"/i);
          const xtreamGroupMatch = attributes.match(/group-id="([^"]*)"/i);
          
          let category = 'Geral';
          if (groupMatch) category = groupMatch[1];
          else if (xtreamGroupMatch) category = xtreamGroupMatch[1];
          
          let type = 'live';
          const catLower = category.toLowerCase();
          const nameLower = name.toLowerCase();

          if (catLower.includes('filme') || catLower.includes('movie') || catLower.includes('vod') || nameLower.includes('filme') || nameLower.includes('vod')) {
            type = 'movie';
          } else if (catLower.includes('serie') || nameLower.includes('serie') || catLower.includes('season') || nameLower.includes('season')) {
            type = 'series';
          }

          currentItem = {
            title: name,
            thumbnail: logoMatch ? logoMatch[1] : `https://picsum.photos/seed/${encodeURIComponent(name)}/400/225`,
            category: category,
            type: type,
            id: Math.random().toString(36).substr(2, 9)
          };
        } else if (line.startsWith('http')) {
          // If we have a URL but no currentItem (no #EXTINF), create a generic one
          if (!currentItem) {
            currentItem = {
              title: `Link ${items.length + 1}`,
              thumbnail: `https://picsum.photos/seed/link-${items.length}/400/225`,
              category: 'Geral',
              type: 'live',
              id: Math.random().toString(36).substr(2, 9)
            };
          }

          currentItem.videoUrl = `/api/stream?url=${encodeURIComponent(line)}`;
          currentItem.backdrop = currentItem.thumbnail;
          currentItem.description = `Conteúdo da categoria ${currentItem.category}`;
          currentItem.year = 2024;
          currentItem.rating = '12+';
          currentItem.duration = currentItem.type === 'live' ? 'Ao Vivo' : 'VOD';
          
          items.push(currentItem);
          currentItem = null;
        }
      }

      console.log(`Parsed ${items.length} items from playlist.`);

      if (items.length === 0) {
        console.warn('No items were parsed from the playlist. Check the M3U format.');
      }

      // Group by category for the UI
      const categoriesMap: { [key: string]: { title: string, type: string, items: any[] } } = {};
      items.forEach(item => {
        if (!categoriesMap[item.category]) {
          categoriesMap[item.category] = {
            title: item.category,
            type: item.type,
            items: []
          };
        }
        if (categoriesMap[item.category].items.length < 100) {
          categoriesMap[item.category].items.push(item);
        }
      });

      const categories = Object.keys(categoriesMap).map(catKey => {
        const cat = categoriesMap[catKey];
        return {
          id: catKey.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          title: cat.title,
          type: cat.type,
          items: cat.items
        };
      }).slice(0, 200);

      res.json(categories);
    } catch (error: any) {
      console.error('Error fetching playlist:', error.message);
      res.status(500).json({ error: 'Failed to fetch playlist', details: error.message });
    }
  });

  // Diagnostic endpoint
  app.get('/api/diagnostic', async (req, res) => {
    let testUrl = req.query.url as string || 'http://dnsd1.space/get.php?username=952279118&password=823943744&type=m3u_plus&output=ts';
    
    // If it's a proxy URL, extract the real target URL
    if (testUrl.startsWith('/api/stream')) {
      try {
        const urlParams = new URL(testUrl, 'http://localhost:3000').searchParams;
        const extractedUrl = urlParams.get('url');
        if (extractedUrl) {
          testUrl = extractedUrl;
        }
      } catch (e) {
        console.error('Failed to parse proxy URL in diagnostic:', e);
      }
    }
    
    try {
      console.log('Running diagnostic for target:', testUrl);
      const startTime = Date.now();
      
      const response = await axios({
        method: 'get',
        url: testUrl,
        timeout: 15000,
        headers: {
          'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
          'Accept': '*/*',
          'Range': 'bytes=0-1024'
        },
        validateStatus: () => true,
        maxRedirects: 5
      });

      const duration = Date.now() - startTime;
      
      res.json({
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        duration: `${duration}ms`,
        url: testUrl,
        success: response.status >= 200 && response.status < 400,
        message: response.status === 406 ? 'Servidor IPTV recusou (406). Tente mudar o User-Agent.' : 
                 response.status === 403 ? 'Acesso negado (403). Verifique se o link ainda é válido.' :
                 response.status === 200 && response.headers['content-type']?.includes('text/html') ? 'O servidor retornou HTML em vez de vídeo. Provavelmente uma página de erro ou login.' :
                 'Conexão estabelecida com sucesso. Se a lista não carregar, verifique se as credenciais estão corretas.'
      });
    } catch (error: any) {
      console.error('Diagnostic error:', error.message, error.code);
      res.status(500).json({
        success: false,
        error: error.message,
        code: error.code,
        url: testUrl,
        message: `Falha na conexão: ${error.code || 'Erro desconhecido'}. Isso pode significar que o servidor IPTV bloqueou o IP da nuvem ou o domínio está inacessível.`
      });
    }
  });

  // Proxy route for video streams
  app.all('/api/stream', async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, User-Agent, Accept');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    }

    const streamUrl = req.query.url as string;
    if (!streamUrl) {
      return res.status(400).send('URL is required');
    }

    try {
      const urlObj = new URL(streamUrl);
      const headers: any = {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
        'Accept': '*/*',
        'Connection': 'close', // Use close to avoid socket hang up issues with some servers
        'Host': urlObj.host, // Crucial for many IPTV providers
      };

      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      console.log(`Proxying ${req.method} request: ${streamUrl} (Range: ${req.headers.range || 'none'})`);

      const protocol = urlObj.protocol === 'https:' ? await import('https') : await import('http');
      
      const requestOptions = {
        method: req.method,
        headers: headers,
        timeout: 60000, // Increased timeout
        rejectUnauthorized: false // Ignore SSL errors from IPTV servers
      };

      const proxyReq = protocol.request(streamUrl, requestOptions, (proxyRes) => {
        // Handle redirects
        if (proxyRes.statusCode && proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
          const redirectUrl = new URL(proxyRes.headers.location, streamUrl).toString();
          console.log(`Redirecting to: ${redirectUrl}`);
          res.redirect(`/api/stream?url=${encodeURIComponent(redirectUrl)}`);
          return;
        }

        console.log(`IPTV Server Response: ${proxyRes.statusCode} ${proxyRes.statusMessage} for ${streamUrl}`);
        
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range, User-Agent, Accept');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');

        // Forward headers
        const headersToForward = [
          'content-type',
          'content-length',
          'content-range',
          'accept-ranges',
          'cache-control',
          'expires',
          'last-modified',
          'etag'
        ];

        headersToForward.forEach(header => {
          if (proxyRes.headers[header]) {
            res.setHeader(header, proxyRes.headers[header] as string);
          }
        });

        // Special handling for TS and HLS streams
        const isTS = streamUrl.toLowerCase().includes('.ts') || 
                     streamUrl.toLowerCase().includes('output=ts') ||
                     streamUrl.toLowerCase().includes('output=mpegts') ||
                     (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('video/mp2t'));

        const isHLS = streamUrl.toLowerCase().includes('.m3u8') ||
                      streamUrl.toLowerCase().includes('output=hls') ||
                      (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('application/x-mpegURL'));

        if (isTS) {
          res.setHeader('Content-Type', 'video/mp2t');
        } else if (isHLS) {
          res.setHeader('Content-Type', 'application/x-mpegURL');
        }

        res.status(proxyRes.statusCode || 200);
        
        if (req.method === 'HEAD') {
          res.end();
        } else if (isHLS && req.method === 'GET') {
          // Rewrite HLS playlist to use absolute URLs through the proxy
          let body = '';
          proxyRes.on('data', (chunk) => {
            body += chunk.toString();
          });
          proxyRes.on('end', () => {
            try {
              const lines = body.split('\n');
              const rewrittenLines = lines.map(line => {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('#')) {
                  // It's a URL or path
                  try {
                    const absoluteUrl = new URL(trimmedLine, streamUrl).toString();
                    return `/api/stream?url=${encodeURIComponent(absoluteUrl)}`;
                  } catch (e) {
                    return line;
                  }
                }
                return line;
              });
              res.send(rewrittenLines.join('\n'));
            } catch (e) {
              console.error('HLS rewrite error:', e);
              res.send(body); // Fallback to original body
            }
          });
        } else {
          proxyRes.pipe(res);
        }
      });

      proxyReq.on('timeout', () => {
        console.error('Proxy request timed out for:', streamUrl);
        proxyReq.destroy();
        if (!res.headersSent) res.status(504).send('IPTV Server Timeout');
      });

      proxyReq.on('error', (err) => {
        console.error('Proxy request error for:', streamUrl, err.message);
        if (!res.headersSent) res.status(500).send(`Proxy Error: ${err.message}`);
      });

      if (req.method !== 'HEAD') {
        req.pipe(proxyReq);
      } else {
        proxyReq.end();
      }

      req.on('close', () => {
        proxyReq.destroy();
      });

    } catch (error: any) {
      console.error('Proxy setup error:', error.message);
      if (!res.headersSent) res.status(500).send(`Proxy Setup Error: ${error.message}`);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
