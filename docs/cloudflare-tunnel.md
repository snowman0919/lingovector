# Cloudflare Tunnel Deployment

Lingovector will run on a Linux server with Docker Compose and be exposed through Cloudflare Tunnel. Do not assume inbound public `80` or `443` ports are open. Keep the public entrypoint in Cloudflare and keep Docker services private to the host or Docker network.

## Recommended Architecture

Default path: run `cloudflared` as an additional Docker Compose service.

```text
Browser
  -> Cloudflare HTTPS
  -> Cloudflare Tunnel
  -> cloudflared container
  -> Docker Compose network
  -> web:${WEB_PORT:-3000} and api:${API_PORT:-8080}
```

Services:

- `web`: Next.js production server on container port `WEB_PORT`, default `3000`.
- `api`: Rust Axum API on container port `API_PORT`, default `8080`.
- `postgres`: PostgreSQL on container port `POSTGRES_PORT`, default `5432`, never public.
- `cloudflared`: outbound tunnel connector.

Recommended public hostname:

- Web: `https://lingovector.kotori9.run/`
- API: `https://lingovector.kotori9.run/api/`

Lingovector now prefers single-domain, path-based API routing. The API subdomain is no longer the default. This keeps Google OAuth and browser CORS to one public origin. Cloudflare Tunnel path routing does not need to strip `/api` because the Axum backend serves the same API route tree under `/api`.

The `/api` path is not a security boundary. The API is still discoverable by path. Real security depends on Google OAuth, backend auth checks, safe CORS, diagnostics disabled by default, `DEV_AUTH=false`, and never exposing secrets.

## Option A: cloudflared as Compose Service

This is the recommended default because `cloudflared` can reach `web` and `api` by Docker service name and runs with the same Compose lifecycle.

1. Create the tunnel in Cloudflare Zero Trust.
2. Store the tunnel token in a shell environment variable or server secret manager, never in git.
3. Configure ordered public hostname/path rules in Cloudflare:

   ```text
   lingovector.kotori9.run /api/*  -> http://api:${API_PORT}
   lingovector.kotori9.run /*      -> http://web:${WEB_PORT}
   ```

   The `/api/*` rule must come before the web fallback rule. Substitute the actual values from `.env.production` or `.env.staging`; the Cloudflare dashboard does not expand Compose env vars in service URLs.

4. Start Compose with the tunnel overlay:

   ```bash
   export COMPOSE_PROJECT_NAME=lingovector
   export LINGOVECTOR_ENV_FILE=.env.production
   export CLOUDFLARE_TUNNEL_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY

   docker compose --env-file .env.production \
     -f docker-compose.production.example.yml \
     -f docker-compose.cloudflare.example.yml \
     up -d
   ```

For staging, use `.env.staging` and a staging project name:

```bash
export COMPOSE_PROJECT_NAME=lingovector-staging
export LINGOVECTOR_ENV_FILE=.env.staging
export CLOUDFLARE_TUNNEL_TOKEN=PASTE_STAGING_TOKEN_IN_SHELL_ONLY

docker compose --env-file .env.staging \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml \
  up -d
```

## Option B: cloudflared as Linux systemd Service

Use this if the operator prefers OS-managed `cloudflared`, or if the Cloudflare account uses a config-file tunnel instead of a token-managed tunnel.

1. Install `cloudflared` on the Linux server.
2. Authenticate/create the tunnel using Cloudflare's current package instructions.
3. Configure ingress to the Compose-published localhost ports:

   ```yaml
   tunnel: YOUR_TUNNEL_ID
   credentials-file: /etc/cloudflared/YOUR_TUNNEL_ID.json

   ingress:
     - hostname: lingovector.kotori9.run
       path: /api/*
       service: http://127.0.0.1:18080
     - hostname: lingovector.kotori9.run
       service: http://127.0.0.1:13000
     - service: http_status:404
   ```

4. Run `cloudflared` under systemd.

With this option, keep the existing `docker-compose.production.example.yml` port bindings to `127.0.0.1`. They are not public, but the local systemd service can reach them.

## Cloudflare Dashboard Notes

High-level Zero Trust steps:

1. Open Cloudflare Zero Trust.
2. Create a tunnel for the Linux server.
3. Install/run the connector using either the Compose token or systemd setup.
4. Add public hostname/path rules:
   - `lingovector.kotori9.run` with path `/api/*` -> `http://api:${API_PORT}` for Compose service mode, or `http://127.0.0.1:${API_HOST_PORT}` for systemd mode.
   - `lingovector.kotori9.run` default/fallback path -> `http://web:${WEB_PORT}` for Compose service mode, or `http://127.0.0.1:${WEB_HOST_PORT}` for systemd mode.
5. Confirm the `/api/*` rule is ordered before the web fallback rule.
6. Confirm Cloudflare DNS is managed for `lingovector.kotori9.run`.

HTTPS is terminated at Cloudflare. Local traffic from `cloudflared` to containers may be HTTP inside the Docker network or localhost.

## Env Values

For the single public hostname:

```text
CORS_ORIGINS=https://lingovector.kotori9.run
NEXT_PUBLIC_API_BASE_URL=/api
API_PORT=8080
WEB_PORT=3000
API_HOST_PORT=18080
WEB_HOST_PORT=13000
POSTGRES_HOST_PORT=15432
```

OAuth:

```text
GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

Google OAuth Authorized JavaScript origins must include only the final HTTPS web origin:

```text
https://lingovector.kotori9.run
```

Authorized redirect URIs can remain empty unless the app changes to a redirect/callback OAuth flow.

## Security Notes

- Do not expose Postgres publicly.
- Do not publish Docker ports on `0.0.0.0` unless another reviewed network boundary exists. The example Compose file binds host ports to `127.0.0.1`.
- Keep `POSTGRES_HOST_PORT` localhost-only for maintenance; Cloudflare should never route to Postgres.
- Do not enable `DEV_AUTH` in staging or production.
- Keep diagnostics disabled in production. Enable only for a short authenticated operator check.
- Do not commit `CLOUDFLARE_TUNNEL_TOKEN`.
- Store tunnel tokens in a shell environment variable, a server secret manager, or a systemd environment file with restrictive permissions.
- Do not put `CLOUDFLARE_TUNNEL_TOKEN` in `.env.staging` or `.env.production`; those files are passed to app containers through `env_file`.
- Use HTTPS public origins in OAuth, CORS, and frontend API config.
- Keep voice/audio storage persistent. Back it up only if the beta privacy policy permits retaining those files.

## Checks

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml ps

docker compose --env-file .env.production \
  -f docker-compose.production.example.yml \
  -f docker-compose.cloudflare.example.yml logs --tail=100 cloudflared

curl -fsS https://lingovector.kotori9.run/api/health

STAGING_API_BASE_URL=https://lingovector.kotori9.run/api npm run test:staging-smoke
```
