"""Neural lesson audio, generated outside the application checkout.

Install pinned packages with install-dependencies.ps1; run using the bundled
Python. Fixed input texts/paths come exclusively from sources/manifest-original.json.
No API key is required by edge-tts. This is an online third-party client.
"""
from __future__ import annotations

import argparse
import asyncio
import copy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import wave

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "dependencies"))
import edge_tts
import imageio_ffmpeg
import numpy as np

FORMAT = {"sampleRate": 22050, "channels": 1, "bitsPerSample": 16, "encoding": "PCM"}
PROSODY = {
    "en": {"voice": "en-US-JennyNeural", "rate": "-12%", "volume": "+0%", "pitch": "+0Hz"},
    "zh": {"voice": "zh-CN-XiaoxiaoNeural", "rate": "-7%", "volume": "+0%", "pitch": "+0Hz"},
}
NEW_INSTRUCTION = "听一听，移动小篮子，接住英语目标对应的图片。箭头按钮、键盘或拖动篮子都能玩。"


def manifest():
    source = json.loads((ROOT / "sources/manifest-original.json").read_text(encoding="utf-8-sig"))
    assert len(source["speech"]["en"]) == 162
    assert len(source["speech"]["zh"]) == 36
    result = copy.deepcopy(source)
    result["speech"]["zh"][NEW_INSTRUCTION] = "/audio/zh-037.wav"
    result["provenance"] = {
        "englishVoice": PROSODY["en"]["voice"],
        "chineseVoice": PROSODY["zh"]["voice"],
        "engine": "Microsoft Edge online neural TTS via edge-tts 7.2.8",
        "format": "PCM WAV, mono, 22050 Hz, 16 bit",
        "englishRate": PROSODY["en"]["rate"],
        "chineseRate": PROSODY["zh"]["rate"],
        "pitch": "+0Hz",
        "volume": "+0%",
        "accent": "en-US",
        "note": "Fixed teaching texts synthesized by adult female neural voices. No child recordings. English gently slowed for teaching; Chinese gently slowed for instructions. Musical themes are original PCM synthesis. Speech amplitude capped at 0.80; no custom expressive SSML is supported by the Edge service.",
        "sourceReferences": [
            "https://github.com/rany2/edge-tts",
            "https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts",
        ],
    }
    return result


def pcm_stats(path):
    with wave.open(str(path), "rb") as audio:
        params = audio.getparams()
        raw = audio.readframes(params.nframes)
    assert params.framerate == 22050 and params.nchannels == 1 and params.sampwidth == 2
    pcm = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768
    peak = float(np.max(np.abs(pcm)))
    rms = float(np.sqrt(np.mean(pcm * pcm)))
    return {
        "filename": path.name,
        "frames": params.nframes,
        "durationMs": round(params.nframes / params.framerate * 1000, 3),
        "format": FORMAT,
        "peak": round(peak, 6),
        "rms": round(rms, 6),
        "nonSilentSamples": int(np.count_nonzero(np.abs(pcm) > 0.0003)),
        "clippedSamples": int(np.count_nonzero(np.abs(pcm) >= 32767 / 32768)),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def convert(mp3, wav):
    # Decode then constrain peaks in PCM to avoid clipping without altering timing.
    subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y",
         "-i", str(mp3), "-ar", "22050", "-ac", "1", "-c:a", "pcm_s16le", str(wav)],
        check=True,
    )
    with wave.open(str(wav), "rb") as decoded:
        params = decoded.getparams()
        samples = np.frombuffer(decoded.readframes(params.nframes), dtype="<i2").astype(np.float64)
    peak = float(np.max(np.abs(samples)))
    if peak > 0.80 * 32767:
        samples *= (0.80 * 32767) / peak
        with wave.open(str(wav), "wb") as output:
            output.setparams(params)
            output.writeframes(np.rint(samples).astype("<i2").tobytes())


async def synthesize(language, text, target, retries=3):
    source = ROOT / "mp3-source" / (target.stem + ".mp3")
    source.parent.mkdir(exist_ok=True)
    # MP3 files provide reproducible conversion even when the remote voice updates.
    if not source.exists() or source.stat().st_size < 500:
        for attempt in range(1, retries + 1):
            try:
                await asyncio.wait_for(edge_tts.Communicate(text, **PROSODY[language]).save(str(source)), timeout=45)
                break
            except Exception as exc:
                print(f"FAILED {target.name} attempt={attempt}: {type(exc).__name__}: {exc}", flush=True)
                if attempt == retries:
                    raise
                await asyncio.sleep(attempt * 2)
    convert(source, target)
    stats = pcm_stats(target)
    if stats["nonSilentSamples"] < 100 or stats["clippedSamples"]:
        raise RuntimeError(f"Audio validation failed: {stats}")
    return stats


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", action="store_true", help="Generate only en-001 and zh-001; no full manifest is written.")
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--reconvert", action="store_true", help="Rebuild WAVs from retained MP3s; fetch remotely only if an MP3 is missing.")
    args = parser.parse_args()
    output = ROOT / "speech"
    output.mkdir(exist_ok=True)
    result = manifest()
    tasks = [(lang, text, output / Path(url).name)
             for lang, entries in result["speech"].items() for text, url in entries.items()]
    if args.probe:
        tasks = [task for task in tasks if task[2].name in ("en-001.wav", "zh-001.wav")]
    semaphore = asyncio.Semaphore(max(1, args.concurrency))
    complete = 0

    async def worker(task):
        nonlocal complete
        lang, text, target = task
        async with semaphore:
            if args.validate_only or (not args.reconvert and target.exists() and target.stat().st_size > 1000):
                stats = pcm_stats(target)
            else:
                stats = await synthesize(lang, text, target)
            complete += 1
            print(f"OK {complete}/{len(tasks)} {target.name} {stats['durationMs']}ms peak={stats['peak']}", flush=True)
            return stats

    stats = await asyncio.gather(*(worker(task) for task in tasks))
    report = {"createdAt": datetime.now(timezone.utc).isoformat(), "speechClips": len(stats),
              "voices": PROSODY, "format": FORMAT, "manualListeningPerformed": False, "files": stats}
    (ROOT / ("probe-report.json" if args.probe else "speech-report.json")).write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if not args.probe:
        result["assetRevision"] = "teacher-" + hashlib.sha256("".join(item["sha256"] for item in stats).encode()).hexdigest()[:12]
        result["durationsMs"] = {f"/audio/{item['filename']}": item["durationMs"] for item in stats}
        (output / "manifest.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print("COMPLETE: 162 English + 37 Chinese neural WAV files; all existing keys retained.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
