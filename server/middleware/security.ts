import { Request, Response, NextFunction } from 'express';

/**
 * Whitelist check middleware
 */
export const whitelistMiddleware = (authorizedDomains: Set<string>) => (req: Request, res: Response, next: NextFunction) => {
  let targetUrl = req.query.url as string;
  if (!targetUrl) return next();
  
  // If targetUrl is a local proxy URL, extract the real URL
  if (targetUrl.startsWith('/api/stream')) {
    try {
      const urlParams = new URL(targetUrl, `http://localhost:${process.env.PORT || 3000}`).searchParams;
      targetUrl = urlParams.get('url') || targetUrl;
    } catch (e) {
      // Continue with original targetUrl if parsing fails
    }
  }

  try {
    if (process.env.ALLOW_ALL_DOMAINS === 'true' || process.env.NODE_ENV !== 'production') return next();

    const urlObj = new URL(targetUrl);
    if (!authorizedDomains.has(urlObj.hostname)) {
      console.warn(`[SECURITY] Blocked request to unauthorized domain: ${urlObj.hostname}. Adicione este domínio ao arquivo .env na variável AUTHORIZED_DOMAINS se necessário.`);
      console.warn(`[SECURITY] Authorized Domains: ${Array.from(authorizedDomains).join(', ')}`);
      
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'O domínio solicitado não está na lista de permissões de segurança (Whitelist).',
        hostname: urlObj.hostname,
        authorizedDomains: Array.from(authorizedDomains)
      });
    }
  } catch (e) {
    if (!res.headersSent) res.status(400).json({ error: 'Invalid URL', details: targetUrl });
    return;
  }
  next();
};

/**
 * Common security headers
 */
export const securityHeadersMiddleware = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Don't set nosniff for streaming routes to help browsers and mpegts.js
  if (!req.url.includes('/api/stream')) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
  
  next();
};
