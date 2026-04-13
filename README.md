# OpenClaw Dashboard

Multi-tenant control plane for OpenClaw gateways. Each **organization** owns one or more **instances**. Each instance is a running OpenClaw gateway — either dialed outbound by the dashboard (simple, same-network) or brought online by a **connector** the tenant runs next to their gateway (zero inbound ports, SaaS-ready).

## Repo layout

```
apps/
  server/       Node/Express API + SQLite. WebSocket upgrade on /api/connector.
  web/          Vite/React dashboard UI (⚠️ still uses pre-multi-tenant paths)
  connector/    Standalone binary tenants run next to their OpenClaw gateway
packages/
  shared/       Types shared between server, web, connector
```

## Quickstart (local dev)

```bash
pnpm install
pnpm -r build

# Required env
cp apps/server/.env.example apps/server/.env
# edit .env: set AUTH_SECRET (openssl rand -hex 32), SUPER_ADMIN_EMAIL/PASSWORD

pnpm --filter @openclaw-dashboard/server dev
```

Server listens on `http://localhost:3001` and `ws://localhost:3001/api/connector`.

## Deploying the dashboard

See **[docs/DEPLOY.md](docs/DEPLOY.md)** for a full VPS walkthrough with Caddy + systemd.

## Onboarding a client

See **[docs/CONNECTOR.md](docs/CONNECTOR.md)** for how to issue an instance token and get a tenant's OpenClaw online in a few minutes.

## Two connection modes

| | Outbound (dial-out) | Connector (dial-in) |
|---|---|---|
| Who initiates | Dashboard dials client gateway | Client connector dials dashboard |
| Client firewall | Must expose gateway (tunnel / wss://) | Outbound HTTPS only |
| Auth | Ed25519 device pairing at gateway | Instance token + device pairing locally |
| Use when | Same box / trusted LAN / Tailscale | Any SaaS client, any network |

Both modes are served transparently — routes call a unified `InstanceGateway` interface.
