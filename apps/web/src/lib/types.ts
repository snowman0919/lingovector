export type User = {
  id: string;
  email: string;
  name: string;
  picture?: string | null;
};

export type ConsentRequirement = {
  consent_type: string;
  consent_version: string;
  title: string;
  body: string;
  required: boolean;
  operator_review_required: boolean;
};

export type ConsentStatus = {
  has_required_consents: boolean;
  required: ConsentRequirement[];
  accepted: Array<{
    consent_type: string;
    consent_version: string;
    accepted_at: string;
  }>;
};

export type PrivacySummary = {
  passages_count: number;
  unknown_words_count: number;
  pronunciation_records_count: number;
  voice_profiles_count: number;
  writing_submissions_count: number;
  review_history_count: number;
};

export type Sentence = {
  id: string;
  sentence_index: number;
  text: string;
  simple_english: string;
  korean_detail: string;
  grammar: Record<string, unknown>;
  chunks: Array<{ label: string; text: string; function: string }>;
  pos: Array<{ token: string; label: string; start: number; end: number }>;
  structure: Array<{ label: string; text: string; role: string }>;
  logic_relation: string;
};

export type Passage = {
  id: string;
  title: string;
  source: string;
  text: string;
  created_at: string;
  sentences: Sentence[];
};

export type WordInspect = {
  word: string;
  english_definition: string;
  core_meaning: string;
  contextual_meaning: string;
  korean_support: string;
  morphology: {
    confidence?: string;
    analysis?: unknown[];
    note?: string;
  };
  familiarity: number;
};

export type TtsResult = {
  provider: string;
  audio_url: string;
  spoken_words: Array<{ word: string; start_ms: number; end_ms: number }>;
  fallback_message?: string;
};

export type WritingResult = {
  id: string;
  scores: Record<string, number>;
  korean_like_translation: Array<{ phrase: string; suggestion: string }>;
  original: string;
  revised: string;
  explanation: string;
};

export type VoiceProfile = {
  id: string;
  provider: string;
  provider_voice_id: string;
  consent_text: string;
  consent_version: string;
  metadata: Record<string, unknown>;
};

export type ArxivRecommendation = {
  id: string;
  category: string;
  title: string;
  abstract_text: string;
  difficulty: string;
  reason: string;
  key_vocabulary: string[];
  writing_prompt: string;
};

export type ProviderDiagnostics = {
  enabled: boolean;
  environment: string;
  providers: Array<{
    name: string;
    mode: "mock" | "configured" | "reachable" | "failed" | "disabled";
    detail: string;
    metadata: Record<string, unknown>;
  }>;
};
