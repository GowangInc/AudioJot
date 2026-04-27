from pathlib import Path

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from backend.database import engine, Base
from backend.api import sessions, notes, audio, transcription

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AudioJot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(notes.router)
app.include_router(audio.router)
app.include_router(transcription.router)

# Serve frontend static files
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if (frontend_dir / "static").exists():
    app.mount("/static", StaticFiles(directory=frontend_dir / "static"), name="static")


@app.get("/")
def root():
    index_path = frontend_dir / "index.html"
    if index_path.exists():
        from fastapi.responses import FileResponse
        return FileResponse(index_path)
    return {"message": "AudioJot API"}
