import os
import threading
from pathlib import Path
from typing import Optional, Callable


# Lazy import faster_whisper so the app can boot without it installed
WhisperModel = None


def _load_model_class():
    global WhisperModel
    if WhisperModel is None:
        from faster_whisper import WhisperModel as _WM
        WhisperModel = _WM
    return WhisperModel

# Global model (lazy-loaded)
_model: Optional[WhisperModel] = None
_model_lock = threading.Lock()

# Active jobs: session_id -> {"status": str, "progress": float, "result": ...}
_jobs: dict = {}


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                WM = _load_model_class()
                # Use CPU with int8 quantization for compatibility
                # User can override with environment variables if they have GPU
                device = os.environ.get("AUDIOJOT_WHISPER_DEVICE", "cpu")
                compute_type = os.environ.get("AUDIOJOT_WHISPER_COMPUTE", "int8")
                _model = WM("base", device=device, compute_type=compute_type)
    return _model


def get_job_status(session_id: str) -> Optional[dict]:
    return _jobs.get(session_id)


def transcribe_audio(
    session_id: str,
    audio_path: Path,
    language: Optional[str] = None,
    on_complete: Optional[Callable] = None,
) -> None:
    """Run transcription in a background thread."""
    _jobs[session_id] = {"status": "transcribing", "progress": 0.0, "result": None}

    def _run():
        try:
            model = _get_model()
            segments, info = model.transcribe(
                str(audio_path),
                language=language,
                word_timestamps=False,
                vad_filter=True,
            )

            results = []
            for idx, segment in enumerate(segments):
                results.append({
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text.strip(),
                    "sequence_index": idx,
                })
                _jobs[session_id]["progress"] = min(1.0, (idx + 1) / max(len(results), 1))

            _jobs[session_id] = {
                "status": "done",
                "progress": 1.0,
                "result": results,
                "language": info.language,
            }
            if on_complete:
                on_complete(session_id, results)
        except Exception as e:
            _jobs[session_id] = {
                "status": "error",
                "progress": 0.0,
                "error": str(e),
            }

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
