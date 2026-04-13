#!/usr/bin/env bash
# Trigger a connect for a given instance id.
#
# Usage (run on the VPS):
#   EMAIL=admin@openclaw.local PASSWORD=xxx scripts/connect-instance.sh <instanceId>

set -euo pipefail

DASHBOARD="${DASHBOARD:-http://localhost:3001}"
EMAIL="${EMAIL:?EMAIL required}"
PASSWORD="${PASSWORD:?PASSWORD required}"
INSTANCE_ID="${1:?instance id required as first arg}"

TOKEN=$(curl -sS -X POST "$DASHBOARD/api/auth/login" \
  -H 'Content-Type: application/json' \
  --data-raw "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data.token))")

if [ -z "$TOKEN" ]; then
  echo "Login failed"
  exit 1
fi

curl -sS -X POST "$DASHBOARD/api/instances/$INSTANCE_ID/connect" \
  -H "Authorization: Bearer $TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
