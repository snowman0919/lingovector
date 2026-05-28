"use client";

import {
  Activity,
  FilePlus2,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  Volume2,
  Wand2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  analyzePassage,
  arxivRecommendations,
  deleteVoice,
  inspectWord,
  mediaUrl,
  openArxiv,
  providerDiagnostics,
  scorePronunciation,
  submitWriting,
  synthesize,
  uploadVoice,
  writingPrompt,
} from "@/lib/api";
import type { ArxivRecommendation, Passage, ProviderDiagnostics, Sentence, TtsResult, VoiceProfile, WordInspect, WritingResult } from "@/lib/types";

type Tab = "audio" | "pronunciation" | "writing" | "arxiv" | "diagnostics" | "review";

const DIAGNOSTICS_VISIBLE = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DIAGNOSTICS_ENABLED === "true";
const DEV_REVIEW_VISIBLE = process.env.NODE_ENV !== "production";

const REVIEW_SAMPLES = [
  {
    id: "high-school",
    title: "Digital Attention",
    source: "review-high-school",
    text: "Although digital tools make learning faster, they also make attention more fragile. Students become better thinkers when they slow down, notice the logic of a sentence, and explain an idea in their own English.",
    word: "fragile",
    response: "I think that digital tools are very useful, but they can make me to lose focus. In my case, slowing down helps my thinking become clearer because I can see the reason of each sentence.",
  },
  {
    id: "abstract",
    title: "Robust Feedback for Small Educational Models",
    source: "review-arxiv-style",
    text: "Small educational language models can provide responsive writing feedback under privacy constraints. We evaluate whether sentence-level explanations improve revision quality, especially when learners must reason about nuance rather than translate a fixed answer.",
    word: "constraints",
    response: "Small models are important thing because students need many informations quickly. However, feedback should not only correct grammar because students must understand nuance and logic.",
  },
] as const;

export function StudyDashboard({
  passage,
  onNewPassage,
  onPassage,
}: {
  passage: Passage;
  onNewPassage: () => void;
  onPassage: (passage: Passage) => void;
}) {
  const [selectedSentenceId, setSelectedSentenceId] = useState(passage.sentences[0]?.id ?? "");
  const selected = useMemo(
    () => passage.sentences.find((sentence) => sentence.id === selectedSentenceId) ?? passage.sentences[0],
    [passage, selectedSentenceId],
  );
  const [word, setWord] = useState<WordInspect | null>(null);
  const [tab, setTab] = useState<Tab>("audio");
  const [busy, setBusy] = useState("");
  const tabs: Tab[] = ["audio", "pronunciation", "writing", "arxiv"];
  if (DIAGNOSTICS_VISIBLE) tabs.push("diagnostics");
  if (DEV_REVIEW_VISIBLE) tabs.push("review");

  async function chooseWord(token: string) {
    if (!selected) return;
    setBusy("word");
    try {
      setWord(await inspectWord(token, selected.text));
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <section className="dashboard-guide">
        <div>
          <b>Study flow</b>
          <span>Choose a sentence on the left, read the meaning flow in the center, click a word on the right, then practice below.</span>
        </div>
        <button className="secondary" onClick={onNewPassage}>
          <FilePlus2 size={16} /> New passage
        </button>
      </section>
      <section className="study-grid">
      <section className="panel study-panel">
        <div className="panel-head">
          <span>Left · Passage</span>
          <button className="icon-button" title="Analyze a new passage" onClick={onNewPassage}>
            <FilePlus2 size={16} />
          </button>
        </div>
        <div className="panel-body sentence-list">
          {passage.sentences.map((sentence) => (
            <div
              className={`sentence-item ${sentence.id === selected?.id ? "active" : ""}`}
              key={sentence.id}
              onClick={() => setSelectedSentenceId(sentence.id)}
              role="button"
              tabIndex={0}
            >
              {sentence.text.split(/\s+/).map((token, index) => (
                <span key={`${token}-${index}`}>
                  <button className="word-button" onClick={(event) => {
                    event.stopPropagation();
                    chooseWord(token);
                  }}>
                    {token}
                  </button>{" "}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="panel study-panel">
        <div className="panel-head">Center · Sentence Analysis</div>
        <div className="panel-body">
          {selected ? <SentenceAnalysis sentence={selected} /> : null}
        </div>
      </section>

      <section className="panel study-panel">
        <div className="panel-head">Right · Word Details</div>
        <div className="panel-body">
          {word ? (
            <WordPanel word={word} busy={busy === "word"} />
          ) : (
            <p className="right-panel-empty">Select any word from the original passage to inspect definition, concept, context, Korean support, and morphology.</p>
          )}
        </div>
      </section>

      <section className="panel study-panel bottom-panel">
        <div className="panel-head">
          Practice
          <div className="bottom-tabs">
            {tabs.map((item) => (
              <button key={item} className={`tab ${tab === item ? "active" : ""}`} onClick={() => setTab(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-body">
          {tab === "audio" && selected ? <AudioPractice sentence={selected} /> : null}
          {tab === "pronunciation" && selected ? <PronunciationPractice sentence={selected} /> : null}
          {tab === "writing" ? <WritingTutor passage={passage} /> : null}
          {tab === "arxiv" ? <ArxivLearning onPassage={onPassage} /> : null}
          {tab === "diagnostics" && DIAGNOSTICS_VISIBLE ? <ProviderDiagnosticsPanel /> : null}
          {tab === "review" && DEV_REVIEW_VISIBLE ? <LearningQualityReview /> : null}
        </div>
      </section>
      </section>
    </>
  );
}

function SentenceAnalysis({ sentence }: { sentence: Sentence }) {
  return (
    <>
      <div className="analysis-card">
        <h3>Simple English</h3>
        <p>{sentence.simple_english}</p>
      </div>
      <div className="analysis-card">
        <h3>Detailed Korean</h3>
        <p>{sentence.korean_detail}</p>
      </div>
      <div className="analysis-card">
        <h3>Grammar Structure</h3>
        <pre>{JSON.stringify(sentence.grammar, null, 2)}</pre>
      </div>
      <div className="analysis-card">
        <h3>Meaning Chunks</h3>
        <div className="chunks">
          {sentence.chunks.map((chunk, index) => (
            <div className="chunk" key={`${chunk.label}-${index}`}>
              <b>{chunk.label}</b>
              <p>{chunk.text}</p>
              <small>{chunk.function}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="analysis-card">
        <h3>POS Visualization</h3>
        <div>
          {sentence.pos.map((token, index) => (
            <span className="token" key={`${token.token}-${index}`}>
              {token.token} <span>{token.label}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="analysis-card">
        <h3>Sentence-Structure Visualization</h3>
        <div className="structure-list">
          {sentence.structure.map((item, index) => (
            <div className="structure-item" key={`${item.label}-${index}`}>
              <b>{item.label}</b>
              <p>{item.text || "No extra words in this section."}</p>
              <small>{item.role}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="analysis-card">
        <h3>Interpretation Flow and Logic</h3>
        <p>{sentence.logic_relation}</p>
      </div>
    </>
  );
}

function WordPanel({ word, busy }: { word: WordInspect; busy: boolean }) {
  return (
    <div className={busy ? "loading" : ""}>
      <div className="analysis-card">
        <h3>{word.word}</h3>
        <p>{word.english_definition}</p>
      </div>
      <div className="analysis-card">
        <h3>Core Meaning Concept</h3>
        <p>{word.core_meaning}</p>
      </div>
      <div className="analysis-card">
        <h3>Contextual Meaning</h3>
        <p>{word.contextual_meaning}</p>
      </div>
      <div className="analysis-card">
        <h3>Korean Support</h3>
        <p>{word.korean_support}</p>
      </div>
      <div className="analysis-card">
        <h3>Morphology</h3>
        <pre>{JSON.stringify(word.morphology, null, 2)}</pre>
      </div>
    </div>
  );
}

function AudioPractice({ sentence }: { sentence: Sentence }) {
  const [tts, setTts] = useState<TtsResult | null>(null);
  const [activeWord, setActiveWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function play() {
    setBusy(true);
    setError("");
    try {
      const result = await synthesize(sentence.text);
      setTts(result);
      setTimeout(() => audioRef.current?.play(), 50);
      result.spoken_words.forEach((word) => {
        window.setTimeout(() => setActiveWord(word.word), word.start_ms);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not play this sentence.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bottom-content">
      <div>
        <p className="mini-title">Sentence Playback</p>
        <div className="toolbar">
          <button className="primary" onClick={play}>
            <Volume2 size={17} /> {busy ? "Preparing..." : "Play sentence"}
          </button>
          {tts?.provider === "mock" && DIAGNOSTICS_VISIBLE ? <span>Demo audio (mock)</span> : null}
        </div>
        {error ? <div className="error">{error}</div> : null}
        {tts ? <audio ref={audioRef} controls src={mediaUrl(tts.audio_url)} /> : null}
      </div>
      <div>
        <p className="mini-title">Current Spoken Word</p>
        <p>
          {sentence.text.split(/\s+/).map((token, index) => (
            <span className={token.replace(/[^\w-]/g, "") === activeWord ? "word-highlight" : ""} key={`${token}-${index}`}>
              {token}{" "}
            </span>
          ))}
        </p>
        <VoiceConsentUploader />
      </div>
    </div>
  );
}

function PronunciationPractice({ sentence }: { sentence: Sentence }) {
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [score, setScore] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorder.current = recorder;
      recorder.ondataavailable = (event) => chunks.current.push(event.data);
      recorder.onstop = () => {
        setAudio(new Blob(chunks.current, { type: "audio/webm" }));
        stream.getTracks().forEach((track) => track.stop());
        setStatus("Recording ready. Press Score to get feedback.");
      };
      recorder.start();
      setRecording(true);
      setStatus("Recording...");
    } catch {
      setError("Microphone access was blocked. Allow microphone permission, or use the mock scorer without recording.");
    }
  }

  function stop() {
    mediaRecorder.current?.stop();
    setRecording(false);
  }

  async function submit() {
    setError("");
    setStatus("Scoring pronunciation...");
    try {
      const result = await scorePronunciation(audio, sentence.text, sentence.id);
      setScore(result.score);
      setStatus("Pronunciation feedback saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not score pronunciation.");
      setStatus("");
    }
  }

  return (
    <div className="bottom-content">
      <div>
        <p className="mini-title">Record and Score</p>
        <div className="toolbar">
          {!recording ? (
            <button className="primary" onClick={start}>
              <Mic size={17} /> Record
            </button>
          ) : (
            <button className="danger" onClick={stop}>
              <Pause size={17} /> Stop
            </button>
          )}
          <button className="secondary" onClick={submit}>
            <RefreshCw size={17} /> Score
          </button>
        </div>
        {status ? <p className="helper-text">{status}</p> : null}
        {error ? <div className="error">{error}</div> : null}
      </div>
      <div>
        <p className="mini-title">Pronunciation Feedback</p>
        <pre>{score ? JSON.stringify(score, null, 2) : "No score yet."}</pre>
      </div>
    </div>
  );
}

function WritingTutor({ passage }: { passage: Passage }) {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [result, setResult] = useState<WritingResult | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function generate() {
    setBusy("prompt");
    setError("");
    try {
      const generated = await writingPrompt(passage.id);
      setPrompt(generated.prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a writing prompt.");
    } finally {
      setBusy("");
    }
  }

  async function submit() {
    if (!prompt.trim() || !response.trim()) {
      setError("Generate a prompt and write your English response first.");
      return;
    }
    setBusy("submit");
    setError("");
    try {
      setResult(await submitWriting(prompt, response, passage.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not score this writing.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="bottom-content">
      <div>
        <p className="mini-title">Writing Prompt</p>
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        <div className="toolbar">
          <button className="secondary" onClick={generate}>
            <Wand2 size={17} /> {busy === "prompt" ? "Generating..." : "Generate"}
          </button>
          <button className="primary" onClick={submit}>
            <Send size={17} /> {busy === "submit" ? "Scoring..." : "Submit"}
          </button>
        </div>
        {error ? <div className="error">{error}</div> : null}
        <div className="field">
          <label htmlFor="writing">Response</label>
          <textarea id="writing" value={response} onChange={(event) => setResponse(event.target.value)} />
        </div>
      </div>
      <div>
        <p className="mini-title">Feedback</p>
        {result ? (
          <>
            <div className="score-grid">
              {Object.entries(result.scores).map(([name, value]) => (
                <div className="score-card" key={name}>
                  <b>{name}</b> {value}/100
                </div>
              ))}
            </div>
            <div className="analysis-card">
              <h3>Korean-like Translated English</h3>
              <pre>{JSON.stringify(result.korean_like_translation, null, 2)}</pre>
            </div>
            <div className="analysis-card">
              <h3>Before</h3>
              <p>{result.original}</p>
            </div>
            <div className="analysis-card">
              <h3>Revised Version</h3>
              <p>{result.revised}</p>
            </div>
            <div className="analysis-card">
              <h3>Explanation</h3>
              <p>{result.explanation}</p>
            </div>
          </>
        ) : (
          <p className="right-panel-empty">Generate a prompt, write in English, then submit for scores and revision.</p>
        )}
      </div>
    </div>
  );
}

function ArxivLearning({ onPassage }: { onPassage: (passage: Passage) => void }) {
  const [papers, setPapers] = useState<ArxivRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setPapers(await arxivRecommendations());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load arXiv recommendations.");
    } finally {
      setLoading(false);
    }
  }

  async function open(id: string) {
    setError("");
    try {
      onPassage(await openArxiv(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open this abstract.");
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button className="primary" onClick={load}>
          <RefreshCw size={17} /> {loading ? "Loading..." : "Load recommendations"}
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {!loading && papers.length === 0 ? <p className="right-panel-empty">Load title-and-abstract recommendations for Security, AI, Robotics, Physics, Chemistry, and Biology.</p> : null}
      <div className={`arxiv-list ${loading ? "loading" : ""}`}>
        {papers.map((paper) => (
          <article className="arxiv-item" key={paper.id}>
            <p className="mini-title">{paper.category} · {paper.difficulty}</p>
            <h3>{paper.title}</h3>
            <p>{paper.abstract_text}</p>
            <p>{paper.reason}</p>
            <p><b>Key vocabulary:</b> {paper.key_vocabulary.join(", ")}</p>
            <p><b>Writing:</b> {paper.writing_prompt}</p>
            <button className="secondary" onClick={() => open(paper.id)}>
              <Play size={17} /> Open abstract
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

export function VoiceConsentUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState("I agree to upload only my own voice, or a voice I have explicit permission to use. I understand Lingovector stores this sample and consent metadata for my study voice profile, and I will not use cloned voices to impersonate anyone.");
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function submit() {
    if (!file) {
      setError("Choose a voice sample file first.");
      return;
    }
    setBusy("upload");
    setError("");
    setStatus("Uploading voice sample...");
    try {
      const response = await uploadVoice(file, consent, "Student voice");
      setProfile(response);
      setStatus("Voice profile saved. You can delete it here at any time.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload this voice sample.");
      setStatus("");
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (!profile) return;
    setBusy("delete");
    setError("");
    try {
      await deleteVoice(profile.id);
      setStatus("Voice profile deleted. The saved profile record was removed and Lingovector attempted to remove the stored audio file.");
      setProfile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this voice profile.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <p className="mini-title">Voice Cloning</p>
      <div className="consent-box">
        <Upload size={18} />
        <span>Upload only your own voice, or a voice you have explicit permission to use. Lingovector stores the audio sample, consent text, consent version, and file metadata for this profile. Delete removes the profile record and attempts to remove the stored audio file. Cloned voices must not be used to impersonate anyone.</span>
      </div>
      <div className="field">
        <label htmlFor="voice-file">Voice sample</label>
        <input id="voice-file" type="file" accept="audio/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </div>
      <div className="field">
        <label htmlFor="consent">Consent text</label>
        <textarea id="consent" value={consent} onChange={(event) => setConsent(event.target.value)} />
      </div>
      <button className="secondary" onClick={submit}>
        <Upload size={17} /> {busy === "upload" ? "Uploading..." : "Upload voice"}
      </button>
      {profile ? (
        <button className="danger" onClick={remove}>
          <Trash2 size={17} /> {busy === "delete" ? "Deleting..." : "Delete voice"}
        </button>
      ) : null}
      {status ? <p className="helper-text">{status}</p> : null}
      {error ? <div className="error">{error}</div> : null}
      {profile ? <pre>{JSON.stringify({ consent_version: profile.consent_version, metadata: profile.metadata }, null, 2)}</pre> : null}
    </div>
  );
}

function LearningQualityReview() {
  const [sampleId, setSampleId] = useState<string>(REVIEW_SAMPLES[0].id);
  const [result, setResult] = useState<{
    passage: Passage;
    word: WordInspect;
    writing: WritingResult;
    prompt: string;
  } | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const sample = REVIEW_SAMPLES.find((item) => item.id === sampleId) ?? REVIEW_SAMPLES[0];

  async function run() {
    setStatus("Running sample through the same study flow...");
    setError("");
    setResult(null);
    try {
      const passage = await analyzePassage(sample.text, sample.title, sample.source);
      const word = await inspectWord(sample.word, passage.sentences[0]?.text ?? sample.text);
      const generatedPrompt = await writingPrompt(passage.id);
      const writing = await submitWriting(generatedPrompt.prompt, sample.response, passage.id);
      setResult({ passage, word, writing, prompt: generatedPrompt.prompt });
      setStatus("Review sample ready.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run this review sample.");
      setStatus("");
    }
  }

  return (
    <div>
      <div className="toolbar">
        <select className="select" value={sampleId} onChange={(event) => setSampleId(event.target.value)}>
          {REVIEW_SAMPLES.map((item) => (
            <option key={item.id} value={item.id}>{item.title}</option>
          ))}
        </select>
        <button className="secondary" onClick={run}>
          <RefreshCw size={17} /> Run review sample
        </button>
      </div>
      {status ? <p className="helper-text">{status}</p> : null}
      {error ? <div className="error">{error}</div> : null}
      {result ? (
        <div className="review-grid">
          <section className="analysis-card">
            <h3>Sentence Analysis</h3>
            <pre>{JSON.stringify(result.passage.sentences, null, 2)}</pre>
          </section>
          <section className="analysis-card">
            <h3>Word Analysis</h3>
            <pre>{JSON.stringify(result.word, null, 2)}</pre>
          </section>
          <section className="analysis-card">
            <h3>Writing Feedback</h3>
            <div className="score-grid">
              {Object.entries(result.writing.scores).map(([name, value]) => (
                <div className="score-card" key={name}>
                  <b>{name}</b> {value}/100
                </div>
              ))}
            </div>
            <p><b>Prompt:</b> {result.prompt}</p>
            <p><b>Before:</b> {result.writing.original}</p>
            <p><b>After:</b> {result.writing.revised}</p>
            <pre>{JSON.stringify(result.writing.korean_like_translation, null, 2)}</pre>
          </section>
        </div>
      ) : (
        <p className="right-panel-empty">Local review mode runs committed sample passages through sentence analysis, word analysis, and writing feedback for manual quality checks.</p>
      )}
    </div>
  );
}

function ProviderDiagnosticsPanel() {
  const [diagnostics, setDiagnostics] = useState<ProviderDiagnostics | null>(null);
  const [status, setStatus] = useState("");

  async function load() {
    setStatus("Loading diagnostics...");
    try {
      setDiagnostics(await providerDiagnostics());
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Diagnostics unavailable.");
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button className="secondary" onClick={load}>
          <Activity size={17} /> Check providers
        </button>
        {diagnostics ? <span>Environment: {diagnostics.environment}</span> : null}
      </div>
      {status ? <p className="right-panel-empty">{status}</p> : null}
      {diagnostics ? (
        <div className="provider-grid">
          {diagnostics.providers.map((provider) => (
            <article className="provider-card" key={provider.name}>
              <div>
                <p className="mini-title">{provider.name}</p>
                <span className={`provider-mode ${provider.mode}`}>{provider.mode}</span>
              </div>
              <p>{provider.detail}</p>
              <pre>{JSON.stringify(provider.metadata, null, 2)}</pre>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
