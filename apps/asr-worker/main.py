import base64
import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from faster_whisper import WhisperModel
except ImportError:  # pragma: no cover - exercised when dependencies are absent
    WhisperModel = None


app = FastAPI(title="Mila ASR Worker", version="0.1.0")


class TranscribeRequest(BaseModel):
    sessionId: str
    chunkId: str
    mimeType: str
    audioBase64: str = Field(min_length=1)
    outputLanguage: str = "en"
    segmentIndex: int = 0


class TranscribeResponse(BaseModel):
    text: str
    normalizedText: str
    translatedText: str
    detectedLanguage: str
    confidence: float
    startMs: int
    endMs: int
    speakerId: Optional[str] = None


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "mila-asr-worker",
        "provider": "faster-whisper",
        "model": os.getenv("WHISPER_MODEL", "small"),
        "ready": WhisperModel is not None,
    }


@app.post("/v1/transcribe", response_model=TranscribeResponse)
def transcribe(request: TranscribeRequest):
    if WhisperModel is None:
        raise HTTPException(
            status_code=503,
            detail="faster-whisper is not installed in the ASR worker environment",
        )

    audio_bytes = decode_audio(request.audioBase64)

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio payload")

    suffix = suffix_for_mime_type(request.mimeType)

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as audio_file:
        audio_file.write(audio_bytes)
        audio_path = Path(audio_file.name)

    try:
        model = get_model()
        task = "translate" if request.outputLanguage == "en" else "transcribe"
        segments, info = model.transcribe(
            str(audio_path),
            task=task,
            beam_size=int(os.getenv("WHISPER_BEAM_SIZE", "5")),
            vad_filter=True,
            multilingual=True,
        )
        segment_list = list(segments)
        text = " ".join(segment.text.strip() for segment in segment_list).strip()

        if not text:
            return TranscribeResponse(
                text="",
                normalizedText="",
                translatedText="",
                detectedLanguage=info.language or "unknown",
                confidence=0,
                startMs=request.segmentIndex * 4200,
                endMs=request.segmentIndex * 4200,
            )

        avg_probability = average_probability(segment.avg_logprob for segment in segment_list)
        start_ms = int(min((segment.start for segment in segment_list), default=0) * 1000)
        end_ms = int(max((segment.end for segment in segment_list), default=0) * 1000)

        return TranscribeResponse(
            text=text,
            normalizedText=text,
            translatedText=text,
            detectedLanguage=info.language or "unknown",
            confidence=max(0.0, min(1.0, avg_probability)),
            startMs=start_ms,
            endMs=end_ms,
        )
    finally:
        audio_path.unlink(missing_ok=True)


@lru_cache(maxsize=1)
def get_model():
    model_name = os.getenv("WHISPER_MODEL", "small")
    device = os.getenv("WHISPER_DEVICE", "auto")
    compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "auto")
    # Pin the CPU thread count. Inside a container CTranslate2 otherwise reads
    # the *host* core count (not the cgroup/VM limit), so on a small VM it spawns
    # far more threads than there are vCPUs and thrashes — measurably slower than
    # matching the thread count to the VM's vCPUs. 0 keeps the library default.
    cpu_threads = int(os.getenv("WHISPER_CPU_THREADS", "0"))
    return WhisperModel(
        model_name,
        device=device,
        compute_type=compute_type,
        cpu_threads=cpu_threads,
    )


def decode_audio(audio_base64: str) -> bytes:
    try:
        return base64.b64decode(audio_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 audio") from exc


def suffix_for_mime_type(mime_type: str) -> str:
    if "ogg" in mime_type:
        return ".ogg"
    if "mpeg" in mime_type or "mp3" in mime_type:
        return ".mp3"
    if "wav" in mime_type:
        return ".wav"
    if "mp4" in mime_type:
        return ".mp4"
    return ".webm"


def average_probability(values) -> float:
    values = list(values)

    if not values:
        return 0.8

    # faster-whisper exposes average log probability; convert a rough confidence.
    return sum(2.718281828 ** value for value in values) / len(values)
