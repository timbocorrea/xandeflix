import { Request, Response } from 'express';
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

      const headers: any = {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
        'Accept': '*/*',
        'Connection': 'close',
        'Host': urlObj.host,
      };

      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      console.log(`[PROXY] Streaming: ${streamUrl.substring(0, 100)}...`);

      const protocol = urlObj.protocol === 'https:' ? https : http;
      
      const requestOptions = {
        method: req.method,
        headers: headers,
        timeout: 60000,
        rejectUnauthorized: true // Enforce SSL security
      };

      const proxyReq = protocol.request(streamUrl, requestOptions, (proxyRes) => {
        // Handle Redirects
        if (proxyRes.statusCode && proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
          const redirectUrl = new URL(proxyRes.headers.location, streamUrl).toString();
          console.log(`[PROXY] Redirecting to: ${redirectUrl.substring(0, 100)}...`);
          res.redirect(`/api/stream?url=${encodeURIComponent(redirectUrl)}`);
          return;
        }

        // Set standard and CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Range, User-Agent, Accept');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');

        const headersToForward = [
          'content-type', 'content-length', 'content-range', 'accept-ranges', 
          'cache-control', 'expires', 'last-modified', 'etag'
        ];

        headersToForward.forEach(header => {
          if (proxyRes.headers[header]) {
            res.setHeader(header, proxyRes.headers[header] as string);
          }
        });

        // Content detection
        const urlLower = streamUrl.toLowerCase();
        const isTS = urlLower.includes('.ts') || urlLower.includes('output=ts') || 
                     urlLower.includes('output=mpegts') ||
                     (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('video/mp2t'));

        const isHLS = urlLower.includes('.m3u8') || urlLower.includes('output=hls') ||
                      (proxyRes.headers['content-type'] && proxyRes.headers['content-type'].includes('application/x-mpegURL'));

        if (isTS) res.setHeader('Content-Type', 'video/mp2t');
        else if (isHLS) res.setHeader('Content-Type', 'application/x-mpegURL');

        res.status(proxyRes.statusCode || 200);

        if (req.method === 'HEAD') {
          res.end();
        } else if (isHLS && req.method === 'GET') {
          this.handleHLSRewrite(proxyRes, res, streamUrl);
        } else {
          proxyRes.pipe(res);
        }
      });

      proxyReq.on('timeout', () => {
        console.error('[PROXY] Request timed out for:', streamUrl);
        proxyReq.destroy();
        if (!res.headersSent) res.status(504).send('IPTV Server Timeout');
      });

      proxyReq.on('error', (err: any) => {
        const errorMsg = this.handleError(err, streamUrl);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Proxy Error', message: errorMsg, code: err.code });
        }
      });

      if (req.method !== 'HEAD') {
        req.pipe(proxyReq);
      } else {
        proxyReq.end();
      }

      req.on('close', () => proxyReq.destroy());

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
