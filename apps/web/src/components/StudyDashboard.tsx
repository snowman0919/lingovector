"use client";

import {
  FilePlus2,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Send,
  Upload,
  Volume2,
  Wand2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  arxivRecommendations,
  inspectWord,
  mediaUrl,
  openArxiv,
  scorePronunciation,
  submitWriting,
  synthesize,
  uploadVoice,
  writingPrompt,
} from "@/lib/api";
import type { ArxivRecommendation, Passage, Sentence, TtsResult, WordInspect, WritingResult } from "@/lib/types";

type Tab = "audio" | "pronunciation" | "writing" | "arxiv";

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
    <section className="study-grid">
      <section className="panel study-panel">
        <div className="panel-head">
          Original Passage
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
        <div className="panel-head">Sentence Analysis</div>
        <div className="panel-body">
          {selected ? <SentenceAnalysis sentence={selected} /> : null}
        </div>
      </section>

      <section className="panel study-panel">
        <div className="panel-head">Word Panel</div>
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
            {(["audio", "pronunciation", "writing", "arxiv"] as Tab[]).map((item) => (
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
        </div>
      </section>
    </section>
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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function play() {
    const result = await synthesize(sentence.text);
    setTts(result);
    setTimeout(() => audioRef.current?.play(), 50);
    result.spoken_words.forEach((word) => {
      window.setTimeout(() => setActiveWord(word.word), word.start_ms);
    });
  }

  return (
    <div className="bottom-content">
      <div>
        <p className="mini-title">Sentence Playback</p>
        <div className="toolbar">
          <button className="primary" onClick={play}>
            <Volume2 size={17} /> Play sentence
          </button>
          {tts ? <span>Provider: {tts.provider}</span> : null}
        </div>
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

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks.current = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorder.current = recorder;
    recorder.ondataavailable = (event) => chunks.current.push(event.data);
    recorder.onstop = () => {
      setAudio(new Blob(chunks.current, { type: "audio/webm" }));
      stream.getTracks().forEach((track) => track.stop());
    };
    recorder.start();
    setRecording(true);
  }

  function stop() {
    mediaRecorder.current?.stop();
    setRecording(false);
  }

  async function submit() {
    const result = await scorePronunciation(audio, sentence.text, sentence.id);
    setScore(result.score);
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
      </div>
      <div>
        <p className="mini-title">Pronunciation JSON</p>
        <pre>{score ? JSON.stringify(score, null, 2) : "No score yet."}</pre>
      </div>
    </div>
  );
}

function WritingTutor({ passage }: { passage: Passage }) {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [result, setResult] = useState<WritingResult | null>(null);

  async function generate() {
    const generated = await writingPrompt(passage.id);
    setPrompt(generated.prompt);
  }

  async function submit() {
    setResult(await submitWriting(prompt, response, passage.id));
  }

  return (
    <div className="bottom-content">
      <div>
        <p className="mini-title">Writing Prompt</p>
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        <div className="toolbar">
          <button className="secondary" onClick={generate}>
            <Wand2 size={17} /> Generate
          </button>
          <button className="primary" onClick={submit}>
            <Send size={17} /> Submit
          </button>
        </div>
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
                  <b>{name}</b> {value}/10
                </div>
              ))}
            </div>
            <div className="analysis-card">
              <h3>Korean-like Translated English</h3>
              <pre>{JSON.stringify(result.korean_like_translation, null, 2)}</pre>
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

  async function load() {
    setLoading(true);
    try {
      setPapers(await arxivRecommendations());
    } finally {
      setLoading(false);
    }
  }

  async function open(id: string) {
    onPassage(await openArxiv(id));
  }

  return (
    <div>
      <div className="toolbar">
        <button className="primary" onClick={load}>
          <RefreshCw size={17} /> Load recommendations
        </button>
      </div>
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
  const [consent, setConsent] = useState("I consent to using this voice sample only for my Lingovector study voice profile.");
  const [result, setResult] = useState("");

  async function submit() {
    if (!file) return;
    const response = await uploadVoice(file, consent, "Student voice");
    setResult(`${response.provider}: ${response.provider_voice_id}`);
  }

  return (
    <div>
      <p className="mini-title">Voice Cloning</p>
      <div className="consent-box">
        <Upload size={18} />
        <span>Upload only your own voice. The backend stores consent text with the voice profile before provider processing.</span>
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
        <Upload size={17} /> Upload voice
      </button>
      {result ? <p>{result}</p> : null}
    </div>
  );
}
