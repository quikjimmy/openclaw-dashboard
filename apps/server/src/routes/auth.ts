import { Router } from 'express';
import crypto from 'crypto';
import { StorageService } from '../services/storage.js';
import { AuthService } from '../services/auth.js';
import { createError } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import type { User, UserRole } from '@openclaw-dashboard/shared';

export function createAuthRouter(storage: StorageService, auth: AuthService): Router {
  const router = Router();

  router.post('/login', async (req, res, next) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        throw createError('email and password required', 400, 'INVALID_REQUEST');
      }
      const result = await auth.login(email, password);
      if (!result) throw createError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', requireAuth, (req, res, next) => {
    try {
      const user = storage.getUser(req.auth!.userId);
      if (!user) throw createError('User not found', 404, 'NOT_FOUND');
      res.json({ ok: true, data: user });
    } catch (error) {
      next(error);
    }
  });

  // Users CRUD — super_admin and org_admin (scoped to their org)
  router.get('/users', requireAuth, requireRole('super_admin', 'org_admin'), (req, res, next) => {
    try {
      const auth = req.auth!;
      const users =
        auth.role === 'super_admin'
          ? storage.getUsers(typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined)
          : storage.getUsers(auth.organizationId);
      res.json({ ok: true, data: { users, total: users.length } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/users', requireAuth, requireRole('super_admin', 'org_admin'), async (req, res, next) => {
    try {
      const body = req.body as {
        email: string;
        password: string;
        name: string;
        role: UserRole;
        organizationId?: string;
      };
      if (!body.email || !body.password || !body.name || !body.role) {
        throw createError('email, password, name, role are required', 400, 'INVALID_REQUEST');
      }

      const caller = req.auth!;
      let organizationId = body.organizationId;
      if (caller.role === 'org_admin') {
        if (body.role === 'super_admin') {
          throw createError('Cannot create super_admin', 403, 'FORBIDDEN');
        }
        organizationId = caller.organizationId;
      }

      if (storage.getUserByEmail(body.email)) {
        throw createError('email already in use', 409, 'EMAIL_CONFLICT');
      }

      const passwordHash = await auth.hashPassword(body.password);
      const user = storage.createUser({
        id: crypto.randomUUID(),
        email: body.email,
        name: body.name,
        role: body.role,
        organizationId,
        passwordHash,
      });
      res.status(201).json({ ok: true, data: user });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/users/:id', requireAuth, requireRole('super_admin', 'org_admin'), async (req, res, next) => {
    try {
      const caller = req.auth!;
      const target = storage.getUser(req.params.id);
      if (!target) throw createError('User not found', 404, 'NOT_FOUND');
      if (caller.role === 'org_admin') {
        if (target.organizationId !== caller.organizationId) {
          throw createError('Forbidden', 403, 'FORBIDDEN');
        }
        if (req.body.role === 'super_admin') {
          throw createError('Forbidden', 403, 'FORBIDDEN');
        }
      }

      const body = req.body as Partial<User> & { password?: string };
      const updates: Partial<User> & { passwordHash?: string } = {
        email: body.email,
        name: body.name,
        role: body.role,
        organizationId: body.organizationId,
      };
      if (body.password) {
        updates.passwordHash = await auth.hashPassword(body.password);
      }
      const updated = storage.updateUser(req.params.id, updates);
      res.json({ ok: true, data: updated });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/users/:id', requireAuth, requireRole('super_admin', 'org_admin'), (req, res, next) => {
    try {
      const caller = req.auth!;
      const target = storage.getUser(req.params.id);
      if (!target) throw createError('User not found', 404, 'NOT_FOUND');
      if (caller.role === 'org_admin' && target.organizationId !== caller.organizationId) {
        throw createError('Forbidden', 403, 'FORBIDDEN');
      }
      if (target.id === caller.userId) {
        throw createError('Cannot delete self', 400, 'INVALID_REQUEST');
      }
      storage.deleteUser(req.params.id);
      res.json({ ok: true, data: null });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
