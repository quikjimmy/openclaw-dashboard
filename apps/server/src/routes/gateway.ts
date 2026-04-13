import { Router } from 'express';
import { Gateways } from '../gateway/gateways.js';
import { StorageService } from '../services/storage.js';
import { createError } from '../middleware/errorHandler.js';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';

export function createGatewayRouter(gateways: Gateways, storage: StorageService): Router {
  const router = Router({ mergeParams: true });
  router.use(requireAuth, requireOrgAccess(storage));

  router.post('/rpc', async (req, res, next) => {
    try {
      const { method, params, idempotencyKey } = req.body;
      if (!method) throw createError('Method is required', 400, 'INVALID_REQUEST');

      const gw = gateways.resolve((req.params as unknown as { instanceId: string }).instanceId);
      if (!gw || !gw.isConnected()) {
        throw createError('Not connected to Gateway', 503, 'NOT_CONNECTED');
      }
      const result = await gw.request(method, params, { idempotencyKey });
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
