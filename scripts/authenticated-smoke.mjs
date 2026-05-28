const API_BASE = (process.env.LINGOVECTOR_API_BASE_URL ?? process.env.STAGING_API_BASE_URL ?? process.env.API_BASE ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const TOKEN = process.env.LINGOVECTOR_AUTH_TOKEN;

function fail(message) {
  console.error(`authenticated smoke failed: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

if (!TOKEN) {
  fail("LINGOVECTOR_AUTH_TOKEN is required. Obtain a short-lived token from an already signed-in staging session and pass it only through the environment.");
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${TOKEN}`);
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
      body = { raw: text.slice(0, 200) };
    }
  }
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  return body;
}

try {
  console.log(`Running authenticated smoke against ${API_BASE}`);

  const me = await request("/me");
  assert(me?.email?.endsWith("@dimigo.hs.kr"), "/me did not return an allowed @dimigo.hs.kr user");
  console.log(`profile: ${me.email}`);

  const passage = await request("/passages/analyze", {
    method: "POST",
    body: JSON.stringify({
      title: "Authenticated smoke passage",
      text: "Although students can translate advanced passages, they still need to explain the logic in English. A strong reader follows how each phrase changes the writer's claim.",
    }),
  });
  assert(Array.isArray(passage.sentences) && passage.sentences.length >= 2, "passage analysis did not return at least two sentences");
  assert(passage.sentences[0].simple_english && passage.sentences[0].korean_detail, "sentence analysis missing English-first/Korean support fields");
  console.log(`passage analysis: ${passage.sentences.length} sentences`);

  const word = await request("/words/inspect", {
    method: "POST",
    body: JSON.stringify({ word: "logic", context: passage.sentences[0].text }),
  });
  assert(word.word === "logic" && word.english_definition && word.korean_support, "word inspection response is incomplete");
  console.log("word inspection: ok");

  const tts = await request("/tts", {
    method: "POST",
    body: JSON.stringify({ text: passage.sentences[0].text }),
  });
  assert(tts.audio_url && Array.isArray(tts.spoken_words) && tts.spoken_words.length > 0, "TTS response missing audio or word timing metadata");
  console.log(`tts: ok (${tts.provider})`);

  const pronunciationForm = new FormData();
  pronunciationForm.append("target_text", passage.sentences[0].text);
  pronunciationForm.append("sentence_id", passage.sentences[0].id);
  pronunciationForm.append("file", new Blob([new Uint8Array(256).fill(5)], { type: "audio/webm" }), "operator-smoke.webm");
  const pronunciation = await request("/pronunciation/score", { method: "POST", body: pronunciationForm });
  assert(pronunciation.score?.overall, "pronunciation score missing overall value");
  console.log(`pronunciation: ok (${pronunciation.provider})`);

  const prompt = await request("/writing/prompts", {
    method: "POST",
    body: JSON.stringify({ passage_id: passage.id }),
  });
  assert(prompt.prompt, "writing prompt missing");
  const writing = await request("/writing/submit", {
    method: "POST",
    body: JSON.stringify({
      passage_id: passage.id,
      prompt: prompt.prompt,
      response: "I think logic is important because students should not only change English to Korean. They should understand how the sentence makes an idea.",
    }),
  });
  assert(Object.keys(writing.scores ?? {}).length === 7, "writing tutor did not return seven score dimensions");
  assert(writing.original && writing.revised && writing.explanation, "writing tutor missing revision fields");
  console.log("writing tutor: ok");

  const papers = await request("/arxiv/recommendations");
  assert(Array.isArray(papers) && papers.length > 0, "arXiv recommendations missing");
  const opened = await request("/arxiv/open", {
    method: "POST",
    body: JSON.stringify({ id: papers[0].id }),
  });
  assert(opened.source === "arxiv" && Array.isArray(opened.sentences) && opened.sentences.length > 0, "arXiv open did not analyze the abstract");
  console.log("arxiv open: ok");

  console.log("authenticated smoke checks passed");
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
