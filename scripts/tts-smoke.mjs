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

const login = await request("/auth/google", {
  method: "POST",
  body: JSON.stringify({ id_token: "dev:student@dimigo.hs.kr" }),
});
const token = login.access_token;

const sentence = "Lingovector helps students hear the logic of English.";
const tts = await request("/tts", { method: "POST", body: JSON.stringify({ text: sentence }) }, token);

assert(tts.provider, "TTS provider missing");
assert(tts.audio_url, "TTS audio URL missing");
assert(Array.isArray(tts.spoken_words) && tts.spoken_words.length > 0, "TTS word timings missing");
assert(tts.spoken_words.every((word) => typeof word.word === "string" && Number.isInteger(word.start_ms) && Number.isInteger(word.end_ms)), "TTS word timings have invalid shape");

console.log(JSON.stringify({
  provider: tts.provider,
  audio_url: tts.audio_url,
  word_count: tts.spoken_words.length,
  first_word: tts.spoken_words[0],
  last_word: tts.spoken_words.at(-1),
}, null, 2));
