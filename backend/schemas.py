from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


# ─── Session ──────────────────────────────────────────────

class SessionCreate(BaseModel):
    title: Optional[str] = None


class SessionUpdate(BaseModel):
    title: Optional[str] = None


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    audio_file_path: Optional[str]
    duration_ms: Optional[int]
    status: str
    transcript_source: str
    created_at: datetime
    updated_at: datetime


# ─── Note ─────────────────────────────────────────────────

class NoteCreate(BaseModel):
    text: str
    audio_offset_ms: int


class NoteUpdate(BaseModel):
    text: Optional[str] = None
    audio_offset_ms: Optional[int] = None


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    text: str
    audio_offset_ms: int
    created_at: datetime
    updated_at: datetime


# ─── Transcript Segment ───────────────────────────────────

class TranscriptSegmentIn(BaseModel):
    start: float
    end: float
    text: str


class TranscriptSegmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    session_id: str
    start_time: float
    end_time: float
    text: str
    sequence_index: int
    speaker: Optional[str]


# ─── Aligned View ─────────────────────────────────────────

class AlignedItem(BaseModel):
    type: str  # "segment" | "note"
    data: dict


class AlignedViewOut(BaseModel):
    session_id: str
    items: List[AlignedItem]


# ─── Transcript Import ────────────────────────────────────

class TranscriptImport(BaseModel):
    segments: List[TranscriptSegmentIn]
    language: Optional[str] = None
