"""Exercise several UTF-8 requests through one persistent Silero worker process."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="strict")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--python", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--worker", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    requests = [
        {"id": 1, "text": "Привет! Я BoxGirl.", "speaker": "xenia", "sample_rate": 48_000},
        {
            "id": 2,
            "text": "Давай спокойно разберёмся — я рядом.",
            "speaker": "xenia",
            "sample_rate": 48_000,
        },
        {"id": 3, "text": "Проверка валидации.", "speaker": "unknown", "sample_rate": 48_000},
        {"id": 4, "text": "А теперь продолжим.", "speaker": "baya", "sample_rate": 48_000},
    ]
    started = time.perf_counter()
    process = subprocess.Popen(
        [str(args.python), "-u", str(args.worker), "--model", str(args.model), "--threads", "4"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    assert process.stdin is not None and process.stdout is not None
    results = []
    try:
        for request in requests:
            process.stdin.write(json.dumps(request, ensure_ascii=False, separators=(",", ":")) + "\n")
            process.stdin.flush()
            response = json.loads(process.stdout.readline())
            results.append(
                {
                    "id": response["id"],
                    "ok": response["ok"],
                    "speaker": response.get("speaker"),
                    "durationMs": response.get("duration_ms"),
                    "synthesisMs": response.get("synthesis_ms"),
                    "wavBytes": round(len(response.get("wav_base64", "")) * 0.75),
                    "error": response.get("error"),
                }
            )
    finally:
        process.stdin.close()
        process.wait(timeout=10)
    print(
        json.dumps(
            {
                "wallMsIncludingOneModelLoad": round((time.perf_counter() - started) * 1_000),
                "responses": results,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    expected = [True, True, False, True]
    return 0 if [item["ok"] for item in results] == expected else 1


if __name__ == "__main__":
    raise SystemExit(main())
