import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import manifest from "../lib/audio-manifest.json";

type Callback = (...args: unknown[]) => void;
type HowlOptions = { src: string[]; volume: number; pool?: number; [key: string]: unknown };
const audioSource = ts.transpileModule(readFileSync(new URL("../lib/audio.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

/** Exercise the actual audio module with deterministic Howler and browser events. */
function audioHost(holdEatLoading = false) {
  const sounds: MockHowl[] = [], captions: unknown[][] = [], timers = new Map<number, Callback>();
  const browserEvents = new Map<string, Callback>();
  let nextVoice = 0, nextTimer = 0;
  class MockHowl {
    voices = new Set<number>();
    playIds: number[] = [];
    stopped: (number | undefined)[] = [];
    unloadCount = 0;
    currentVolume: number;
    currentState = "loaded";
    listeners = new Map<string, Set<Callback>>();
    constructor(readonly options: HowlOptions) {
      this.currentVolume = options.volume;
      if (holdEatLoading && options.src[0].startsWith(manifest.effects.eat)) this.currentState = "loading";
      sounds.push(this);
    }
    state() { return this.currentState; }
    volume(value: number) { this.currentVolume = value; return this; }
    playing(id?: number) { return id === undefined ? this.voices.size > 0 : this.voices.has(id); }
    play() { const id = ++nextVoice; this.voices.add(id); this.playIds.push(id); return id; }
    stop(id?: number) {
      this.stopped.push(id);
      const ids = id === undefined ? [...this.voices] : [id];
      for (const stoppedId of ids) { this.voices.delete(stoppedId); this.emit("stop", stoppedId); }
      return this;
    }
    pause() { return this; }
    unload() { this.unloadCount++; this.currentState = "unloaded"; this.voices.clear(); return this; }
    load() { this.currentState = "loaded"; this.emit("load"); return this; }
    once(event: string, callback: Callback) {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event)!.add(callback); return this;
    }
    off(event: string, callback: Callback) {
      this.listeners.get(event)?.delete(callback); return this;
    }
    emit(event: string, id?: number) {
      if (event === "end" || event === "playerror") this.voices.delete(id!);
      const configured = this.options[`on${event}`] as Callback | undefined;
      configured?.(id);
      for (const callback of [...(this.listeners.get(event) ?? [])]) { this.off(event, callback); callback(id); }
    }
  }
  const document = { hidden: false, addEventListener(name: string, callback: Callback) { browserEvents.set(name, callback); } };
  const window = { addEventListener(name: string, callback: Callback) { browserEvents.set(name, callback); } };
  const exports = {} as typeof import("../lib/audio");
  vm.runInNewContext(audioSource, {
    exports, document, window,
    Date: class extends Date { static now() { return 1000; } },
    setTimeout(callback: Callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    require(id: string) {
      if (id === "howler") return { Howl: MockHowl, Howler: { ctx: { state: "running" }, autoUnlock: false } };
      if (id === "@/lib/audio-manifest.json") return { default: manifest };
      if (id === "@/lib/speech-caption") return {
        beginSpeechCaption: (...args: unknown[]) => captions.push(["begin", ...args]),
        updateSpeechCaption: (...args: unknown[]) => captions.push(["update", ...args]),
        clearSpeechCaption: () => captions.push(["clear"]),
      };
      throw new Error(`Unexpected audio dependency: ${id}`);
    },
  });
  return {
    audio: exports, sounds, captions, document, browserEvents,
    eatSound: () => sounds.findLast(sound => sound.options.src[0].startsWith(manifest.effects.eat)),
    async flush() { await Promise.resolve(); await Promise.resolve(); },
  };
}

test("rapid bites play every time, cap active voices at four, and leave English playing", async () => {
  const host = audioHost();
  const sentence = host.audio.playSpeech("cat"); await host.flush();
  const speech = host.sounds.find(sound => sound.options.src[0].startsWith(manifest.speech.en.cat))!;
  assert.equal(speech.playIds.length, 1);
  const originalCaptions = host.captions.map(entry => [...entry]);
  host.audio.playAdventureEffect("correct");
  for (let bite = 0; bite < 9; bite++) {
    host.audio.playAdventureEat();
    assert.ok(host.eatSound()!.voices.size <= 4);
  }
  const eat = host.eatSound()!;
  assert.equal(eat.playIds.length, 9, "bites at the same clock instant must not be throttled");
  assert.equal(eat.stopped.length, 5, "only the oldest bites are replaced at the polyphony cap");
  assert.equal(speech.stopped.length, 0);
  assert.ok(speech.playing());
  assert.deepEqual(host.captions, originalCaptions, "bites leave the spoken English caption alone");
  speech.emit("end", speech.playIds[0]); await sentence;
});

test("completed or failed bites free their voices; volume updates and mute apply immediately", async () => {
  const host = audioHost(); await host.audio.unlockAudio();
  for (let bite = 0; bite < 4; bite++) host.audio.playAdventureEat();
  const eat = host.eatSound()!;
  eat.emit("end", eat.playIds[0]); eat.emit("playerror", eat.playIds[1]);
  host.audio.playAdventureEat(); host.audio.playAdventureEat();
  assert.equal(eat.stopped.length, 0, "released voices must not evict still-playing bites");
  host.audio.setAudioSettings({ music: false, volume: 0.5 });
  assert.ok(Math.abs(eat.currentVolume - 0.18) < 1e-12);
  host.audio.setAudioSettings({ music: false, volume: 0 });
  assert.equal(eat.currentVolume, 0);
  host.audio.playAdventureEat(); assert.equal(eat.playIds.length, 6);
  host.audio.setAudioSettings({ music: false, volume: 1 }); host.audio.playAdventureEat();
  assert.equal(eat.playIds.length, 7, "disabling background music does not mute bite effects");
});

test("locked or hidden pages stay quiet and stopAllAudio clears pending bites before re-entry", async () => {
  const host = audioHost(true);
  host.audio.playAdventureEat(); assert.equal(host.eatSound(), undefined);
  await host.audio.unlockAudio();
  host.document.hidden = true; host.audio.playAdventureEat(); assert.equal(host.eatSound(), undefined);
  host.document.hidden = false; host.audio.playAdventureEat();
  const pending = host.eatSound()!; assert.equal(pending.state(), "loading");
  host.audio.stopAllAudio(); assert.equal(pending.voices.size, 0); assert.equal(pending.unloadCount, 1);
  host.audio.playAdventureEat(); assert.equal(pending.playIds.length, 1, "stopping locks effects until a new gesture");
  await host.audio.unlockAudio(); host.audio.playAdventureEat();
  assert.notEqual(host.eatSound(), pending, "a queued bite cannot survive into the next visit");
  host.document.hidden = true; host.browserEvents.get("visibilitychange")!();
  assert.equal(host.eatSound()!.voices.size, 0);
});

test("a failed bite download releases queued voices and the next bite retries the asset", async () => {
  const host = audioHost(true); await host.audio.unlockAudio(); host.audio.playAdventureEat();
  const failed = host.eatSound()!; failed.emit("loaderror");
  assert.equal(failed.unloadCount, 1); assert.equal(failed.voices.size, 0);
  host.audio.playAdventureEat(); assert.notEqual(host.eatSound(), failed);
  assert.equal(host.eatSound()!.playIds.length, 1);
});

test("original bite WAV is a short, non-silent, unclipped PCM effect with smooth boundaries", () => {
  const wav = readFileSync(new URL(`../public${manifest.effects.eat}`, import.meta.url));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF"); assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt16LE(20), 1); assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt16LE(34), 16); assert.equal(wav.readUInt32LE(24), 22050);
  const duration = wav.readUInt32LE(40) / wav.readUInt32LE(28) * 1000;
  const durations = manifest.durationsMs as Record<string, number>;
  assert.equal(duration, durations[manifest.effects.eat]); assert.ok(duration >= 120 && duration <= 180);
  const pcm = Array.from({ length: wav.readUInt32LE(40) / 2 }, (_, index) => wav.readInt16LE(44 + index * 2));
  assert.equal(pcm[0], 0); assert.equal(pcm.at(-1), 0);
  assert.ok(Math.max(...pcm.map(Math.abs)) < 32767, "the effect does not clip");
  const rms = Math.sqrt(pcm.reduce((sum, value) => sum + value * value, 0) / pcm.length) / 32768;
  assert.ok(rms > 0.025 && rms < 0.2, "the effect has audible but gentle energy");
});
