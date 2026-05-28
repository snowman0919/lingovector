"use client";

import { BookOpen, FileText } from "lucide-react";
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
    setBusy(true);
    setError("");
    try {
      onPassage(await analyzePassage(text, title));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not analyze passage");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`panel input-panel ${busy ? "loading" : ""}`}>
      <h2>Paste an English passage</h2>
      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="passage">Passage</label>
        <textarea id="passage" value={text} onChange={(event) => setText(event.target.value)} />
      </div>
      <div className="toolbar">
        <button className="primary" onClick={submit}>
          <FileText size={17} /> Analyze
        </button>
        <button className="secondary" onClick={() => setText(SAMPLE)}>
          <BookOpen size={17} /> Sample
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
    </section>
  );
}
