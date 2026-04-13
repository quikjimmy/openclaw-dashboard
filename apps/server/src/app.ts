import express, { Express } from 'express';
import cors from 'cors';
import { Gateways } from './gateway/gateways.js';
import { InstanceDeviceService } from './services/device.js';
import { StorageService } from './services/storage.js';
import { AuthService } from './services/auth.js';
import { configureAuth } from './middleware/auth.js';
import { createAuthRouter } from './routes/auth.js';
import { createOrganizationsRouter } from './routes/organizations.js';
import { createInstancesRouter } from './routes/instances.js';
import { createEventsRouter } from './routes/events.js';
import { createGatewayRouter } from './routes/gateway.js';
import { createAgentsRouter } from './routes/agents.js';
import { createChatRouter } from './routes/chat.js';
import { createApprovalsRouter } from './routes/approvals.js';
import { createTasksRouter } from './routes/tasks.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { errorHandler } from './middleware/errorHandler.js';

export interface AppDeps {
  storage: StorageService;
  gateways: Gateways;
  devices: InstanceDeviceService;
  auth: AuthService;
}

export function createApp(deps: AppDeps): Express {
  const { storage, gateways, devices, auth } = deps;
  configureAuth(auth);

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_, res) => {
    res.json({
      status: 'ok',
      instances: gateways.summary(),
    });
  });

  app.use('/api/auth', createAuthRouter(storage, auth));
  app.use('/api/organizations', createOrganizationsRouter(storage));
  app.use('/api/instances', createInstancesRouter(storage, gateways, devices));
  app.use('/api/events', createEventsRouter(gateways, storage, auth));
  app.use('/api/dashboard', createDashboardRouter(storage, gateways));

  app.use('/api/instances/:instanceId/agents', createAgentsRouter(gateways, storage));
  app.use('/api/instances/:instanceId/chat', createChatRouter(gateways, storage));
  app.use('/api/instances/:instanceId/approvals', createApprovalsRouter(gateways, storage));
  app.use('/api/instances/:instanceId/tasks', createTasksRouter(gateways, storage));
  app.use('/api/instances/:instanceId/gateway', createGatewayRouter(gateways, storage));

  app.use(errorHandler);
  return app;
}
