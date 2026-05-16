# Azure App Service deployment

**Live URL:** https://attendance-cn-18203.azurewebsites.net
**Resource group:** `attendance-rg` · **Plan:** `attendance-plan` (B1 Linux, eastus2) · **App:** `attendance-cn-18203`

## TL;DR — redeploy in ~2 minutes

```bash
./azure-deploy.sh
```

This script:
1. Builds the SPA locally (`vite build` → `dist/`, ~3 sec).
2. Zips `server/`, `dist/`, `package.json`, `package-lock.json` (excludes `node_modules`, `.env`, `data/`).
3. Pushes the zip; Oryx installs **production-only deps** on Linux (`sharp`, `tfjs-node` native binaries). ~1-2 min.

## Why local build + server install (not full Oryx build)

Oryx's full build would run `npm install` (full) + `npm run build` (vite) on the server. Two problems:
- It takes ~10 minutes per deploy.
- `vite` is a devDep, so production mode skips it → `vite: not found`.

Our approach: **build the SPA locally** (it's identical output on any machine), and let Oryx only do what *must* run on Linux: install `sharp` and `tfjs-node` native bindings. This is configured via the app setting `CUSTOM_BUILD_COMMAND`.

## First-time provisioning (already done)

If you ever need to recreate the app from scratch, the script auto-provisions everything. Just run `./azure-deploy.sh` — it's idempotent.

Region: **eastus2** (Azure for Students allows `northcentralus, canadacentral, westus3, eastus2, eastus`; you cannot use `westus2` or `centralus`).

## Key app settings (already configured)

| Setting | Value | Purpose |
|---|---|---|
| `NODE_ENV` | `production` | Triggers the static-file serving block in `server/index.js` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | Lets Oryx run `CUSTOM_BUILD_COMMAND` |
| `CUSTOM_BUILD_COMMAND` | `npm ci --omit=dev ...` | Skip vite build, install prod deps only |
| `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_TAB`, `GOOGLE_WORKERS_TAB`, `GOOGLE_DRIVE_FOLDER_ID` | from `.env` | Sheet/Drive config |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | full JSON | Service-account credentials (pushed by the script from your local `.env`) |

Update env vars later via:
```bash
az webapp config appsettings set -n attendance-cn-18203 -g attendance-rg \
  --settings KEY=value
```

## Verify the deployment

```bash
# Health checks
curl https://attendance-cn-18203.azurewebsites.net/api/face/warm   # → {"ok":true} means tfjs-node loaded
curl https://attendance-cn-18203.azurewebsites.net/api/stats
curl https://attendance-cn-18203.azurewebsites.net/api/workers | jq length

# Live logs
az webapp log tail -n attendance-cn-18203 -g attendance-rg

# SSH
az webapp ssh -n attendance-cn-18203 -g attendance-rg
```

## Macbook quirks (one-time fixes)

### Homebrew Python + `pyexpat` crash on macOS Tahoe

If `az` commands crash with `Symbol not found: _XML_SetAllocTrackerActivationThreshold`:

```bash
install_name_tool -change /usr/lib/libexpat.1.dylib \
  /opt/homebrew/opt/expat/lib/libexpat.1.dylib \
  /opt/homebrew/Cellar/python@3.13/3.13.13_1/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/pyexpat.cpython-313-darwin.so
codesign --force -s - \
  /opt/homebrew/Cellar/python@3.13/3.13.13_1/Frameworks/Python.framework/Versions/3.13/lib/python3.13/lib-dynload/pyexpat.cpython-313-darwin.so
```

## Cost (Azure for Students $100 credit)

- B1 Linux plan: ~$13/month → about 7 months of runtime.
- Bandwidth and storage: negligible for a kiosk workload.
- `--always-on true` is already set so you get no cold-start lag.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Deploy log says `vite: not found` | Oryx running `npm run build` in production mode | Already fixed via `CUSTOM_BUILD_COMMAND`. If it recurs, verify the setting exists. |
| `/api/face/warm` returns 503 | `tfjs-node` failed to install on Linux | Check `az webapp log tail` for the install error. Plan must be B1 or higher (not free). |
| Site returns 503 "Application Error" | App crashed at startup | `az webapp log download` then inspect `LogFiles/*docker.log` for the node stack trace. |
| `RequestDisallowedByAzure` on plan create | Student subscription region policy | Use `LOC=eastus2 ./azure-deploy.sh` (or any other allowed region). |
| `Linux Runtime 'NODE\|20-lts' is not supported` | Region only has Node 22 | Already using `NODE:22-lts`. |
