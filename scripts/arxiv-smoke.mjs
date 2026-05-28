const API_BASE = process.env.API_BASE ?? "http://127.0.0.1:8080";
const REQUIRED_CATEGORIES = ["Security", "AI", "Robotics", "Physics", "Chemistry", "Biology"];

if (process.env.ARXIV_REAL_ENABLED !== "true") {
  console.log("ARXIV_REAL_ENABLED is not true; real arXiv smoke path skipped.");
  process.exit(0);
}

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

const login = await request("/auth/google", {
  method: "POST",
  body: JSON.stringify({ id_token: "dev:student@dimigo.hs.kr" }),
});
const token = login.access_token;
const consentStatus = await request("/me/consents", {}, token);
if (!consentStatus.has_required_consents) {
  await request("/me/consents/accept", {
    method: "POST",
    body: JSON.stringify({ accepted: consentStatus.required.map((item) => item.consent_type) }),
  }, token);
}
const papers = await request("/arxiv/recommendations", {}, token);

for (const category of REQUIRED_CATEGORIES) {
  assert(papers.some((paper) => paper.category === category), `missing arXiv category ${category}`);
}
for (const paper of papers) {
  assert(typeof paper.title === "string" && paper.title.length > 0, "paper title missing");
  assert(typeof paper.abstract_text === "string" && paper.abstract_text.length > 0, "paper abstract missing");
  assert(!("pdf_url" in paper) && !("full_text" in paper), "paper response should remain title/abstract only");
}

const diagnostics = await request("/diagnostics/providers", {}, token);
const arxiv = diagnostics.providers.find((provider) => provider.name === "arxiv");
assert(arxiv, "arXiv diagnostics missing");

console.log(JSON.stringify({
  papers: papers.length,
  categories: papers.map((paper) => paper.category),
  diagnostics: {
    mode: arxiv.mode,
    cache: arxiv.metadata.cache,
  },
}, null, 2));
