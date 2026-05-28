"use client";

import {
  Activity,
  FilePlus2,
  KeyRound,
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
  consentStatus,
  deleteAccount,
  deleteAllVoiceData,
  deleteVoice,
  inspectWord,
  mediaUrl,
  openArxiv,
  privacySummary,
  providerDiagnostics,
  scorePronunciation,
  submitWriting,
  uploadVoice,
  withdrawConsent,
  writingPrompt,
} from "@/lib/api";
import { configuredTtsMode, synthesizeForBrowser, ttsModeLabel } from "@/lib/tts";
import type { ArxivRecommendation, ConsentStatus, Passage, PrivacySummary, ProviderDiagnostics, Sentence, TtsResult, VoiceProfile, WordInspect, WritingResult } from "@/lib/types";

type Tab = "audio" | "pronunciation" | "writing" | "arxiv" | "privacy" | "diagnostics" | "review";

const DIAGNOSTICS_VISIBLE = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DIAGNOSTICS_ENABLED === "true";
const DEV_REVIEW_VISIBLE = process.env.NODE_ENV !== "production";
const TAB_LABELS: Record<Tab, string> = {
  audio: "발음 듣기",
  pronunciation: "발음 연습",
  writing: "영작 튜터",
  arxiv: "논문 추천",
  privacy: "개인정보 및 계정",
  diagnostics: "개발자 진단",
  review: "품질 리뷰",
};
const SCORE_LABELS: Record<string, string> = {
  Grammar: "문법",
  Vocabulary: "어휘",
  Nuance: "뉘앙스",
  Logic: "논리",
  Structure: "구조",
  Clarity: "명확성",
  Naturalness: "자연스러움",
};

function scoreLabel(name: string) {
  return SCORE_LABELS[name] ?? name;
}

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
  onAccountDeleted,
}: {
  passage: Passage;
  onNewPassage: () => void;
  onPassage: (passage: Passage) => void;
  onAccountDeleted: () => void;
}) {
  const [selectedSentenceId, setSelectedSentenceId] = useState(passage.sentences[0]?.id ?? "");
  const selected = useMemo(
    () => passage.sentences.find((sentence) => sentence.id === selectedSentenceId) ?? passage.sentences[0],
    [passage, selectedSentenceId],
  );
  const [word, setWord] = useState<WordInspect | null>(null);
  const [tab, setTab] = useState<Tab>("audio");
  const [busy, setBusy] = useState("");
  const tabs: Tab[] = ["audio", "pronunciation", "writing", "arxiv", "privacy"];
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
          <b>학습 흐름</b>
          <span>왼쪽에서 원문 문장을 고르고, 가운데에서 의미 흐름을 먼저 읽은 뒤, 오른쪽에서 단어를 깊게 확인하세요. 아래에서는 듣기, 발음, 영작을 연습합니다.</span>
        </div>
        <button className="secondary" onClick={onNewPassage}>
          <FilePlus2 size={16} /> 새 지문 입력
        </button>
      </section>
      <section className="study-grid">
        <section className="panel study-panel">
          <div className="panel-head">
            <span>왼쪽 · 원문</span>
            <button className="icon-button" title="새 지문 분석" onClick={onNewPassage}>
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
          <div className="panel-head">가운데 · 문장 분석</div>
          <div className="panel-body">
            {selected ? <SentenceAnalysis sentence={selected} /> : null}
          </div>
        </section>

        <section className="panel study-panel">
          <div className="panel-head">오른쪽 · 단어 상세</div>
          <div className="panel-body">
            {word ? (
              <WordPanel word={word} busy={busy === "word"} />
            ) : (
              <p className="right-panel-empty">원문에서 단어를 클릭하면 영어 정의, 핵심 개념, 문맥 속 의미, 한국어 보조 설명, 형태 분석을 볼 수 있습니다. 선택한 단어는 학습 기록에 저장됩니다.</p>
            )}
          </div>
        </section>

        <section className="panel study-panel bottom-panel">
          <div className="panel-head">
            연습
            <div className="bottom-tabs">
              {tabs.map((item) => (
                <button key={item} className={`tab ${tab === item ? "active" : ""}`} onClick={() => setTab(item)}>
                  {TAB_LABELS[item]}
                </button>
              ))}
            </div>
          </div>
          <div className="panel-body">
            {tab === "audio" && selected ? <AudioPractice sentence={selected} /> : null}
            {tab === "pronunciation" && selected ? <PronunciationPractice sentence={selected} /> : null}
            {tab === "writing" ? <WritingTutor passage={passage} /> : null}
            {tab === "arxiv" ? <ArxivLearning onPassage={onPassage} /> : null}
            {tab === "privacy" ? <PrivacySettings onAccountDeleted={onAccountDeleted} /> : null}
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
        <h3>Simple English 설명</h3>
        <p>{sentence.simple_english}</p>
      </div>
      <div className="analysis-card">
        <h3>자세한 한국어 설명</h3>
        <p>{sentence.korean_detail}</p>
      </div>
      <div className="analysis-card">
        <h3>문법 구조</h3>
        <pre>{JSON.stringify(sentence.grammar, null, 2)}</pre>
      </div>
      <div className="analysis-card">
        <h3>의미 단위</h3>
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
        <h3>품사 분석</h3>
        <div>
          {sentence.pos.map((token, index) => (
            <span className="token" key={`${token.token}-${index}`}>
              {token.token} <span>{token.label}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="analysis-card">
        <h3>문장 구조</h3>
        <div className="structure-list">
          {sentence.structure.map((item, index) => (
            <div className="structure-item" key={`${item.label}-${index}`}>
              <b>{item.label}</b>
              <p>{item.text || "이 구간에 추가 단어가 없습니다."}</p>
              <small>{item.role}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="analysis-card">
        <h3>해석 흐름과 논리 관계</h3>
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
        <h3>핵심 의미 개념</h3>
        <p>{word.core_meaning}</p>
      </div>
      <div className="analysis-card">
        <h3>문맥 속 의미</h3>
        <p>{word.contextual_meaning}</p>
      </div>
      <div className="analysis-card">
        <h3>한국어 보조 설명</h3>
        <p>{word.korean_support}</p>
      </div>
      <div className="analysis-card">
        <h3>형태 분석</h3>
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
      const result = await synthesizeForBrowser(sentence.text);
      setTts(result);
      setTimeout(() => audioRef.current?.play(), 50);
      result.spoken_words.forEach((word) => {
        window.setTimeout(() => setActiveWord(word.word), word.start_ms);
      });
    } catch {
      setError("문장을 재생하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bottom-content">
      <div>
        <p className="mini-title">문장 재생</p>
        <div className="toolbar">
          <button className="primary" onClick={play}>
            <Volume2 size={17} /> {busy ? "준비 중..." : "문장 재생"}
          </button>
          <span>온디바이스 TTS 상태: {ttsModeLabel()} · provider: {tts?.provider ?? "대기 중"}</span>
          {(tts?.provider === "mock" || tts?.provider === "browser-mock") && DIAGNOSTICS_VISIBLE ? <span>개발용 샘플 음성 (mock)</span> : null}
        </div>
        {tts?.fallback_message ? <p className="helper-text">{tts.fallback_message}</p> : null}
        {error ? <div className="error">{error}</div> : null}
        {tts ? <audio ref={audioRef} controls src={mediaUrl(tts.audio_url)} /> : null}
      </div>
      <div>
        <p className="mini-title">현재 들리는 단어</p>
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
        setStatus("녹음이 준비되었습니다. 점수 확인을 눌러 피드백을 받아 보세요.");
      };
      recorder.start();
      setRecording(true);
      setStatus("녹음 중...");
    } catch {
      setError("마이크 접근이 차단되었습니다. 브라우저에서 마이크 권한을 허용하거나, 녹음 없이 mock 채점기를 사용해 보세요.");
    }
  }

  function stop() {
    mediaRecorder.current?.stop();
    setRecording(false);
  }

  async function submit() {
    setError("");
    setStatus("발음을 채점하는 중...");
    try {
      const result = await scorePronunciation(audio, sentence.text, sentence.id);
      setScore(result.score);
      setStatus("발음 피드백이 저장되었습니다.");
    } catch {
      setError("발음을 채점하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setStatus("");
    }
  }

  return (
    <div className="bottom-content">
      <div>
        <p className="mini-title">녹음과 채점</p>
        <div className="toolbar">
          {!recording ? (
            <button className="primary" onClick={start}>
              <Mic size={17} /> 녹음 시작
            </button>
          ) : (
            <button className="danger" onClick={stop}>
              <Pause size={17} /> 중지
            </button>
          )}
          <button className="secondary" onClick={submit}>
            <RefreshCw size={17} /> 점수 확인
          </button>
        </div>
        {status ? <p className="helper-text">{status}</p> : null}
        {error ? <div className="error">{error}</div> : null}
      </div>
      <div>
        <p className="mini-title">발음 피드백</p>
        <pre>{score ? JSON.stringify(score, null, 2) : "아직 점수가 없습니다."}</pre>
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
    } catch {
      setError("영작 프롬프트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy("");
    }
  }

  async function submit() {
    if (!prompt.trim() || !response.trim()) {
      setError("먼저 프롬프트를 만들고 영어 답안을 작성해 주세요.");
      return;
    }
    setBusy("submit");
    setError("");
    try {
      setResult(await submitWriting(prompt, response, passage.id));
    } catch {
      setError("영작 피드백을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="bottom-content">
      <div>
        <p className="mini-title">영작 프롬프트</p>
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        <div className="toolbar">
          <button className="secondary" onClick={generate}>
            <Wand2 size={17} /> {busy === "prompt" ? "만드는 중..." : "프롬프트 만들기"}
          </button>
          <button className="primary" onClick={submit}>
            <Send size={17} /> {busy === "submit" ? "채점 중..." : "영작 제출"}
          </button>
        </div>
        {error ? <div className="error">{error}</div> : null}
        <div className="field">
          <label htmlFor="writing">내 영어 답안</label>
          <textarea id="writing" value={response} onChange={(event) => setResponse(event.target.value)} />
        </div>
      </div>
      <div>
        <p className="mini-title">피드백 보기</p>
        {result ? (
          <>
            <div className="score-grid">
              {Object.entries(result.scores).map(([name, value]) => (
                <div className="score-card" key={name}>
                  <b>{scoreLabel(name)}</b> {value}/100
                </div>
              ))}
            </div>
            <div className="analysis-card">
              <h3>한국어식 번역투</h3>
              <pre>{JSON.stringify(result.korean_like_translation, null, 2)}</pre>
            </div>
            <div className="analysis-card">
              <h3>수정 전</h3>
              <p>{result.original}</p>
            </div>
            <div className="analysis-card">
              <h3>수정 후</h3>
              <p>{result.revised}</p>
            </div>
            <div className="analysis-card">
              <h3>설명</h3>
              <p>{result.explanation}</p>
            </div>
          </>
        ) : (
          <p className="right-panel-empty">프롬프트를 만든 뒤 영어로 답안을 쓰고 제출하면 7개 기준 점수, 번역투 점검, 수정 예시와 설명을 볼 수 있습니다.</p>
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
    } catch {
      setError("논문 추천을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function open(id: string) {
    setError("");
    try {
      onPassage(await openArxiv(id));
    } catch {
      setError("이 초록을 분석 화면으로 열지 못했습니다.");
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button className="primary" onClick={load}>
          <RefreshCw size={17} /> {loading ? "불러오는 중..." : "논문 추천 불러오기"}
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {!loading && papers.length === 0 ? <p className="right-panel-empty">Security, AI, Robotics, Physics, Chemistry, Biology 분야의 제목과 초록만 사용한 추천을 불러옵니다. 마음에 드는 초록은 같은 문장 분석 흐름으로 열 수 있습니다.</p> : null}
      <div className={`arxiv-list ${loading ? "loading" : ""}`}>
        {papers.map((paper) => (
          <article className="arxiv-item" key={paper.id}>
            <p className="mini-title">{paper.category} · {paper.difficulty}</p>
            <h3>{paper.title}</h3>
            <p>{paper.abstract_text}</p>
            <p>{paper.reason}</p>
            <p><b>핵심 어휘:</b> {paper.key_vocabulary.join(", ")}</p>
            <p><b>영작 과제:</b> {paper.writing_prompt}</p>
            <button className="secondary" onClick={() => open(paper.id)}>
              <Play size={17} /> 초록 분석하기
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

export function VoiceConsentUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState("저는 제 목소리이거나 사용할 명시적 허락을 받은 목소리만 업로드하는 데 동의합니다. Lingovector가 학습용 음성 프로필을 위해 이 샘플과 동의 메타데이터를 저장한다는 점을 이해하며, 복제 음성을 다른 사람을 사칭하는 데 사용하지 않겠습니다.");
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function submit() {
    if (!file) {
      setError("먼저 음성 샘플 파일을 선택해 주세요.");
      return;
    }
    setBusy("upload");
    setError("");
    setStatus("음성 샘플을 업로드하는 중...");
    try {
      const response = await uploadVoice(file, consent, "Student voice");
      setProfile(response);
      setStatus("음성 프로필이 저장되었습니다. 언제든지 여기에서 삭제할 수 있습니다.");
    } catch {
      setError("음성 샘플을 업로드하지 못했습니다. 동의 문구와 파일을 확인한 뒤 다시 시도해 주세요.");
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
      setStatus("음성 프로필이 삭제되었습니다. 저장된 프로필 기록을 제거했고, 저장된 오디오 파일 삭제도 시도했습니다.");
      setProfile(null);
    } catch {
      setError("음성 프로필을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <p className="mini-title">음성 업로드</p>
      <div className="consent-box">
        <Upload size={18} />
        <span>본인 목소리 또는 명시적 허락을 받은 목소리만 업로드하세요. Lingovector는 오디오 샘플, 동의 문구, 동의 버전, 파일 메타데이터를 저장합니다. 삭제하면 프로필 기록을 제거하고 저장된 오디오 파일 삭제를 시도합니다. 복제 음성은 다른 사람을 사칭하는 데 사용할 수 없습니다.</span>
      </div>
      <div className="field">
        <label htmlFor="voice-file">음성 샘플</label>
        <input id="voice-file" type="file" accept="audio/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </div>
      <div className="field">
        <label htmlFor="consent">동의 문구</label>
        <textarea id="consent" value={consent} onChange={(event) => setConsent(event.target.value)} />
      </div>
      <button className="secondary" onClick={submit}>
        <Upload size={17} /> {busy === "upload" ? "업로드 중..." : "음성 업로드"}
      </button>
      {profile ? (
        <button className="danger" onClick={remove}>
          <Trash2 size={17} /> {busy === "delete" ? "삭제 중..." : "음성 삭제"}
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
    setStatus("샘플을 같은 학습 흐름으로 실행하는 중...");
    setError("");
    setResult(null);
    try {
      const passage = await analyzePassage(sample.text, sample.title, sample.source);
      const word = await inspectWord(sample.word, passage.sentences[0]?.text ?? sample.text);
      const generatedPrompt = await writingPrompt(passage.id);
      const writing = await submitWriting(generatedPrompt.prompt, sample.response, passage.id);
      setResult({ passage, word, writing, prompt: generatedPrompt.prompt });
      setStatus("리뷰 샘플 준비 완료.");
    } catch {
      setError("리뷰 샘플을 실행하지 못했습니다. API 상태를 확인해 주세요.");
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
          <RefreshCw size={17} /> 리뷰 샘플 실행
        </button>
      </div>
      {status ? <p className="helper-text">{status}</p> : null}
      {error ? <div className="error">{error}</div> : null}
      {result ? (
        <div className="review-grid">
          <section className="analysis-card">
            <h3>문장 분석</h3>
            <pre>{JSON.stringify(result.passage.sentences, null, 2)}</pre>
          </section>
          <section className="analysis-card">
            <h3>단어 분석</h3>
            <pre>{JSON.stringify(result.word, null, 2)}</pre>
          </section>
          <section className="analysis-card">
            <h3>영작 피드백</h3>
            <div className="score-grid">
              {Object.entries(result.writing.scores).map(([name, value]) => (
                <div className="score-card" key={name}>
                  <b>{scoreLabel(name)}</b> {value}/100
                </div>
              ))}
            </div>
            <p><b>프롬프트:</b> {result.prompt}</p>
            <p><b>수정 전:</b> {result.writing.original}</p>
            <p><b>수정 후:</b> {result.writing.revised}</p>
            <pre>{JSON.stringify(result.writing.korean_like_translation, null, 2)}</pre>
          </section>
        </div>
      ) : (
        <p className="right-panel-empty">로컬 리뷰 모드는 커밋된 샘플 지문을 문장 분석, 단어 분석, 영작 피드백 흐름에 넣어 학습 품질을 직접 확인하게 해 줍니다.</p>
      )}
    </div>
  );
}

function PrivacySettings({ onAccountDeleted }: { onAccountDeleted: () => void }) {
  const [summary, setSummary] = useState<PrivacySummary | null>(null);
  const [consents, setConsents] = useState<ConsentStatus | null>(null);
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    setBusy("load");
    setError("");
    try {
      const [nextSummary, nextConsents] = await Promise.all([privacySummary(), consentStatus()]);
      setSummary(nextSummary);
      setConsents(nextConsents);
      setStatus("개인정보 상태를 불러왔습니다.");
    } catch {
      setError("개인정보 상태를 불러오지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function removeVoiceData() {
    setBusy("voice");
    setError("");
    try {
      const result = await deleteAllVoiceData();
      setStatus(`음성 데이터 삭제를 처리했습니다. 프로필 ${result.deleted_profiles}개, 파일 삭제 시도 ${result.attempted_file_deletions}건.`);
      await load();
    } catch {
      setError("음성 데이터를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy("");
    }
  }

  async function removeAccount(kind: "delete" | "withdraw") {
    if (confirm !== "삭제") {
      setError("계정을 삭제하려면 확인 칸에 '삭제'를 입력해 주세요.");
      return;
    }
    setBusy(kind);
    setError("");
    try {
      if (kind === "withdraw") {
        await withdrawConsent();
      } else {
        await deleteAccount();
      }
      onAccountDeleted();
    } catch {
      setError("계정 삭제를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="privacy-settings">
      <div className="toolbar">
        <button className="secondary" onClick={load}>
          <KeyRound size={17} /> {busy === "load" ? "불러오는 중..." : "동의 내역과 저장 데이터 확인"}
        </button>
        <span>온디바이스 TTS 상태: {ttsModeLabel(configuredTtsMode())}</span>
      </div>
      <div className="consent-box">
        Lingovector는 필수 동의가 있어야 학습 기능을 제공할 수 있습니다. 개인정보 제공 동의를 철회하면 베타 서비스 이용이 중단되고 계정 삭제와 같은 흐름으로 처리됩니다.
      </div>
      {status ? <p className="helper-text">{status}</p> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="privacy-grid">
        <section className="analysis-card">
          <h3>동의 내역</h3>
          {consents ? (
            <ul className="compact-list">
              {consents.required.map((item) => {
                const accepted = consents.accepted.find((record) => record.consent_type === item.consent_type && record.consent_version === item.consent_version);
                return (
                  <li key={item.consent_type}>
                    <b>{item.title}</b>
                    <span>{accepted ? `동의 완료: ${new Date(accepted.accepted_at).toLocaleString("ko-KR")}` : "현재 버전 동의 필요"}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="right-panel-empty">버튼을 눌러 현재 동의 내역을 확인하세요.</p>
          )}
        </section>
        <section className="analysis-card">
          <h3>학습 기록 삭제 안내</h3>
          {summary ? (
            <div className="score-grid">
              <div className="score-card"><b>분석 지문</b> {summary.passages_count}</div>
              <div className="score-card"><b>저장 단어</b> {summary.unknown_words_count}</div>
              <div className="score-card"><b>발음 기록</b> {summary.pronunciation_records_count}</div>
              <div className="score-card"><b>음성 프로필</b> {summary.voice_profiles_count}</div>
              <div className="score-card"><b>영작 제출</b> {summary.writing_submissions_count}</div>
              <div className="score-card"><b>복습 기록</b> {summary.review_history_count}</div>
            </div>
          ) : (
            <p className="right-panel-empty">저장된 학습 기록 개수를 확인할 수 있습니다. 계정 삭제 시 연결된 개인 데이터 삭제를 시도합니다.</p>
          )}
        </section>
        <section className="analysis-card">
          <h3>음성 데이터 관리</h3>
          <p>업로드한 voice profile DB 기록과 연결된 저장 파일 삭제를 시도합니다. 다른 기능에서 생성했지만 계정과 직접 연결되지 않은 로컬 출력 파일은 운영자 cleanup 절차가 필요할 수 있습니다.</p>
          <button className="danger" onClick={removeVoiceData}>
            <Trash2 size={17} /> {busy === "voice" ? "삭제 중..." : "음성 데이터 삭제"}
          </button>
        </section>
        <section className="analysis-card">
          <h3>개인정보 제공 동의 철회 및 계정 삭제</h3>
          <p>필수 동의를 철회하면 서비스를 계속 제공할 수 없어 계정과 개인 학습 데이터 삭제로 처리됩니다. 계속하려면 아래 칸에 &quot;삭제&quot;를 입력하세요.</p>
          <div className="field">
            <label htmlFor="delete-confirm">삭제 확인</label>
            <input id="delete-confirm" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="삭제" />
          </div>
          <div className="toolbar">
            <button className="danger" onClick={() => removeAccount("withdraw")}>
              <Trash2 size={17} /> {busy === "withdraw" ? "처리 중..." : "개인정보 제공 동의 철회"}
            </button>
            <button className="danger" onClick={() => removeAccount("delete")}>
              <Trash2 size={17} /> {busy === "delete" ? "삭제 중..." : "계정 삭제"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function ProviderDiagnosticsPanel() {
  const [diagnostics, setDiagnostics] = useState<ProviderDiagnostics | null>(null);
  const [status, setStatus] = useState("");

  async function load() {
    setStatus("진단 정보를 불러오는 중...");
    try {
      setDiagnostics(await providerDiagnostics());
      setStatus("");
    } catch {
      setStatus("진단 정보를 불러오지 못했습니다. API 설정을 확인해 주세요.");
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button className="secondary" onClick={load}>
          <Activity size={17} /> 제공자 상태 확인
        </button>
        {diagnostics ? <span>환경: {diagnostics.environment}</span> : null}
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
              <p><b>상태 설명:</b> {provider.detail}</p>
              <pre>{JSON.stringify(provider.metadata, null, 2)}</pre>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
