from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from pathlib import Path

from backend.database import get_db
from backend.models import Session as SessionModel, TranscriptSegment, Note
from backend.schemas import TranscriptSegmentOut, AlignedViewOut, TranscriptImport
from backend.services.alignment import build_aligned_view
from backend.services import transcriber

router = APIRouter(prefix="/sessions", tags=["transcription"])


@router.post("/{session_id}/transcribe")
def start_transcription(session_id: str, db: DBSession = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.audio_file_path:
        raise HTTPException(status_code=400, detail="No audio for this session")

    session.status = "transcribing"
    db.commit()

    def on_complete(sid, segments_data):
        db2 = next(get_db())
        sess = db2.query(SessionModel).filter(SessionModel.id == sid).first()
        if not sess:
            return
        # Clear old segments
        db2.query(TranscriptSegment).filter(TranscriptSegment.session_id == sid).delete()
        for item in segments_data:
            seg = TranscriptSegment(
                session_id=sid,
                start_time=item["start"],
                end_time=item["end"],
                text=item["text"],
                sequence_index=item["sequence_index"],
            )
            db2.add(seg)
        sess.status = "transcribed"
        sess.transcript_source = "local_whisper"
        db2.commit()

    transcriber.transcribe_audio(session_id, Path(session.audio_file_path), on_complete=on_complete)
    return {"ok": True, "status": "transcribing"}


@router.get("/{session_id}/transcribe-status")
def transcription_status(session_id: str):
    job = transcriber.get_job_status(session_id)
    if not job:
        return {"status": "idle"}
    return job


@router.post("/{session_id}/transcript/import")
def import_transcript(session_id: str, payload: TranscriptImport, db: DBSession = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    db.query(TranscriptSegment).filter(TranscriptSegment.session_id == session_id).delete()
    for idx, seg_in in enumerate(payload.segments):
        seg = TranscriptSegment(
            session_id=session_id,
            start_time=seg_in.start,
            end_time=seg_in.end,
            text=seg_in.text,
            sequence_index=idx,
        )
        db.add(seg)

    session.status = "transcribed"
    session.transcript_source = "imported"
    db.commit()
    return {"ok": True}


@router.get("/{session_id}/aligned", response_model=AlignedViewOut)
def get_aligned_view(session_id: str, db: DBSession = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    segments = db.query(TranscriptSegment).filter(TranscriptSegment.session_id == session_id).order_by(TranscriptSegment.sequence_index).all()
    notes = db.query(Note).filter(Note.session_id == session_id).order_by(Note.audio_offset_ms).all()

    items = build_aligned_view(segments, notes)
    return {"session_id": session_id, "items": items}
