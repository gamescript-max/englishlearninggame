"""Eight original, seamless child-friendly musical loops (no sampled songs).

Deterministic PCM synthesis of mallet, plucked-string, and soft marimba timbres.
All melodies below were authored for this project; no external song/audio input.
The output directory is deliberately separate from the speech directory.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import wave
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "dependencies"))

import numpy as np

OUTPUT = ROOT / "music"
SR = 22050
SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]

# Eight-beat motifs: (beat offset, pentatonic degree, length in beats).
# Different phrasing, keys, tempos and timbres give each destination its own sound.
THEMES = {
    "world": {"file": "music-loop.wav", "title": "小岛出发 · Island Steps", "bpm": 108, "root": 60,
              "lead": "glock", "motifs": [
                  [(0, 0, 1), (1.5, 2, .5), (2, 3, 1.5), (4, 4, 1), (5, 3, .5), (6, 1, 1.5)],
                  [(0, 2, .75), (1, 1, .75), (2.5, 0, 1), (4, 1, .75), (5, 2, .75), (6, 0, 1.5)],
                  [(0, 3, 1), (1.5, 4, .5), (2, 5, 1.5), (4, 4, 1), (5.5, 2, .5), (6, 3, 1.5)],
                  [(0, 2, .75), (1, 3, .75), (2, 1, 1.5), (4, 2, .75), (5, 1, .75), (6, 0, 1.5)]],
              "harmony": [0, 7, 9, 0]},
    "animals": {"file": "music-animals.wav", "title": "森林脚印 · Forest Footsteps", "bpm": 96, "root": 62,
                "lead": "wood", "motifs": [
                    [(0, 0, .5), (.75, 1, .5), (2, 2, 1), (3.5, 1, .5), (5, 0, 1), (6.5, 3, .5)],
                    [(0, 2, 1), (2, 3, .5), (3, 2, .5), (4.5, 1, 1), (6, 0, 1.5)],
                    [(0, 3, .5), (1, 4, .5), (2.5, 3, 1), (4, 2, .5), (5, 1, .5), (6, 2, 1.5)],
                    [(0, 1, 1), (2, 0, .5), (3.5, 1, .5), (5, 2, .5), (6, 0, 1.5)]],
                "harmony": [0, 9, 7, 0]},
    "food": {"file": "music-food.wav", "title": "野餐点心 · Picnic Sprinkles", "bpm": 112, "root": 65,
             "lead": "pluck", "motifs": [
                 [(0, 2, .5), (.5, 3, .5), (1.5, 2, .5), (2.5, 0, 1), (4, 1, .5), (5, 2, .5), (6, 0, 1.5)],
                 [(0, 1, .5), (1, 2, .5), (2, 4, 1), (4, 3, .5), (4.5, 2, .5), (6, 1, 1.5)],
                 [(0, 3, .5), (1, 4, .5), (2, 5, 1), (4, 4, .5), (5, 3, .5), (6, 2, 1.5)],
                 [(0, 2, .5), (.5, 1, .5), (2, 0, 1), (4, 1, .5), (5, 2, .5), (6, 0, 1.5)]],
             "harmony": [0, 7, 0, 9]},
    "toys": {"file": "music-toys.wav", "title": "玩具转转 · Toy Parade", "bpm": 120, "root": 67,
             "lead": "wood", "motifs": [
                 [(0, 0, .5), (1, 3, .5), (2, 2, .5), (3, 1, .5), (4, 0, .5), (5.5, 2, .5), (6.5, 3, .5)],
                 [(0, 4, 1), (2, 3, .5), (3, 1, .5), (4, 2, 1), (6, 0, 1.5)],
                 [(0, 2, .5), (1, 4, .5), (2, 3, .5), (3, 2, .5), (4, 1, .5), (5, 3, .5), (6, 4, .75)],
                 [(0, 3, .5), (1, 2, .5), (2, 1, 1), (4, 2, .5), (5, 1, .5), (6, 0, 1.5)]],
             "harmony": [0, 7, 9, 0]},
    "bubbles": {"file": "music-bubbles.wav", "title": "泡泡漂流 · Bubble Drift", "bpm": 88, "root": 69,
                "lead": "glock", "motifs": [
                    [(0, 0, 1.5), (2.5, 2, 1), (4.5, 4, 1.5), (7, 3, .5)],
                    [(0, 2, 1.5), (2.5, 1, 1), (4, 0, 1.5), (6.5, 2, .5)],
                    [(0, 3, 1.5), (2, 4, 1), (4, 5, 1.5), (6.5, 4, .75)],
                    [(0, 2, 1.5), (2.5, 3, .75), (4.5, 1, 1), (6, 0, 1.5)]],
                "harmony": [0, 9, 7, 0]},
    "delivery": {"file": "music-delivery.wav", "title": "码头小船 · Dockside Delivery", "bpm": 110, "root": 60,
                 "lead": "pluck", "motifs": [
                     [(0, 0, .5), (1.5, 1, .5), (2.5, 3, 1), (4, 2, .5), (5.5, 1, .5), (6.5, 0, 1)],
                     [(0, 2, .5), (1.5, 3, .5), (2.5, 4, 1), (4, 3, .5), (5.5, 2, .5), (6.5, 1, 1)],
                     [(0, 3, .5), (1.5, 2, .5), (2.5, 4, 1), (4, 5, .5), (5.5, 4, .5), (6.5, 3, 1)],
                     [(0, 2, .5), (1.5, 1, .5), (2.5, 0, 1), (4, 1, .5), (5.5, 2, .5), (6.5, 0, 1)]],
                 "harmony": [0, 7, 9, 7]},
    "connect": {"file": "music-connect.wav", "title": "彩线花园 · Rainbow Connections", "bpm": 102, "root": 64,
                "lead": "glock", "motifs": [
                    [(0, 0, .75), (1, 1, .75), (2, 2, 1), (4, 3, .75), (5, 2, .75), (6, 1, 1.5)],
                    [(0, 1, .75), (1, 2, .75), (2, 3, 1), (4, 4, .75), (5, 3, .75), (6, 2, 1.5)],
                    [(0, 2, .75), (1, 3, .75), (2, 4, 1), (4, 5, .75), (5, 4, .75), (6, 3, 1.5)],
                    [(0, 3, .75), (1, 2, .75), (2, 1, 1), (4, 2, .75), (5, 1, .75), (6, 0, 1.5)]],
                "harmony": [0, 9, 0, 7]},
    "catch": {"file": "music-catch.wav", "title": "草地小篮 · Meadow Baskets", "bpm": 116, "root": 62,
              "lead": "wood", "motifs": [
                  [(0, 2, .5), (1, 0, .5), (2, 1, .5), (3.5, 2, .5), (4.5, 3, .75), (6, 2, 1.5)],
                  [(0, 3, .5), (1, 1, .5), (2, 2, .5), (3.5, 3, .5), (4.5, 4, .75), (6, 3, 1.5)],
                  [(0, 4, .5), (1, 2, .5), (2, 3, .5), (3.5, 4, .5), (4.5, 5, .75), (6, 4, 1.5)],
                  [(0, 3, .5), (1, 2, .5), (2, 1, .5), (3.5, 0, .5), (4.5, 1, .75), (6, 0, 1.5)]],
              "harmony": [0, 7, 0, 9]},
}


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def tone(midi, duration, kind, volume):
    n = max(1, round(duration * SR))
    t = np.arange(n) / SR
    freq = hz(midi)
    attack = 1 - np.exp(-t / .009)
    release = np.minimum(1, (duration - t) / .09)
    if kind == "glock":
        result = (np.sin(2 * math.pi * freq * t) * np.exp(-t / .48)
                  + .14 * np.sin(2 * math.pi * freq * 2.76 * t) * np.exp(-t / .16)
                  + .035 * np.sin(2 * math.pi * freq * 5.4 * t) * np.exp(-t / .07))
    elif kind == "wood":
        result = (np.sin(2 * math.pi * freq * t) * np.exp(-t / .30)
                  + .12 * np.sin(2 * math.pi * freq * 3 * t) * np.exp(-t / .055)
                  + .04 * np.sin(2 * math.pi * freq * 5.5 * t) * np.exp(-t / .025))
    elif kind == "pluck":
        result = (np.sin(2 * math.pi * freq * t)
                  + .18 * np.sin(2 * math.pi * freq * 2 * t)
                  + .055 * np.sin(2 * math.pi * freq * 3 * t)) * np.exp(-t / .44)
    else:  # soft marimba / bass
        result = (np.sin(2 * math.pi * freq * t) + .08 * np.sin(2 * math.pi * freq * 2 * t)) * np.exp(-t / .65)
    return volume * attack * np.clip(release, 0, 1) * result


def add_circular(buffer, at, data):
    indices = (round(at * SR) + np.arange(len(data))) % len(buffer)
    np.add.at(buffer, indices, data)


def compose(theme):
    beat = 60 / theme["bpm"]
    n = round(64 * beat * SR)
    track = np.zeros(n, dtype=np.float64)
    # Four motifs form 8 bars; the repeat adds a quiet upper answering voice.
    for section in range(8):
        motif = theme["motifs"][section % 4]
        start = section * 8
        for index, (offset, degree, length) in enumerate(motif):
            midi = theme["root"] + SCALE[degree] + 12
            data = tone(midi, min(length * beat + .35, 1.5), theme["lead"], .21)
            add_circular(track, (start + offset) * beat, data)
            if section >= 4 and index in (1, 3):
                answer = tone(midi - 12, .70, "pluck", .055)
                add_circular(track, (start + offset + .5) * beat, answer)
        chord = theme["root"] + theme["harmony"][section % 4]
        # Small, low marimba pulses instead of drums; remain below speech.
        for off in (0, 4):
            add_circular(track, (start + off) * beat, tone(chord - 12, 1.2, "bass", .105))
        for off, interval in ((1, 7), (3, 12), (5, 7), (7, 12)):
            add_circular(track, (start + off) * beat, tone(chord + interval, .75, "pluck", .040))
    # A tiny room echo is circular too, so a repeat carries the same musical tail.
    track = track + .11 * np.roll(track, round(.112 * SR)) + .05 * np.roll(track, round(.229 * SR))
    track -= track.mean()
    # A 12 ms raised-cosine seam brings both exact boundary samples to zero.
    # It is short enough to preserve the musical beat while preventing clicks.
    seam = round(.012 * SR)
    ramp = np.sin(np.linspace(0, math.pi / 2, seam)) ** 2
    track[:seam] *= ramp
    track[-seam:] *= ramp[::-1]
    peak = np.max(np.abs(track))
    track *= .36 / peak
    samples = np.rint(track * 32767).astype("<i2")
    path = OUTPUT / theme["file"]
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SR)
        wav.writeframes(samples.tobytes())
    return {
        "title": theme["title"], "filename": path.name, "url": "/audio/" + path.name,
        "bpm": theme["bpm"], "leadTimbre": theme["lead"], "bars": 16,
        "frames": len(samples), "durationMs": round(len(samples) / SR * 1000, 3),
        "sampleRate": SR, "channels": 1, "bitsPerSample": 16,
        "peak": round(float(np.max(np.abs(samples.astype(np.float64)))) / 32768, 6),
        "rms": round(float(np.sqrt(np.mean((samples.astype(np.float64) / 32768) ** 2))), 6),
        "nonSilentSamples": int(np.count_nonzero(np.abs(samples.astype(np.int32)) > 10)),
        "clippedSamples": int(np.count_nonzero(np.abs(samples.astype(np.int32)) >= 32767)),
        "boundaryJump": round(abs(int(samples[0]) - int(samples[-1])) / 32768, 6),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def main():
    OUTPUT.mkdir(exist_ok=True)
    files = {key: compose(theme) for key, theme in THEMES.items()}
    assert len(set(item["sha256"] for item in files.values())) == 8
    assert all(item["nonSilentSamples"] > 100 and not item["clippedSamples"] for item in files.values())
    assert all(item["boundaryJump"] < .005 for item in files.values())
    report = {
        "provenance": "Original melodies and accompaniment authored specifically for English Island; deterministic sine-partial PCM synthesis; no copyrighted songs, downloaded music, audio samples, or child recordings.",
        "manualListeningPerformed": False,
        "loopMethod": "16 bars; notes and echo tails wrap circularly; exact PCM length; 12 ms raised-cosine seam fades bring boundary samples to zero.",
        "files": files,
    }
    (ROOT / "music-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUTPUT / "music-themes.json").write_text(json.dumps({
        "music": "/audio/music-loop.wav",
        "musicThemes": {key: item["url"] for key, item in files.items()},
        "durationsMs": {item["url"]: item["durationMs"] for item in files.values()},
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    for key, item in files.items():
        print(f"{key}: {item['filename']} {item['durationMs']}ms peak={item['peak']} boundary={item['boundaryJump']}")


if __name__ == "__main__":
    main()
