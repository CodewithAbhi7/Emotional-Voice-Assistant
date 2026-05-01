"""
Alarm CRUD and simulation routes.
"""
from __future__ import annotations

import os
import uuid

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.alarm.escalation import EscalationEngine
from app.config import Config
from app.database import DB

router = APIRouter()
db = DB()


class CreateAlarmBody(BaseModel):
    profile_id: str
    alarm_time: str
    days: str = "ONCE"
    label: str = "Alarm"
    primary_phrase: str | None = None
    escalation_phrase_1: str | None = None
    escalation_phrase_2: str | None = None
    escalation_phrase_3: str | None = None
    auto_generate: bool = True
    language: str = "en"
    snooze_minutes: int = 1
    escalation_trigger_snooze: int = 2


class SimulateBody(BaseModel):
    profile_id: str
    phase: int
    label: str | None = None
    phrase: str | None = None
    primary_phrase: str | None = None
    language: str = "en"
    auto_generate: bool = True


@router.post("/")
async def create_alarm(request: Request, body: CreateAlarmBody):
    profile = await db.get_profile(body.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    alarm_id = str(uuid.uuid4())
    payload = {
        "id": alarm_id,
        "profile_id": body.profile_id,
        "label": body.label,
        "alarm_time": body.alarm_time,
        "days": body.days,
        "primary_phrase": body.primary_phrase,
        "escalation_phrase_1": body.escalation_phrase_1,
        "escalation_phrase_2": body.escalation_phrase_2,
        "escalation_phrase_3": body.escalation_phrase_3,
        "auto_generate": body.auto_generate,
        "language": body.language,
        "snooze_minutes": body.snooze_minutes,
        "escalation_trigger_snooze": body.escalation_trigger_snooze,
    }

    await db.create_alarm(payload)
    await request.app.state.alarm_engine.schedule_alarm(payload)
    return {"id": alarm_id, "alarm_time": body.alarm_time}


@router.post("/simulate")
async def simulate_phase(request: Request, body: SimulateBody):
    profile = await db.get_profile(body.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    if not profile.get("speaker_wav") or not os.path.exists(profile["speaker_wav"]):
        raise HTTPException(status_code=400, detail="Speaker profile missing")

    cloner = request.app.state.voice_cloner
    phase = max(0, min(body.phase, 3))
    tone = Config.ALARM_TONE_PHASES[phase].copy()

    phrase = (body.phrase or "").strip()
    if not phrase:
        preview_alarm = {
            "id": "preview",
            "label": body.label or "Alarm",
            "relationship_type": profile["relationship"],
            "primary_phrase": body.primary_phrase or "",
            "language": body.language,
            "auto_generate": body.auto_generate,
        }
        helper = EscalationEngine(cloner, db, request.app.state.alarm_engine._generate_text)
        if phase == 0:
            phrase = preview_alarm["primary_phrase"]
        else:
            phrase = await helper._resolve_phrase(preview_alarm, phase)

    audio_path = await cloner.synthesize(
        text=phrase,
        speaker_wav=profile["speaker_wav"],
        language=body.language,
        tone=tone,
    )
    return FileResponse(
        audio_path,
        media_type="audio/wav",
        headers={"X-Phrase": phrase, "X-Phase": str(phase)},
    )


@router.get("/")
async def list_alarms():
    return {"alarms": await db.list_active_alarms()}


@router.delete("/{alarm_id}")
async def delete_alarm(request: Request, alarm_id: str):
    alarm = await db.get_alarm(alarm_id)
    if not alarm:
        raise HTTPException(status_code=404, detail="Alarm not found")
    await request.app.state.alarm_engine.unschedule_alarm(alarm_id)
    await db.delete_alarm(alarm_id)
    return {"deleted": True}
