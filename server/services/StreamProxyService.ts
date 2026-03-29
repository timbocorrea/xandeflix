import { Request, Response } from 'express';
import axios from 'axios';
import * as http from 'http';
import * as https from 'https';

export class StreamProxyService {
  /**
   * Proxies a stream URL with appropriate headers and security
   */
  public static async proxy(streamUrl: string, req: Request, res: Response, authorizedDomains: Set<string>): Promise<void> {
    try {
      const urlObj = new URL(streamUrl);
      
      // SSRF Whitelist Check
      if (!authorizedDomains.has(urlObj.hostname)) {
        console.warn(`[SECURITY] Blocked stream request to unauthorized domain: ${urlObj.hostname}`);
        res.status(403).send('Forbidden: O domínio solicitado não está autorizado.');
        return;
      }

      console.log(`[PROXY] Streaming (Axios): ${streamUrl.substring(0, 100)}...`);

      const headers: any = {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
        'Accept': '*/*',
        'Connection': 'keep-alive',
      };

      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      const response = await axios.request({
        url: streamUrl,
        method: req.method,
        headers,
        responseType: 'stream',
        timeout: 60000,
        maxRedirects: 10,
        validateStatus: () => true,
        httpsAgent: new https.Agent({
          rejectUnauthorized: process.env.ALLOW_INSECURE_TLS === 'true' ? false : true,
        }),
        httpAgent: new http.Agent({ keepAlive: true }),
      });

      // Forward status code
      res.status(response.status);

      // Forward essential headers
      const headersToForward = [
        'content-type', 'content-length', 'content-range', 'accept-ranges', 
        'cache-control', 'expires', 'last-modified', 'etag'
      ];

      headersToForward.forEach(header => {
        if (response.headers[header]) {
          res.setHeader(header, response.headers[header] as string);
        }
      });

      // CORS & Cache
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      
      // For live streams, we don't want browsers to buffer too much locally
      const isLive = streamUrl.includes('live') || streamUrl.includes('output=ts') || streamUrl.includes('output=mpegts');
      if (isLive) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        // Remove Content-Length if it looks like an infinite stream to prevent issues
        if (!response.headers['content-length'] || parseInt(response.headers['content-length'] as string) > 1024 * 1024 * 1024) {
          res.removeHeader('Content-Length');
        }
      }

      // Detect Content Type overrides
      const urlLower = streamUrl.toLowerCase();
      const isTS = urlLower.includes('.ts') || urlLower.includes('output=ts') || 
                   urlLower.includes('output=mpegts') ||
                   (response.headers['content-type'] && response.headers['content-type'].includes('video/mp2t'));

      const isHLS = urlLower.includes('.m3u8') || urlLower.includes('output=hls') ||
                    (response.headers['content-type'] && response.headers['content-type'].includes('application/x-mpegURL'));

      if (isTS) res.setHeader('Content-Type', 'video/mp2t');
      else if (isHLS) res.setHeader('Content-Type', 'application/x-mpegURL');

      if (req.method === 'HEAD') {
        res.end();
      } else if (isHLS) {
        // HLS Rewrite
        let body = '';
        response.data.on('data', (chunk: any) => body += chunk.toString());
        response.data.on('end', () => {
          const rewritten = body.split('\n').map(line => {
             const trimmed = line.trim();
             if (trimmed && !trimmed.startsWith('#')) {
               try { return `/api/stream?url=${encodeURIComponent(new URL(trimmed, streamUrl).toString())}`; } 
               catch { return line; }
             }
             return line;
          }).join('\n');
          res.send(rewritten);
        });
      } else {
        response.data.pipe(res);
      }

      req.on('close', () => {
        if (response.data && response.data.destroy) response.data.destroy();
      });

    } catch (error: any) {
      console.error('[PROXY] Setup error:', error.message);
      if (!res.headersSent) res.status(500).send(`Proxy Setup Error: ${error.message}`);
    }
  }

  private static handleHLSRewrite(proxyRes: http.IncomingMessage, res: Response, streamUrl: string): void {
    let body = '';
    proxyRes.on('data', chunk => body += chunk.toString());
    proxyRes.on('end', () => {
      try {
        const lines = body.split('\n');
        const rewrittenLines = lines.map(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            try {
              const absoluteUrl = new URL(trimmed, streamUrl).toString();
              return `/api/stream?url=${encodeURIComponent(absoluteUrl)}`;
            } catch { return line; }
          }
          return line;
        });
        res.send(rewrittenLines.join('\n'));
      } catch (e) {
        console.error('[PROXY] HLS rewrite error:', e);
        res.send(body);
      }
    });
  }

  private static handleError(err: any, streamUrl: string): string {
    if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(err.code)) {
      console.error(`[SECURITY] SSL Validation failed for: ${streamUrl}`);
      return `IPTV Server Certificate Error: ${err.code}. Check provider security.`;
    }
    console.error('[PROXY] Request error:', err.message);
    return err.message;
  }
}
