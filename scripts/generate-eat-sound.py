"""Generate the original short, soft crunch/chomp effect using only PCM synthesis."""

import math
from pathlib import Path
import random
import struct
import wave


SAMPLE_RATE = 22050
DURATION_SECONDS = 0.160
OUTPUT = Path(__file__).resolve().parents[1] / "public/audio/effects/eat.wav"


def generate_samples() -> list[int]:
    rng = random.Random(20261005)
    filtered_noise = 0.0
    samples = []
    count = round(SAMPLE_RATE * DURATION_SECONDS)
    for index in range(count):
        time = index / SAMPLE_RATE
        white_noise = rng.uniform(-1.0, 1.0)
        filtered_noise += 0.30 * (white_noise - filtered_noise)
        crunch = white_noise - filtered_noise
        value = 0.0
        # Two tiny jaw contacts give the bite texture without a reward-like ding.
        for start, level in ((0.006, 1.0), (0.066, 0.70)):
            age = time - start
            if age < 0:
                continue
            attack = min(1.0, age / 0.003)
            envelope = attack * math.exp(-age / 0.018)
            phase = 2.0 * math.pi * (230.0 * age - 420.0 * age * age)
            jaw = math.sin(phase) + 0.20 * math.sin(phase * 2.7)
            value += level * envelope * (0.28 * jaw + 0.24 * filtered_noise + 0.11 * crunch)
        fade = min(1.0, time / 0.004, (DURATION_SECONDS - time) / 0.014)
        samples.append(round(max(-0.65, min(0.65, value * fade)) * 32767))
    # Exact zero endpoints avoid a click at either PCM boundary.
    samples[0] = samples[-1] = 0
    return samples


def main() -> None:
    samples = generate_samples()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUTPUT), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(struct.pack(f"<{len(samples)}h", *samples))
    print(f"Generated {OUTPUT}: {len(samples) / SAMPLE_RATE * 1000:.0f} ms, original mono PCM.")


if __name__ == "__main__":
    main()
