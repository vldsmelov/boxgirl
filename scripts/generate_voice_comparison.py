"""Generate and loudness-align the Silero side of the BoxGirl voice comparison."""

from __future__ import annotations

import argparse
import array
import json
import math
import sys
import time
import wave
from datetime import datetime, timezone
from pathlib import Path

from silero_worker import SileroEngine


SPEAKERS = ("xenia", "kseniya", "baya")


def normalize_pcm16(path: Path, target_dbfs: float = -20.0) -> dict[str, float | int]:
    with wave.open(str(path), "rb") as reader:
        params = reader.getparams()
        frames = reader.readframes(params.nframes)
    if params.sampwidth != 2 or params.nchannels != 1:
        raise ValueError(f"Expected mono PCM16 WAV: {path}")
    samples = array.array("h")
    samples.frombytes(frames)
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples:
        return {"durationMs": 0, "rmsDbfs": -96.0, "peakDbfs": -96.0}

    peak = max(abs(sample) for sample in samples) / 32_768.0
    rms = math.sqrt(sum(sample * sample for sample in samples) / len(samples)) / 32_768.0
    target_rms = 10 ** (target_dbfs / 20.0)
    rms_gain = target_rms / max(rms, 1e-9)
    peak_gain = 0.95 / max(peak, 1e-9)
    gain = min(rms_gain, peak_gain, 4.0)
    normalized = array.array("h", (max(-32_768, min(32_767, round(sample * gain))) for sample in samples))
    if sys.byteorder != "little":
        normalized.byteswap()
    with wave.open(str(path), "wb") as writer:
        writer.setparams(params)
        writer.writeframes(normalized.tobytes())

    final_peak = peak * gain
    final_rms = rms * gain
    return {
        "durationMs": round(len(samples) * 1_000 / params.framerate),
        "sampleRate": params.framerate,
        "rmsDbfs": round(20 * math.log10(max(final_rms, 1e-9)), 2),
        "peakDbfs": round(20 * math.log10(max(final_peak, 1e-9)), 2),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--phrases", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=4)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    phrases = json.loads(args.phrases.read_text(encoding="utf-8"))
    args.output.mkdir(parents=True, exist_ok=True)
    engine = SileroEngine(args.model, args.threads)
    measurements: list[dict[str, object]] = []

    for speaker in SPEAKERS:
        voice_dir = args.output / speaker
        voice_dir.mkdir(parents=True, exist_ok=True)
        for phrase in phrases:
            started = time.perf_counter()
            wav_bytes, duration_ms, synthesis_ms = engine.synthesize(
                phrase["text"], speaker, 48_000
            )
            target = voice_dir / f"{phrase['id']}.wav"
            target.write_bytes(wav_bytes)
            measurements.append(
                {
                    "voice": speaker,
                    "phraseId": phrase["id"],
                    "durationMs": duration_ms,
                    "synthesisMs": synthesis_ms,
                    "wallMs": round((time.perf_counter() - started) * 1_000),
                    "realTimeFactor": round(synthesis_ms / max(duration_ms, 1), 4),
                }
            )

    audio_stats: dict[str, dict[str, float | int]] = {}
    for wav_path in sorted(args.output.glob("*/*.wav")):
        audio_stats[str(wav_path.relative_to(args.output)).replace("\\", "/")] = normalize_pcm16(wav_path)

    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "model": "silero-v5_5_ru",
        "sileroSampleRate": 48_000,
        "normalizationTargetDbfs": -20.0,
        "voices": ["irina", *SPEAKERS],
        "phrases": phrases,
        "measurements": measurements,
        "audioStats": audio_stats,
    }
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
