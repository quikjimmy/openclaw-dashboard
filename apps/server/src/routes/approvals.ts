import { Router } from 'express';
import { Gateways } from '../gateway/gateways.js';
import { StorageService } from '../services/storage.js';
import { createError } from '../middleware/errorHandler.js';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import type {
  ApprovalListResponse,
  Approval,
  ApprovalStats,
  ResolveApprovalRequest,
} from '@openclaw-dashboard/shared';

function liveGateway(gateways: Gateways, instanceId: string) {
  const gw = gateways.resolve(instanceId);
  if (!gw || !gw.isConnected()) {
    throw createError('Not connected to Gateway', 503, 'NOT_CONNECTED');
  }
  return gw;
}

export function createApprovalsRouter(gateways: Gateways, storage: StorageService): Router {
  const router = Router({ mergeParams: true });
  router.use(requireAuth, requireOrgAccess(storage));

  router.get('/', async (req, res, next) => {
    try {
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      const { filter } = req.query;
      const result = await gw.request<ApprovalListResponse>('exec.approvals.list', {
        filter: filter as string | undefined,
      });
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get('/stats', async (req, res, next) => {
    try {
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      const result = await gw.request<ApprovalStats>('exec.approvals.stats');
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      const result = await gw.request<Approval>('exec.approvals.get', {
        approvalId: req.params.id,
      });
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/resolve', async (req, res, next) => {
    try {
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      const { action, reason, rememberChoice }: ResolveApprovalRequest = req.body;
      if (!action) throw createError('action is required', 400, 'INVALID_REQUEST');
      const validActions = ['allow-once', 'allow-always', 'deny', 'deny-always'];
      if (!validActions.includes(action)) {
        throw createError('Invalid action', 400, 'INVALID_ACTION');
      }
      const result = await gw.request('exec.approval.resolve', {
        approvalId: req.params.id,
        action,
        reason,
        rememberChoice,
      });
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
