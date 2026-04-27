from typing import List, Dict, Any


def build_aligned_view(
    segments: List[Any],
    notes: List[Any],
) -> List[Dict[str, Any]]:
    """
    Interleave transcript segments and notes chronologically.
    Each note is placed immediately before the segment whose time range
    contains the note's audio_offset_ms, or the nearest segment if there's
    no exact overlap. Notes without segments still appear.
    """
    segments = sorted(segments, key=lambda s: s.sequence_index)
    notes = sorted(notes, key=lambda n: n.audio_offset_ms)

    if not segments:
        # No transcript yet — just return all notes
        return [{"type": "note", "data": _note_to_dict(n)} for n in notes]

    seg_bounds = [(s.start_time, s.end_time, s) for s in segments]

    # Map each note to its target segment index
    note_placements = []
    for note in notes:
        note_time = note.audio_offset_ms / 1000.0
        target_idx = None
        for idx, (start, end, _) in enumerate(seg_bounds):
            if start <= note_time <= end:
                target_idx = idx
                break
        if target_idx is None:
            distances = [abs(note_time - start) for start, _, _ in seg_bounds]
            target_idx = distances.index(min(distances))
        note_placements.append((target_idx, note))

    items: List[Dict[str, Any]] = []

    # Notes before first segment
    first_start = seg_bounds[0][0]
    pre_notes = [note for idx, note in note_placements if note.audio_offset_ms / 1000.0 < first_start]
    for note in pre_notes:
        items.append({"type": "note", "data": _note_to_dict(note)})

    for seg_idx, segment in enumerate(segments):
        items.append({"type": "segment", "data": _segment_to_dict(segment)})
        seg_notes = [note for idx, note in note_placements if idx == seg_idx and note not in pre_notes]
        for note in seg_notes:
            items.append({"type": "note", "data": _note_to_dict(note)})

    # Notes after last segment
    last_end = seg_bounds[-1][1]
    post_notes = [note for note in notes if note.audio_offset_ms / 1000.0 > last_end]
    for note in post_notes:
        if note not in pre_notes:
            items.append({"type": "note", "data": _note_to_dict(note)})

    return items


def _segment_to_dict(segment: Any) -> Dict[str, Any]:
    return {
        "id": segment.id,
        "start_time": segment.start_time,
        "end_time": segment.end_time,
        "text": segment.text,
        "sequence_index": segment.sequence_index,
        "speaker": segment.speaker,
    }


def _note_to_dict(note: Any) -> Dict[str, Any]:
    return {
        "id": note.id,
        "text": note.text,
        "audio_offset_ms": note.audio_offset_ms,
        "created_at": note.created_at.isoformat(),
    }
