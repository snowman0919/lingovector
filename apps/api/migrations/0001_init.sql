CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    picture TEXT,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS passages (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'paste',
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sentence_analyses (
    id UUID PRIMARY KEY,
    passage_id UUID NOT NULL REFERENCES passages(id) ON DELETE CASCADE,
    sentence_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    simple_english TEXT NOT NULL,
    korean_detail TEXT NOT NULL,
    grammar JSONB NOT NULL,
    chunks JSONB NOT NULL,
    pos JSONB NOT NULL,
    structure JSONB NOT NULL,
    logic_relation TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS unknown_words (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word TEXT NOT NULL,
    familiarity INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, word)
);

CREATE TABLE IF NOT EXISTS voice_profiles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_voice_id TEXT NOT NULL,
    consent_text TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pronunciation_records (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sentence_id UUID REFERENCES sentence_analyses(id) ON DELETE SET NULL,
    target_text TEXT NOT NULL,
    audio_path TEXT NOT NULL,
    score JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS writing_submissions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    passage_id UUID REFERENCES passages(id) ON DELETE SET NULL,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    scores JSONB NOT NULL,
    korean_like_translation JSONB NOT NULL,
    revised TEXT NOT NULL,
    explanation TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_history (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL,
    item_ref TEXT NOT NULL,
    result TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_passages_user ON passages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sentence_passage ON sentence_analyses(passage_id, sentence_index);
CREATE INDEX IF NOT EXISTS idx_pronunciation_user ON pronunciation_records(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_writing_user ON writing_submissions(user_id, created_at DESC);
