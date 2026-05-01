"""
Per-connection session state.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket

from app.websocket.audio_buffer import AudioBuffer


@dataclass
class ConnectionSession:
    ws: WebSocket
    profile_id: str | None = None
    gemini: Any = None
    audio_buffer: AudioBuffer = field(default_factory=AudioBuffer)
    is_recording: bool = False
    conversation_history: list[tuple[str, str]] = field(default_factory=list)
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str | None = None
