"""Persistent JSON-lines worker for the local BoxGirl Silero TTS backend."""

from __future__ import annotations

import argparse
import base64
import contextlib
import io
import json
import sys
import time
import wave
from pathlib import Path
from typing import Any


ALLOWED_SPEAKERS = {"xenia", "kseniya", "baya"}
ALLOWED_SAMPLE_RATES = {8_000, 24_000, 48_000}
MAX_TEXT_LENGTH = 2_000

# Windows pipes otherwise inherit the active ANSI code page (often cp1251), while Rust IPC is UTF-8.
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8", errors="strict")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="strict")


class SileroEngine:
    def __init__(self, model_path: Path, threads: int = 4) -> None:
        # The stdout stream is a strict IPC protocol. Third-party diagnostics go to stderr.
        with contextlib.redirect_stdout(sys.stderr):
            import torch

            torch.set_num_threads(max(1, min(threads, 8)))
            torch.set_num_interop_threads(1)
            self._torch = torch
            self._model = torch.package.PackageImporter(str(model_path)).load_pickle(
                "tts_models", "model"
            )

    def synthesize(self, text: str, speaker: str, sample_rate: int) -> tuple[bytes, int, int]:
        text = text.strip()
        if not text:
            raise ValueError("Текст для озвучивания пуст")
        if len(text) > MAX_TEXT_LENGTH:
            raise ValueError(f"Текст длиннее {MAX_TEXT_LENGTH} символов")
        if speaker not in ALLOWED_SPEAKERS:
            raise ValueError(f"Неизвестный голос Silero: {speaker}")
        if sample_rate not in ALLOWED_SAMPLE_RATES:
            raise ValueError(f"Неподдерживаемая частота: {sample_rate} Гц")

        started = time.perf_counter()
        with self._torch.inference_mode(), contextlib.redirect_stdout(sys.stderr):
            audio = self._model.apply_tts(
                text=text,
                speaker=speaker,
                sample_rate=sample_rate,
            )
        synthesis_ms = round((time.perf_counter() - started) * 1_000)
        samples = audio.detach().cpu().float().flatten().clamp(-1.0, 1.0)
        peak = float(samples.abs().max()) if samples.numel() else 0.0
        if peak > 0:
            samples = samples * min(1.35, 0.94 / peak)
        pcm = (samples * 32_767.0).round().to(self._torch.int16).numpy().tobytes()

        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes(pcm)
        duration_ms = round(samples.numel() * 1_000 / sample_rate)
        return output.getvalue(), duration_ms, synthesis_ms


def response(request_id: int, **payload: Any) -> None:
    print(
        json.dumps({"id": request_id, **payload}, ensure_ascii=False, separators=(",", ":")),
        flush=True,
    )


def run_worker(model_path: Path, threads: int) -> int:
    try:
        engine = SileroEngine(model_path, threads)
    except Exception as error:  # startup failures must still be visible to the Rust bridge
        response(0, ok=False, error=f"Не удалось загрузить Silero: {error}")
        return 2

    for raw_line in sys.stdin:
        request_id = 0
        try:
            request = json.loads(raw_line)
            request_id = int(request.get("id", 0))
            wav_bytes, duration_ms, synthesis_ms = engine.synthesize(
                str(request.get("text", "")),
                str(request.get("speaker", "")),
                int(request.get("sample_rate", 48_000)),
            )
            response(
                request_id,
                ok=True,
                wav_base64=base64.b64encode(wav_bytes).decode("ascii"),
                duration_ms=duration_ms,
                synthesis_ms=synthesis_ms,
                sample_rate=int(request.get("sample_rate", 48_000)),
                speaker=str(request.get("speaker", "")),
            )
        except Exception as error:
            response(
                request_id,
                ok=False,
                error=f"Silero TTS: {type(error).__name__}: {error!r}",
            )
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=4)
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    raise SystemExit(run_worker(arguments.model, arguments.threads))
