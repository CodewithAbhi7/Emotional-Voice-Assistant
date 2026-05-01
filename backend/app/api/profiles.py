"""
Voice profile API.
"""
from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from loguru import logger
from pydantic import BaseModel

from app.config import Config
from app.database import DB
from app.voice.validator import validate_audio_sample

router = APIRouter()
db = DB()


class CreateProfileBody(BaseModel):
    relationship: str
    display_name: str
    language: str = "en"
    consent: bool
    audio_path: str


class SynthBody(BaseModel):
    text: str
    language: str = "en"
    warmth: float = 0.7
    urgency: float = 0.3
    anger: float = 0.0


@router.post("/validate")
async def validate(body: dict):
    path = body.get("audio_path", "")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=400, detail="Audio file not found")
    return validate_audio_sample(path)


@router.post("/")
async def create_profile(request: Request, body: CreateProfileBody):
    if not body.consent:
        raise HTTPException(status_code=403, detail="Consent required")
    if body.relationship not in Config.RELATIONSHIP_TYPES:
        raise HTTPException(status_code=400, detail="Invalid relationship type")
    if not os.path.exists(body.audio_path):
        raise HTTPException(status_code=400, detail="Audio file not found")

    validation = validate_audio_sample(body.audio_path)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation["error"])

    profile_id = str(uuid.uuid4())
    sample_dest = Path(Config.VOICE_SAMPLES_DIR) / f"{profile_id}_raw{Path(body.audio_path).suffix or '.wav'}"
    shutil.copy2(body.audio_path, sample_dest)

    cloner = request.app.state.voice_cloner
    speaker_wav = await cloner.create_speaker_profile(body.audio_path, profile_id)
    existing = await db.list_profiles()

    await db.create_profile(
        {
            "id": profile_id,
            "relationship": body.relationship,
            "display_name": body.display_name,
            "language": body.language,
            "sample_path": str(sample_dest),
            "speaker_wav": speaker_wav,
            "quality": validation["quality"],
            "consent": True,
            "is_default": not existing,
        }
    )

    if not existing:
        await db.set_default_profile(profile_id)

    return {
        "id": profile_id,
        "quality": validation["quality"],
        "warning": validation.get("warning"),
    }


@router.get("/")
async def list_profiles():
    return {"profiles": await db.list_profiles()}


@router.post("/{profile_id}/synthesize")
async def synthesize(request: Request, profile_id: str, body: SynthBody):
    profile = await db.get_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not profile.get("speaker_wav") or not os.path.exists(profile["speaker_wav"]):
        raise HTTPException(status_code=400, detail="Speaker profile missing")

    cloner = request.app.state.voice_cloner
    audio_path = await cloner.synthesize(
        text=body.text,
        speaker_wav=profile["speaker_wav"],
        language=body.language,
        tone={
            "warmth": body.warmth,
            "urgency": body.urgency,
            "anger": body.anger,
        },
    )
    return FileResponse(audio_path, media_type="audio/wav")


@router.delete("/{profile_id}")
async def delete_profile(request: Request, profile_id: str):
    profile = await db.get_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    alarms = await db.list_alarms_for_profile(profile_id)
    for alarm in alarms:
        try:
            await request.app.state.alarm_engine.unschedule_alarm(alarm["id"])
        except Exception:
            pass

    phrases = await db.list_phrases(profile_id)
    for phrase in phrases:
        cache_path = phrase.get("audio_cache")
        if cache_path and os.path.exists(cache_path):
            try:
                os.remove(cache_path)
            except OSError as exc:
                logger.warning("Could not remove cached phrase audio {}: {}", cache_path, exc)

    for key in ("sample_path", "speaker_wav"):
        path = profile.get(key)
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError as exc:
                logger.warning("Could not remove profile file {}: {}", path, exc)

    await db.delete_profile_graph(profile_id)
    remaining = await db.list_profiles()
    if remaining and not any(item.get("is_default") for item in remaining):
        await db.set_default_profile(remaining[0]["id"])
    return {"deleted": True}
