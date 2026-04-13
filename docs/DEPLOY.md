# Deploying the Dashboard to a VPS

Opinionated: one VPS runs OpenClaw *and* the dashboard, fronted by Caddy for TLS. Works for both "just my own OpenClaw" and "I have tenants too."

## Prerequisites

- A VPS (any Linux; these steps assume Debian/Ubuntu).
- A domain you control, with an A record for e.g. `dashboard.yourdomain.com` pointing at the VPS.
- OpenClaw already running on the VPS, bound to `127.0.0.1:18789` (default).
- Node 20+ and pnpm on the VPS.

```bash
# Node 20 (Debian/Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pnpm

# Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

## 1. Clone and build

```bash
sudo mkdir -p /opt/openclaw-dashboard && sudo chown $USER /opt/openclaw-dashboard
git clone <your-repo-url> /opt/openclaw-dashboard
cd /opt/openclaw-dashboard
pnpm install
pnpm -r build
```

## 2. Configure the server

```bash
cd /opt/openclaw-dashboard/apps/server
cp .env.example .env
```

Edit `.env`:

```dotenv
PORT=3001
DATA_DIR=/opt/openclaw-dashboard/apps/server/data
AUTH_SECRET=<paste `openssl rand -hex 32` output>
SUPER_ADMIN_EMAIL=you@yourdomain.com
SUPER_ADMIN_PASSWORD=<a strong password, used only for first boot>
```

`SUPER_ADMIN_*` is only consumed on first boot; safe to delete after.

## 3. Run as a systemd service

`/etc/systemd/system/openclaw-dashboard.service`:

```ini
[Unit]
Description=OpenClaw Dashboard API
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/openclaw-dashboard/apps/server
EnvironmentFile=/opt/openclaw-dashboard/apps/server/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /opt/openclaw-dashboard/apps/server/data
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-dashboard
sudo systemctl status openclaw-dashboard
```

## 4. Serve the web UI

For now, build the static bundle and let Caddy serve it directly:

```bash
cd /opt/openclaw-dashboard
pnpm --filter @openclaw-dashboard/web build
# output: /opt/openclaw-dashboard/apps/web/dist
```

> **Heads up:** the web UI still targets legacy single-tenant API paths. It'll load but most pages won't function end-to-end until it's updated to use instance-scoped routes and the login flow. The API is fully usable via `curl`/Postman today.

## 5. Caddy reverse proxy

`/etc/caddy/Caddyfile`:

```caddy
dashboard.yourdomain.com {
    encode zstd gzip

    # Static web UI
    root * /opt/openclaw-dashboard/apps/web/dist
    file_server

    # API + SSE + connector WebSocket upgrade
    @api path /api/* /health
    handle @api {
        reverse_proxy localhost:3001 {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
            flush_interval -1       # SSE: disable buffering
        }
    }
}
```

```bash
sudo systemctl reload caddy
```

Caddy fetches a Let's Encrypt cert automatically. Visit `https://dashboard.yourdomain.com/health` — you should see `{"status":"ok","instances":[]}`.

## 6. Verify

```bash
# from your laptop
curl https://dashboard.yourdomain.com/health
curl -X POST https://dashboard.yourdomain.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@yourdomain.com","password":"..."}'
```

## 7. Attach your own OpenClaw as the first instance

Since OpenClaw is on the **same box** as the dashboard, use `outbound` mode with `localhost` — no tunnels:

```bash
TOKEN=<paste token from /api/auth/login>
ORG=$(curl -sS -X POST https://dashboard.yourdomain.com/api/organizations \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Personal","slug":"personal"}')

ORG_ID=$(node -e "console.log(JSON.parse(process.argv[1]).data.id)" "$ORG")

curl -sS -X POST https://dashboard.yourdomain.com/api/instances \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"organizationId\":\"$ORG_ID\",\"name\":\"Local\",\"gatewayUrl\":\"ws://localhost:18789\",\"deployment\":\"self-hosted\",\"connectionMode\":\"outbound\"}"
```

The response returns the instance, plus `deviceId` and `devicePublicKey`. Approve the device in your OpenClaw UI. The server will connect automatically.

## 8. Updating later

```bash
cd /opt/openclaw-dashboard
git pull
pnpm install
pnpm -r build
sudo systemctl restart openclaw-dashboard
```

SQLite schema evolves via idempotent `ALTER TABLE` calls in `StorageService.initSchema` — no manual migrations needed.

## Backups

Only one thing to back up: the SQLite file.

```bash
sqlite3 /opt/openclaw-dashboard/apps/server/data/dashboard.db ".backup '/var/backups/dashboard-$(date +%F).db'"
```

Throw that in a cron and you're good.
