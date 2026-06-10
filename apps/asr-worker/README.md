# Mila ASR Worker

Open-source speech-to-text worker for Mila. It exposes a small HTTP API consumed by the NestJS backend when `ASR_PROVIDER=http`.

## Run

Recommended on macOS for lowest local latency:

```bash
pnpm dev:asr:native
```

This installs the Python venv, starts the worker on `127.0.0.1:9000`, preloads
the model, and uses the low-latency live defaults (`tiny`, int8, beam size 1,
worker VAD off). On an Apple M4, a 1.36s live chunk with vocabulary measured
`p95=344ms` through the full websocket path; the same path through Colima Docker
measured `p95=2306ms`, so native ASR is the live coaching path on macOS.

Then point the API at it:

```bash
ASR_PROVIDER=http ASR_BASE_URL=http://127.0.0.1:9000 pnpm --filter @mila/api dev
```

Manual setup:

```bash
cd apps/asr-worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
WHISPER_PRELOAD=true uvicorn main:app --host 127.0.0.1 --port 9000
```

Then start the API with:

```bash
ASR_PROVIDER=http ASR_BASE_URL=http://localhost:9000 pnpm --filter @mila/api dev
```

## Models

Default live model:

```bash
WHISPER_MODEL=tiny
```

`tiny` is intentionally the CPU live default so short chunks can finish faster
than real time. For stronger multilingual quality use `base`, `small`,
`medium`, or `large-v3` when you have enough CPU/GPU headroom and can tolerate
added latency.

The worker preloads the model by default (`WHISPER_PRELOAD=true`). That makes
startup slower but avoids the first meeting chunk paying the model load cost.

For live meetings, keep worker VAD off:

```bash
WHISPER_VAD_FILTER=false
```

The Electron client already silence-gates live audio before it sends chunks.
Worker-side VAD can add latency and can drop short interjections. Enable it only
for noisy uploads or if silence hallucinations become more costly than latency.

## API

```txt
GET  /health
POST /v1/transcribe
```

`/v1/transcribe` accepts base64 audio chunks and returns transcript text, detected language, and confidence.
