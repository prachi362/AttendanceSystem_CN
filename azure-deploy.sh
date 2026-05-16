#!/usr/bin/env bash
# Azure App Service deploy script for the attendance kiosk.
# Reads creds from local .env, pushes them as App Service settings, and zip-deploys.
#
# Usage:  ./azure-deploy.sh                    # first run (creates everything)
#         APP=existing-app-name ./azure-deploy.sh   # redeploy to an existing app

set -euo pipefail

# ---- Config ----
RG="${RG:-attendance-rg}"
PLAN="${PLAN:-attendance-plan}"
LOC="${LOC:-centralus}"        # student-friendly region
SKU="${SKU:-B1}"
APP="${APP:-attendance-cn-$RANDOM}"

# ---- Load .env (without exporting to global shell) ----
if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Need GOOGLE_SHEET_ID etc."
  exit 1
fi
set -a; source .env; set +a

# Build the service-account JSON value to push to Azure.
# Prefer the inline JSON; otherwise read the file path.
SA_JSON="${GOOGLE_SERVICE_ACCOUNT_KEY:-}"
if [[ -z "$SA_JSON" && -n "${GOOGLE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  if [[ -f "$GOOGLE_SERVICE_ACCOUNT_JSON" ]]; then
    SA_JSON="$(cat "$GOOGLE_SERVICE_ACCOUNT_JSON")"
  fi
fi
if [[ -z "$SA_JSON" ]]; then
  echo "ERROR: no service account credentials found in .env."
  echo "       Set GOOGLE_SERVICE_ACCOUNT_KEY=<json> or GOOGLE_SERVICE_ACCOUNT_JSON=<path>."
  exit 1
fi

# ---- Provision (idempotent) ----
echo "==> Resource group $RG"
if ! az group show -n "$RG" --only-show-errors >/dev/null 2>&1; then
  az group create -n "$RG" -l "$LOC" --only-show-errors >/dev/null
else
  echo "    (already exists, reusing)"
fi

echo "==> App Service plan $PLAN ($SKU, $LOC)"
az appservice plan create -n "$PLAN" -g "$RG" --is-linux --sku "$SKU" \
  --location "$LOC" --only-show-errors >/dev/null

echo "==> Web app $APP"
if ! az webapp show -n "$APP" -g "$RG" --only-show-errors >/dev/null 2>&1; then
  az webapp create -n "$APP" -g "$RG" -p "$PLAN" \
    --runtime "NODE:22-lts" --only-show-errors >/dev/null
fi

echo "==> Startup command + always-on"
az webapp config set -n "$APP" -g "$RG" \
  --startup-file "node server/index.js" \
  --always-on true --only-show-errors >/dev/null

echo "==> App settings (env vars)"
az webapp config appsettings set -n "$APP" -g "$RG" --only-show-errors --settings \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true \
  NODE_ENV=production \
  WEBSITE_NODE_DEFAULT_VERSION=~22 \
  GOOGLE_SHEET_ID="${GOOGLE_SHEET_ID:-}" \
  GOOGLE_SHEET_TAB="${GOOGLE_SHEET_TAB:-Sheet1}" \
  GOOGLE_WORKERS_TAB="${GOOGLE_WORKERS_TAB:-Workers}" \
  GOOGLE_DRIVE_FOLDER_ID="${GOOGLE_DRIVE_FOLDER_ID:-}" \
  GOOGLE_SERVICE_ACCOUNT_KEY="$SA_JSON" >/dev/null

echo "==> Building SPA locally (vite)"
npm run build >/dev/null

echo "==> Building deploy zip (includes pre-built dist/, excludes node_modules + .env)"
rm -f /tmp/attendance.zip
zip -rq /tmp/attendance.zip . \
  -x "node_modules/*" "data/*" ".git/*" ".env" "*.log"

# CUSTOM_BUILD_COMMAND tells Oryx to only install prod deps (skip vite build,
# since dist/ is already in the zip). This cuts the server build from 10 min to ~1 min.
az webapp config appsettings set -n "$APP" -g "$RG" --only-show-errors --settings \
  CUSTOM_BUILD_COMMAND="npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund" \
  >/dev/null

echo "==> Deploying (server-side: npm install prod deps only, ~1-2 min)"
az webapp deploy -n "$APP" -g "$RG" --src-path /tmp/attendance.zip --type zip \
  --async true --track-status false

URL="https://$APP.azurewebsites.net"
echo ""
echo "================================================"
echo "  Deployed:  $URL"
echo "================================================"
echo "  Tail logs:  az webapp log tail -n $APP -g $RG"
echo "  SSH:        az webapp ssh -n $APP -g $RG"
echo ""
