"""Fixed fish names and expanded English cards; no child audio is transmitted."""
from __future__ import annotations
import asyncio
import hashlib
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
CHECKOUT = ROOT.parents[1]
sys.path.insert(0, str(CHECKOUT.parent / "audio-refresh/dependencies"))
spec = importlib.util.spec_from_file_location("ecology_teacher_audio", ROOT / "generate-speech.py")
base = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(base)
base.ROOT = CHECKOUT / "artifacts/ecology-audio"
base.ROOT.mkdir(parents=True, exist_ok=True)

async def main():
    texts = json.loads((ROOT / "ecology-texts.json").read_text(encoding="utf-8-sig"))
    existing = json.loads((CHECKOUT / "lib/audio-manifest.json").read_text(encoding="utf-8-sig"))
    entries = {"speech": {"en": {}, "zh": {}}, "durationsMs": {}}
    report = {"createdAt": datetime.now(timezone.utc).isoformat(), "voices": base.PROSODY,
              "format": base.FORMAT, "manualListeningPerformed": False, "files": [], "reusedReferences": []}
    semaphore = asyncio.Semaphore(4)
    async def worker(lang, text):
        async with semaphore:
            reused = text in existing["speech"][lang]
            url = existing["speech"][lang].get(text, f"/audio/ecology-{lang}-{hashlib.sha256((lang + ':' + text).encode()).hexdigest()[:16]}.wav")
            target = CHECKOUT / "public" / url.lstrip("/")
            stats = base.pcm_stats(target) if target.exists() and target.stat().st_size > 1000 else await base.synthesize(lang, text, target)
            if stats["nonSilentSamples"] < 100 or stats["clippedSamples"] or stats["durationMs"] < 200:
                raise RuntimeError(f"Invalid fixed voice: {url}")
            entries["speech"][lang][text] = url
            entries["durationsMs"][url] = stats["durationMs"]
            report["reusedReferences" if reused else "files"].append({"lang": lang, "text": text, "url": url, **stats})
            print(f"OK {lang}: {text} ({stats['durationMs']} ms)", flush=True)
    await asyncio.gather(*(worker(lang, text) for lang in ("en", "zh") for text in dict.fromkeys(texts[lang])))
    entries["ecologyExpansion"] = {"englishVoice": base.PROSODY["en"]["voice"], "chineseVoice": base.PROSODY["zh"]["voice"],
                                    "format": "PCM WAV mono 22050 Hz 16 bit", "manuallyAuditioned": False,
                                    "synthesizedTextCount": len(report["files"]), "reusedTextCount": len(report["reusedReferences"])}
    (CHECKOUT / "artifacts/ecology-audio-entries.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "ecology-verification-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"COMPLETE: {len(report['files'])} generated; {len(report['reusedReferences'])} reused.", flush=True)
if __name__ == "__main__":
    asyncio.run(main())
