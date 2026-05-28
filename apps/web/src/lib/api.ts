import type { ArxivRecommendation, Passage, TtsResult, User, VoiceProfile, WordInspect, WritingResult } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8080";
const TOKEN_KEY = "lingovector_token";

export function getToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message ?? "API request failed");
  }
  return response.json() as Promise<T>;
}

export const mediaUrl = (path: string) => (path.startsWith("http") ? path : `${API_BASE}${path}`);

export async function login(idToken: string): Promise<{ access_token: string; user: User }> {
  return request("/auth/google", { method: "POST", body: JSON.stringify({ id_token: idToken }) });
}

export async function me(): Promise<User> {
  return request("/me");
}

export async function analyzePassage(text: string, title?: string, source = "paste"): Promise<Passage> {
  return request("/passages/analyze", { method: "POST", body: JSON.stringify({ text, title, source }) });
}

export async function inspectWord(word: string, context: string): Promise<WordInspect> {
  return request("/words/inspect", { method: "POST", body: JSON.stringify({ word, context }) });
}

export async function synthesize(text: string, voiceId?: string): Promise<TtsResult> {
  return request("/tts", { method: "POST", body: JSON.stringify({ text, voice_id: voiceId }) });
}

export async function uploadVoice(file: Blob, consentText: string, name: string) {
  const form = new FormData();
  form.append("file", file, "voice-sample.webm");
  form.append("consent_text", consentText);
  form.append("name", name);
  return request<VoiceProfile>("/voices/upload", {
    method: "POST",
    body: form,
  });
}

export async function deleteVoice(id: string) {
  return request<{ id: string; deleted: boolean }>(`/voices/${id}`, { method: "DELETE" });
}

export async function scorePronunciation(file: Blob | null, targetText: string, sentenceId?: string) {
  const form = new FormData();
  if (file) form.append("file", file, "pronunciation.webm");
  form.append("target_text", targetText);
  if (sentenceId) form.append("sentence_id", sentenceId);
  return request<{ id: string; score: Record<string, unknown> }>("/pronunciation/score", { method: "POST", body: form });
}

export async function writingPrompt(passageId: string): Promise<{ prompt: string }> {
  return request("/writing/prompts", { method: "POST", body: JSON.stringify({ passage_id: passageId }) });
}

export async function submitWriting(prompt: string, response: string, passageId?: string): Promise<WritingResult> {
  return request("/writing/submit", {
    method: "POST",
    body: JSON.stringify({ prompt, response, passage_id: passageId }),
  });
}

export async function arxivRecommendations(): Promise<ArxivRecommendation[]> {
  return request("/arxiv/recommendations");
}

export async function openArxiv(id: string): Promise<Passage> {
  return request("/arxiv/open", { method: "POST", body: JSON.stringify({ id }) });
}
