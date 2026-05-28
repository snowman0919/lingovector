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
  -> web:3000 and api:8080
```

Services:

- `web`: Next.js production server on container port `3000`.
- `api`: Rust Axum API on container port `8080`.
- `postgres`: PostgreSQL on container port `5432`, never public.
- `cloudflared`: outbound tunnel connector.

Recommended public hostnames:

- Web: `https://lingovector.example.com`
- API: `https://api.lingovector.example.com`

This split-host design matches the current app best because the frontend uses `NEXT_PUBLIC_API_BASE_URL` as a complete browser-visible API origin and the API validates `CORS_ORIGINS` against the web origin.

Single-domain routing, such as `https://lingovector.example.com/api`, is not the default. Cloudflare hostname/path routing does not rewrite `/api` away for the backend. Use single-domain routing only if you add a reverse proxy that rewrites `/api/*` to the Axum API routes.

## Option A: cloudflared as Compose Service

This is the recommended default because `cloudflared` can reach `web` and `api` by Docker service name and runs with the same Compose lifecycle.

1. Create the tunnel in Cloudflare Zero Trust.
2. Store the tunnel token in a shell environment variable or server secret manager, never in git.
3. Configure public hostnames in Cloudflare:

   ```text
   lingovector.example.com      -> http://web:3000
   api.lingovector.example.com  -> http://api:8080
   ```

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
     - hostname: lingovector.example.com
       service: http://127.0.0.1:3000
     - hostname: api.lingovector.example.com
       service: http://127.0.0.1:8080
     - service: http_status:404
   ```

4. Run `cloudflared` under systemd.

With this option, keep the existing `docker-compose.production.example.yml` port bindings to `127.0.0.1`. They are not public, but the local systemd service can reach them.

## Cloudflare Dashboard Notes

High-level Zero Trust steps:

1. Open Cloudflare Zero Trust.
2. Create a tunnel for the Linux server.
3. Install/run the connector using either the Compose token or systemd setup.
4. Add public hostnames:
   - Web hostname -> `http://web:3000` for Compose service mode, or `http://127.0.0.1:3000` for systemd mode.
   - API hostname -> `http://api:8080` for Compose service mode, or `http://127.0.0.1:8080` for systemd mode.
5. Confirm Cloudflare DNS is managed for the selected hostnames.

HTTPS is terminated at Cloudflare. Local traffic from `cloudflared` to containers may be HTTP inside the Docker network or localhost.

## Env Values

For split hostnames:

```text
CORS_ORIGINS=https://lingovector.example.com
NEXT_PUBLIC_API_BASE_URL=https://api.lingovector.example.com
```

OAuth:

```text
GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

Google OAuth Authorized JavaScript origins must include the final HTTPS web origin, for example `https://lingovector.example.com`.

## Security Notes

- Do not expose Postgres publicly.
- Do not publish Docker ports on `0.0.0.0` unless another reviewed network boundary exists.
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

curl -fsS https://api.lingovector.example.com/health
```
