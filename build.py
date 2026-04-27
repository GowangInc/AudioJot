#!/usr/bin/env python3
"""
Build AudioJot.app for macOS using PyInstaller.
Run: python3 build.py
"""

import os
import sys
import shutil
import subprocess

APP_NAME = "AudioJot"
DIST_DIR = "dist"
APP_PATH = f"{DIST_DIR}/{APP_NAME}.app"


def clean():
    for d in ["build", DIST_DIR]:
        if os.path.exists(d):
            shutil.rmtree(d)
            print(f"Cleaned {d}/")


def build():
    # Ensure frontend is included
    frontend_dir = os.path.abspath("frontend")
    if not os.path.exists(frontend_dir):
        print("ERROR: frontend/ directory not found")
        sys.exit(1)

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", APP_NAME,
        "--windowed",
        "--noconfirm",
        "--clean",
        "--add-data", f"{frontend_dir}:frontend",
        "--hidden-import", "backend.api.sessions",
        "--hidden-import", "backend.api.notes",
        "--hidden-import", "backend.api.audio",
        "--hidden-import", "backend.api.transcription",
        "--hidden-import", "backend.services.alignment",
        "--hidden-import", "backend.services.transcriber",
        "--hidden-import", "backend.services.recorder",
        "--osx-bundle-identifier", "com.gowanginc.audiojot",
        "main.py",
    ]

    print("Running PyInstaller...")
    subprocess.run(cmd, check=True)

    # Post-build: ensure Info.plist has correct display name
    plist_path = f"{APP_PATH}/Contents/Info.plist"
    if os.path.exists(plist_path):
        with open(plist_path, "r") as f:
            content = f.read()
        content = content.replace(
            "<string>AudioJot</string>",
            "<string>AudioJot</string>",
        )
        with open(plist_path, "w") as f:
            f.write(content)

    print(f"\n✓ Built: {APP_PATH}")
    print(f"\nTo install:")
    print(f"  cp -R {APP_PATH} /Applications/")
    print(f"\nThen you can launch AudioJot from Spotlight or Raycast.")


if __name__ == "__main__":
    clean()
    build()
