import { Request, Response, NextFunction } from 'express';
import { AuthSessionService } from '../services/AuthSessionService.ts';

/**
 * Middleware for validating admin privileges
 */
export const adminAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const adminToken = (req.headers['x-admin-token'] || req.headers.authorization?.replace(/^Bearer\s+/i, '')) as string | undefined;
  const session = AuthSessionService.getSession(adminToken);

  if (session?.role === 'admin') {
    next();
  } else {
    console.warn(`[SECURITY] Unauthorized admin access attempt from: ${req.ip}`);
    res.status(403).json({ 
      error: 'Acesso negado: Requer privilégios de administrador.',
      code: 'UNAUTHORIZED_ADMIN'
    });
  }
};
