import { Router } from 'express';
import crypto from 'crypto';
import { StorageService } from '../services/storage.js';
import { Gateways } from '../gateway/gateways.js';
import { InstanceDeviceService } from '../services/device.js';
import { createError } from '../middleware/errorHandler.js';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import type {
  CreateInstanceRequest,
  Instance,
  InstanceListResponse,
} from '@openclaw-dashboard/shared';

function generateInstanceToken(): string {
  // 32 bytes = 256 bits of entropy, base64url for URL-safe transport.
  return crypto.randomBytes(32).toString('base64url');
}

export function createInstancesRouter(
  storage: StorageService,
  gateways: Gateways,
  devices: InstanceDeviceService
): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', (req, res, next) => {
    try {
      const auth = req.auth!;
      const orgFilter =
        typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;

      let orgScope: string | undefined;
      if (auth.role === 'super_admin') {
        orgScope = orgFilter;
      } else {
        if (!auth.organizationId) throw createError('No organization', 403, 'FORBIDDEN');
        if (orgFilter && orgFilter !== auth.organizationId) {
          throw createError('Forbidden', 403, 'FORBIDDEN');
        }
        orgScope = auth.organizationId;
      }

      const instances = storage.getInstances(orgScope);
      const response: InstanceListResponse = { instances, total: instances.length };
      res.json({ ok: true, data: response });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', requireOrgAccess(storage, 'id'), (req, res, next) => {
    try {
      const instance = storage.getInstance(req.params.id);
      if (!instance) throw createError('Instance not found', 404, 'NOT_FOUND');
      const gw = gateways.resolve(req.params.id);
      res.json({
        ok: true,
        data: { ...instance, connected: gw?.isConnected() ?? false },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const auth = req.auth!;
      const body = req.body as CreateInstanceRequest;
      if (!body.name) throw createError('name is required', 400, 'INVALID_REQUEST');
      if (!body.organizationId) throw createError('organizationId is required', 400, 'INVALID_REQUEST');
      const mode = body.connectionMode || 'outbound';
      if (mode === 'outbound' && !body.gatewayUrl) {
        throw createError('gatewayUrl is required for outbound mode', 400, 'INVALID_REQUEST');
      }
      if (auth.role !== 'super_admin' && auth.organizationId !== body.organizationId) {
        throw createError('Forbidden', 403, 'FORBIDDEN');
      }
      if (!storage.getOrganization(body.organizationId)) {
        throw createError('Organization not found', 404, 'ORG_NOT_FOUND');
      }

      const id = crypto.randomUUID();
      let plainToken: string | null = null;
      let instanceTokenHash: string | undefined;
      if (mode === 'connector') {
        plainToken = generateInstanceToken();
        instanceTokenHash = StorageService.hashInstanceToken(plainToken);
      }

      const instance = storage.createInstance({
        id,
        organizationId: body.organizationId,
        name: body.name,
        description: body.description,
        gatewayUrl: body.gatewayUrl || '',
        deployment: body.deployment,
        connectionMode: mode,
        region: body.region,
        instanceTokenHash,
      });

      const responseData: Record<string, unknown> = { ...instance };
      if (mode === 'outbound') {
        // Provision device keys eagerly so the public key is available for pairing.
        const identity = devices.getOrCreate(id);
        responseData.deviceId = identity.id;
        responseData.devicePublicKey = identity.publicKey;
      }
      if (plainToken) {
        // SHOWN ONCE — store on the client immediately, never retrievable again.
        responseData.instanceToken = plainToken;
      }

      res.status(201).json({ ok: true, data: responseData });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', requireOrgAccess(storage, 'id'), (req, res, next) => {
    try {
      const body = req.body as Partial<Instance>;
      const updated = storage.updateInstance(req.params.id, body);
      if (!updated) throw createError('Instance not found', 404, 'NOT_FOUND');
      if (body.gatewayUrl) {
        gateways.disconnect(req.params.id);
      }
      res.json({ ok: true, data: updated });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', requireOrgAccess(storage, 'id'), (req, res, next) => {
    try {
      gateways.disconnect(req.params.id);
      const ok = storage.deleteInstance(req.params.id);
      if (!ok) throw createError('Instance not found', 404, 'NOT_FOUND');
      res.json({ ok: true, data: null });
    } catch (error) {
      next(error);
    }
  });

  // Regenerate connector token (for key rotation or lost-token recovery)
  router.post('/:id/rotate-token', requireOrgAccess(storage, 'id'), (req, res, next) => {
    try {
      const instance = storage.getInstance(req.params.id);
      if (!instance) throw createError('Instance not found', 404, 'NOT_FOUND');
      if (instance.connectionMode !== 'connector') {
        throw createError('Only connector instances have tokens', 400, 'INVALID_MODE');
      }
      const token = generateInstanceToken();
      storage.updateInstance(req.params.id, {
        instanceTokenHash: StorageService.hashInstanceToken(token),
      });
      gateways.disconnect(req.params.id);
      res.json({ ok: true, data: { instanceToken: token } });
    } catch (error) {
      next(error);
    }
  });

  // Outbound-mode lifecycle
  router.post('/:id/connect', requireOrgAccess(storage, 'id'), async (req, res, next) => {
    try {
      const instance = storage.getInstance(req.params.id);
      if (!instance) throw createError('Instance not found', 404, 'NOT_FOUND');
      if (instance.connectionMode === 'connector') {
        throw createError('Connector instances connect themselves', 400, 'INVALID_MODE');
      }
      const gw = await gateways.ensureConnected(req.params.id);
      const identity = devices.getOrCreate(req.params.id);
      res.json({
        ok: true,
        data: { connected: gw?.isConnected() ?? false, deviceId: identity.id },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/disconnect', requireOrgAccess(storage, 'id'), (req, res, next) => {
    try {
      gateways.disconnect(req.params.id);
      res.json({ ok: true, data: { connected: false } });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id/status', requireOrgAccess(storage, 'id'), (req, res, next) => {
    try {
      const instance = storage.getInstance(req.params.id);
      if (!instance) throw createError('Instance not found', 404, 'NOT_FOUND');
      const gw = gateways.resolve(req.params.id);
      const payload: Record<string, unknown> = {
        connected: gw?.isConnected() ?? false,
        mode: instance.connectionMode,
      };
      if (instance.connectionMode === 'outbound') {
        const identity = devices.getOrCreate(req.params.id);
        payload.deviceId = identity.id;
        payload.devicePublicKey = identity.publicKey;
      }
      res.json({ ok: true, data: payload });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
