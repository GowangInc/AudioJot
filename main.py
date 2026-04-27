#!/usr/bin/env python3
"""
AudioJot entry point.
Starts FastAPI in a background thread, then opens a pywebview window.
"""

import threading
import time
import webview
import uvicorn

from backend.app import app
from backend.config import HOST


def find_free_port() -> int:
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((HOST, 0))
        return s.getsockname()[1]


def start_server(port: int):
    uvicorn.run(app, host=HOST, port=port, log_level="warning")


def main():
    port = find_free_port()

    server_thread = threading.Thread(
        target=start_server,
        args=(port,),
        daemon=True,
    )
    server_thread.start()

    # Give the server a moment to start
    time.sleep(0.5)

    url = f"http://{HOST}:{port}"

    window = webview.create_window(
        "AudioJot",
        url=url,
        width=1200,
        height=800,
        min_size=(800, 600),
        text_select=True,
    )
    webview.start()


if __name__ == "__main__":
    main()
