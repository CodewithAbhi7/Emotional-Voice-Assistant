"""
Custom phrases API.
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.config import Config
from app.database import DB

router = APIRouter()
db = DB()


class CreatePhraseBody(BaseModel):
    profile_id: str
    phrase_type: str
    text: str
    language: str = "en"
    warmth: float = 0.7
    urgency: float = 0.3
    anger: float = 0.0


@router.get("/")
async def list_phrases(profile_id: str = Query(...)):
    return {"phrases": await db.list_phrases(profile_id)}


@router.post("/")
async def create_phrase(body: CreatePhraseBody):
    profile = await db.get_profile(body.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    phrase_id = str(uuid.uuid4())
    await db.create_phrase(
        {
            "id": phrase_id,
            "profile_id": body.profile_id,
            "phrase_type": body.phrase_type,
            "text": body.text,
            "language": body.language,
            "warmth": body.warmth,
            "urgency": body.urgency,
            "anger": body.anger,
        }
    )
    return {"id": phrase_id}


@router.get("/{phrase_id}/preview")
async def preview_phrase(request: Request, phrase_id: str):
    phrase = await db.get_phrase(phrase_id)
    if not phrase:
        raise HTTPException(status_code=404, detail="Phrase not found")

    profile = await db.get_profile(phrase["profile_id"])
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not profile.get("speaker_wav") or not os.path.exists(profile["speaker_wav"]):
        raise HTTPException(status_code=400, detail="Speaker profile missing")

    cache_path = phrase.get("audio_cache")
    if cache_path and os.path.exists(cache_path):
        return FileResponse(cache_path, media_type="audio/wav")

    cache_target = str(Path(Config.PHRASE_CACHE_DIR) / f"phrase_{phrase_id}.wav")
    audio_path = await request.app.state.voice_cloner.synthesize(
        text=phrase["text"],
        speaker_wav=profile["speaker_wav"],
        language=phrase.get("language", profile.get("language", "en")),
        tone={
            "warmth": phrase.get("warmth", 0.7),
            "urgency": phrase.get("urgency", 0.3),
            "anger": phrase.get("anger", 0.0),
        },
        output_path=cache_target,
    )
    await db.update_phrase_audio_cache(phrase_id, audio_path)
    return FileResponse(audio_path, media_type="audio/wav")


@router.delete("/{phrase_id}")
async def delete_phrase(phrase_id: str):
    phrase = await db.get_phrase(phrase_id)
    if not phrase:
        raise HTTPException(status_code=404, detail="Phrase not found")

    cache_path = phrase.get("audio_cache")
    if cache_path and os.path.exists(cache_path):
        os.remove(cache_path)

    await db.delete_phrase(phrase_id)
    return {"deleted": True}
