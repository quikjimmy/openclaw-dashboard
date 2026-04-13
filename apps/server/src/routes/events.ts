import { Router, Response } from 'express';
import { Gateways } from '../gateway/gateways.js';
import { StorageService } from '../services/storage.js';
import { AuthService } from '../services/auth.js';
import { createError } from '../middleware/errorHandler.js';
import type { GatewayEvent } from '@openclaw-dashboard/shared';

interface SseClient {
  res: Response;
  organizationId?: string;
  isSuperAdmin: boolean;
}

/**
 * Global SSE stream.
 *
 * Browsers can't attach custom headers to EventSource, so this accepts
 * `?token=` in the query string. Events are filtered by organization so a
 * tenant only sees their own instances. Subscribes to both the outbound
 * GatewayPool and the inbound ConnectorHub.
 */
export function createEventsRouter(
  gateways: Gateways,
  storage: StorageService,
  auth: AuthService
): Router {
  const router = Router();
  const clients = new Set<SseClient>();

  const deliver = (client: SseClient, payload: unknown) => {
    client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const broadcast = (instanceId: string, payload: unknown) => {
    const instance = storage.getInstance(instanceId);
    clients.forEach((client) => {
      if (client.isSuperAdmin || client.organizationId === instance?.organizationId) {
        deliver(client, payload);
      }
    });
  };

  const wireSource = (src: typeof gateways.pool | typeof gateways.hub) => {
    src.on('event', (arg: { instanceId: string; event: GatewayEvent }) => {
      broadcast(arg.instanceId, { type: 'gateway-event', instanceId: arg.instanceId, event: arg.event });
    });
    src.on('connected', (instanceId: string) => {
      broadcast(instanceId, { type: 'connection', instanceId, status: 'connected' });
    });
    src.on('disconnected', (instanceId: string) => {
      broadcast(instanceId, { type: 'connection', instanceId, status: 'disconnected' });
    });
  };
  wireSource(gateways.pool);
  wireSource(gateways.hub);
  gateways.pool.on(
    'pairing-required',
    ({ instanceId, deviceId }: { instanceId: string; deviceId: string }) => {
      broadcast(instanceId, {
        type: 'connection',
        instanceId,
        status: 'pairing_required',
        deviceId,
      });
    }
  );

  router.get('/stream', (req, res, next) => {
    try {
      const token = typeof req.query.token === 'string' ? req.query.token : null;
      if (!token) throw createError('Missing token', 401, 'UNAUTHENTICATED');
      const ctx = auth.verifyToken(token);
      if (!ctx) throw createError('Invalid token', 401, 'UNAUTHENTICATED');

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const client: SseClient = {
        res,
        organizationId: ctx.organizationId,
        isSuperAdmin: ctx.role === 'super_admin',
      };
      clients.add(client);

      deliver(client, { type: 'connected', instances: gateways.summary() });

      const ping = setInterval(() => res.write(': ping\n\n'), 30000);
      req.on('close', () => {
        clearInterval(ping);
        clients.delete(client);
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
