# Mila Architecture

## System Shape

```txt
apps/web     Next.js App Router, Web Audio API, PWA-ready UI
apps/api     NestJS REST + WebSocket gateway
packages/shared  DTOs, transcript types, language helpers
infra         Postgres, Redis, object storage, future AI workers
```

## Realtime Flow

```txt
Browser microphone
  -> Web Audio API / MediaRecorder
  -> WebSocket meeting stream
  -> NestJS Meeting Gateway
  -> ASR Provider
  -> language detection + normalization
  -> transcript segment event
  -> notes debounce queue
  -> WebSocket response to UI
  -> PostgreSQL persistence
```

```txt
Google Meet captions
  -> Browser extension content script
  -> Extension background bridge
  -> WebSocket `transcript-chunk`
  -> NestJS Meeting Gateway
  -> transcript segment event fan-out
  -> Mila web UI and notes engine
```

## Auto-Start Detection

Browser sandboxing prevents a plain web app from inspecting other tabs or native apps. Mila therefore treats meeting detection as a trusted signal pipeline:

```txt
Calendar worker / browser extension / desktop bridge
  -> meeting joined signal
  -> Mila API creates an auto-started session
  -> Mila web app opens that existing session
  -> extension or desktop bridge sends transcript/audio chunks
  -> microphone capture starts only when browser permission allows
```

Current supported signal shapes:

- URL parameters: `?autostart=1&meetingUrl=...`
- URL parameters with an existing bridge session: `?sessionId=...&autostart=1`
- `window.postMessage({ type: 'mila.meeting-joined', payload })`
- `localStorage['mila:meeting-signal']`

Future production sources:

- Google Calendar and Microsoft Graph calendar polling
- Browser extension for Google Meet, Zoom web, Teams web, Slack huddles
- Tauri desktop bridge for native meeting apps, system audio, tray auto-start

## Real Audio Boundaries

`ASR_PROVIDER=mock` is a demo-only provider. It must never generate transcript text for real uploaded or microphone audio. Production transcription requires one of:

- Local worker: faster-whisper or whisper.cpp
- GPU worker: faster-whisper/vLLM-style service boundary
- External compatible ASR provider

Capture scope by client:

- Web-only: microphone after browser permission; no other-tab or whole-device capture
- Browser extension: meeting-tab detection and Google Meet caption bridge; tab audio capture is next
- Desktop app: system audio and native meeting app detection through OS APIs
- Mobile app: microphone capture; background call capture is limited by platform rules

## Scalability Model

- API nodes remain stateless except WebSocket connection state.
- Transcript writes are append-only and idempotent by segment ID.
- Redis coordinates queues, debounce timers, and future Socket.IO/WS fan-out.
- ASR and LLM workers scale independently from API nodes.
- WebSocket is the MVP transport; LiveKit/WebRTC becomes the media plane when concurrent audio load grows.
- Provider adapters isolate fast-moving AI infrastructure from product logic.

## Provider Interfaces

- `AsrProvider`: turns audio chunks into partial/final transcript segments.
- `TranslationProvider`: normalizes source text into the selected output language.
- `NotesProvider`: produces incremental and final structured notes.
- `LlmNotesRouter`: routes note generation across Free Claude Code env, OpenRouter, NVIDIA NIM, local OpenAI-compatible servers, and heuristic fallback.
- `EmbeddingProvider`: creates vectors for search.
- `ObjectStorageProvider`: stores raw audio in S3-compatible storage.

## Open-Source Defaults

- ASR: faster-whisper or whisper.cpp
- VAD: Silero VAD
- LLM: Ollama for local development, vLLM for GPU production
- Free hosted LLM route: NVIDIA NIM primary with OpenRouter free-model fallbacks when configured
- DB: PostgreSQL with pgvector
- Queue/cache: Redis + BullMQ
- Media scale path: LiveKit

## Security

- JWT sessions with short-lived access tokens and refresh rotation.
- Signed WebSocket session tokens.
- Per-user meeting ownership checks on all REST and WS paths.
- Audio and transcripts encrypted at rest in production.
- Raw audio retention policy per workspace.
- Provider calls are server-side only; browser never receives AI provider keys.
