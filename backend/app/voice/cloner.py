"""
Chatterbox TTS voice cloning client.
"""
from __future__ import annotations

import asyncio
import hashlib
import mimetypes
import os
from pathlib import Path
from typing import Optional

import httpx
import numpy as np
import soundfile as sf
from loguru import logger
from scipy.signal import resample

from app.config import Config
from app.voice.validator import load_audio_mono, validate_audio_sample


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


class VoiceCloner:
    def __init__(self):
        self.is_ready = False
        self._lock = asyncio.Lock()
        self._client: httpx.AsyncClient | None = None

    async def initialize(self):
        logger.info(
            "Connecting to Chatterbox voice service at {}",
            Config.CHATTERBOX_BASE_URL,
        )
        self._client = httpx.AsyncClient(
            base_url=Config.CHATTERBOX_BASE_URL,
            timeout=httpx.Timeout(
                Config.CHATTERBOX_TIMEOUT_SEC,
                connect=10.0,
            ),
        )
        self.is_ready = await self._check_health(raise_on_error=False)
        if self.is_ready:
            logger.info("Chatterbox voice service is ready")
        else:
            logger.warning(
                "Chatterbox voice service is unavailable. Start the CPU container and retry."
            )

    async def close(self):
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _check_health(self, raise_on_error: bool = True) -> bool:
        if self._client is None:
            if raise_on_error:
                raise RuntimeError("Voice client is not initialized")
            return False

        try:
            response = await self._client.get("/health")
            if response.is_success:
                return True

            detail = self._response_detail(response)
            if raise_on_error:
                raise RuntimeError(
                    f"Chatterbox health check failed ({response.status_code}): {detail}"
                )
            return False
        except Exception as exc:
            if raise_on_error:
                raise RuntimeError(f"Chatterbox health check failed: {exc}") from exc
            return False

    async def _ensure_ready(self):
        if self.is_ready:
            return

        self.is_ready = await self._check_health(raise_on_error=False)
        if not self.is_ready:
            raise RuntimeError(
                "Chatterbox API is unavailable. Start the Chatterbox CPU container first."
            )

    async def validate_sample(self, path: str) -> dict:
        return validate_audio_sample(path)

    async def create_speaker_profile(self, audio_path: str, profile_id: str) -> str:
        data, sample_rate = load_audio_mono(audio_path)

        target_rate = Config.VOICE_PROFILE_SAMPLE_RATE
        if sample_rate != target_rate:
            data = resample(data, int(len(data) * target_rate / sample_rate))
            sample_rate = target_rate

        peak = np.max(np.abs(data)) if len(data) else 0.0
        if peak > 0:
            data = data / peak * 0.95

        energy = np.abs(data)
        if len(energy):
            threshold = max(energy) * 0.02
            voiced = np.where(energy > threshold)[0]
            if len(voiced):
                pad = int(sample_rate * 0.1)
                start = max(0, voiced[0] - pad)
                end = min(len(data), voiced[-1] + pad)
                data = data[start:end]

        out_path = Path(Config.SPEAKER_PROFILES_DIR) / f"{profile_id}.wav"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(out_path, data, sample_rate)
        return str(out_path)

    async def synthesize(
        self,
        text: str,
        speaker_wav: str,
        language: str = "en",
        tone: Optional[dict] = None,
        output_path: Optional[str] = None,
    ) -> str:
        await self._ensure_ready()

        if not os.path.exists(speaker_wav):
            raise FileNotFoundError(f"Speaker WAV not found: {speaker_wav}")

        tone = tone or {}
        processed_text = self._apply_tone_to_text(text, tone)
        settings = self._tone_to_params(tone)

        if output_path is None:
            cache_key = hashlib.md5(
                (
                    f"{processed_text}|{speaker_wav}|{language}|"
                    f"{settings['exaggeration']}|{settings['cfg_weight']}|{settings['temperature']}"
                ).encode("utf-8")
            ).hexdigest()[:12]
            output_path = str(Path(Config.PHRASE_CACHE_DIR) / f"synth_{cache_key}.wav")

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        async with self._lock:
            mime_type = mimetypes.guess_type(speaker_wav)[0] or "audio/wav"
            with open(speaker_wav, "rb") as voice_file:
                response = await self._client.post(
                    "/v1/audio/speech/upload",
                    headers={"Accept": "audio/wav"},
                    data={
                        "input": processed_text,
                        "exaggeration": f"{settings['exaggeration']:.2f}",
                        "cfg_weight": f"{settings['cfg_weight']:.2f}",
                        "temperature": f"{settings['temperature']:.2f}",
                    },
                    files={
                        "voice_file": (
                            Path(speaker_wav).name,
                            voice_file,
                            mime_type,
                        )
                    },
                )

            if not response.is_success:
                detail = self._response_detail(response)
                raise RuntimeError(
                    f"Chatterbox synthesis failed ({response.status_code}): {detail}"
                )

            with open(output_path, "wb") as audio_file:
                audio_file.write(response.content)

        return output_path

    def _response_detail(self, response: httpx.Response) -> str:
        try:
            payload = response.json()
            if isinstance(payload, dict):
                return str(payload.get("detail") or payload.get("message") or payload)
            return str(payload)
        except Exception:
            return response.text.strip() or "Unknown error"

    def _tone_to_params(self, tone: dict) -> dict[str, float]:
        warmth = float(tone.get("warmth", 0.7))
        urgency = float(tone.get("urgency", 0.3))
        anger = float(tone.get("anger", 0.0))

        exaggeration = _clamp(
            Config.CHATTERBOX_EXAGGERATION + (anger * 0.45) + (urgency * 0.30) - (warmth * 0.05),
            0.25,
            2.0,
        )
        cfg_weight = _clamp(
            Config.CHATTERBOX_CFG_WEIGHT - (urgency * 0.22) + (warmth * 0.08),
            0.0,
            1.0,
        )
        temperature = _clamp(
            Config.CHATTERBOX_TEMPERATURE + (anger * 0.15) + (urgency * 0.10),
            0.05,
            5.0,
        )

        return {
            "exaggeration": round(exaggeration, 2),
            "cfg_weight": round(cfg_weight, 2),
            "temperature": round(temperature, 2),
        }

    def _apply_tone_to_text(self, text: str, tone: dict) -> str:
        anger = tone.get("anger", 0.0)
        urgency = tone.get("urgency", 0.3)
        warmth = tone.get("warmth", 0.7)

        result = text.strip()
        if anger > 0.65:
            result = result.rstrip(".,?") + "!"
            if anger > 0.8:
                result = result.rstrip("!") + "!!"
        elif urgency > 0.6:
            result = result.rstrip(".") + "!"
        elif warmth > 0.8 and urgency < 0.3 and not result.endswith(("...", ".", "?")):
            result += "..."
        return result

    async def synthesize_cached(
        self,
        text: str,
        speaker_wav: str,
        language: str,
        tone: dict,
        cache_key: str,
    ) -> str:
        cached_path = Path(Config.PHRASE_CACHE_DIR) / f"cached_{cache_key}.wav"
        if cached_path.exists():
            return str(cached_path)
        return await self.synthesize(
            text=text,
            speaker_wav=speaker_wav,
            language=language,
            tone=tone,
            output_path=str(cached_path),
        )
