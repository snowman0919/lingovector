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
      setError("Paste a short English passage first.");
      return;
    }
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
      <div className="input-intro">
        <Sparkles size={20} />
        <div>
          <h2>Paste an English passage</h2>
          <p>Lingovector splits the passage into sentences, explains meaning flow in simple English first, then helps with nuance, vocabulary, pronunciation, and writing.</p>
        </div>
      </div>
      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="passage">Passage to study</label>
        <textarea
          id="passage"
          value={text}
          placeholder="Paste 2-6 English sentences from class, a textbook, or an article abstract."
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="toolbar">
        <button className="primary" onClick={submit}>
          <FileText size={17} /> {busy ? "Analyzing..." : "Analyze passage"}
        </button>
        <button className="secondary" onClick={() => {
          setTitle("Nuance and fluency");
          setText(SAMPLE);
          setError("");
        }}>
          <BookOpen size={17} /> Use sample passage
        </button>
      </div>
      <p className="next-action">After analysis, choose a sentence on the left, read the center explanation, then click any word for deeper meaning.</p>
      {error ? <div className="error">{error}</div> : null}
    </section>
  );
}
