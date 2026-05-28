# Google OAuth Operator Setup

Use this checklist for local, staging, and production OAuth setup. Do not commit client secrets or tokens. Lingovector uses Google ID tokens verified by the Rust API and allows only verified `@dimigo.hs.kr` accounts.

## Google Cloud Setup

1. Open Google Cloud Console and select the project used for Lingovector.
2. Configure the OAuth consent screen:
   - App name: `Lingovector`
   - User type: choose the setting approved for the school beta.
   - Support/contact email: use an operator or school-managed address.
   - Authorized domains: add the real staging/production domain roots.
   - Scopes: basic profile/email scopes are enough for sign-in.
3. Create an OAuth 2.0 Client ID:
   - Application type: Web application.
   - Name: use a clear name such as `Lingovector Staging Web`.
4. Add Authorized JavaScript origins:
   - Local: `http://localhost:3000`
   - Staging: `https://YOUR_STAGING_FRONTEND_HOST`
   - Production: `https://YOUR_PRODUCTION_FRONTEND_HOST`
5. If a redirect-based flow is introduced later, add redirect URIs separately:
   - Local: `http://localhost:3000/auth/callback`
   - Staging: `https://YOUR_STAGING_FRONTEND_HOST/auth/callback`
   - Production: `https://YOUR_PRODUCTION_FRONTEND_HOST/auth/callback`

Current Lingovector login uses Google Identity Services in the browser and sends the ID token to the API for verification. `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` should be the same web client ID for the target environment.

## Environment Usage

Backend:

```text
GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
ALLOWED_EMAIL_DOMAIN=dimigo.hs.kr
```

Frontend build:

```text
NEXT_PUBLIC_GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

Staging and production must also set exact HTTPS CORS origins:

```text
CORS_ORIGINS=https://YOUR_STAGING_FRONTEND_HOST
NEXT_PUBLIC_API_BASE_URL=https://YOUR_STAGING_API_HOST
```

## Backend Enforcement

The backend verifies:

- Google ID token signature and audience against `GOOGLE_CLIENT_ID`.
- `email_verified` is true.
- Email domain is `@dimigo.hs.kr`.
- Hosted domain claim is compatible with `dimigo.hs.kr` when Google provides it.

Do not rely on the frontend Google button alone. A token can appear valid to the browser but still be rejected by the backend if the audience, email verification, or school domain checks fail.

## Manual Token Capture for Smoke Testing

Use this only for staging/operator smoke tests.

1. Open the staging frontend.
2. Sign in with a verified `@dimigo.hs.kr` test account.
3. Open browser developer tools.
4. Find the API request to `/me` or another authenticated endpoint.
5. Copy the bearer token from the `Authorization` request header.
6. Run the smoke script in a local shell:

   ```bash
   LINGOVECTOR_API_BASE_URL=https://YOUR_STAGING_API_HOST \
   LINGOVECTOR_AUTH_TOKEN=PASTE_TOKEN_IN_SHELL_ONLY \
   npm run test:authenticated-smoke
   ```

Do not paste tokens into commits, docs, screenshots, issue trackers, shared chats, shell history exports, or logs. Close the terminal or unset the variable after the check:

```bash
unset LINGOVECTOR_AUTH_TOKEN
```

## Troubleshooting

### Google Button Missing

- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` was not set at frontend build time.
- Rebuild the web image after changing frontend public env vars.

### Wrong Origin

- The browser origin must exactly match an Authorized JavaScript origin.
- Include scheme and host, for example `https://staging.example.edu`.
- Do not use `localhost` for staging/production OAuth.

### Missing Client ID

- Backend `GOOGLE_CLIENT_ID` missing: backend rejects ID tokens.
- Frontend `NEXT_PUBLIC_GOOGLE_CLIENT_ID` missing: Google button may not render.

### Non-Dimigo Account

- Expected behavior: backend rejects the login.
- Confirm the account email ends in `@dimigo.hs.kr`.
- Confirm the Google account email is verified.

### Token Accepted by Frontend but Rejected by Backend

- `GOOGLE_CLIENT_ID` mismatch between frontend build and backend env.
- ID token audience belongs to a different OAuth client.
- `ALLOWED_EMAIL_DOMAIN` is not `dimigo.hs.kr`.
- Google did not mark `email_verified=true`.
- Hosted-domain claim does not match the school domain.
