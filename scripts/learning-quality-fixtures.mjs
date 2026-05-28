import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const localApiHost = !process.env.API_HOST || ["0.0.0.0", "::"].includes(process.env.API_HOST) ? "127.0.0.1" : process.env.API_HOST;
const localApiPort = process.env.API_HOST_PORT ?? process.env.API_PORT ?? "8080";
const API_BASE = (process.env.LINGOVECTOR_API_BASE_URL ?? process.env.STAGING_API_BASE_URL ?? process.env.API_BASE ?? `http://${localApiHost}:${localApiPort}`).replace(/\/$/, "");
const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE_PATH = resolve(ROOT, "fixtures/learning-quality/samples.json");
const OUTPUT_DIR = resolve(ROOT, "local-output/learning-quality");
const SCORE_KEYS = ["Grammar", "Vocabulary", "Nuance", "Logic", "Structure", "Clarity", "Naturalness"];

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

function validateSentenceAnalysis(passage) {
  assert(typeof passage.id === "string", "passage id missing");
  assert(Array.isArray(passage.sentences) && passage.sentences.length > 0, "sentences missing");
  for (const sentence of passage.sentences) {
    assert(typeof sentence.text === "string" && sentence.text.length > 0, "sentence text missing");
    assert(typeof sentence.simple_english === "string" && sentence.simple_english.length > 0, "simple English explanation missing");
    assert(typeof sentence.korean_detail === "string" && sentence.korean_detail.length > 0, "Korean detail missing");
    assert(sentence.grammar && typeof sentence.grammar === "object" && !Array.isArray(sentence.grammar), "grammar object missing");
    assert(Array.isArray(sentence.chunks), "meaning chunks missing");
    assert(Array.isArray(sentence.pos), "POS visualization missing");
    assert(Array.isArray(sentence.structure), "sentence-structure visualization missing");
    assert(typeof sentence.logic_relation === "string" && sentence.logic_relation.length > 0, "logic relation missing");
  }
}

function validateWordAnalysis(word) {
  for (const field of ["word", "english_definition", "core_meaning", "contextual_meaning", "korean_support"]) {
    assert(typeof word[field] === "string" && word[field].length > 0, `word field ${field} missing`);
  }
  assert(word.morphology && typeof word.morphology === "object", "morphology object missing");
  assert(["low", "medium", "high", undefined].includes(word.morphology.confidence), "invalid morphology confidence");
  assert(Array.isArray(word.morphology.analysis ?? []), "morphology analysis must be an array");
}

function validateWritingFeedback(feedback) {
  assert(feedback.scores && typeof feedback.scores === "object", "scores missing");
  assert(Object.keys(feedback.scores).length === SCORE_KEYS.length, "writing scores must have seven dimensions");
  for (const key of SCORE_KEYS) {
    const score = feedback.scores[key];
    assert(Number.isInteger(score) && score >= 0 && score <= 100, `score ${key} must be 0-100`);
  }
  assert(Array.isArray(feedback.korean_like_translation), "Korean-like translation flags must be an array");
  assert(typeof feedback.original === "string", "original writing missing");
  assert(typeof feedback.revised === "string" && feedback.revised.length > 0, "revised writing missing");
  assert(typeof feedback.explanation === "string" && feedback.explanation.length > 0, "writing explanation missing");
}

const fixtures = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
await mkdir(OUTPUT_DIR, { recursive: true });

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

const index = {
  generated_at: new Date().toISOString(),
  api_base: API_BASE,
  outputs: [],
};

for (const sample of fixtures.passages) {
  const passage = await request("/passages/analyze", {
    method: "POST",
    body: JSON.stringify({ title: sample.title, source: sample.source, text: sample.text }),
  }, token);
  validateSentenceAnalysis(passage);

  const word = await request("/words/inspect", {
    method: "POST",
    body: JSON.stringify({ word: sample.word, context: passage.sentences[0].text }),
  }, token);
  validateWordAnalysis(word);

  const prompt = await request("/writing/prompts", {
    method: "POST",
    body: JSON.stringify({ passage_id: passage.id }),
  }, token);
  const writing = await request("/writing/submit", {
    method: "POST",
    body: JSON.stringify({ passage_id: passage.id, prompt: prompt.prompt, response: sample.student_response }),
  }, token);
  validateWritingFeedback(writing);

  const output = {
    fixture: sample.id,
    passage,
    word,
    prompt,
    writing_review: {
      before: writing.original,
      after: writing.revised,
      scores: writing.scores,
      korean_like_translation: writing.korean_like_translation,
      explanation: writing.explanation,
    },
  };
  const path = resolve(OUTPUT_DIR, `${sample.id}.json`);
  await writeFile(path, JSON.stringify(output, null, 2));
  index.outputs.push(path);
}

for (const sample of fixtures.student_writings) {
  const writing = await request("/writing/submit", {
    method: "POST",
    body: JSON.stringify({ prompt: sample.prompt, response: sample.response }),
  }, token);
  validateWritingFeedback(writing);
  const output = {
    fixture: sample.id,
    prompt: sample.prompt,
    before: writing.original,
    after: writing.revised,
    scores: writing.scores,
    korean_like_translation: writing.korean_like_translation,
    explanation: writing.explanation,
  };
  const path = resolve(OUTPUT_DIR, `writing-${sample.id}.json`);
  await writeFile(path, JSON.stringify(output, null, 2));
  index.outputs.push(path);
}

const indexPath = resolve(OUTPUT_DIR, "index.json");
await writeFile(indexPath, JSON.stringify(index, null, 2));

console.log(`learning-quality fixture outputs saved to ${OUTPUT_DIR}`);
