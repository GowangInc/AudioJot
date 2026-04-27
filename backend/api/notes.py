from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession

from backend.database import get_db
from backend.models import Note, Session as SessionModel
from backend.schemas import NoteCreate, NoteUpdate, NoteOut

router = APIRouter(prefix="/sessions", tags=["notes"])


@router.post("/{session_id}/notes", response_model=NoteOut)
def create_note(session_id: str, payload: NoteCreate, db: DBSession = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    note = Note(session_id=session_id, text=payload.text, audio_offset_ms=payload.audio_offset_ms)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get("/{session_id}/notes", response_model=List[NoteOut])
def list_notes(session_id: str, db: DBSession = Depends(get_db)):
    return db.query(Note).filter(Note.session_id == session_id).order_by(Note.audio_offset_ms).all()


@router.patch("/notes/{note_id}", response_model=NoteOut)
def update_note(note_id: str, payload: NoteUpdate, db: DBSession = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    if payload.text is not None:
        note.text = payload.text
    if payload.audio_offset_ms is not None:
        note.audio_offset_ms = payload.audio_offset_ms
    db.commit()
    db.refresh(note)
    return note


@router.delete("/notes/{note_id}")
def delete_note(note_id: str, db: DBSession = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return {"ok": True}
