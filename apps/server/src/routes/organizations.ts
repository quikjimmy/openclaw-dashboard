import { Router } from 'express';
import crypto from 'crypto';
import { StorageService } from '../services/storage.js';
import { createError } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import type {
  CreateOrganizationRequest,
  Organization,
  OrganizationListResponse,
} from '@openclaw-dashboard/shared';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function createOrganizationsRouter(storage: StorageService): Router {
  const router = Router();

  router.use(requireAuth);

  // List — super_admin sees all, others see just their org
  router.get('/', (req, res, next) => {
    try {
      const auth = req.auth!;
      const organizations =
        auth.role === 'super_admin'
          ? storage.getOrganizations()
          : auth.organizationId
            ? [storage.getOrganization(auth.organizationId)].filter(Boolean) as Organization[]
            : [];
      const response: OrganizationListResponse = { organizations, total: organizations.length };
      res.json({ ok: true, data: response });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', (req, res, next) => {
    try {
      const auth = req.auth!;
      if (auth.role !== 'super_admin' && auth.organizationId !== req.params.id) {
        throw createError('Forbidden', 403, 'FORBIDDEN');
      }
      const org = storage.getOrganization(req.params.id);
      if (!org) throw createError('Organization not found', 404, 'NOT_FOUND');
      res.json({ ok: true, data: org });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', requireRole('super_admin'), (req, res, next) => {
    try {
      const body = req.body as CreateOrganizationRequest;
      if (!body.name) throw createError('name is required', 400, 'INVALID_REQUEST');
      if (!body.slug || !SLUG_RE.test(body.slug)) {
        throw createError('slug must match ^[a-z0-9][a-z0-9-]{0,62}$', 400, 'INVALID_SLUG');
      }
      if (storage.getOrganizationBySlug(body.slug)) {
        throw createError('slug already in use', 409, 'SLUG_CONFLICT');
      }

      const org = storage.createOrganization({
        id: crypto.randomUUID(),
        name: body.name,
        slug: body.slug,
        plan: body.plan || 'free',
        status: 'active',
        settings: body.settings,
      });
      res.status(201).json({ ok: true, data: org });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', requireRole('super_admin', 'org_admin'), (req, res, next) => {
    try {
      const auth = req.auth!;
      if (auth.role === 'org_admin' && auth.organizationId !== req.params.id) {
        throw createError('Forbidden', 403, 'FORBIDDEN');
      }
      const body = req.body as Partial<Organization>;
      if (body.slug) {
        if (!SLUG_RE.test(body.slug)) {
          throw createError('invalid slug', 400, 'INVALID_SLUG');
        }
        const existing = storage.getOrganizationBySlug(body.slug);
        if (existing && existing.id !== req.params.id) {
          throw createError('slug already in use', 409, 'SLUG_CONFLICT');
        }
      }
      const org = storage.updateOrganization(req.params.id, body);
      if (!org) throw createError('Organization not found', 404, 'NOT_FOUND');
      res.json({ ok: true, data: org });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', requireRole('super_admin'), (req, res, next) => {
    try {
      const ok = storage.deleteOrganization(req.params.id);
      if (!ok) throw createError('Organization not found', 404, 'NOT_FOUND');
      res.json({ ok: true, data: null });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
