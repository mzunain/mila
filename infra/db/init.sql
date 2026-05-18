CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  avatar_url TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'email',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'live', 'processing', 'completed', 'failed')),
  output_language TEXT NOT NULL DEFAULT 'en',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES meeting_sessions(id) ON DELETE CASCADE,
  speaker_id TEXT,
  original_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  detected_language TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('ltr', 'rtl')),
  confidence REAL NOT NULL DEFAULT 0,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  is_final BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_notes (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL UNIQUE REFERENCES meeting_sessions(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  key_points JSONB NOT NULL DEFAULT '[]',
  action_items JSONB NOT NULL DEFAULT '[]',
  decisions JSONB NOT NULL DEFAULT '[]',
  output_language TEXT NOT NULL DEFAULT 'en',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transcript_segments_session_time_idx
  ON transcript_segments (session_id, start_ms);

CREATE INDEX IF NOT EXISTS meeting_sessions_user_created_idx
  ON meeting_sessions (user_id, created_at DESC);
