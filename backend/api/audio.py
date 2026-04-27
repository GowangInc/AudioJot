import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DBSession

from backend.database import get_db
from backend.models import Session as SessionModel
from backend.config import SESSIONS_DIR

router = APIRouter(prefix="/sessions", tags=["audio"])


def _audio_path(session_id: str) -> Path:
    return SESSIONS_DIR / session_id / "audio.webm"


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
