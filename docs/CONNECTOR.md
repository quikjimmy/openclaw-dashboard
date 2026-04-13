# Onboarding a Client (Connector Mode)

Connector mode is how you add tenants without asking them to expose their gateway. They run a small Node process next to their OpenClaw; it dials *into* your dashboard and keeps the socket open.

## Dashboard operator (you): issue a token

```bash
TOKEN=$(curl -sS -X POST https://dashboard.yourdomain.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@yourdomain.com","password":"..."}' | jq -r .data.token)

# 1. Make (or pick) an organization for this tenant
ORG=$(curl -sS -X POST https://dashboard.yourdomain.com/api/organizations \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Acme Corp","slug":"acme"}')
ORG_ID=$(echo "$ORG" | jq -r .data.id)

# 2. Create the instance in connector mode
INST=$(curl -sS -X POST https://dashboard.yourdomain.com/api/instances \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"organizationId\":\"$ORG_ID\",\"name\":\"Acme Prod\",\"gatewayUrl\":\"\",\"deployment\":\"self-hosted\",\"connectionMode\":\"connector\"}")

echo "$INST" | jq
```

The response contains `instanceToken`. **This is the only time it's shown.** Store it securely (password manager, vault) and send it to the client over a secure channel. If it's lost, regenerate:

```bash
curl -X POST https://dashboard.yourdomain.com/api/instances/$INSTANCE_ID/rotate-token \
  -H "Authorization: Bearer $TOKEN"
```

## Client (tenant): run the connector

Two options — pick whichever their VPS is set up for.

### Option A: Node directly

```bash
git clone <your-repo-url> ~/openclaw-connector
cd ~/openclaw-connector
pnpm install
pnpm --filter @openclaw-dashboard/connector build
cd apps/connector
cp .env.example .env
```

Edit `apps/connector/.env`:

```dotenv
DASHBOARD_URL=wss://dashboard.yourdomain.com/api/connector
INSTANCE_TOKEN=<the token you received>
GATEWAY_URL=ws://localhost:18789      # their local OpenClaw
STATE_DIR=/var/lib/openclaw-connector # or any writable path
```

Run:

```bash
pnpm --filter @openclaw-dashboard/connector start
```

On first run it will print:

```
[local] generated new device identity: 9f3a6b2c4e...
=========================================================
 OpenClaw pairing required
 Device ID:         9f3a6b2c4e...
 Device public key: ...base64...
 Approve this device in OpenClaw, then the connector will
 finish authenticating automatically.
=========================================================
```

The client opens OpenClaw, approves the device. The connector retries and comes online. On the dashboard, `GET /api/instances/<id>` will now show `"connected": true`.

### Option B: systemd service (recommended for production)

`/etc/systemd/system/openclaw-connector.service`:

```ini
[Unit]
Description=OpenClaw Dashboard Connector
After=network.target

[Service]
Type=simple
User=openclaw
Group=openclaw
WorkingDirectory=/opt/openclaw-connector/apps/connector
EnvironmentFile=/opt/openclaw-connector/apps/connector/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now openclaw-connector
sudo journalctl -u openclaw-connector -f
```

## What the connector does

- Pairs **once** with the local OpenClaw (Ed25519 operator role), stores the device identity + token at `STATE_DIR/identity.json` (mode 0600).
- Opens one WSS to the dashboard authenticated with `INSTANCE_TOKEN`. Auto-reconnects with backoff on drops.
- For every request the dashboard sends (`agents.list`, `chat.send`, `exec.approvals.list`, …) the connector forwards it to the local OpenClaw and returns the response.
- Forwards local OpenClaw events to the dashboard so the SSE stream / web UI updates live.

## Revoking a tenant

Either:

```bash
# Nuke the instance (disconnects any live connector)
curl -X DELETE https://dashboard.yourdomain.com/api/instances/<id> \
  -H "Authorization: Bearer $TOKEN"

# Or just rotate the token — the old connector will fail to authenticate on next reconnect
curl -X POST https://dashboard.yourdomain.com/api/instances/<id>/rotate-token \
  -H "Authorization: Bearer $TOKEN"
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Connector logs `invalid instance token` (ws 4403) | Token mismatch / rotated | Re-issue token, update `.env`, restart |
| Connector stuck on `pairing required` | Device not approved yet in OpenClaw | Approve in OpenClaw UI using the printed device ID |
| Dashboard shows instance but `connected: false` | Connector not running / network down | `systemctl status openclaw-connector` + check journal |
| Dashboard can't reach the connector endpoint | Caddy not proxying WS upgrade | Make sure `/api/*` is in the Caddy `@api` matcher |
