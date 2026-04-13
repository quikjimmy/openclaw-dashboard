import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthService, AuthContext } from '../services/auth.js';
import { StorageService } from '../services/storage.js';
import { createError } from './errorHandler.js';
import type { UserRole } from '@openclaw-dashboard/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

let authService: AuthService | null = null;

export function configureAuth(service: AuthService): void {
  authService = service;
}

function parseToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!authService) return next(createError('Auth not configured', 500, 'AUTH_NOT_CONFIGURED'));
  const token = parseToken(req);
  if (!token) return next(createError('Missing bearer token', 401, 'UNAUTHENTICATED'));
  const ctx = authService.verifyToken(token);
  if (!ctx) return next(createError('Invalid or expired token', 401, 'UNAUTHENTICATED'));
  req.auth = ctx;
  next();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(createError('Unauthenticated', 401, 'UNAUTHENTICATED'));
    if (!roles.includes(req.auth.role)) {
      return next(createError('Forbidden', 403, 'FORBIDDEN'));
    }
    next();
  };
}

/**
 * Verify that the authenticated caller has access to the org that owns the
 * instance referenced by `:{paramName}`. super_admin bypasses the check.
 */
export function requireOrgAccess(storage: StorageService, paramName = 'instanceId'): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(createError('Unauthenticated', 401, 'UNAUTHENTICATED'));
    if (req.auth.role === 'super_admin') return next();

    const instanceId = req.params[paramName];
    if (!instanceId) return next(createError('Missing instance id', 400, 'INVALID_REQUEST'));

    const instance = storage.getInstance(instanceId);
    if (!instance) return next(createError('Instance not found', 404, 'NOT_FOUND'));
    if (instance.organizationId !== req.auth.organizationId) {
      return next(createError('Forbidden', 403, 'FORBIDDEN'));
    }
    next();
  };
}
