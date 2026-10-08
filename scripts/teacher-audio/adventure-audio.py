"""Generate fixed adventure speech, retaining the project's teaching voices.

Input is authored curriculum text, never children's voices or recordings.
The entries file is a merge patch; this script does not mutate audio manifests.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
CHECKOUT = ROOT.parents[1]
sys.path.insert(0, str(CHECKOUT.parent / "audio-refresh/dependencies"))
spec = importlib.util.spec_from_file_location("adventure_teacher_audio", ROOT / "generate-speech.py")
base = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(base)
ARTIFACTS = CHECKOUT / "artifacts"
base.ROOT = ARTIFACTS / "adventure-audio"
base.ROOT.mkdir(parents=True, exist_ok=True)


async def main():
    texts = json.loads((ROOT / "adventure-texts.json").read_text(encoding="utf-8-sig"))
    existing = json.loads((CHECKOUT / "lib/audio-manifest.json").read_text(encoding="utf-8-sig"))
    entries = {"speech": {"en": {}, "zh": {}}, "durationsMs": {}}
    report = {"createdAt": datetime.now(timezone.utc).isoformat(), "voices": base.PROSODY,
              "format": base.FORMAT, "manualListeningPerformed": False, "files": [], "reusedReferences": []}
    semaphore = asyncio.Semaphore(2)

    async def worker(lang, text, number):
        async with semaphore:
            if text in existing["speech"][lang]:
                url = existing["speech"][lang][text]
                stats = base.pcm_stats(CHECKOUT / "public" / url.lstrip("/"))
                report["reusedReferences"].append({"lang": lang, "text": text, "url": url, **stats})
            else:
                url = f"/audio/adventure-{lang}-{number:03d}.wav"
                target = CHECKOUT / "public" / url.lstrip("/")
                if target.exists() and target.stat().st_size > 1000:
                    stats = base.pcm_stats(target)
                else:
                    stats = await base.synthesize(lang, text, target)
                report["files"].append({"lang": lang, "text": text, "url": url, **stats})
            if stats["nonSilentSamples"] < 100 or stats["clippedSamples"] or stats["durationMs"] < 200:
                raise RuntimeError(f"Audio verification failed: {url}")
            entries["speech"][lang][text] = url
            entries["durationsMs"][url] = stats["durationMs"]
            print(f"OK {lang}: {text} ({stats['durationMs']} ms)", flush=True)

    tasks = []
    for lang in ("en", "zh"):
        for number, text in enumerate(texts[lang], 1):
            tasks.append(worker(lang, text, number))
    await asyncio.gather(*tasks)
    entries["adventureExpansion"] = {"englishVoice": base.PROSODY["en"]["voice"], "chineseVoice": base.PROSODY["zh"]["voice"],
                                     "format": "PCM WAV mono 22050 Hz 16 bit", "manuallyAuditioned": False,
                                     "synthesizedTextCount": len(report["files"]), "reusedTextCount": len(report["reusedReferences"])}
    (ARTIFACTS / "adventure-audio-entries.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    (ROOT / "adventure-verification-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(f"COMPLETE: {len(report['files'])} generated, {len(report['reusedReferences'])} reused; manifests unmodified.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())

