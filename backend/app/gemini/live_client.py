"""
Gemini Live client wrapper.
"""
from __future__ import annotations

import base64
from typing import Any

from loguru import logger

from app.config import Config


class GeminiLiveClient:
    def __init__(self, system_prompt: str):
        self.system_prompt = system_prompt
        self.client = None
        self.session = None
        self._session_cm = None
        self._is_connected = False
        self._live_error: str | None = None

    async def connect(self):
        if not Config.GEMINI_API_KEY:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        from google import genai

        config = {
            "response_modalities": ["TEXT"],
            "system_instruction": self.system_prompt,
            "input_audio_transcription": {},
            "temperature": 0.7,
            "max_output_tokens": 150,
        }

        self.client = genai.Client(
            api_key=Config.GEMINI_API_KEY,
        )
        try:
            self._session_cm = self.client.aio.live.connect(
                model=Config.GEMINI_LIVE_MODEL,
                config=config,
            )
            self.session = await self._session_cm.__aenter__()
            self._is_connected = True
            self._live_error = None
            logger.info("Gemini Live connected")
        except Exception as exc:
            self.session = None
            self._session_cm = None
            self._is_connected = False
            self._live_error = str(exc)
            logger.warning("Gemini Live unavailable, falling back to text model: {}", exc)

    async def send_audio(self, pcm_bytes: bytes):
        if not self._is_connected or self.session is None:
            raise RuntimeError("Gemini Live session is not connected")

        from google.genai import types

        try:
            await self.session.send_realtime_input(
                audio=types.Blob(
                    data=pcm_bytes,
                    mime_type=f"audio/pcm;rate={Config.MIC_SAMPLE_RATE}",
                )
            )
        except Exception:
            await self._send_legacy_audio(pcm_bytes, end_of_turn=False)

    async def send_audio_end_of_turn(self, pcm_bytes: bytes) -> dict[str, str]:
        if not self._is_connected or self.session is None:
            response_text = await self._generate_text_fallback(
                "The user spoke through audio, but real-time audio understanding is unavailable. "
                "Reply briefly, warmly, and ask them to repeat by text if needed."
            )
            return {"transcription": "", "response_text": response_text}

        try:
            try:
                if pcm_bytes:
                    await self.send_audio(pcm_bytes)
                await self.session.send_realtime_input(audio_stream_end=True)
            except Exception:
                await self._send_legacy_audio(pcm_bytes, end_of_turn=True)

            return await self._collect_response()
        except Exception as exc:
            logger.warning("Gemini Live audio turn failed, using text fallback: {}", exc)
            await self.disconnect()
            response_text = await self._generate_text_fallback(
                "The user spoke through audio, but the live turn failed before a response was completed. "
                "Reply briefly, acknowledge the interruption, and ask them to repeat the task in text."
            )
            return {"transcription": "", "response_text": response_text}

    async def send_text(self, text: str) -> dict[str, str]:
        if not self._is_connected or self.session is None:
            response_text = await self._generate_text_fallback(text)
            return {"transcription": text, "response_text": response_text}

        try:
            await self.session.send_realtime_input(text=text)
            response = await self._collect_response()
            if not response["transcription"]:
                response["transcription"] = text
            return response
        except Exception as exc:
            logger.warning("Gemini Live text turn failed, using text fallback: {}", exc)
            await self.disconnect()
            response_text = await self._generate_text_fallback(text)
            return {"transcription": text, "response_text": response_text}

    async def _collect_response(self) -> dict[str, str]:
        response_text_parts: list[str] = []
        transcription = ""

        async for message in self.session.receive():
            message_text = getattr(message, "text", None)
            if message_text:
                response_text_parts.append(message_text)

            server_content = getattr(message, "server_content", None)
            if server_content:
                extracted = self._extract_parts_text(server_content)
                if extracted:
                    response_text_parts.append(extracted)

                input_transcription = getattr(server_content, "input_transcription", None)
                if input_transcription:
                    transcription = getattr(input_transcription, "text", "") or str(
                        input_transcription
                    )

                if getattr(server_content, "turn_complete", False):
                    break

        response_text = " ".join(part.strip() for part in response_text_parts if part).strip()
        return {
            "response_text": self._dedupe_text(response_text),
            "transcription": transcription.strip(),
        }

    def _extract_parts_text(self, server_content: Any) -> str:
        model_turn = getattr(server_content, "model_turn", None)
        if not model_turn:
            return ""

        chunks: list[str] = []
        for part in getattr(model_turn, "parts", []) or []:
            text = getattr(part, "text", None)
            if text:
                chunks.append(text)
        return " ".join(chunks).strip()

    def _dedupe_text(self, text: str) -> str:
        segments = [segment.strip() for segment in text.split("\n") if segment.strip()]
        deduped: list[str] = []
        for segment in segments:
            if not deduped or deduped[-1] != segment:
                deduped.append(segment)
        return " ".join(deduped).strip()

    async def disconnect(self):
        if self.session is not None:
            try:
                close = getattr(self.session, "close", None)
                if callable(close):
                    await close()
            except Exception as exc:
                logger.debug("Gemini session close warning: {}", exc)

        if self._session_cm is not None:
            try:
                await self._session_cm.__aexit__(None, None, None)
            except Exception as exc:
                logger.debug("Gemini context exit warning: {}", exc)

        self.session = None
        self._session_cm = None
        self._is_connected = False

    def update_system_prompt(self, new_prompt: str):
        self.system_prompt = new_prompt

    async def _generate_text_fallback(self, text: str) -> str:
        if self.client is None:
            from google import genai

            self.client = genai.Client(api_key=Config.GEMINI_API_KEY)

        prompt = (
            f"{self.system_prompt}\n\n"
            f"User: {text}\n"
            "Assistant:"
        )
        response = await self.client.aio.models.generate_content(
            model=Config.GEMINI_FLASH_MODEL,
            contents=prompt,
        )
        return ((response.text or "").strip() or "I'm here. Tell me a little more.")

    async def _send_legacy_audio(self, pcm_bytes: bytes, end_of_turn: bool):
        send = getattr(self.session, "send", None)
        if not callable(send):
            raise RuntimeError("Gemini session does not support legacy send() fallback")

        await send(
            input={
                "realtime_input": {
                    "media_chunks": [
                        {
                            "data": base64.b64encode(pcm_bytes).decode("utf-8"),
                            "mime_type": f"audio/pcm;rate={Config.MIC_SAMPLE_RATE}",
                        }
                    ]
                    if pcm_bytes
                    else []
                }
            },
            end_of_turn=end_of_turn,
        )
