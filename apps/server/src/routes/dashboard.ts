import { Router } from 'express';
import crypto from 'crypto';
import { StorageService } from '../services/storage.js';
import { Gateways } from '../gateway/gateways.js';
import { createError } from '../middleware/errorHandler.js';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import type { DashboardStats, HealthCheck } from '@openclaw-dashboard/shared';

export function createDashboardRouter(storage: StorageService, gateways: Gateways): Router {
  const router = Router();

  router.use(requireAuth);

  // Aggregate stats, scoped to the caller's org unless super_admin.
  router.get('/stats', (req, res, next) => {
    try {
      const auth = req.auth!;
      const scope =
        auth.role === 'super_admin'
          ? (typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined)
          : auth.organizationId;

      const stats: DashboardStats = storage.getDashboardStats(scope);
      res.json({ ok: true, data: stats });
    } catch (error) {
      next(error);
    }
  });

  // Instance health — latest recorded check + live probe
  router.get('/instances/:instanceId/health', requireOrgAccess(storage), async (req, res, next) => {
    try {
      const instanceId = req.params.instanceId;
      const latest = storage.getLatestHealthCheck(instanceId);

      // Live probe when a gateway is present for the instance
      let live: HealthCheck | undefined;
      const gw = gateways.resolve(instanceId);
      if (gw?.isConnected()) {
        const started = Date.now();
        try {
          const info = (await gw.request('health.check').catch(() => null)) as
            | Record<string, unknown>
            | null;
          const checkedAt = Date.now();
          const check: HealthCheck = {
            id: crypto.randomUUID(),
            instanceId,
            status: info ? 'healthy' : 'degraded',
            latencyMs: checkedAt - started,
            checkedAt,
            details: info ?? undefined,
          };
          live = storage.createHealthCheck(check);
        } catch (err) {
          const check: HealthCheck = {
            id: crypto.randomUUID(),
            instanceId,
            status: 'unreachable',
            checkedAt: Date.now(),
            details: { error: (err as Error).message },
          };
          live = storage.createHealthCheck(check);
        }
      }

      res.json({
        ok: true,
        data: {
          latest: live ?? latest ?? null,
          history: storage.getHealthCheckHistory(instanceId, 20),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  // Alerts — list scoped
  router.get('/alerts', (req, res, next) => {
    try {
      const auth = req.auth!;
      const orgId =
        auth.role === 'super_admin'
          ? (typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined)
          : auth.organizationId;
      const alerts = storage.getAlerts({
        organizationId: orgId,
        instanceId: typeof req.query.instanceId === 'string' ? req.query.instanceId : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        limit: typeof req.query.limit === 'string' ? parseInt(req.query.limit) : 100,
      });
      const counts = storage.getActiveAlertCount(orgId);
      res.json({
        ok: true,
        data: { alerts, total: alerts.length, active: counts.total },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/alerts/:id/acknowledge', (req, res, next) => {
    try {
      const auth = req.auth!;
      const updated = storage.updateAlert(req.params.id, {
        status: 'acknowledged',
        acknowledgedAt: Date.now(),
        acknowledgedBy: auth.userId,
      });
      if (!updated) throw createError('Alert not found', 404, 'NOT_FOUND');
      res.json({ ok: true, data: updated });
    } catch (error) {
      next(error);
    }
  });

  router.post('/alerts/:id/resolve', (req, res, next) => {
    try {
      const updated = storage.updateAlert(req.params.id, {
        status: 'resolved',
        resolvedAt: Date.now(),
      });
      if (!updated) throw createError('Alert not found', 404, 'NOT_FOUND');
      res.json({ ok: true, data: updated });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
