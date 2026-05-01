"""
PCM audio accumulation and silence detection.
"""
from __future__ import annotations

import numpy as np

from app.config import Config


class AudioBuffer:
    def __init__(self):
        self._chunks: list[bytes] = []
        self._silence_chunks = 0
        self._has_speech = False

    def add_chunk(self, chunk: bytes):
        self._chunks.append(chunk)
        samples = np.frombuffer(chunk, dtype=np.int16).astype(np.float32) / 32768.0
        energy = float(np.sqrt(np.mean(samples**2))) if len(samples) else 0.0

        if energy > Config.SILENCE_THRESHOLD:
            self._has_speech = True
            self._silence_chunks = 0
        else:
            self._silence_chunks += 1

    def is_silence_detected(self) -> bool:
        chunks_for_silence = int((Config.SILENCE_DURATION_MS / 1000) / 0.1)
        return self._has_speech and self._silence_chunks >= chunks_for_silence

    def get_all(self) -> bytes:
        return b"".join(self._chunks)

    def reset(self):
        self._chunks = []
        self._silence_chunks = 0
        self._has_speech = False
