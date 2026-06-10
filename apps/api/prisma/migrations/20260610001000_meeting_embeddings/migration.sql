CREATE TABLE IF NOT EXISTS "meeting_embeddings" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "session_id" uuid NOT NULL REFERENCES "meeting_sessions"("id") ON DELETE CASCADE,
  "segment_id" uuid REFERENCES "transcript_segments"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(64) NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "meeting_embeddings_session_idx"
  ON "meeting_embeddings" ("session_id");

CREATE INDEX IF NOT EXISTS "meeting_embeddings_segment_idx"
  ON "meeting_embeddings" ("segment_id");
