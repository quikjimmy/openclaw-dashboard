import { Router } from 'express';
import { Gateways } from '../gateway/gateways.js';
import { StorageService } from '../services/storage.js';
import { createError } from '../middleware/errorHandler.js';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import type { AgentListResponse, Agent, CreateAgentRequest } from '@openclaw-dashboard/shared';

function liveGateway(gateways: Gateways, instanceId: string) {
  const gw = gateways.resolve(instanceId);
  if (!gw || !gw.isConnected()) {
    throw createError('Not connected to Gateway', 503, 'NOT_CONNECTED');
  }
  return gw;
}

export function createAgentsRouter(gateways: Gateways, storage: StorageService): Router {
  const router = Router({ mergeParams: true });
  router.use(requireAuth, requireOrgAccess(storage));

  router.get('/', async (req, res, next) => {
    try {
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      const result = await gw.request<AgentListResponse>('agents.list');
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      const result = await gw.request<Agent>('agent.identity.get', { agentId: req.params.id });
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      const agentData: CreateAgentRequest = req.body;
      const result = await gw.request<Agent>('agents.create', agentData);
      res.status(201).json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      const result = await gw.request<Agent>('agents.update', {
        agentId: req.params.id,
        ...req.body,
      });
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      await gw.request('agents.delete', { agentId: req.params.id });
      res.json({ ok: true, data: null });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/:action', async (req, res, next) => {
    try {
      const { id, action } = req.params as { id: string; action: string };
      if (!['start', 'stop', 'restart'].includes(action)) {
        throw createError('Invalid action', 400, 'INVALID_ACTION');
      }
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      const result = await gw.request(`agent.${action}`, { agentId: id });
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
