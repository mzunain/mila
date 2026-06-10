# @mila/api

NestJS API for Mila's live meetings, transcripts, notes, auth, and action inbox.

## Responsibilities

- Authenticated REST and WebSocket endpoints for the web and Electron clients.
- Meeting session lifecycle: start, ingest audio/transcript chunks, complete,
  and retrieve history.
- ASR provider routing to mock transcription or the faster-whisper worker.
- Notes generation through fast local live previews and LLM-backed final notes.
- Persistence through Prisma, Postgres/pgvector, and Redis-backed session state.

## Local Development

Run from the repository root:

```bash
pnpm --filter @mila/api dev
```

The API listens on `http://localhost:7400` when started by the root runner. The
ASR worker is expected at `ASR_BASE_URL` and defaults to the local Docker worker
configured in `.env.example`.

Useful checks:

```bash
pnpm --filter @mila/api lint
pnpm --filter @mila/api typecheck
pnpm --filter @mila/api test
pnpm --filter @mila/api build
```

Generate Prisma client after dependency changes or a clean install:

```bash
pnpm --filter @mila/api exec prisma generate
```

## Latency Notes

Live transcript responses should not wait on network LLM calls. The ingestion
path stores each transcript segment, returns a heuristic live notes preview, and
leaves higher-quality LLM summarization for final notes or explicit user actions.
