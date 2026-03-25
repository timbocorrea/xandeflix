import { Request, Response, NextFunction } from 'express';

/**
 * Whitelist check middleware
 */
export const whitelistMiddleware = (authorizedDomains: Set<string>) => (req: Request, res: Response, next: NextFunction) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) return next();
  
  try {
    const urlObj = new URL(targetUrl);
    if (!authorizedDomains.has(urlObj.hostname)) {
      console.warn(`[SECURITY] Blocked request to unauthorized domain: ${urlObj.hostname}`);
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'O domínio solicitado não está na lista de permissões de segurança (Whitelist).' 
      });
    }
  } catch (e) {
    if (!res.headersSent) res.status(400).json({ error: 'Invalid URL' });
    return;
  }
  next();
};

/**
 * Common security headers
 */
export const securityHeadersMiddleware = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
};
