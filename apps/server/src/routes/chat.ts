import { Router } from 'express';
import { Gateways } from '../gateway/gateways.js';
import { StorageService } from '../services/storage.js';
import { createError } from '../middleware/errorHandler.js';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import type {
  SessionListResponse,
  Session,
  ChatHistoryResponse,
  Message,
  SendMessageRequest,
} from '@openclaw-dashboard/shared';

function liveGateway(gateways: Gateways, instanceId: string) {
  const gw = gateways.resolve(instanceId);
  if (!gw || !gw.isConnected()) {
    throw createError('Not connected to Gateway', 503, 'NOT_CONNECTED');
  }
  return gw;
}

export function createChatRouter(gateways: Gateways, storage: StorageService): Router {
  const router = Router({ mergeParams: true });
  router.use(requireAuth, requireOrgAccess(storage));

  router.get('/sessions', async (req, res, next) => {
    try {
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      const { agentId } = req.query;
      const result = await gw.request<SessionListResponse>('sessions.list', {
        agentId: agentId as string | undefined,
      });
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get('/sessions/:id', async (req, res, next) => {
    try {
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      const result = await gw.request<Session>('sessions.get', { sessionId: req.params.id });
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.post('/sessions', async (req, res, next) => {
    try {
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      const { agentId } = req.body;
      if (!agentId) throw createError('agentId is required', 400, 'INVALID_REQUEST');
      const result = await gw.request<Session>('sessions.create', { agentId });
      res.status(201).json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get('/history/:sessionId', async (req, res, next) => {
    try {
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      const { cursor, limit } = req.query;
      const result = await gw.request<ChatHistoryResponse>('chat.history', {
        sessionId: req.params.sessionId,
        cursor: cursor as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  router.post('/send', async (req, res, next) => {
    try {
      const gw = liveGateway(gateways, (req.params as unknown as { instanceId: string }).instanceId);
      const messageData: SendMessageRequest = req.body;
      if (!messageData.agentId) throw createError('agentId is required', 400, 'INVALID_REQUEST');
      if (!messageData.content) throw createError('content is required', 400, 'INVALID_REQUEST');
      const result = await gw.request<Message>('chat.send', messageData);
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
