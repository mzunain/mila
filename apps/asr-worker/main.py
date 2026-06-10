import base64
import os
import tempfile
from functools import lru_cache
from pathlib import Path
from time import perf_counter
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
    vocabulary: list[str] = Field(default_factory=list)
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


@app.on_event("startup")
def preload_model_on_startup():
    if WhisperModel is None:
        return
    if not read_bool(os.getenv("WHISPER_PRELOAD", "true")):
        return
    started = perf_counter()
    get_model()
    elapsed_ms = int((perf_counter() - started) * 1000)
    print(
        f"Loaded faster-whisper model {os.getenv('WHISPER_MODEL', 'tiny')} "
        f"in {elapsed_ms}ms",
        flush=True,
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "mila-asr-worker",
        "provider": "faster-whisper",
        "model": os.getenv("WHISPER_MODEL", "tiny"),
        "modelLoaded": get_model.cache_info().currsize > 0,
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
        # Always transcribe faithfully in the language actually spoken. Whisper's
        # "translate" task only ever outputs English, which (a) mangles the
        # original words that name/mention detection relies on and (b) mislabels
        # non-English meetings (text in English, detectedLanguage still foreign).
        # Translating into the user's chosen output language is a separate,
        # downstream concern handled by the LLM layer, not the ASR worker.
        task = "transcribe"
        segments, info = model.transcribe(
            str(audio_path),
            task=task,
            beam_size=int(os.getenv("WHISPER_BEAM_SIZE", "5")),
            multilingual=True,
            # --- Hallucination control --------------------------------------
            # Small Whisper models invent text on near-silent or noisy chunks:
            # the trained-on-YouTube "Thank you for watching", and decoder
            # repetition loops ("I am giving you a secret." x4). On a live
            # meeting that buried the real words under junk at ~35% confidence.
            # These knobs strip most of it before it reaches the UI. VAD is
            # configurable because the Electron client already silence-gates
            # live chunks; always-on worker VAD adds latency and can drop short
            # interjections.
            vad_filter=read_bool(os.getenv("WHISPER_VAD_FILTER", "false")),
            vad_parameters=dict(
                min_silence_duration_ms=int(os.getenv("WHISPER_MIN_SILENCE_MS", "500")),
                speech_pad_ms=int(os.getenv("WHISPER_SPEECH_PAD_MS", "200")),
            ),
            # Don't seed each window with the previous window's text — that's the
            # mechanism that lets one hallucinated phrase snowball into a loop.
            condition_on_previous_text=False,
            # Forbid the decoder from repeating any 3-gram (kills the
            # "secret. secret. secret." loops at the source).
            no_repeat_ngram_size=int(os.getenv("WHISPER_NO_REPEAT_NGRAM", "3")),
            # Drop windows the model itself flags as unlikely to be speech.
            no_speech_threshold=float(os.getenv("WHISPER_NO_SPEECH_THRESHOLD", "0.6")),
            log_prob_threshold=float(os.getenv("WHISPER_LOGPROB_THRESHOLD", "-0.8")),
            compression_ratio_threshold=float(os.getenv("WHISPER_COMPRESSION_RATIO", "2.2")),
            initial_prompt=build_initial_prompt(request.vocabulary),
        )
        # Strip the notorious silence-hallucinations the thresholds miss (they
        # often decode with deceptively high confidence), then join the rest.
        segment_list = [seg for seg in segments if not is_probable_hallucination(seg)]
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
    model_name = os.getenv("WHISPER_MODEL", "tiny")
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
    if "aiff" in mime_type or "aifc" in mime_type:
        return ".aiff"
    if "mp4" in mime_type:
        return ".mp4"
    return ".webm"


def average_probability(values) -> float:
    values = list(values)

    if not values:
        return 0.8

    # faster-whisper exposes average log probability; convert a rough confidence.
    return sum(2.718281828 ** value for value in values) / len(values)


def build_initial_prompt(vocabulary: list[str]) -> Optional[str]:
    terms = []
    seen = set()
    for raw_term in vocabulary:
        term = " ".join(str(raw_term).strip().split())
        if not term:
            continue
        key = term.lower()
        if key in seen:
            continue
        seen.add(key)
        terms.append(term[:80])
        if len(terms) >= 40:
            break
    if not terms:
        return None
    return "Important meeting vocabulary: " + ", ".join(terms)


# Stock phrases small Whisper models emit over silence/music/noise — artefacts
# of YouTube training data, never real meeting speech. Substring match (case-
# insensitive) because the model often pads them ("...and I'll see you in the
# next one"). Kept deliberately short and unambiguous to avoid eating real talk.
_HALLUCINATION_SUBSTRINGS = (
    "thank you for watching",
    "thanks for watching",
    "see you in the next",
    "please subscribe",
    "like and subscribe",
    "subtitles by",
    "amara.org",
)


def is_probable_hallucination(segment) -> bool:
    text = segment.text.strip().lower()
    core = text.strip(" .!?,\"'“”")
    if not core:
        return True
    if any(sub in text for sub in _HALLUCINATION_SUBSTRINGS):
        return True
    # A short blip the model itself rates as probably-not-speech is almost always
    # a silence hallucination. These frequently decode with high confidence, so
    # no_speech_threshold alone won't drop them — length + no_speech_prob does.
    no_speech = getattr(segment, "no_speech_prob", 0.0) or 0.0
    if no_speech > 0.8 and len(core) <= 24:
        return True
    return False


def read_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}
