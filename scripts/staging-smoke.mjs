// For Cloudflare Tunnel staging, use:
//   STAGING_API_BASE_URL=https://api-staging.example.com npm run test:staging-smoke
const API_BASE = (process.env.STAGING_API_BASE_URL ?? process.env.LINGOVECTOR_API_BASE_URL ?? process.env.API_BASE ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const TOKEN = process.env.STAGING_AUTH_TOKEN ?? process.env.LINGOVECTOR_AUTH_TOKEN;

const allowedModes = new Set(["mock", "configured", "reachable", "failed", "disabled"]);

function fail(message) {
  console.error(`staging smoke failed: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function request(path, options = {}, token = TOKEN, allowStatuses = []) {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  if (!response.ok && !allowStatuses.includes(response.status)) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return { status: response.status, body };
}

function assertNoSecretLikePayload(value, label) {
  const json = JSON.stringify(value ?? {});
  const forbidden = ["access_token", "id_token", "jwt_secret", "authorization", "bearer "];
  for (const key of forbidden) {
    assert(!json.toLowerCase().includes(key), `${label} appears to include sensitive key text: ${key}`);
  }
}

console.log(`Checking staging API at ${API_BASE}`);

try {
  const health = await request("/health", {}, null);
  assert(health.body?.ok === true, "/health did not report ok=true");
  assert(health.body?.database?.ready === true, "/health did not report database.ready=true");
  console.log("health: ok");

  const protectedRoute = await request("/me", {}, null, [401, 403]);
  assert([401, 403].includes(protectedRoute.status), "/me should reject unauthenticated requests");
  console.log(`protected route: unauthenticated /me rejected with ${protectedRoute.status}`);

  if (!TOKEN) {
    console.log("STAGING_AUTH_TOKEN or LINGOVECTOR_AUTH_TOKEN not set; skipping authenticated diagnostics, passage, TTS, and arXiv checks.");
    console.log("Manual auth step: sign in with a verified @dimigo.hs.kr staging account and provide a short-lived bearer token only through an environment variable.");
    process.exit(0);
  }

  const me = await request("/me");
  assert(me.body?.email?.endsWith("@dimigo.hs.kr"), "authenticated /me did not return an allowed school account");
  console.log(`auth: verified school account ${me.body.email}`);

  const diagnostics = await request("/diagnostics/providers", {}, TOKEN, [404]);
  if (diagnostics.status === 404) {
    console.log("diagnostics: disabled, expected default for staging");
  } else {
    assert(Array.isArray(diagnostics.body?.providers), "diagnostics response missing providers array");
    assertNoSecretLikePayload(diagnostics.body, "diagnostics");
    for (const name of ["db", "auth", "llm", "tts", "voice_cloning", "pronunciation", "arxiv"]) {
      const provider = diagnostics.body.providers.find((item) => item.name === name);
      assert(provider && allowedModes.has(provider.mode), `diagnostics missing valid mode for ${name}`);
    }
    console.log("diagnostics: enabled and sanitized");
  }

  const passage = await request(
    "/passages/analyze",
    {
      method: "POST",
      body: JSON.stringify({
        title: "Staging smoke passage",
        text: "Although students may translate a difficult sentence, they still need to understand how its logic develops. Clear English thinking begins when they explain the idea before choosing Korean words.",
      }),
    },
  );
  assert(Array.isArray(passage.body?.sentences) && passage.body.sentences.length >= 2, "passage analysis did not return sentence analysis");
  assert(typeof passage.body.sentences[0].simple_english === "string", "sentence analysis missing simple English explanation");
  assert(typeof passage.body.sentences[0].korean_detail === "string", "sentence analysis missing Korean support");
  console.log("passage analysis: ok");

  const tts = await request(
    "/tts",
    { method: "POST", body: JSON.stringify({ text: passage.body.sentences[0].text }) },
  );
  assert(tts.body?.audio_url, "TTS missing audio_url");
  assert(Array.isArray(tts.body?.spoken_words) && tts.body.spoken_words.length > 0, "TTS missing word timing metadata");
  console.log(`tts: ok (${tts.body.provider})`);

  const papers = await request("/arxiv/recommendations");
  assert(Array.isArray(papers.body) && papers.body.length > 0, "arXiv recommendations returned no papers");
  for (const paper of papers.body) {
    assert(typeof paper.title === "string" && paper.title.length > 0, "arXiv paper missing title");
    assert(typeof paper.abstract_text === "string" && paper.abstract_text.length > 0, "arXiv paper missing abstract");
    assert(!("pdf_url" in paper) && !("full_text" in paper), "arXiv response should stay title/abstract only");
  }
  console.log(`arxiv: ok (${papers.body.length} recommendations)`);

  console.log("staging smoke checks passed");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
