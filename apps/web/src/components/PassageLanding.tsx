"use client";

import { BookOpen, FileText, Sparkles } from "lucide-react";
import { useState } from "react";
import { analyzePassage } from "@/lib/api";
import type { Passage } from "@/lib/types";

const SAMPLE = `Although many students can translate difficult passages, they often struggle to explain how a sentence builds its idea. Real fluency begins when learners notice structure, logic, and nuance before choosing Korean words.`;

export function PassageLanding({ onPassage }: { onPassage: (passage: Passage) => void }) {
  const [title, setTitle] = useState("Nuance and fluency");
  const [text, setText] = useState(SAMPLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!text.trim()) {
      setError("먼저 짧은 영어 지문을 붙여 넣어 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      onPassage(await analyzePassage(text, title));
    } catch {
      setError("지문을 분석하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`panel input-panel ${busy ? "loading" : ""}`}>
      <div className="input-intro">
        <Sparkles size={20} />
        <div>
          <h2>지문 입력</h2>
          <p>영어 지문을 문장별로 나누고, 먼저 쉬운 영어로 의미 흐름을 잡은 뒤 한국어 설명으로 구조와 뉘앙스를 보완합니다.</p>
        </div>
      </div>
      <div className="field">
        <label htmlFor="title">제목</label>
        <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="passage">분석할 영어 지문</label>
        <textarea
          id="passage"
          value={text}
          placeholder="수업 지문, 교과서 문장, 논문 초록에서 가져온 영어 문장 2-6개를 붙여 넣어 보세요."
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="toolbar">
        <button className="primary" onClick={submit}>
          <FileText size={17} /> {busy ? "분석 중..." : "지문 분석"}
        </button>
        <button className="secondary" onClick={() => {
          setTitle("Nuance and fluency");
          setText(SAMPLE);
          setError("");
        }}>
          <BookOpen size={17} /> 샘플 지문 사용
        </button>
      </div>
      <p className="next-action">분석 후에는 왼쪽에서 문장을 고르고, 가운데 설명을 읽은 뒤, 더 알고 싶은 단어를 클릭하세요.</p>
      {error ? <div className="error">{error}</div> : null}
    </section>
  );
}
