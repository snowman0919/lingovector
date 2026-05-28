# Linux Server Runbook

Use this runbook for a Linux server deployment rehearsal with Docker Compose and Cloudflare Tunnel. Do not deploy production from memory. Do not paste secrets into commits, logs, screenshots, or shared chats.

## Prerequisites

Target OS: Ubuntu or Debian.

Expected packages/tools:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
```

Docker assumptions:

- Docker Engine is installed from Docker's official repository or an approved server image.
- Docker Compose v2 is available as `docker compose`.
- The operator user can run Docker commands, or uses `sudo docker`.

Check:

```bash
docker --version
docker compose version
```

## Clone or Update Repo

First install:

```bash
git clone YOUR_REPO_URL lingovector
cd lingovector
```

Update existing checkout:

```bash
cd lingovector
git fetch --all --prune
git status --short
git checkout main
git pull --ff-only
```

If `git status --short` shows local changes, stop and decide whether they are intentional before updating.

## Prepare Environment

Staging:

```bash
cp .env.staging.example .env.staging
chmod 600 .env.staging
```

Production:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Fill values outside git:

- `DATABASE_URL`
- `JWT_SECRET`
- `GOOGLE_CLIENT_ID`
- `ALLOWED_EMAIL_DOMAIN=dimigo.hs.kr`
- `CORS_ORIGINS=https://lingovector.kotori9.run`
- `NEXT_PUBLIC_API_BASE_URL=/api`
- `API_PORT=8080`
- `WEB_PORT=3000`
- `POSTGRES_PORT=5432`
- `API_HOST_PORT=18080`
- `WEB_HOST_PORT=13000`
- `POSTGRES_HOST_PORT=15432`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- provider env vars only after approval
- `CLOUDFLARE_TUNNEL_TOKEN` only as a shell environment variable or protected secret source, not in `.env.staging` or `.env.production`

Do not enable `DEV_AUTH` in staging or production.

Container ports are used by Docker service-name routing and Cloudflare Compose mode. Host ports are localhost-only bindings for operator checks on a shared server; change `API_HOST_PORT` and `WEB_HOST_PORT` when another service already uses those host ports. Keep `POSTGRES_HOST_PORT` bound to `127.0.0.1` only and do not route it through Cloudflare.

## Build

Staging:

```bash
export COMPOSE_PROJECT_NAME=lingovector-staging
export LINGOVECTOR_ENV_FILE=.env.staging

docker compose --env-file .env.staging \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml \
  build
```

Production:

```bash
export COMPOSE_PROJECT_NAME=lingovector
export LINGOVECTOR_ENV_FILE=.env.production

docker compose --env-file .env.production \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml \
  build
```

## Cloudflare Tunnel Setup

Recommended: Compose-managed `cloudflared`.

1. In Cloudflare Zero Trust, create a tunnel.
2. Add ordered public hostname/path rules:
   - `lingovector.kotori9.run` path `/api/*` -> `http://api:${API_PORT}`
   - `lingovector.kotori9.run` default path -> `http://web:${WEB_PORT}`
   The `/api/*` rule must come first.
3. Put the token in the server shell/session or protected environment file:

   ```bash
   export CLOUDFLARE_TUNNEL_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY
   ```

Alternative: install `cloudflared` as a systemd service and route `lingovector.kotori9.run /api/*` to `http://127.0.0.1:${API_HOST_PORT}`, then the default route to `http://127.0.0.1:${WEB_HOST_PORT}`.

## Start

Staging:

```bash
export COMPOSE_PROJECT_NAME=lingovector-staging
export LINGOVECTOR_ENV_FILE=.env.staging
export CLOUDFLARE_TUNNEL_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY

docker compose --env-file .env.staging \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml \
  up -d
```

Production rehearsal:

```bash
export COMPOSE_PROJECT_NAME=lingovector
export LINGOVECTOR_ENV_FILE=.env.production
export CLOUDFLARE_TUNNEL_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY

docker compose --env-file .env.production \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml \
  up -d
```

## Healthcheck

Local API health:

```bash
curl -fsS http://127.0.0.1:${API_HOST_PORT:-18080}/health
```

Cloudflare Tunnel API health:

```bash
curl -fsS https://lingovector.kotori9.run/api/health
```

Expected: `"ok": true` and `"database": {"ready": true}`.

## Logs

```bash
docker compose --env-file .env.staging \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml logs --tail=200 api

docker compose --env-file .env.staging \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml logs --tail=100 cloudflared
```

Logs must not include secrets, tunnel tokens, Google tokens, JWTs, raw voice files, or sensitive request bodies.

## Restart

```bash
docker compose --env-file .env.staging \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml restart api web cloudflared
```

## Shutdown

Preserve volumes:

```bash
docker compose --env-file .env.staging \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml down
```

Do not run `down --volumes` unless the staging owner confirms all staging DB/storage data is disposable.

## Update Procedure

1. Record current commit:

   ```bash
   git rev-parse --short HEAD
   ```

2. Preserve logs:

   ```bash
   mkdir -p logs
   docker compose --env-file .env.staging \
     -f docker-compose.production.example.yml \
     -f docker-compose.cloudflare.example.yml logs --no-color > "logs/update-$(date +%Y%m%d-%H%M%S).log"
   ```

3. Back up DB before migrations:

   ```bash
   mkdir -p backups
   docker compose --env-file .env.staging -f docker-compose.production.example.yml exec -T postgres \
     sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "backups/staging-$(date +%Y%m%d-%H%M%S).sql"
   ```

4. Pull:

   ```bash
   git pull --ff-only
   ```

5. Rebuild and restart:

   ```bash
   docker compose --env-file .env.staging \
     -f docker-compose.production.example.yml \
     -f docker-compose.cloudflare.example.yml build

   docker compose --env-file .env.staging \
     -f docker-compose.production.example.yml \
     -f docker-compose.cloudflare.example.yml up -d
   ```

6. Run smoke:

   ```bash
   STAGING_API_BASE_URL=https://lingovector.kotori9.run/api npm run test:staging-smoke
   ```

## Rollback

1. Stop API/web/cloudflared:

   ```bash
   docker compose --env-file .env.staging \
     -f docker-compose.production.example.yml \
     -f docker-compose.cloudflare.example.yml stop api web cloudflared
   ```

2. Checkout previous commit or retag previous images.
3. Rebuild/start with the previous version.
4. Check local and tunnel health.
5. Restore DB from backup only if the migration/data issue requires it and the restore plan has been reviewed.

## Security Notes

- Postgres must not be exposed publicly.
- Cloudflare Tunnel token must live outside git, such as a shell environment variable, a server secret manager, or a systemd environment file.
- Do not put the tunnel token in `.env.staging` or `.env.production`; those files are passed to app containers.
- `DEV_AUTH=false` in staging and production.
- `DIAGNOSTICS_ENABLED=false` in production except for short authenticated checks.
- Use `https://lingovector.kotori9.run` for OAuth/CORS and `/api` for frontend API configuration.
- Keep `STORAGE_DIR` persistent for voice/audio files, and back it up only according to the approved privacy policy.
- Browser ONNX TTS model files must be deployed outside git if `NEXT_PUBLIC_TTS_MODE=browser_onnx`.
- Verify the first-login consent gate, voice data deletion, and account deletion with a staging/test account before allowing real student voice uploads.
