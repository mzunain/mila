-- Add template + share-link columns to meeting_sessions
ALTER TABLE "meeting_sessions"
  ADD COLUMN IF NOT EXISTS "template_id" TEXT,
  ADD COLUMN IF NOT EXISTS "share_token" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "meeting_sessions_share_token_key"
  ON "meeting_sessions" ("share_token");
