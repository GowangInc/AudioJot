# AudioJot

A local-first Mac app for recording audio, taking timestamped notes, and automatically generating transcripts aligned with your notes using [faster-whisper](https://github.com/SYSTRAN/faster-whisper).

## Features

- **Session-based**: Each recording is a self-contained session with audio, notes, and transcript
- **Live note-taking**: Type notes during recording; timestamps are captured automatically
- **Playback notes**: Listen back and drop in notes at specific moments
- **Local transcription**: Run faster-whisper offline on your Mac
- **Transcript import**: Record on a lightweight machine, transcribe elsewhere, then import the JSON
- **Aligned view**: Notes are interleaved with transcript segments at the correct timestamps
- **Export**: Save your session as Markdown

## Tech Stack

- Python 3.10+ / FastAPI
- SQLite
- vanilla JS frontend
- pywebview + PyInstaller for native Mac packaging

## Development Setup

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run in development mode (opens in browser)
python3 -m uvicorn backend.app:app --reload

# Or run the desktop app
python3 main.py
```

## Project Structure

```
audiojot/
├── backend/
│   ├── app.py              # FastAPI application
│   ├── database.py         # SQLAlchemy setup
│   ├── models.py           # Database models
│   ├── schemas.py          # Pydantic schemas
│   ├── config.py           # App directories & config
│   ├── api/
│   │   ├── sessions.py
│   │   ├── notes.py
│   │   ├── audio.py
│   │   └── transcription.py
│   └── services/
│       ├── alignment.py    # Note-to-segment alignment logic
│       └── transcriber.py  # faster-whisper wrapper
├── frontend/
│   ├── index.html
│   └── static/
│       ├── style.css
│       └── app.js
├── main.py                 # Entry point (FastAPI + pywebview)
└── requirements.txt
```

## Packaging

```bash
# Build AudioJot.app
pyinstaller --windowed --name AudioJot main.py
```

## License

MIT
