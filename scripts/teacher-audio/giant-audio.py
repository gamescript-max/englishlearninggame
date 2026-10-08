"""Generate four fixed giant-creature names with the existing teaching voice.

Only authored public names are sent to the TTS service. This script never reads
or uploads learner recordings and never edits application audio manifests.
Run with the bundled Python; dependencies are reused from audio-refresh.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
CHECKOUT = ROOT.parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(CHECKOUT.parent / "audio-refresh/dependencies"))
spec = importlib.util.spec_from_file_location("giant_teacher_audio", ROOT / "generate-speech.py")
assert spec and spec.loader
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

TEXTS = [
    ("Mosasaurus", "giant-en-mosasaurus.wav"),
    ("Giant pliosaur", "giant-en-giant-pliosaur.wav"),
    ("Abyssal giant turtle", "giant-en-abyssal-giant-turtle.wav"),
    ("Azure sea dragon", "giant-en-azure-sea-dragon.wav"),
]


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-only", action="store_true", help="Check existing WAVs without remote synthesis.")
    parser.add_argument("--rebuild", action="store_true", help="Regenerate the four WAVs even when they exist.")
    args = parser.parse_args()
    entries = {"speech": {"en": {}, "zh": {}}, "durationsMs": {}}
    report = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "voice": base.PROSODY["en"],
        "format": base.FORMAT,
        "manualListeningPerformed": False,
        "verificationScope": "WAV headers, PCM duration, non-silence, RMS/peak, clipping and unique hashes; no subjective audition or transcript recognition.",
        "learnerRecordingsReadOrUploaded": False,
        "applicationManifestsModified": False,
        "files": [],
    }
    semaphore = asyncio.Semaphore(2)

    async def worker(text, filename):
        async with semaphore:
            url = f"/audio/{filename}"
            target = CHECKOUT / "public" / "audio" / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            if args.validate_only or (not args.rebuild and target.exists() and target.stat().st_size > 1000):
                stats = base.pcm_stats(target)
            else:
                stats = await base.synthesize("en", text, target)
            if stats["nonSilentSamples"] < 100 or stats["clippedSamples"] or stats["durationMs"] < 200 or stats["peak"] > .8001:
                raise RuntimeError(f"Audio verification failed: {url}")
            print(f"OK {text}: {stats['durationMs']} ms; peak={stats['peak']}; clipped={stats['clippedSamples']}", flush=True)
            return {"lang": "en", "text": text, "url": url, "bytes": target.stat().st_size, **stats}

    # The shared synthesizer creates its intermediate MP3s under ROOT. Keep
    # those temporary inputs outside the checkout and delete them after use.
    with tempfile.TemporaryDirectory(prefix="english-island-giant-audio-") as temp:
        base.ROOT = Path(temp)
        report["files"] = await asyncio.gather(*(worker(text, filename) for text, filename in TEXTS))
    if len({item["sha256"] for item in report["files"]}) != len(TEXTS):
        raise RuntimeError("Generated giant-name audio must have distinct content.")
    for item in report["files"]:
        entries["speech"]["en"][item["text"]] = item["url"]
        entries["durationsMs"][item["url"]] = item["durationMs"]
    entries["giantExpansion"] = {
        "englishVoice": base.PROSODY["en"]["voice"],
        "englishRate": base.PROSODY["en"]["rate"],
        "format": "PCM WAV mono 22050 Hz 16 bit",
        "manuallyAuditioned": False,
        "synthesizedTextCount": len(TEXTS),
    }
    report.update({"status": "passed", "speechClips": len(TEXTS), "allNonSilent": True, "totalClippedSamples": 0, "allHashesDistinct": True})
    (CHECKOUT / "artifacts" / "giant-audio-entries.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "giant-verification-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("COMPLETE: four verified WAVs and manifest merge entries; application manifests unmodified.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
