# AudioJot

A local-first Mac app for recording audio, taking timestamped notes, and automatically generating transcripts aligned with your notes using [faster-whisper](https://github.com/SYSTRAN/faster-whisper).

## Features

- **Text editor interface**: Type notes freely in a textarea. During recording, each Enter press timestamps the line invisibly.
- **Session-based**: Each recording is a self-contained session with audio, notes, and transcript.
- **Live note-taking**: Type during recording; timestamps captured automatically on Enter.
- **Playback notes**: Listen back and type notes at specific moments.
- **Local transcription**: Run faster-whisper offline on your Mac.
- **Transcript import**: Record on a lightweight machine, transcribe elsewhere, then import the JSON.
- **Aligned document view**: Toggle between raw notes and transcript+notes interleaved at timestamps.
- **Export**: Save your session as Markdown.

## Development Setup

```bash
# Clone and enter directory
git clone https://github.com/GowangInc/AudioJot.git
cd AudioJot

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the desktop app
python3 main.py
```

## Build AudioJot.app (for Spotlight / Raycast)

Running `python3 main.py` works but won't show up in Spotlight and the menu bar says "Python". To fix both, build a proper `.app` bundle:

```bash
source venv/bin/activate
python3 build.py
```

This creates `dist/AudioJot.app`. Install it:

```bash
cp -R dist/AudioJot.app /Applications/
```

Now you can launch AudioJot from Spotlight or Raycast, and the menu bar will say "AudioJot".

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
│   │   ├── audio.py        # Recording + upload
│   │   └── transcription.py
│   └── services/
│       ├── alignment.py    # Note-to-segment alignment
│       ├── transcriber.py  # faster-whisper wrapper
│       └── recorder.py     # Python audio capture
├── frontend/
│   ├── index.html
│   └── static/
│       ├── style.css
│       └── app.js
├── main.py                 # Entry point (FastAPI + pywebview)
├── build.py                # PyInstaller build script
└── requirements.txt
```

## License

MIT
