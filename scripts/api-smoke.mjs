const API_BASE = process.env.API_BASE ?? "http://127.0.0.1:8080";

async function request(path, options = {}, token) {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${text}`);
  }
  return body;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const health = await request("/health");
assert(health.ok === true && health.database?.ready === true, "health endpoint did not report DB ready");

const login = await request("/auth/google", {
  method: "POST",
  body: JSON.stringify({ id_token: `dev:smoke-${Date.now()}@dimigo.hs.kr` }),
});
const token = login.access_token;
assert(token, "login did not return access token");

const blocked = await fetch(`${API_BASE}/passages`, {
  headers: { Authorization: `Bearer ${token}` },
});
const blockedBody = await blocked.json().catch(() => ({}));
assert(blocked.status === 403 && blockedBody.error === "consent_required", "protected learning route should require beta privacy consent before activation");

const consentStatus = await request("/me/consents", {}, token);
assert(consentStatus.has_required_consents === false, "fresh smoke user should need consent");
const acceptedConsent = await request(
  "/me/consents/accept",
  {
    method: "POST",
    body: JSON.stringify({ accepted: consentStatus.required.map((item) => item.consent_type) }),
  },
  token,
);
assert(acceptedConsent.has_required_consents === true, "consent acceptance did not activate app access");

const diagnostics = await request("/diagnostics/providers", {}, token);
const allowedModes = new Set(["mock", "configured", "reachable", "failed", "disabled"]);
for (const name of ["db", "auth", "llm", "tts", "voice_cloning", "pronunciation", "arxiv"]) {
  const provider = diagnostics.providers?.find((item) => item.name === name);
  assert(provider && allowedModes.has(provider.mode), `provider diagnostics missing ${name}`);
}

const passage = await request(
  "/passages/analyze",
  {
    method: "POST",
    body: JSON.stringify({
      title: "Smoke passage",
      text: "Although students can translate difficult passages, they often miss the logic. Real fluency starts when they explain the idea in English.",
    }),
  },
  token,
);
assert(passage.sentences?.length >= 2, "passage analysis did not split sentences");

const word = await request(
  "/words/inspect",
  {
    method: "POST",
    body: JSON.stringify({ word: "fluency", context: passage.sentences[1].text }),
  },
  token,
);
assert(word.word === "fluency", "word inspection failed");

const tts = await request(
  "/tts",
  { method: "POST", body: JSON.stringify({ text: passage.sentences[0].text }) },
  token,
);
assert(tts.audio_url && tts.spoken_words?.length > 0, "tts did not return audio and timing metadata");

const voiceForm = new FormData();
voiceForm.append("name", "Smoke voice");
voiceForm.append("consent_text", "I consent to using this voice sample only for my Lingovector study voice profile. I confirm this is my own voice or I have explicit permission to use it, and I will not use cloned voices to impersonate others.");
voiceForm.append("file", new Blob([new Uint8Array(128).fill(7)], { type: "audio/webm" }), "voice.webm");
const voice = await request("/voices/upload", { method: "POST", body: voiceForm }, token);
assert(voice.id && voice.consent_version, "voice upload did not return consent metadata");
assert(voice.metadata?.warning?.includes("impersonate"), "voice upload warning metadata missing");

const deleted = await request(`/voices/${voice.id}`, { method: "DELETE" }, token);
assert(deleted.deleted === true, "voice delete failed");

const pronunciationForm = new FormData();
pronunciationForm.append("target_text", passage.sentences[0].text);
pronunciationForm.append("sentence_id", passage.sentences[0].id);
pronunciationForm.append("file", new Blob([new Uint8Array(256).fill(3)], { type: "audio/webm" }), "pronunciation.webm");
const pronunciation = await request("/pronunciation/score", { method: "POST", body: pronunciationForm }, token);
assert(pronunciation.score?.overall, "pronunciation score missing overall");

const prompt = await request(
  "/writing/prompts",
  { method: "POST", body: JSON.stringify({ passage_id: passage.id }) },
  token,
);
const writing = await request(
  "/writing/submit",
  {
    method: "POST",
    body: JSON.stringify({
      passage_id: passage.id,
      prompt: prompt.prompt,
      response: "I think that it is very important thing because students need many informations about logic.",
    }),
  },
  token,
);
assert(Object.keys(writing.scores ?? {}).length === 7, "writing score does not have seven dimensions");
assert(Object.values(writing.scores).every((score) => Number.isInteger(score) && score >= 0 && score <= 100), "writing scores must be 0-100");
assert(writing.original && writing.revised, "writing before/after fields missing");

const papers = await request("/arxiv/recommendations", {}, token);
assert(Array.isArray(papers) && papers.length >= 6, "arXiv recommendations missing categories");
const opened = await request("/arxiv/open", { method: "POST", body: JSON.stringify({ id: papers[0].id }) }, token);
assert(opened.source === "arxiv" && opened.sentences?.length > 0, "arXiv open did not analyze abstract");

const deletedAccount = await request("/me", { method: "DELETE" }, token);
assert(deletedAccount.deleted === true, "account deletion endpoint did not confirm deletion");
const deletedMe = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } });
assert(deletedMe.status === 401, "deleted account token should no longer authenticate");

console.log("api smoke checks passed");
