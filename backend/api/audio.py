import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DBSession

from backend.database import get_db
from backend.models import Session as SessionModel
from backend.config import SESSIONS_DIR
from backend.services.recorder import AudioRecorder, HAS_RECORDER

router = APIRouter(prefix="/sessions", tags=["audio"])

# Global recorder instance (one recording at a time)
_recorder: Optional[AudioRecorder] = None


def _audio_path(session_id: str) -> Path:
    return SESSIONS_DIR / session_id / "audio.wav"


@router.post("/{session_id}/audio/record-start")
def record_start(session_id: str, db: DBSession = Depends(get_db)):
    global _recorder
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not HAS_RECORDER:
        raise HTTPException(
            status_code=500,
            detail="Recording dependencies not installed. Run: pip install sounddevice soundfile",
        )
    if _recorder and _recorder.is_recording:
        raise HTTPException(status_code=400, detail="Already recording")

    _recorder = AudioRecorder()
    _recorder.output_path = _audio_path(session_id)
    _recorder.start()
    session.status = "recording"
    db.commit()
    return {"ok": True, "status": "recording"}


@router.post("/{session_id}/audio/record-stop")
def record_stop(session_id: str, db: DBSession = Depends(get_db)):
    global _recorder
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not _recorder or not _recorder.is_recording:
        raise HTTPException(status_code=400, detail="Not currently recording")

    path = _recorder.stop()
    duration_ms = _recorder.elapsed_ms()

    if path and path.exists():
        session.audio_file_path = str(path)
        session.duration_ms = duration_ms
        session.status = "recorded"
    else:
        session.status = "error"

    db.commit()
    _recorder = None
    return {
        "ok": True,
        "path": str(path) if path else None,
        "duration_ms": duration_ms,
    }


@router.post("/{session_id}/audio/upload")
def upload_audio(session_id: str, file: UploadFile = File(...), db: DBSession = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    dest = _audio_path(session_id)
    dest.parent.mkdir(parents=True, exist_ok=True)

    with dest.open("wb") as buf:
        shutil.copyfileobj(file.file, buf)

    session.audio_file_path = str(dest)
    session.status = "recorded"
    db.commit()
    return {"ok": True, "path": str(dest)}


@router.get("/{session_id}/audio")
def get_audio(session_id: str, db: DBSession = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session or not session.audio_file_path:
        raise HTTPException(status_code=404, detail="Audio not found")
    path = Path(session.audio_file_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio file missing")
    return FileResponse(path)
