from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _as_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _as_float(value: str, default: float) -> float:
    if value is None:
        return default
    return float(value)


def _resolve_path(raw_path: str) -> str:
    path = Path(raw_path)
    if path.is_absolute():
        return str(path)
    return str((Path(__file__).resolve().parents[1] / path).resolve())


class Config:
    BASE_DIR = Path(__file__).resolve().parents[1]

    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_LIVE_MODEL: str = os.getenv(
        "GEMINI_LIVE_MODEL", "gemini-3.1-flash-live-preview"
    )
    GEMINI_FLASH_MODEL: str = os.getenv("GEMINI_FLASH_MODEL", "gemini-2.5-flash")

    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    DEBUG: bool = _as_bool(os.getenv("DEBUG", "true"), default=True)

    DB_PATH: str = _resolve_path(os.getenv("DB_PATH", "./data/eva.db"))
    VOICE_SAMPLES_DIR: str = _resolve_path(
        os.getenv("VOICE_SAMPLES_DIR", "./data/voice_samples")
    )
    SPEAKER_PROFILES_DIR: str = _resolve_path(
        os.getenv("SPEAKER_PROFILES_DIR", "./data/speaker_profiles")
    )
    PHRASE_CACHE_DIR: str = _resolve_path(
        os.getenv("PHRASE_CACHE_DIR", "./data/phrase_cache")
    )

    VOICE_PROVIDER: str = os.getenv("VOICE_PROVIDER", "chatterbox")
    CHATTERBOX_BASE_URL: str = os.getenv(
        "CHATTERBOX_BASE_URL", "http://127.0.0.1:4123"
    ).rstrip("/")
    CHATTERBOX_TIMEOUT_SEC: float = _as_float(
        os.getenv("CHATTERBOX_TIMEOUT_SEC", "240"),
        default=240.0,
    )
    CHATTERBOX_EXAGGERATION: float = _as_float(
        os.getenv("CHATTERBOX_EXAGGERATION", "0.55"),
        default=0.55,
    )
    CHATTERBOX_CFG_WEIGHT: float = _as_float(
        os.getenv("CHATTERBOX_CFG_WEIGHT", "0.50"),
        default=0.50,
    )
    CHATTERBOX_TEMPERATURE: float = _as_float(
        os.getenv("CHATTERBOX_TEMPERATURE", "0.80"),
        default=0.80,
    )
    VOICE_PROFILE_SAMPLE_RATE: int = int(
        os.getenv("VOICE_PROFILE_SAMPLE_RATE", "24000")
    )

    MIC_SAMPLE_RATE: int = 16000
    MIC_CHANNELS: int = 1
    SILENCE_THRESHOLD: float = float(os.getenv("SILENCE_THRESHOLD", "0.01"))
    SILENCE_DURATION_MS: int = int(os.getenv("SILENCE_DURATION_MS", "800"))

    ALARM_SNOOZE_MINUTES: int = int(os.getenv("ALARM_SNOOZE_MINUTES", "1"))
    ALARM_MAX_ESCALATIONS: int = int(os.getenv("ALARM_MAX_ESCALATIONS", "3"))
    ALARM_ESCALATION_TRIGGER: int = int(
        os.getenv("ALARM_ESCALATION_TRIGGER", "2")
    )
    ALARM_PHASE_DELAY_MIN_SECONDS: int = int(
        os.getenv("ALARM_PHASE_DELAY_MIN_SECONDS", "30")
    )
    ALARM_PHASE_DELAY_MAX_SECONDS: int = int(
        os.getenv("ALARM_PHASE_DELAY_MAX_SECONDS", "50")
    )

    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
        ).split(",")
        if origin.strip()
    ]

    RELATIONSHIP_TYPES = ["MOM", "DAD", "SIBLING", "MENTOR", "FRIEND", "CUSTOM"]
    SUPPORTED_LANGUAGES = {
        "en": "English",
        "hi": "Hindi",
        "es": "Spanish",
        "fr": "French",
        "de": "German",
        "pt": "Portuguese",
        "ta": "Tamil",
        "te": "Telugu",
        "bn": "Bengali",
    }

    ALARM_TONE_PHASES = [
        {"warmth": 1.0, "urgency": 0.2, "anger": 0.0, "speed": 0.85},
        {"warmth": 0.85, "urgency": 0.45, "anger": 0.1, "speed": 1.0},
        {"warmth": 0.65, "urgency": 0.70, "anger": 0.35, "speed": 1.15},
        {"warmth": 0.40, "urgency": 0.90, "anger": 0.75, "speed": 1.30},
    ]

    RELATIONSHIP_TONES = {
        "MOM": {"warmth": 0.9, "urgency": 0.2, "anger": 0.0, "speed": 1.0},
        "DAD": {"warmth": 0.8, "urgency": 0.3, "anger": 0.0, "speed": 1.0},
        "SIBLING": {"warmth": 0.7, "urgency": 0.3, "anger": 0.0, "speed": 1.05},
        "MENTOR": {"warmth": 0.6, "urgency": 0.4, "anger": 0.0, "speed": 1.0},
        "FRIEND": {"warmth": 0.8, "urgency": 0.2, "anger": 0.0, "speed": 1.0},
        "CUSTOM": {"warmth": 0.7, "urgency": 0.3, "anger": 0.0, "speed": 1.0},
    }
