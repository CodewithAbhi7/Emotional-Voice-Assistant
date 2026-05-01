"""
Professional versus personal mode state machine.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Callable, Optional

from loguru import logger


class Mode(str, Enum):
    PERSONAL = "PERSONAL"
    PROFESSIONAL = "PROFESSIONAL"


@dataclass
class ModeConfig:
    tone_warmth: float
    tone_urgency: float
    tone_speed: float
    max_words: int
    formality: str
    emotional_support: bool


CONFIGS = {
    Mode.PERSONAL: ModeConfig(
        tone_warmth=0.85,
        tone_urgency=0.2,
        tone_speed=1.0,
        max_words=60,
        formality="informal",
        emotional_support=True,
    ),
    Mode.PROFESSIONAL: ModeConfig(
        tone_warmth=0.2,
        tone_urgency=0.4,
        tone_speed=1.05,
        max_words=30,
        formality="formal",
        emotional_support=False,
    ),
}


class ModeStateMachine:
    def __init__(self):
        self.current = Mode.PERSONAL
        self.previous: Optional[Mode] = None
        self.changed_at = datetime.now()
        self._callbacks: list[Callable] = []

    @property
    def config(self) -> ModeConfig:
        return CONFIGS[self.current]

    def switch(self, target: Mode, reason: str = "manual"):
        if self.current == target:
            return
        self.previous = self.current
        self.current = target
        self.changed_at = datetime.now()
        logger.info("Mode: {} -> {} ({})", self.previous, self.current, reason)
        for callback in self._callbacks:
            try:
                callback(target, self.previous, reason)
            except Exception:
                continue

    def switch_to_personal(self, reason: str = "manual"):
        self.switch(Mode.PERSONAL, reason)

    def switch_to_professional(self, reason: str = "manual"):
        self.switch(Mode.PROFESSIONAL, reason)

    def on_change(self, callback: Callable):
        self._callbacks.append(callback)

    def status(self) -> dict:
        return {
            "mode": self.current.value,
            "tone_warmth": self.config.tone_warmth,
            "tone_urgency": self.config.tone_urgency,
            "max_words": self.config.max_words,
            "changed_at": self.changed_at.isoformat(),
        }

    def infer_from_keywords(self, text: str) -> Optional[Mode]:
        lowered = text.lower()
        professional = ["meeting", "schedule", "email", "calendar", "task", "deadline", "project", "timer"]
        personal = ["stressed", "sad", "happy", "tired", "love", "worried", "scared", "feel"]
        pro_score = sum(1 for word in professional if word in lowered)
        personal_score = sum(1 for word in personal if word in lowered)
        if pro_score > personal_score and pro_score >= 2:
            return Mode.PROFESSIONAL
        if personal_score > pro_score and personal_score >= 1:
            return Mode.PERSONAL
        return None
