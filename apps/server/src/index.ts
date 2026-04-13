import 'dotenv/config';
import http from 'http';
import crypto from 'crypto';
import { createApp } from './app.js';
import { GatewayPool } from './gateway/pool.js';
import { ConnectorHub } from './gateway/connector.js';
import { Gateways } from './gateway/gateways.js';
import { InstanceDeviceService } from './services/device.js';
import { StorageService } from './services/storage.js';
import { AuthService } from './services/auth.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const AUTH_SECRET = process.env.AUTH_SECRET;

async function main() {
  if (!AUTH_SECRET) {
    console.error('AUTH_SECRET env var is required (>= 16 chars)');
    process.exit(1);
  }

  const storage = new StorageService();
  const devices = new InstanceDeviceService(storage);
  const pool = new GatewayPool(storage, devices);
  const hub = new ConnectorHub(storage);
  const gateways = new Gateways(storage, pool, hub);
  const auth = new AuthService(storage, AUTH_SECRET);

  await bootstrapSuperAdmin(storage, auth);

  const app = createApp({ storage, gateways, devices, auth });

  const server = http.createServer(app);
  hub.attach(server, '/api/connector');

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Connector endpoint: ws://localhost:${PORT}/api/connector`);
  });

  // Auto-reconnect known outbound instances on boot. Connector-mode instances
  // dial in themselves.
  for (const instance of storage.getInstances()) {
    if (instance.connectionMode === 'outbound' && instance.gatewayUrl) {
      pool.connect(instance.id).catch((err) => {
        console.warn(`Failed to connect instance ${instance.id}:`, err.message);
      });
    }
  }

  const shutdown = () => {
    console.log('Shutting down...');
    pool.disconnectAll();
    hub.closeAll();
    storage.close();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function bootstrapSuperAdmin(storage: StorageService, auth: AuthService) {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) return;
  if (storage.getUserByEmail(email)) return;

  const passwordHash = await auth.hashPassword(password);
  storage.createUser({
    id: crypto.randomUUID(),
    email,
    name: 'Super Admin',
    role: 'super_admin',
    passwordHash,
  });
  console.log(`Seeded super_admin user: ${email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
