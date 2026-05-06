import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function tokenAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith('/api/docs') || req.path === '/health') {
    return next();
  }

  if (req.path.startsWith('/public/today/')) {
    return next();
  }

  const token = req.query.token as string | undefined;

  if (!config.apiToken) {
    return next();
  }

  if (!token || token !== config.apiToken) {
    res.status(401).json({ error: 'Unauthorized — invalid or missing token' });
    return;
  }

  next();
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('Unhandled error:', err.message);

  if (err.message?.includes('SQLITE_CONSTRAINT')) {
    res.status(400).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
}
