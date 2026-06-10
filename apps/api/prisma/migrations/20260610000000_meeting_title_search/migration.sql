CREATE INDEX IF NOT EXISTS "meeting_sessions_user_title_idx"
  ON "meeting_sessions" ("user_id", "title");
