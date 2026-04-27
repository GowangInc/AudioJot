import threading
import time
from pathlib import Path
from typing import Optional

try:
    import sounddevice as sd
    import numpy as np
    import soundfile as sf
    HAS_RECORDER = True
except ImportError:
    HAS_RECORDER = False


class AudioRecorder:
    def __init__(self):
        self.is_recording = False
        self.frames = []
        self.thread = None
        self.start_time = 0.0
        self.sample_rate = 44100
        self.channels = 1
        self.output_path: Optional[Path] = None

    def start(self) -> None:
        if not HAS_RECORDER:
            raise RuntimeError(
                "Audio recording requires 'sounddevice' and 'soundfile'. "
                "Install with: pip install sounddevice soundfile"
            )
        self.is_recording = True
        self.frames = []
        self.start_time = time.time()
        self.thread = threading.Thread(target=self._record_loop, daemon=True)
        self.thread.start()

    def _record_loop(self) -> None:
        blocksize = int(self.sample_rate * 0.1)  # 100ms chunks
        with sd.InputStream(
            samplerate=self.sample_rate,
            channels=self.channels,
            dtype="float32",
            blocksize=blocksize,
        ) as stream:
            while self.is_recording:
                chunk, overflowed = stream.read(blocksize)
                if chunk is not None and chunk.size > 0:
                    self.frames.append(chunk.copy())

    def stop(self) -> Optional[Path]:
        self.is_recording = False
        if self.thread:
            self.thread.join(timeout=3)

        if not self.frames:
            return None

        recording = np.concatenate(self.frames, axis=0)
        if self.output_path:
            self.output_path.parent.mkdir(parents=True, exist_ok=True)
            sf.write(str(self.output_path), recording, self.sample_rate)
            return self.output_path
        return None

    def elapsed_ms(self) -> int:
        return int((time.time() - self.start_time) * 1000)
