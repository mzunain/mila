# Mila Product Plan

## Brand

- Name: Mila
- Meaning: Multilingual Intelligence Listening Assistant
- Positioning: Meeting memory for code-switched conversations
- Tagline: Multilingual meeting memory
- Logo: Interlocking speech bubble and waveform mark
- Fonts: Geist Sans for product UI, Geist Mono for timestamps, IDs, and technical labels
- Palette: Ink, paper, signal green, saffron, and blue-gray accents

## Outcome

Mila listens to live or uploaded conversations, preserves the original multilingual transcript, normalizes it into a selected language, and produces structured meeting notes.

## Target Users

- Founders and operators working across multilingual teams
- Students and researchers recording mixed-language discussions
- Distributed teams that need searchable, accessible meeting records
- Users who need Urdu, Hindi, Finnish, and English support from day one

## Core Differentiators

- Code-switching is a first-class data model, not a translation afterthought
- Original transcript and normalized transcript are stored separately
- Per-segment language and direction metadata support mixed RTL/LTR text
- Open-source-first AI stack with provider interfaces for future models
- Product path covers web, desktop, and mobile without rewriting the core backend

## Release Sequence

1. Foundation: brand, monorepo, web shell, API shell, live mock ASR flow
2. Capture bridge: faster-whisper worker, real upload transcription, Google Meet caption bridge
3. Auth: email login, Google OAuth, JWT, refresh rotation, role-ready user model
4. Persistence: PostgreSQL repositories, migrations, session history
5. Notes engine: incremental and final notes with free-model/provider-routed LLM fallback
6. Export: Markdown, PDF, copy, share links
7. Search: pgvector embeddings and keyword search
8. Apps: PWA hardening, Tauri desktop, mobile wrapper or native mobile client

## Acceptance Criteria For Foundation

- Web app can create a meeting session through the API
- Web app can open a realtime WebSocket meeting stream
- WebSocket transcript events fan out to every client attached to the same session
- Transcript segments preserve original and normalized text
- UI shows language, direction, original/translated toggle, and notes
- API exposes health and session endpoints
- Product docs explain architecture, scalability, and open-source AI strategy
- Tests cover multilingual segment normalization and API session behavior

## Architecture Decisions

- Use a provider interface for ASR, translation, notes, embeddings, and storage
- Start with WebSocket audio chunks; keep a WebRTC/LiveKit migration path for scale
- Store transcript segments as append-only events for auditability and replay
- Use Redis/BullMQ for async notes, exports, embeddings, and model jobs
- Use PostgreSQL as the source of truth and pgvector for semantic search
- Keep local mock providers so the app works without paid APIs
- Route LLM notes through OpenAI-compatible adapters so OpenRouter, NVIDIA NIM, Ollama, LM Studio, llama.cpp, and future providers can be swapped without changing meeting logic

## Competitor Notes

- Granola: excellent desktop workflow and notes quality; weaker public multilingual/code-switch positioning
- Otter: strong transcription and sharing; product can feel meeting-recorder-first rather than multilingual assistant-first
- Fireflies: broad integrations; heavier workflow and less privacy/local-model positioning
- Fathom: strong video meeting workflow; limited differentiation for mixed-language teams

Mila's gap to win: multilingual fidelity, privacy/local deployment, configurable notes, and clean apps across web, desktop, and mobile.
