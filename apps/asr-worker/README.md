# Mila ASR Worker

Open-source speech-to-text worker for Mila. It exposes a small HTTP API consumed by the NestJS backend when `ASR_PROVIDER=http`.

## Run

```bash
cd apps/asr-worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 9000
```

Then start the API with:

```bash
ASR_PROVIDER=http ASR_BASE_URL=http://localhost:9000 pnpm --filter @mila/api dev
```

## Models

Default model:

```bash
WHISPER_MODEL=small
```

For stronger multilingual quality use `medium` or `large-v3` on a machine with enough memory/GPU.

## API

```txt
GET  /health
POST /v1/transcribe
```

`/v1/transcribe` accepts base64 audio chunks and returns transcript text, detected language, and confidence.
