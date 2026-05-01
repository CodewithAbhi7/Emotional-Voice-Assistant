"""
Audio sample validation helpers.
"""
from __future__ import annotations

import os

import numpy as np
import soundfile as sf


def load_audio_mono(path: str) -> tuple[np.ndarray, int]:
    try:
        data, sample_rate = sf.read(path)
        if getattr(data, "ndim", 1) > 1:
            data = data.mean(axis=1)
        return data.astype(np.float32), int(sample_rate)
    except Exception:
        import librosa

        data, sample_rate = librosa.load(path, sr=None, mono=True)
        return data.astype(np.float32), int(sample_rate)


def validate_audio_sample(path: str) -> dict:
    try:
        file_size = os.path.getsize(path)
        if file_size > 10 * 1024 * 1024:
            return {
                "valid": False,
                "duration": 0.0,
                "quality": 0.0,
                "error": "Audio file is too large. Chatterbox supports up to 10MB.",
                "warning": None,
            }

        data, sample_rate = load_audio_mono(path)
        duration = len(data) / float(sample_rate or 1)
        if duration < 6.0:
            return {
                "valid": False,
                "duration": round(duration, 1),
                "quality": 0.0,
                "error": f"Too short ({duration:.1f}s). Need at least 6 seconds.",
                "warning": None,
            }

        frame_size = max(1, int(sample_rate * 0.025))
        frames = [
            data[index : index + frame_size]
            for index in range(0, max(0, len(data) - frame_size), frame_size)
        ]
        energies = [float(np.sqrt(np.mean(frame**2))) for frame in frames if len(frame) == frame_size]
        if not energies:
            return {
                "valid": False,
                "duration": round(duration, 1),
                "quality": 0.0,
                "error": "Could not analyze audio.",
                "warning": None,
            }

        noise_floor = np.percentile(energies, 10)
        signal_peak = max(energies)
        snr = 20 * np.log10(signal_peak / max(noise_floor, 1e-10))
        quality = min(1.0, max(0.0, (snr - 10) / 30))

        warning = None
        if duration < 15:
            warning = f"Short sample ({duration:.1f}s). 15+ seconds gives better quality."
        if quality < 0.5:
            warning = "Background noise detected. Quieter audio gives a better clone."

        return {
            "valid": True,
            "duration": round(duration, 1),
            "quality": round(float(quality), 2),
            "error": None,
            "warning": warning,
        }
    except Exception as exc:
        return {
            "valid": False,
            "duration": 0.0,
            "quality": 0.0,
            "error": str(exc),
            "warning": None,
        }
