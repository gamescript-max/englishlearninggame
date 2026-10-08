import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import manifest from "../lib/audio-manifest.json";
import { sharkLetters, sharkSpeech, sharkWelcomeGuide } from "../lib/shark-content";

function speechWav(url: string): { durationMs: number; audibleSamples: number } {
  assert.match(url, /^\/audio\/[^/]+\.wav$/);
  const wav = readFileSync(new URL(`../public${url}`, import.meta.url));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt32LE(4) + 8, wav.length, `${url} RIFF file is complete`);
  let format: Buffer | undefined, samples: Buffer | undefined;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const name = wav.toString("ascii", offset, offset + 4), length = wav.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + length <= wav.length, `${url} has no truncated chunk`);
    if (name === "fmt ") format = wav.subarray(offset + 8, offset + 8 + length);
    if (name === "data") samples = wav.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length + (length % 2);
  }
  assert.ok(format && samples, `${url} has format and audio chunks`);
  assert.equal(format.readUInt16LE(0), 1, "uncompressed PCM");
  assert.equal(format.readUInt16LE(2), 1, "mono teaching voice");
  assert.equal(format.readUInt32LE(4), 22050);
  assert.equal(format.readUInt16LE(14), 16);
  assert.equal(samples.length % 2, 0);
  assert.ok(samples.length > 22050 / 5 * 2, `${url} is a real utterance`);
  let audibleSamples = 0, clippedSamples = 0;
  for (let offset = 0; offset + 2 <= samples.length; offset += 2) {
    const value = Math.abs(samples.readInt16LE(offset));
    if (value > 10) audibleSamples++;
    if (value >= 32767) clippedSamples++;
  }
  assert.ok(audibleSamples > 100, `${url} contains an audible voice`);
  assert.equal(clippedSamples, 0, `${url} does not clip`);
  return { durationMs: samples.length / format.readUInt32LE(8) * 1000, audibleSamples };
}
test("both packaged manifests exactly agree and every authored shark speech key has a real PCM asset", () => {
  const packaged = JSON.parse(readFileSync(new URL("../public/audio/manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(packaged, manifest);
  const durations = manifest.durationsMs as Record<string, number>;
  for (const language of ["en", "zh"] as const) {
    const speech = manifest.speech[language] as Record<string, string>;
    assert.equal(new Set(sharkSpeech[language]).size, sharkSpeech[language].length);
    for (const text of sharkSpeech[language]) {
      const url = speech[text];
      assert.ok(url, `missing exact ${language} teaching text: ${text}`);
      const wav = speechWav(url);
      assert.ok(durations[url] > 200 && durations[url] < 30000, `${text} has a usable declared duration`);
      assert.ok(Math.abs(wav.durationMs - durations[url]) <= .002, `${text} PCM duration matches the manifest`);
    }
  }
});
test("all uppercase letters have standalone audio and the short Chinese welcome stays under seven seconds", () => {
  const speech = manifest.speech.en as Record<string, string>;
  const urls = sharkLetters.map(letter => speech[letter.speech]);
  assert.equal(urls.length, 26);
  assert.ok(urls.every(Boolean));
  assert.equal(new Set(urls).size, 26, "letters use separate authored clips");
  const welcome = (manifest.speech.zh as Record<string, string>)[sharkWelcomeGuide];
  assert.ok(welcome);
  const durations = manifest.durationsMs as Record<string, number>;
  assert.ok(durations[welcome] > 0 && durations[welcome] < 7000);
});
