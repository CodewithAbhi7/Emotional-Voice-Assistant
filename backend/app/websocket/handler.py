"""
Main WebSocket orchestration.
"""
from __future__ import annotations

import base64
import os
import re
import tempfile
import uuid

import soundfile as sf
from fastapi import WebSocket
from loguru import logger

from app.config import Config
from app.database import DB
from app.alarm.reminder_parser import ReminderParser
from app.gemini.live_client import GeminiLiveClient
from app.gemini.prompts import build_system_prompt
from app.mode.state_machine import Mode, ModeStateMachine
from app.voice.cloner import VoiceCloner
from app.voice.emotion import EmotionAnalyzer, emotion_from_text
from app.websocket.session import ConnectionSession


class WebSocketHandler:
    def __init__(self, voice_cloner: VoiceCloner, alarm_engine, mode_fsm: ModeStateMachine):
        self.cloner = voice_cloner
        self.alarm_engine = alarm_engine
        self.mode_fsm = mode_fsm
        self.db = DB()
        self.emotion_analyzer = EmotionAnalyzer()
        self.reminder_parser = ReminderParser(self.db)
        self._sessions: dict[int, ConnectionSession] = {}

    async def connect(self, ws: WebSocket):
        await ws.accept()
        session = ConnectionSession(ws=ws)
        self._sessions[id(ws)] = session
        self.alarm_engine.add_alarm_callback(
            session.session_id,
            lambda alarm_id, audio_path, phase, phrase: self._handle_alarm_event(
                ws, alarm_id, audio_path, phase, phrase
            ),
        )
        await self._send(
            ws,
            {
                "type": "STATUS",
                "state": "IDLE",
                "message": "Connected. Create a voice profile to begin.",
            },
        )

    async def disconnect(self, ws: WebSocket):
        session = self._sessions.pop(id(ws), None)
        if session and session.gemini:
            await session.gemini.disconnect()
        if session and session.conversation_id:
            await self.db.end_conversation(session.conversation_id)
        if session:
            self.alarm_engine.remove_alarm_callback(session.session_id)

    async def handle_audio_chunk(self, ws: WebSocket, data: bytes):
        session = self._sessions.get(id(ws))
        if not session or not session.is_recording:
            return

        session.audio_buffer.add_chunk(data)
        if session.audio_buffer.is_silence_detected():
            await self._process_utterance(ws, session)

    async def handle_control_message(self, ws: WebSocket, msg: dict):
        session = self._sessions.get(id(ws))
        if not session:
            return

        msg_type = msg.get("type")
        if msg_type == "START_RECORDING":
            await self._start_recording(ws, session, msg.get("profile_id"))
        elif msg_type == "END_OF_SPEECH":
            await self._process_utterance(ws, session)
        elif msg_type == "TEXT_INPUT":
            await self._process_text_input(ws, session, msg.get("text", ""), msg.get("profile_id"))
        elif msg_type == "SWITCH_MODE":
            mode = msg.get("mode", "PERSONAL")
            if mode == Mode.PROFESSIONAL.value:
                self.mode_fsm.switch_to_professional("user_command")
            else:
                self.mode_fsm.switch_to_personal("user_command")

            if session.gemini:
                await session.gemini.disconnect()
                session.gemini = None

            await self._send(
                ws,
                {
                    "type": "MODE_CHANGED",
                    "mode": self.mode_fsm.current.value,
                    "reason": "user_command",
                },
            )
        elif msg_type == "ALARM_RESPONSE":
            await self.alarm_engine.respond(msg.get("alarm_id"), msg.get("action", "SNOOZE"))
        elif msg_type == "CANCEL":
            session.audio_buffer.reset()
            session.is_recording = False
            await self._send(ws, {"type": "STATUS", "state": "IDLE", "message": "Cancelled."})
        elif msg_type == "PING":
            await self._send(ws, {"type": "PONG"})

    async def _start_recording(self, ws: WebSocket, session: ConnectionSession, profile_id: str | None):
        if profile_id:
            session.profile_id = profile_id

        if not session.gemini or not session.gemini._is_connected:
            await self._init_gemini(session)

        await self._ensure_conversation(session)

        session.audio_buffer.reset()
        session.is_recording = True
        await self._send(ws, {"type": "STATUS", "state": "LISTENING", "message": "Listening..."})

    async def _init_gemini(self, session: ConnectionSession):
        profile = await self._resolve_profile(session.profile_id)
        system_prompt = build_system_prompt(
            profile=profile,
            mode=self.mode_fsm.current.value,
            history=session.conversation_history[-4:],
        )
        session.gemini = GeminiLiveClient(system_prompt=system_prompt)
        await session.gemini.connect()

    async def _ensure_conversation(self, session: ConnectionSession):
        if session.conversation_id:
            return
        session.conversation_id = str(uuid.uuid4())
        await self.db.create_conversation(
            {
                "id": session.conversation_id,
                "profile_id": session.profile_id,
                "mode": self.mode_fsm.current.value,
            }
        )

    async def _process_utterance(self, ws: WebSocket, session: ConnectionSession):
        session.is_recording = False
        pcm_data = session.audio_buffer.get_all()
        session.audio_buffer.reset()

        if len(pcm_data) < 3200:
            await self._send(ws, {"type": "STATUS", "state": "IDLE", "message": "Didn't catch that."})
            return

        await self._ensure_conversation(session)
        await self._send(ws, {"type": "STATUS", "state": "THINKING", "message": "EVA is thinking..."})

        temp_path = None
        try:
            temp_path = self._save_pcm_to_wav(pcm_data)
            emotion = self.emotion_analyzer.analyze(temp_path)

            if not session.gemini or not session.gemini._is_connected:
                await self._init_gemini(session)

            result = await self._query_gemini_with_audio(session, pcm_data)
            transcription = result.get("transcription", "").strip()
            response_text = result.get("response_text", "").strip() or "I didn't quite catch that. Could you try again?"
            if transcription:
                reminder_response = await self._try_create_alarm_from_text(session, transcription)
                if reminder_response:
                    response_text = reminder_response

            if transcription:
                await self._send(ws, {"type": "TRANSCRIPTION", "text": transcription, "is_final": True})
                await self.db.add_message(
                    {
                        "id": str(uuid.uuid4()),
                        "convo_id": session.conversation_id,
                        "role": "user",
                        "text": transcription,
                        "emotion": emotion["state"],
                    }
                )

            await self._send(
                ws,
                {
                    "type": "EMOTION",
                    "state": emotion["state"],
                    "confidence": emotion["confidence"],
                    "scores": emotion["scores"],
                },
            )
            await self._send(ws, {"type": "RESPONSE_TEXT", "text": response_text, "is_final": True})

            crisis = self._check_crisis(f"{transcription} {response_text}")
            if crisis:
                await self._send(
                    ws,
                    {
                        "type": "CRISIS_ALERT",
                        "risk_level": crisis,
                        "helpline": "iCall: 9152987821 | Vandrevala: 1860-2662-345",
                    },
                )

            profile = await self._resolve_profile(session.profile_id)
            audio_path = None
            if self._should_use_cloned_voice(profile):
                await self._send(
                    ws,
                    {"type": "STATUS", "state": "THINKING", "message": "Generating voice..."},
                )
                tone = self._build_tone(emotion, profile)
                audio_path = await self.cloner.synthesize(
                    text=response_text,
                    speaker_wav=profile["speaker_wav"],
                    language=profile.get("language", "en"),
                    tone=tone,
                )
                duration_ms = int(sf.info(audio_path).duration * 1000)
                with open(audio_path, "rb") as audio_file:
                    audio_bytes = audio_file.read()
                await self._send(
                    ws,
                    {
                        "type": "RESPONSE_AUDIO",
                        "audio_b64": base64.b64encode(audio_bytes).decode("utf-8"),
                        "duration_ms": duration_ms,
                    },
                )

            await self.db.add_message(
                {
                    "id": str(uuid.uuid4()),
                    "convo_id": session.conversation_id,
                    "role": "assistant",
                    "text": response_text,
                    "emotion": emotion["state"],
                    "audio_path": audio_path,
                }
            )

            if transcription:
                session.conversation_history.append((transcription, response_text))
                session.conversation_history = session.conversation_history[-10:]

            await self._send(ws, {"type": "STATUS", "state": "IDLE", "message": "Tap to speak"})
        except Exception as exc:
            logger.exception("Utterance processing failed: {}", exc)
            await self._send(
                ws,
                {"type": "ERROR", "code": "PROCESSING_FAILED", "message": str(exc)},
            )
            await self._send(ws, {"type": "STATUS", "state": "IDLE", "message": "Tap to speak"})
        finally:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)

    async def _process_text_input(
        self,
        ws: WebSocket,
        session: ConnectionSession,
        text: str,
        profile_id: str | None = None,
    ):
        if profile_id:
            session.profile_id = profile_id
        text = text.strip()
        if not text:
            return

        await self._ensure_conversation(session)
        await self._send(ws, {"type": "STATUS", "state": "THINKING", "message": "EVA is thinking..."})

        try:
            emotion = emotion_from_text(text)
            await self._send(
                ws,
                {
                    "type": "EMOTION",
                    "state": emotion["state"],
                    "confidence": emotion["confidence"],
                    "scores": emotion["scores"],
                },
            )

            reminder_response = await self._try_create_alarm_from_text(session, text)

            if reminder_response:
                response_text = reminder_response
            else:
                if not session.gemini or not session.gemini._is_connected:
                    await self._init_gemini(session)

                result = await self._query_gemini_with_text(session, text)
                response_text = result.get("response_text", "").strip() or self._fallback_response(text)

            await self._send(ws, {"type": "TRANSCRIPTION", "text": text, "is_final": True})
            await self._send(ws, {"type": "RESPONSE_TEXT", "text": response_text, "is_final": True})

            await self.db.add_message(
                {
                    "id": str(uuid.uuid4()),
                    "convo_id": session.conversation_id,
                    "role": "user",
                    "text": text,
                    "emotion": emotion["state"],
                }
            )

            profile = await self._resolve_profile(session.profile_id)
            audio_path = None
            if self._should_use_cloned_voice(profile):
                await self._send(
                    ws,
                    {"type": "STATUS", "state": "THINKING", "message": "Generating voice..."},
                )
                tone = self._build_tone(emotion, profile)
                audio_path = await self.cloner.synthesize(
                    text=response_text,
                    speaker_wav=profile["speaker_wav"],
                    language=profile.get("language", "en"),
                    tone=tone,
                )
                duration_ms = int(sf.info(audio_path).duration * 1000)
                with open(audio_path, "rb") as audio_file:
                    audio_bytes = audio_file.read()
                await self._send(
                    ws,
                    {
                        "type": "RESPONSE_AUDIO",
                        "audio_b64": base64.b64encode(audio_bytes).decode("utf-8"),
                        "duration_ms": duration_ms,
                    },
                )

            await self.db.add_message(
                {
                    "id": str(uuid.uuid4()),
                    "convo_id": session.conversation_id,
                    "role": "assistant",
                    "text": response_text,
                    "emotion": emotion["state"],
                    "audio_path": audio_path,
                }
            )

            session.conversation_history.append((text, response_text))
            session.conversation_history = session.conversation_history[-10:]

            crisis = self._check_crisis(f"{text} {response_text}")
            if crisis:
                await self._send(
                    ws,
                    {
                        "type": "CRISIS_ALERT",
                        "risk_level": crisis,
                        "helpline": "iCall: 9152987821 | Vandrevala: 1860-2662-345",
                    },
                )

            await self._send(ws, {"type": "STATUS", "state": "IDLE", "message": "Tap to speak"})
        except Exception as exc:
            logger.exception("Text input failed: {}", exc)
            await self._send(ws, {"type": "ERROR", "code": "TEXT_FAILED", "message": str(exc)})
            await self._send(ws, {"type": "STATUS", "state": "IDLE", "message": "Tap to speak"})

    async def _handle_alarm_event(
        self,
        ws: WebSocket,
        alarm_id: str,
        audio_path: str | None,
        phase: int,
        phrase: str,
    ):
        audio_b64 = None
        if audio_path and os.path.exists(audio_path):
            with open(audio_path, "rb") as audio_file:
                audio_b64 = base64.b64encode(audio_file.read()).decode("utf-8")

        await self._send(
            ws,
            {
                "type": "ALARM_FIRED",
                "alarm_id": alarm_id,
                "phase": phase,
                "phrase": phrase,
                "audio_b64": audio_b64,
            },
        )

    async def _resolve_profile(self, profile_id: str | None) -> dict | None:
        if profile_id:
            profile = await self.db.get_profile(profile_id)
            if profile:
                return profile
        return await self.db.get_default_profile()

    def _should_use_cloned_voice(self, profile: dict | None) -> bool:
        if self.mode_fsm.current == Mode.PROFESSIONAL:
            return False
        return bool(profile and profile.get("speaker_wav") and os.path.exists(profile["speaker_wav"]))

    async def _query_gemini_with_audio(self, session: ConnectionSession, pcm_data: bytes) -> dict:
        try:
            return await session.gemini.send_audio_end_of_turn(pcm_data)
        except Exception as exc:
            logger.warning("Gemini audio turn failed: {}", exc)
            if session.gemini:
                await session.gemini.disconnect()
                session.gemini = None
            return {
                "transcription": "",
                "response_text": self._model_error_response(exc, spoken_input=True),
            }

    async def _query_gemini_with_text(self, session: ConnectionSession, text: str) -> dict:
        try:
            return await session.gemini.send_text(text)
        except Exception as exc:
            logger.warning("Gemini text turn failed: {}", exc)
            if session.gemini:
                await session.gemini.disconnect()
                session.gemini = None
            return {
                "transcription": text,
                "response_text": self._model_error_response(exc, text=text),
            }

    def _build_tone(self, emotion: dict, profile: dict) -> dict:
        base = Config.RELATIONSHIP_TONES.get(profile.get("relationship", "CUSTOM"), {}).copy()
        state = emotion.get("state", "CALM")

        if self.mode_fsm.current == Mode.PROFESSIONAL:
            return {"warmth": 0.2, "urgency": 0.4, "anger": 0.0, "speed": 1.05}

        adjustments = {
            "STRESSED": {"warmth": 0.1, "urgency": -0.1},
            "SAD": {"warmth": 0.15, "urgency": -0.15},
            "ANXIOUS": {"warmth": 0.1, "urgency": -0.2},
            "ANGRY": {"warmth": 0.05, "urgency": -0.05},
            "TIRED": {"warmth": 0.1, "urgency": -0.15},
            "HAPPY": {"warmth": 0.0, "urgency": 0.0},
        }
        for key, delta in adjustments.get(state, {}).items():
            base[key] = max(0.0, min(1.0, base.get(key, 0.5) + delta))
        return base

    def _check_crisis(self, text: str) -> str | None:
        lowered = text.lower()
        high_risk = [
            "want to die",
            "kill myself",
            "end my life",
            "no reason to live",
            "suicidal",
            "end it all",
        ]
        medium_risk = [
            "don't want to be here",
            "give up on life",
            "can't take it anymore",
            "everyone better without me",
            "what's the point",
        ]
        for phrase in high_risk:
            if phrase in lowered:
                return "HIGH"
        for phrase in medium_risk:
            if phrase in lowered:
                return "MEDIUM"
        return None

    def _save_pcm_to_wav(self, pcm_bytes: bytes) -> str:
        import numpy as np

        temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        sf.write(temp_file.name, samples, Config.MIC_SAMPLE_RATE)
        return temp_file.name

    async def _try_create_alarm_from_text(
        self,
        session: ConnectionSession,
        text: str,
    ) -> str | None:
        try:
            plan = await self.reminder_parser.parse(
                text=text,
                preferred_profile_id=session.profile_id,
            )
        except ValueError as exc:
            return str(exc)

        if not plan:
            return None

        payload = {**plan.payload, "id": str(uuid.uuid4())}
        await self.db.create_alarm(payload)
        await self.alarm_engine.schedule_alarm(payload)
        return plan.confirmation

    def _fallback_response(self, text: str) -> str:
        inferred = self.mode_fsm.infer_from_keywords(text or "")
        if inferred == Mode.PROFESSIONAL or self.mode_fsm.current == Mode.PROFESSIONAL:
            return "I heard you. Say the task again in one short sentence and I will help."
        return "I'm here with you. Tell me a little more and we'll take it one step at a time."

    def _model_error_response(
        self,
        exc: Exception,
        text: str = "",
        spoken_input: bool = False,
    ) -> str:
        error_text = str(exc)
        lowered = error_text.lower()

        if "resource_exhausted" in lowered or "quota" in lowered or "429" in lowered:
            retry_match = re.search(r"retry in ([0-9]+(?:\.[0-9]+)?)s", lowered)
            if retry_match:
                retry_seconds = max(1, round(float(retry_match.group(1))))
                return (
                    "Gemini has hit its current API quota, so I cannot answer normally right now. "
                    f"Please try again in about {retry_seconds} seconds, or check your Gemini billing and limits."
                )
            return (
                "Gemini has hit its current API quota, so I cannot answer normally right now. "
                "Please check your Gemini billing and limits, then try again."
            )

        if spoken_input:
            return "I lost the live response before I could answer. Please try once more, or type the task."

        return self._fallback_response(text)

    async def _send(self, ws: WebSocket, payload: dict):
        try:
            await ws.send_json(payload)
        except Exception as exc:
            logger.debug("WebSocket send failed: {}", exc)
