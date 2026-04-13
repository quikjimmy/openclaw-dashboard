#!/usr/bin/env node
import 'dotenv/config';
import path from 'path';
import { LocalGateway } from './local-gateway.js';
import { DashboardLink } from './dashboard-link.js';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return val;
}

async function main() {
  const dashboardUrl = requireEnv('DASHBOARD_URL'); // e.g. wss://dashboard.example.com/api/connector
  const instanceToken = requireEnv('INSTANCE_TOKEN'); // issued by POST /api/instances (connector mode)
  const gatewayUrl = process.env.GATEWAY_URL || 'ws://localhost:18789';
  const stateDir = process.env.STATE_DIR || './state';
  const identityPath = path.resolve(stateDir, 'identity.json');

  const local = new LocalGateway(gatewayUrl, identityPath);
  const link = new DashboardLink(dashboardUrl, instanceToken, local);

  local.on('pairing-required', (deviceId: string) => {
    console.log('');
    console.log('=========================================================');
    console.log(' OpenClaw pairing required');
    console.log(` Device ID:         ${deviceId}`);
    console.log(` Device public key: ${local.devicePublicKey}`);
    console.log(' Approve this device in OpenClaw, then the connector will');
    console.log(' finish authenticating automatically.');
    console.log('=========================================================');
    console.log('');
  });

  await local.connect().catch((err) => {
    console.error('Local gateway initial connect failed:', err.message);
    // keep going — socket will reconnect and pairing can be approved later
  });

  link.start();

  const shutdown = () => {
    console.log('Shutting down connector...');
    link.stop();
    local.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
