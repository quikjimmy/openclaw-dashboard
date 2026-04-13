#!/usr/bin/env bash
# Create the first org + local-OpenClaw instance, from the VPS.
#
# Usage (run on the VPS):
#   DASHBOARD=http://localhost:3001 \
#   EMAIL=admin@openclaw.local \
#   PASSWORD=xxx \
#   ORG_NAME=Personal ORG_SLUG=personal \
#   INSTANCE_NAME=Local GATEWAY_URL=ws://localhost:18789 \
#   scripts/bootstrap-local-instance.sh

set -euo pipefail

DASHBOARD="${DASHBOARD:-http://localhost:3001}"
EMAIL="${EMAIL:?EMAIL required}"
PASSWORD="${PASSWORD:?PASSWORD required}"
ORG_NAME="${ORG_NAME:-Personal}"
ORG_SLUG="${ORG_SLUG:-personal}"
INSTANCE_NAME="${INSTANCE_NAME:-Local}"
GATEWAY_URL="${GATEWAY_URL:-ws://localhost:18789}"

jq_get() {
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const v=JSON.parse(d); const p='$1'.split('.'); let o=v; for(const k of p) o=o?.[k]; console.log(o ?? '')})"
}

echo "--- login ---"
TOKEN=$(curl -sS -X POST "$DASHBOARD/api/auth/login" \
  -H 'Content-Type: application/json' \
  --data-raw "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | jq_get 'data.token')

if [ -z "$TOKEN" ]; then
  echo "Login failed"
  exit 1
fi
echo "Token obtained: ${TOKEN:0:24}..."

echo "--- create org ($ORG_NAME) ---"
ORG_ID=$(curl -sS -X POST "$DASHBOARD/api/organizations" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data-raw "{\"name\":\"$ORG_NAME\",\"slug\":\"$ORG_SLUG\"}" \
  | jq_get 'data.id')

if [ -z "$ORG_ID" ]; then
  # Maybe the org already exists — look it up
  ORG_ID=$(curl -sS "$DASHBOARD/api/organizations" \
    -H "Authorization: Bearer $TOKEN" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d); const m=(r.data.organizations||[]).find(o=>o.slug==='$ORG_SLUG'); console.log(m?m.id:'')})")
fi
echo "Org ID: $ORG_ID"

echo "--- create instance ($INSTANCE_NAME, outbound -> $GATEWAY_URL) ---"
curl -sS -X POST "$DASHBOARD/api/instances" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data-raw "{\"organizationId\":\"$ORG_ID\",\"name\":\"$INSTANCE_NAME\",\"gatewayUrl\":\"$GATEWAY_URL\",\"deployment\":\"self-hosted\",\"connectionMode\":\"outbound\"}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
