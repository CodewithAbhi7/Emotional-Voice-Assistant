"""
EVA backend entrypoint.
"""
from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import aiofiles
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

load_dotenv()

from app.api import alarms, mode, phrases, profiles
from app.alarm.engine import AlarmEngine
from app.config import Config
from app.database import init_database
from app.mode.state_machine import ModeStateMachine
from app.voice.cloner import VoiceCloner
from app.websocket.handler import WebSocketHandler


voice_cloner: VoiceCloner | None = None
alarm_engine: AlarmEngine | None = None
mode_fsm: ModeStateMachine | None = None
ws_handler: WebSocketHandler | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global voice_cloner, alarm_engine, mode_fsm, ws_handler

    logger.info("EVA backend starting")

    for directory in (
        Config.VOICE_SAMPLES_DIR,
        Config.SPEAKER_PROFILES_DIR,
        Config.PHRASE_CACHE_DIR,
    ):
        Path(directory).mkdir(parents=True, exist_ok=True)

    await init_database()
    logger.info("Database ready")

    voice_cloner = VoiceCloner()
    await voice_cloner.initialize()
    if voice_cloner.is_ready:
        logger.info("Voice engine ready")
    else:
        logger.warning("Voice engine unavailable at startup")

    mode_fsm = ModeStateMachine()

    alarm_engine = AlarmEngine(voice_cloner=voice_cloner, mode_fsm=mode_fsm)
    await alarm_engine.start()
    logger.info("Alarm engine ready")

    ws_handler = WebSocketHandler(
        voice_cloner=voice_cloner,
        alarm_engine=alarm_engine,
        mode_fsm=mode_fsm,
    )

    app.state.voice_cloner = voice_cloner
    app.state.alarm_engine = alarm_engine
    app.state.mode_fsm = mode_fsm
    app.state.ws_handler = ws_handler

    logger.info("EVA is ready")
    try:
        yield
    finally:
        if alarm_engine is not None:
            await alarm_engine.stop()
        if voice_cloner is not None:
            await voice_cloner.close()


app = FastAPI(title="EVA", version="3.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles.router, prefix="/api/profiles", tags=["Profiles"])
app.include_router(alarms.router, prefix="/api/alarms", tags=["Alarms"])
app.include_router(phrases.router, prefix="/api/phrases", tags=["Phrases"])
app.include_router(mode.router, prefix="/api/mode", tags=["Mode"])


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "voice_ready": bool(voice_cloner and voice_cloner.is_ready),
        "xtts_ready": bool(voice_cloner and voice_cloner.is_ready),
        "voice_provider": Config.VOICE_PROVIDER,
        "chatterbox_base_url": Config.CHATTERBOX_BASE_URL,
        "gemini_configured": bool(Config.GEMINI_API_KEY),
    }


@app.post("/api/upload-temp")
async def upload_temp(file: UploadFile = File(...)):
    suffix = Path(file.filename or "sample.wav").suffix or ".wav"
    temp_name = f"temp_{uuid.uuid4().hex}{suffix}"
    temp_path = Path(Config.VOICE_SAMPLES_DIR) / temp_name

    async with aiofiles.open(temp_path, "wb") as out_file:
        while chunk := await file.read(1024 * 1024):
            await out_file.write(chunk)

    return {"path": str(temp_path)}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    handler = app.state.ws_handler
    await handler.connect(ws)
    try:
        while True:
            try:
                data = await asyncio.wait_for(ws.receive(), timeout=30.0)
            except asyncio.TimeoutError:
                await ws.send_json({"type": "ping"})
                continue

            if data["type"] == "websocket.receive":
                if data.get("bytes"):
                    await handler.handle_audio_chunk(ws, data["bytes"])
                elif data.get("text"):
                    import json

                    await handler.handle_control_message(ws, json.loads(data["text"]))
            elif data["type"] == "websocket.disconnect":
                break
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except RuntimeError as exc:
        if 'Cannot call "receive" once a disconnect message has been received.' in str(exc):
            logger.info("WebSocket disconnected")
        else:
            logger.exception("WebSocket runtime error: {}", exc)
    except Exception as exc:
        logger.exception("WebSocket error: {}", exc)
    finally:
        await handler.disconnect(ws)
