# Lingovector Staging Rehearsal Runbook

Use this runbook to start a production-like staging instance without deploying production. Staging is for operator verification, OAuth setup checks, provider readiness, and beta rehearsal only.

Do not use real student data in staging unless a teacher/admin has explicitly approved the test and privacy handling. Prefer short synthetic passages, test voice clips, and a dedicated `@dimigo.hs.kr` staging account.

Before any real student learning data or voice sample is used, complete the final school/operator/legal review of [privacy-consent-draft.md](privacy-consent-draft.md). The in-app consent text is a beta draft, not legal advice.

## Prerequisites

- Docker Desktop or Docker Engine with Compose v2.
- Node.js 22+ and npm for smoke scripts.
- Rust stable only if running local non-Docker checks.
- Access to the staging/beta Cloudflare Tunnel hostname: `https://lingovector.kotori9.run`.
- Google OAuth web client configured for `https://lingovector.kotori9.run`.
- A staging PostgreSQL database or the compose-provided PostgreSQL service.
- No production secrets copied casually into staging.

## Create `.env.staging`

Copy the template outside git:

```bash
cp .env.staging.example .env.staging
```

Use staging-only values:

```text
APP_ENV=staging
DEV_AUTH=false
DATABASE_URL=postgres://lingovector_staging:STAGING_PASSWORD@postgres:5432/lingovector_staging
JWT_SECRET=STAGING_ONLY_LONG_RANDOM_VALUE_AT_LEAST_32_CHARS
GOOGLE_CLIENT_ID=YOUR_STAGING_GOOGLE_CLIENT_ID
ALLOWED_EMAIL_DOMAIN=dimigo.hs.kr
CORS_ORIGINS=https://lingovector.kotori9.run
API_PORT=8080
WEB_PORT=3000
POSTGRES_PORT=5432
API_HOST_PORT=18080
WEB_HOST_PORT=13000
POSTGRES_HOST_PORT=15432
STORAGE_DIR=/app/storage
DIAGNOSTICS_ENABLED=false
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_STAGING_GOOGLE_CLIENT_ID
NEXT_PUBLIC_DIAGNOSTICS_ENABLED=false
POSTGRES_USER=lingovector_staging
POSTGRES_PASSWORD=STAGING_PASSWORD
POSTGRES_DB=lingovector_staging
```

Provider env vars are optional. Leave `LLM_API_URL`, `LLM_API_KEY`, `SUPERTONE_API_KEY`, `SUPERTONE_LOCAL_TTS_URL`, `SUPERTONE_LOCAL_VOICE_URL`, and `PRONUNCIATION_PROVIDER_URL` empty for mock mode. Set `ARXIV_REAL_ENABLED=false` unless intentionally checking the real arXiv path. Use `NEXT_PUBLIC_TTS_MODE=browser_onnx` only when Supertonic ONNX model/schema assets are mounted or deployed; otherwise select `server` or `mock` deliberately.

`APP_ENV=staging` is production-like in the backend: required env vars are validated, HTTPS CORS is required, diagnostics are off by default, and `DEV_AUTH=true` is rejected.

Use a staging-specific Compose project name so local rehearsal volumes do not collide with other Lingovector compose runs:

```bash
export COMPOSE_PROJECT_NAME=lingovector-staging
```

## OAuth Staging Setup

In Google Cloud Console, configure the staging OAuth web client:

- Authorized JavaScript origin: `https://lingovector.kotori9.run`
- Backend `GOOGLE_CLIENT_ID`: same staging web client ID.
- Frontend `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: same staging web client ID.
- Authorized redirect URIs can remain empty unless a redirect/callback OAuth flow is later added.

The `@dimigo.hs.kr` restriction must still apply in staging. Verify that a non-school Google account is rejected.

## Cloudflare Tunnel Staging Setup

Cloudflare Tunnel is the expected public entrypoint for staging. Prefer the Compose `cloudflared` overlay:

```bash
export COMPOSE_PROJECT_NAME=lingovector-staging
export LINGOVECTOR_ENV_FILE=.env.staging
export CLOUDFLARE_TUNNEL_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY
```

In Cloudflare Zero Trust, route one public hostname to internal Docker services with ordered path rules:

```text
lingovector.kotori9.run /api/*  -> http://api:${API_PORT}
lingovector.kotori9.run /*      -> http://web:${WEB_PORT}
```

Then use:

```text
CORS_ORIGINS=https://lingovector.kotori9.run
NEXT_PUBLIC_API_BASE_URL=/api
```

The `/api/*` rule must be before the web fallback. Cloudflare Tunnel does not need to strip `/api`; the backend serves `/api/*` directly. Do not publish Postgres. Do not commit the tunnel token.

Cloudflare Compose mode uses Docker service names and container ports. Host ports such as `API_HOST_PORT=18080` and `WEB_HOST_PORT=13000` are only for local operator checks or systemd `cloudflared`. Keep `POSTGRES_HOST_PORT` localhost-only and never route it through Cloudflare.

## Build

Build production-like images using the staging env file:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml build
```

To build individual images:

```bash
docker build -f apps/api/Dockerfile -t lingovector-api:staging-rehearsal .
docker build \
  -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=/api \
  --build-arg NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_STAGING_GOOGLE_CLIENT_ID \
  --build-arg NEXT_PUBLIC_DIAGNOSTICS_ENABLED=false \
  -t lingovector-web:staging-rehearsal .
```

## Start

Start the stack locally, bound to localhost ports:

```bash
LINGOVECTOR_ENV_FILE=.env.staging \
docker compose --env-file .env.staging \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml up -d
```

Check container state:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml ps
```

## Healthcheck

From the host:

```bash
curl -fsS http://127.0.0.1:${API_HOST_PORT:-18080}/health
```

Through the staging public hostname or tunnel:

```bash
curl -fsS https://lingovector.kotori9.run/api/health
```

Expected response includes `"ok": true` and `"database": {"ready": true}`.

## Logs Check

Inspect recent logs without printing env files or secrets:

```bash
docker compose --env-file .env.staging -f docker-compose.production.example.yml logs --tail=200 api
docker compose --env-file .env.staging -f docker-compose.production.example.yml logs --tail=100 web
docker compose --env-file .env.staging -f docker-compose.production.example.yml -f docker-compose.cloudflare.example.yml logs --tail=100 cloudflared
```

Logs should show request paths and request IDs, not tokens, secrets, raw voice files, or sensitive request bodies.

## Smoke Test Sequence

Production-like staging uses Google OAuth, so dev-token scripts are not expected to pass unless running a separate local dev API.

Unauthenticated staging checks:

```bash
STAGING_API_BASE_URL=https://lingovector.kotori9.run/api npm run test:staging-smoke
```

Authenticated staging checks:

1. Sign in through the staging frontend with a verified `@dimigo.hs.kr` account.
2. Obtain a short-lived bearer token using browser developer tools only for this operator check.
3. Run:

   ```bash
   STAGING_API_BASE_URL=https://lingovector.kotori9.run/api \
   STAGING_AUTH_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY \
   npm run test:staging-smoke
   ```

The script does not print the token. It checks `/health`, protected-route rejection, `/me`, current consent acceptance, diagnostics if enabled, passage analysis, TTS metadata, and arXiv title/abstract behavior.

For a deeper authenticated check that also covers word inspection, pronunciation scoring, writing tutor, and arXiv open:

```bash
LINGOVECTOR_API_BASE_URL=https://lingovector.kotori9.run/api \
LINGOVECTOR_AUTH_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY \
npm run test:authenticated-smoke
```

Unset the token after testing:

```bash
unset LINGOVECTOR_AUTH_TOKEN STAGING_AUTH_TOKEN
```

Local dev smoke scripts remain useful for non-staging API verification:

```bash
npm run test:api-smoke
npm run test:tts-smoke
npm run test:learning-quality
npm run test:arxiv-smoke
```

## Provider Diagnostics Verification

Diagnostics are off by default in staging. To verify provider readiness:

1. Temporarily set `DIAGNOSTICS_ENABLED=true`.
2. Set `NEXT_PUBLIC_DIAGNOSTICS_ENABLED=true` only if you need the frontend diagnostics tab.
3. Restart the API/web as needed.
4. Sign in with an authorized staging account.
5. Run authenticated staging smoke or open `/diagnostics/providers`.
6. Confirm provider modes are `mock`, `configured`, `reachable`, `failed`, or `disabled`.
7. Confirm no secrets, API keys, raw tokens, or raw request bodies appear.
8. Set diagnostics back to false and restart.

## Storage Verification

Confirm runtime storage is mounted and writable:

```bash
STORAGE_DIR=/path/to/staging/storage npm run ops:storage
docker compose --env-file .env.staging -f docker-compose.production.example.yml exec api sh -lc 'du -sh /app/storage && find /app/storage -maxdepth 2 -type f | head -n 25'
```

Voice uploads are stored under `STORAGE_DIR/voices`; generated TTS/pronunciation audio is under `STORAGE_DIR/audio`. Do not manually delete staging user data unless the staging owner approves it.

## Rollback

For a staging rehearsal rollback:

1. Preserve logs:

   ```bash
   mkdir -p logs/staging
   docker compose --env-file .env.staging -f docker-compose.production.example.yml logs --no-color > "logs/staging/compose-$(date +%Y%m%d-%H%M%S).log"
   ```

2. Back up the staging DB:

   ```bash
   mkdir -p backups
   docker compose --env-file .env.staging -f docker-compose.production.example.yml exec -T postgres \
     sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "backups/staging-$(date +%Y%m%d-%H%M%S).sql"
   ```

3. Stop current containers:

   ```bash
   docker compose --env-file .env.staging -f docker-compose.production.example.yml stop web api
   ```

4. Checkout the previous commit or retag the previous images.
5. Rebuild/restart.
6. Confirm `/health`, OAuth login, first-login Korean consent gate, passage analysis, TTS, voice upload/delete, account deletion with a test account, and writing tutor.

## Shutdown

Stop containers but keep volumes:

```bash
docker compose --env-file .env.staging -f docker-compose.production.example.yml down
```

This preserves staging PostgreSQL and storage volumes.

## Cleanup

Clean local verification outputs only:

```bash
npm run ops:cleanup-local-output
npm run ops:cleanup-local-output -- --delete
```

Remove staging containers and networks while preserving named volumes:

```bash
docker compose --env-file .env.staging -f docker-compose.production.example.yml down
```

Remove staging volumes only after confirming the data is disposable:

```bash
docker compose --env-file .env.staging -f docker-compose.production.example.yml down --volumes
```

Do not run `down --volumes` against a production compose project or any staging project containing real student data.

## Common Failures

- `DEV_AUTH cannot be enabled`: staging is production-like. Set `DEV_AUTH=false`. For isolated local dev-token tests, use the normal development API instead.
- `DATABASE_URL is required`: fill `.env.staging` with a staging DB URL.
- `CORS_ORIGINS must contain explicit https origins`: use the exact staging frontend HTTPS origin, not localhost or `*`.
- Google login button missing: set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` at web build time and rebuild the web image.
- Google login rejected: confirm `GOOGLE_CLIENT_ID`, authorized JavaScript origin, and verified `@dimigo.hs.kr` account.
- Browser cannot call API: confirm `NEXT_PUBLIC_API_BASE_URL`, reverse proxy/tunnel route, HTTPS certificate, and `CORS_ORIGINS`.
- Diagnostics returns 404: expected when disabled. Temporarily enable `DIAGNOSTICS_ENABLED=true` only for an operator check.
- TTS returns mock provider: expected if `NEXT_PUBLIC_TTS_MODE=mock` or server-side fallback has no provider configured.
- Browser ONNX TTS falls back: expected until `NEXT_PUBLIC_SUPERTONIC_ONNX_CONFIG_URL` points to a reviewed Supertonic schema and model files are deployed.
- Voice upload fails: confirm file type, consent text includes agreement, `STORAGE_DIR` is writable, and storage volume is mounted.
