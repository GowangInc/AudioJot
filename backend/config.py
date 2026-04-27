import os
from pathlib import Path

APP_NAME = "AudioJot"

# Data directory: ~/Library/Application Support/AudioJot on macOS
DATA_DIR = Path.home() / "Library" / "Application Support" / APP_NAME
if os.name != "posix" or not DATA_DIR.parent.exists():
    DATA_DIR = Path.home() / f".{APP_NAME.lower()}"

DATA_DIR.mkdir(parents=True, exist_ok=True)
SESSIONS_DIR = DATA_DIR / "sessions"
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_PATH = DATA_DIR / "data.db"

# Server config
HOST = "127.0.0.1"
PORT = 0  # 0 = auto-assign; we read the actual port at runtime
