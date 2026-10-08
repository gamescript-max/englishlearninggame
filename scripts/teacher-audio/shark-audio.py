"""Generate fixed authored shark speech using the existing teacher voices."""
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
CHECKOUT = HERE.parents[1]
sys.path.insert(0, str(CHECKOUT.parent / "audio-refresh/dependencies"))
spec = importlib.util.spec_from_file_location("teacher", HERE / "generate-speech.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
base.ROOT = CHECKOUT / "artifacts/shark-audio"
base.ROOT.mkdir(parents=True, exist_ok=True)

async def main():
    texts = json.loads((HERE / "shark-texts.json").read_text(encoding="utf-8"))
    manifest = json.loads((CHECKOUT / "lib/audio-manifest.json").read_text(encoding="utf-8"))
    report = {"voices": base.PROSODY, "format": base.FORMAT, "manuallyAuditioned": False, "files": []}
    semaphore = asyncio.Semaphore(3)
    async def worker(lang, text):
        async with semaphore:
            url = manifest["speech"][lang].get(text) or f"/audio/shark-{lang}-{hashlib.sha256(text.encode()).hexdigest()[:12]}.wav"
            target = CHECKOUT / "public" / url.lstrip("/")
            stats = base.pcm_stats(target) if target.exists() else await base.synthesize(lang, text, target)
            if stats["nonSilentSamples"] < 100 or stats["clippedSamples"] or stats["durationMs"] < 200:
                raise RuntimeError(f"Invalid speech: {url}")
            manifest["speech"][lang][text] = url
            manifest["durationsMs"][url] = stats["durationMs"]
            report["files"].append({"language": lang, "text": text, "url": url, **stats})
            print(f"OK {lang}: {text}", flush=True)
    await asyncio.gather(*(worker(lang, text) for lang in ["en", "zh"] for text in texts[lang]))
    report["files"].sort(key=lambda item: (item["language"], item["text"]))
    manifest["assetRevision"] = "teacher-shark-" + hashlib.sha256("".join(item["sha256"] for item in report["files"]).encode()).hexdigest()[:12]
    manifest["sharkExpansion"] = {"englishVoice": base.PROSODY["en"]["voice"], "chineseVoice": base.PROSODY["zh"]["voice"], "manuallyAuditioned": False, "textCount": len(report["files"])}
    serialized = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    for target in [CHECKOUT / "lib/audio-manifest.json", CHECKOUT / "public/audio/manifest.json"]:
        target.write_text(serialized, encoding="utf-8")
    (HERE / "shark-verification-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"COMPLETE {len(report['files'])} fixed clips", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
