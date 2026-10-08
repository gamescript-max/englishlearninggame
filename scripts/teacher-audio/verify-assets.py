"""Read/verify the external asset directory, then write an integration manifest.

Does not access or modify an application checkout. Original effects must be
copied into effects/ when assembling a complete 210-WAV asset set.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import wave
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "dependencies"))

import numpy as np


def verify(path):
    with wave.open(str(path), "rb") as wav:
        assert wav.getframerate() == 22050, path
        assert wav.getnchannels() == 1, path
        assert wav.getsampwidth() == 2 and wav.getcomptype() == "NONE", path
        frames = wav.getnframes()
        samples = np.frombuffer(wav.readframes(frames), dtype="<i2").astype(np.int32)
    assert frames > 100, path
    nonsilent = int(np.count_nonzero(np.abs(samples) > 10))
    clipped = int(np.count_nonzero(np.abs(samples) >= 32767))
    assert nonsilent > 100 and clipped == 0, path
    return {"file": path.relative_to(ROOT).as_posix(), "url": "/audio/" + path.name,
            "durationMs": round(frames / 22050 * 1000, 3), "frames": frames,
            "peak": round(float(np.max(np.abs(samples))) / 32768, 6),
            "rms": round(float(np.sqrt(np.mean((samples.astype(np.float64) / 32768) ** 2))), 6),
            "nonSilentSamples": nonsilent, "clippedSamples": clipped,
            "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    original = json.loads((ROOT / "sources/manifest-original.json").read_text(encoding="utf-8-sig"))
    combined = json.loads((ROOT / "speech/manifest.json").read_text(encoding="utf-8"))
    themes = json.loads((ROOT / "music/music-themes.json").read_text(encoding="utf-8"))
    assert combined["defaultAccent"] == "en-US"
    for lang in ("en", "zh"):
        assert all(combined["speech"][lang].get(text) == url for text, url in original["speech"][lang].items())
    assert len(combined["speech"]["en"]) == 162
    assert len(combined["speech"]["zh"]) == 37
    assert combined["effects"] == original["effects"]
    assert combined["music"] == original["music"]
    combined["musicThemes"] = themes["musicThemes"]
    expected = []
    for lang in ("en", "zh"):
        expected.extend(ROOT / "speech" / Path(url).name for url in combined["speech"][lang].values())
    expected.extend(ROOT / "music" / Path(url).name for url in themes["musicThemes"].values())
    expected.extend(ROOT / "effects" / Path(url).name for url in combined["effects"].values())
    assert len(expected) == 210 and len(set(expected)) == 210
    stats = [verify(path) for path in expected]
    # Each text and each destination has independently generated, distinct content.
    assert len({item["sha256"] for item in stats}) == 210
    assert all(item["durationMs"] < 20000 for item in stats if item["file"].startswith("speech/"))
    combined["durationsMs"] = {item["url"]: item["durationMs"] for item in stats}
    combined["provenance"]["music"] = "Eight original 16-bar melodies with glockenspiel, wood/marimba, and plucked partials. Deterministic mathematical PCM synthesis; no downloaded audio or song samples."
    combined["provenance"]["effects"] = "Three existing original mathematical effects preserved byte-for-byte from the source set."
    (ROOT / "manifest-combined.json").write_text(json.dumps(combined, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "status": "passed", "originalKeysRetained": 198, "addedChineseKeys": 1,
        "englishClips": 162, "chineseClips": 37, "musicLoops": 8, "preservedEffects": 3,
        "wavFileCount": len(stats), "mp3SourcesRetained": len(list((ROOT / "mp3-source").glob("*.mp3"))),
        "totalWavBytes": sum(item["bytes"] for item in stats),
        "format": "PCM WAV, mono, 22050 Hz, 16 bit", "allNonSilent": True,
        "totalClippedSamples": sum(item["clippedSamples"] for item in stats),
        "maxSpeechDurationMs": max(item["durationMs"] for item in stats if item["file"].startswith("speech/")),
        "all210WavHashesDistinct": True, "manualListeningPerformed": False,
        "verificationScope": "Text/path manifest coverage, WAV headers, PCM duration, RMS/peak, non-silence, clipping, unique content; music report verifies zero-amplitude loop boundary. No subjective listening or transcript recognition was performed.",
        "files": stats,
    }
    (ROOT / "verification-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "files"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
