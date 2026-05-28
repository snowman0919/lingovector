# Lingovector School Beta Checklist

Use this checklist before a small school-internal beta. Do not paste secrets into this file, issue trackers, or chat logs.

## Local Verification

- [ ] `cp .env.example .env`
- [ ] `npm run dev:db`
- [ ] `DEV_AUTH=true npm run dev:api`
- [ ] `npm run dev:web`
- [ ] `cargo fmt --all`
- [ ] `cargo clippy --workspace --all-targets -- -D warnings`
- [ ] `cargo test --workspace`
- [ ] `npm run test:web`
- [ ] `npm --workspace apps/web run lint`
- [ ] `npm --workspace apps/web run typecheck`
- [ ] `npm --workspace apps/web run build`
- [ ] `npm run test:api-smoke`
- [ ] `npm run test:tts-smoke`
- [ ] `npm run test:learning-quality`
- [ ] `npm run test:arxiv-smoke`

## Production Env Verification

- [ ] `ENVIRONMENT=production`
- [ ] `DEV_AUTH=false` or unset
- [ ] `DATABASE_URL` points to the beta PostgreSQL database
- [ ] `JWT_SECRET` is generated, private, non-default, and at least 32 characters
- [ ] `GOOGLE_CLIENT_ID` is set to the backend OAuth web client ID
- [ ] `ALLOWED_EMAIL_DOMAIN=dimigo.hs.kr`
- [ ] `CORS_ORIGINS` contains only explicit `https://` frontend origins
- [ ] `DIAGNOSTICS_ENABLED=false` unless an admin-only diagnostics check is planned
- [ ] `NEXT_PUBLIC_DIAGNOSTICS_ENABLED=false` for normal student builds
- [ ] `NEXT_PUBLIC_TTS_MODE=browser_onnx` is set only when ONNX model/schema files are deployed; otherwise use `server` or `mock` intentionally

## Auth Verification

- [ ] Google OAuth consent screen is configured for the school beta
- [ ] Authorized JavaScript origin includes the local origin for local testing
- [ ] Authorized JavaScript origin includes the production frontend origin
- [ ] A verified `@dimigo.hs.kr` account can sign in
- [ ] First login shows the Korean required consent gate before dashboard access
- [ ] Completing all required consent checkboxes activates the app
- [ ] A non-`@dimigo.hs.kr` account is rejected with a clear message
- [ ] An unverified Google email is rejected
- [ ] Production build does not show the local development token input

## Product Flow Tests

- [ ] Passage analysis splits a pasted passage into sentences
- [ ] Center panel shows simple English first and detailed Korean second
- [ ] POS visualization and sentence-structure visualization are separate
- [ ] Clicking a word opens definition, core concept, contextual meaning, Korean support, and morphology
- [ ] TTS plays the selected sentence and highlights spoken words
- [ ] Voice upload requires explicit consent text
- [ ] Voice delete reports success and removes the profile
- [ ] Pronunciation recording returns 0-100 score JSON
- [ ] Writing Tutor generates a prompt, scores seven dimensions, flags Korean-like translated English, and shows before/after revision
- [ ] arXiv recommendations cover Security, AI, Robotics, Physics, Chemistry, and Biology
- [ ] Opening an arXiv abstract uses title and abstract only

## Privacy Review

- [ ] Students are told to upload only their own voice or a voice they have explicit permission to use
- [ ] UI states cloned voices must not be used to impersonate others
- [ ] Voice upload stores consent text, consent version, file metadata, and the audio sample
- [ ] Voice deletion behavior is documented
- [ ] `개인정보 및 계정` shows consent history, voice data controls, consent withdrawal, and account deletion
- [ ] Account deletion or required-consent withdrawal is verified with a test account
- [ ] Do not upload real student voice until the consent gate and deletion flow are verified
- [ ] Local storage path and retention expectations are documented for beta operators
- [ ] Diagnostics output does not include secrets, tokens, or sensitive request bodies
- [ ] Logs include only sanitized provider metadata

## Provider Verification

- [ ] LLM provider configured or mock mode accepted for beta
- [ ] `npm run test:learning-quality` output reviewed under `local-output/learning-quality/`
- [ ] Browser Supertonic ONNX TTS is configured or server/mock fallback is accepted for beta
- [ ] Server-side Supertone/Supertonic TTS is treated as optional fallback, not the default assumption
- [ ] `npm run test:tts-smoke` confirms audio URL and word timing metadata
- [ ] Voice cloning provider configured or mock mode accepted for beta
- [ ] Pronunciation provider configured or mock mode accepted for beta
- [ ] `ARXIV_REAL_ENABLED=true npm run test:arxiv-smoke` passes if real arXiv is enabled

## Rollback Plan

- [ ] Keep the previous known-good commit SHA available
- [ ] Keep database backups before beta schema changes
- [ ] Know how to stop the frontend and API processes
- [ ] Know how to disable real providers by removing provider env vars and restarting the API
- [ ] Know how to disable diagnostics by setting `DIAGNOSTICS_ENABLED=false` and rebuilding frontend with `NEXT_PUBLIC_DIAGNOSTICS_ENABLED=false`
- [ ] Have a student-facing fallback message if beta access is paused
