# Lingovector v0.3 MVP

Lingovector is an AI English tutor for Korean high school students. The v0.3 MVP focuses on English as a tool for thinking and expression: sentence logic, vocabulary nuance, pronunciation, and writing feedback.

## Stack

- Frontend: Next.js + TypeScript
- Backend: Rust + Axum
- Database: PostgreSQL via SQLx migrations
- Auth: Google ID token verification on the backend, restricted to verified `@dimigo.hs.kr` accounts
- Providers: trait-based LLM, TTS, voice cloning, pronunciation, and arXiv providers
- Default mode: mock providers when external API keys or local provider URLs are absent

## Run Locally

1. Copy env values:

   ```bash
   cp .env.example .env
   ```

2. Start PostgreSQL:

   ```bash
   docker compose up -d postgres
   ```

3. Install frontend dependencies:

   ```bash
   npm install
   ```

4. Start the Rust API:

   ```bash
   npm run dev:api
   ```

5. Start the frontend:

   ```bash
   npm run dev:web
   ```

6. Open `http://localhost:3000`.

For local development without Google OAuth, sign in with:

```text
dev:student@dimigo.hs.kr
```

The dev token is accepted only when `ENVIRONMENT=development` or `ENVIRONMENT=test`.

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: server-side session token signing secret. Use a long random value outside local development.
- `GOOGLE_CLIENT_ID`: OAuth client ID used to verify Google ID token audience.
- `ALLOWED_EMAIL_DOMAIN`: defaults to `dimigo.hs.kr`.
- `CORS_ORIGINS`: comma-separated frontend origins.
- `STORAGE_DIR`: local audio and voice sample storage directory.
- `SUPERTONE_API_KEY`: enables future real Supertone provider work. Empty uses mocks.
- `SUPERTONE_LOCAL_TTS_URL`: optional local TTS server endpoint returning audio bytes.
- `NEXT_PUBLIC_API_BASE_URL`: frontend API URL.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: enables the Google Identity Services button.

Never commit real secrets.

## Implemented MVP Features

- Login with backend-verified Google token path and a development-only Dimigo token.
- Protected API routes using signed backend JWTs.
- Passage input as the authenticated landing workflow.
- Sentence splitting and heuristic sentence analysis with simple English first and Korean detail second.
- Separate POS and sentence-structure visualizations.
- Vocabulary inspection with definition, core concept, contextual reading, Korean support, and conservative morphology.
- TTS endpoint with mock WAV generation or optional local Supertone-compatible TTS endpoint.
- Voice sample upload with explicit consent text and saved voice profile.
- Browser recording and pronunciation scoring with stored score JSON.
- Writing prompt generation, scoring across seven dimensions, Korean-like translated English detection, revision, and explanation.
- arXiv-style recommendations across Security, AI, Robotics, Physics, Chemistry, and Biology, with abstract opening into the same analysis flow.
- Learning records for passages, sentences, unknown words, voice profiles, pronunciation records, writing submissions, and review history.

## Commands

```bash
npm run format:api
npm run clippy:api
npm run test:api
npm run lint
npm run build
```

## Notes

- Mock LLM analysis is heuristic and intentionally transparent. Replace `MockLlmProvider` with a real provider implementation when an LLM provider is selected.
- The Supertone/Supertonic-3 abstraction currently supports mock output and an optional local TTS HTTP endpoint through `SUPERTONE_LOCAL_TTS_URL`.
- Uploaded audio is stored on local disk under `STORAGE_DIR`; production should use object storage and retention controls.
