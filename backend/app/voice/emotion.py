"""
Emotion analysis for user speech.
"""
from __future__ import annotations

import librosa
import numpy as np
from loguru import logger


EMOTIONS = ["CALM", "STRESSED", "ANXIOUS", "SAD", "HAPPY", "ANGRY", "TIRED"]


class EmotionAnalyzer:
    def analyze(self, audio_path: str) -> dict:
        try:
            samples, sample_rate = librosa.load(audio_path, sr=22050)
            if len(samples) < sample_rate * 0.3:
                return self._calm()

            biomarkers = self._biomarkers(samples, sample_rate)
            scores = self._classify(biomarkers)
            dominant = max(scores, key=scores.get)
            return {
                "state": dominant,
                "confidence": round(scores[dominant], 3),
                "scores": {key: round(value, 3) for key, value in scores.items()},
                "biomarkers": biomarkers,
            }
        except Exception as exc:
            logger.warning("Emotion analysis failed: {}", exc)
            return self._calm()

    def _biomarkers(self, samples: np.ndarray, sample_rate: int) -> dict:
        f0, voiced, _ = librosa.pyin(
            samples,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C7"),
            sr=sample_rate,
        )
        voiced_f0 = f0[voiced] if voiced.any() else np.array([150.0])
        rms = librosa.feature.rms(y=samples)[0]
        onsets = librosa.onset.onset_detect(y=samples, sr=sample_rate, units="time")
        zcr = float(np.mean(librosa.feature.zero_crossing_rate(samples)[0]))

        return {
            "pitch_mean": round(float(np.mean(voiced_f0)), 1),
            "pitch_std": round(float(np.std(voiced_f0)), 1),
            "energy": round(float(np.mean(rms)), 5),
            "rate": round(len(onsets) / max(len(samples) / sample_rate, 0.1), 2),
            "zcr": round(zcr, 5),
        }

    def _classify(self, biomarkers: dict) -> dict:
        pitch = min(1.0, max(0.0, (biomarkers["pitch_mean"] - 80) / 220))
        pitch_var = min(1.0, max(0.0, biomarkers["pitch_std"] / 60))
        energy = min(1.0, max(0.0, biomarkers["energy"] / 0.08))
        rate = min(1.0, max(0.0, (biomarkers["rate"] - 1) / 6))
        zcr = min(1.0, max(0.0, biomarkers["zcr"] / 0.2))

        scores = {
            "CALM": 0.5 * (1 - pitch_var) + 0.3 * (1 - abs(energy - 0.4)) + 0.2 * (1 - abs(rate - 0.4)),
            "STRESSED": 0.3 * pitch_var + 0.35 * energy + 0.35 * rate,
            "ANXIOUS": 0.3 * pitch + 0.25 * rate + 0.25 * zcr + 0.2 * pitch_var,
            "SAD": 0.35 * (1 - pitch) + 0.35 * (1 - energy) + 0.3 * (1 - rate),
            "HAPPY": 0.3 * pitch + 0.3 * energy + 0.2 * rate + 0.2 * (1 - pitch_var),
            "ANGRY": 0.3 * pitch_var + 0.3 * energy + 0.25 * zcr + 0.15 * rate,
            "TIRED": 0.35 * (1 - energy) + 0.35 * (1 - rate) + 0.3 * (1 - pitch),
        }
        total = sum(scores.values()) or 1.0
        return {key: value / total for key, value in scores.items()}

    def _calm(self) -> dict:
        return {
            "state": "CALM",
            "confidence": 0.6,
            "scores": {
                "CALM": 0.6,
                "STRESSED": 0.1,
                "ANXIOUS": 0.05,
                "SAD": 0.1,
                "HAPPY": 0.05,
                "ANGRY": 0.05,
                "TIRED": 0.05,
            },
            "biomarkers": {
                "pitch_mean": 150.0,
                "pitch_std": 25.0,
                "energy": 0.03,
                "rate": 3.5,
                "zcr": 0.08,
            },
        }


def emotion_from_text(text: str) -> dict:
    lowered = text.lower()
    keywords = {
        "STRESSED": ["stressed", "overwhelmed", "pressure", "anxious", "panic"],
        "SAD": ["sad", "crying", "depressed", "hopeless", "alone", "hurt"],
        "HAPPY": ["happy", "excited", "great", "amazing", "joy", "love", "wonderful"],
        "ANGRY": ["angry", "frustrated", "hate", "furious", "annoyed", "rage"],
        "TIRED": ["tired", "exhausted", "sleepy", "drained", "burnout"],
    }
    scores = {emotion: sum(1 for word in words if word in lowered) for emotion, words in keywords.items()}
    scores["CALM"] = max(0, 1 - sum(scores.values()))
    total = sum(scores.values()) or 1
    normalized = {key: value / total for key, value in scores.items()}
    dominant = max(normalized, key=normalized.get)
    return {
        "state": dominant,
        "confidence": normalized[dominant],
        "scores": normalized,
        "biomarkers": {},
    }
