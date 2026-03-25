import { Request, Response, NextFunction } from 'express';

/**
 * Middleware for validating admin privileges
 */
export const adminAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const adminToken = req.headers['x-admin-token'];
  const secretKey = process.env.ADMIN_SECRET_KEY || 'xandeflix-admin-2026';

  if (adminToken === secretKey) {
    next();
  } else {
    console.warn(`[SECURITY] Unauthorized admin access attempt from: ${req.ip}`);
    res.status(403).json({ 
      error: 'Acesso negado: Requer privilégios de administrador.',
      code: 'UNAUTHORIZED_ADMIN'
    });
  }
};
