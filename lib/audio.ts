"use client";

import { Howl, Howler } from "howler";
import manifest from "@/lib/audio-manifest.json";
import { beginSpeechCaption, clearSpeechCaption, updateSpeechCaption } from "@/lib/speech-caption";

export type SpeechLanguage = "en" | "zh";
export type AudioEffect = "correct" | "retry" | "reward";
export type AudioSettings = { music: boolean; volume: number };
export type MusicTheme = keyof typeof manifest.musicThemes;

const speechManifest = manifest.speech as Record<SpeechLanguage, Record<string, string>>;
// Cached desktop voices must not mask a newly published natural-voice set.
const assetSource = (source: string) => `${source}?v=${manifest.assetRevision}`;
const cache = new Map<string, Howl>();
let settings: AudioSettings = { music: true, volume: 0.7 };
let background: Howl | undefined;
let musicTheme: MusicTheme = "world";
let unlocked = false;
let ducked = false;
let request = 0;
let visibilityBound = false;
let foreground: { sound: Howl; cancel: () => void } | undefined;
const adventureSounds = new Map<AudioEffect, Howl>();
let lastAdventureEffect = 0;
let adventureEatSound: Howl | undefined;
const adventureEatVoices: number[] = [];
const eatVolume = () => settings.volume * 0.36;

function assertBrowser() {
  if (typeof window === "undefined") throw new Error("声音需要在浏览器中播放。");
}

function musicVolume() {
  return settings.volume * (ducked ? 0.035 : 0.16);
}

function updateMusic() {
  if (!background) return;
  background.volume(musicVolume());
  if (!settings.music || !unlocked || document.hidden) {
    background.pause();
  } else if (background.state() === "unloaded") {
    background.load();
  } else if (background.state() === "loaded" && !background.playing()) {
    background.play();
  }
}

function getSound(source: string) {
  const existing = cache.get(source);
  if (existing) {
    // Refresh insertion order so recently used lesson audio remains cached.
    cache.delete(source);
    cache.set(source, existing);
    return existing;
  }
  const sound = new Howl({ src: [assetSource(source)], format: ["wav"], preload: false, volume: settings.volume });
  cache.set(source, sound);
  // Load only the requested manifest clip rather than downloading the whole course.
  if (cache.size > 40) {
    for (const [oldSource, oldSound] of cache) {
      if (oldSound === foreground?.sound || oldSound === sound) continue;
      oldSound.unload();
      cache.delete(oldSource);
      break;
    }
  }
  return sound;
}

export function setMusicTheme(theme: MusicTheme): void {
  if (theme === musicTheme) return;
  musicTheme = theme;
  background?.unload(); background = undefined;
  if (typeof window !== "undefined") { ensureMusic(); updateMusic(); }
}

function ensureMusic() {
  if (background) return;
  const sound = new Howl({ src: [assetSource(manifest.musicThemes[musicTheme])], format: ["wav"], loop: true, preload: false, volume: musicVolume(), onload: () => { if (background === sound) updateMusic(); } });
  background = sound;
}

/** A map tap, directional control or speaker tap unlocks iOS audio. */
export async function unlockAudio(): Promise<void> {
  assertBrowser();
  const unlockRequest = request;
  Howler.autoUnlock = true;
  ensureMusic();
  if (Howler.ctx && Howler.ctx.state !== "running") {
    try {
      await Howler.ctx.resume();
    } catch {
      throw new Error("声音还没有开启，请再点一次开始或小喇叭。");
    }
    if (String(Howler.ctx.state) !== "running") {
      throw new Error("声音还没有开启，请再点一次开始或小喇叭。");
    }
  }
  if (request !== unlockRequest) return;
  unlocked = true;
  if (!visibilityBound) {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopAllAudio();
    });
    window.addEventListener("pagehide", stopAllAudio);
    window.addEventListener("native-background", stopAllAudio);
    visibilityBound = true;
  }
  updateMusic();
}

async function playCue(source: string, englishText?: string): Promise<void> {
  assertBrowser();
  const thisRequest = ++request;
  foreground?.cancel();
  if (englishText) beginSpeechCaption(thisRequest, englishText);
  else clearSpeechCaption();
  try { await unlockAudio(); }
  catch (error) { updateSpeechCaption(thisRequest, "error"); throw error; }
  if (request !== thisRequest) return;
  const sound = getSound(source);
  return new Promise<void>((resolve, reject) => {
    let id: number | undefined;
    let settled = false;
    const active = { sound, cancel: () => finish() };

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      updateSpeechCaption(thisRequest, error ? "error" : "ended");
      clearTimeout(timer);
      sound.off("load", start);
      sound.off("loaderror", loadError);
      sound.off("playerror", playError);
      sound.off("end", ended);
      if (id !== undefined) sound.stop(id);
      if (foreground === active) {
        foreground = undefined;
        ducked = false;
        updateMusic();
      }
      if (error) reject(error);
      else resolve();
    }

    function start() {
      if (settled || request !== thisRequest) { finish(); return; }
      sound.volume(settings.volume);
      ducked = true;
      updateMusic();
      id = sound.play();
      if (!settled) updateSpeechCaption(thisRequest, "playing");
    }
    function loadError() {
      // A subsequent click gets a fresh Howl and genuinely retries the network load.
      cache.delete(source);
      finish(new Error("声音加载失败，请检查网络后点击小喇叭重试。"));
      sound.unload();
    }
    function playError() {
      finish(new Error("声音没有播放成功，请点击小喇叭重试。"));
    }
    function ended() { finish(); }

    foreground = active;
    sound.once("loaderror", loadError);
    sound.once("playerror", playError);
    sound.once("end", ended);
    const timer = setTimeout(() => finish(new Error("声音等待时间太长，请点击小喇叭重试。")), 20000);
    if (sound.state() === "loaded") start();
    else {
      sound.once("load", start);
      if (sound.state() !== "loading") sound.load();
    }
  });
}

/** Exact-text lookup: all teaching audio is fixed, bundled local synthesis. */
export async function playSpeech(text: string, language: SpeechLanguage = "en", options: { caption?: boolean } = {}): Promise<void> {
  const source = speechManifest[language][text];
  if (!source) throw new Error(`这句话的声音还没有准备好：${text}`);
  await playCue(source, language === "en" && options.caption !== false ? text : undefined);
}

export async function playEffect(effect: AudioEffect): Promise<void> {
  await playCue(manifest.effects[effect]);
}

/** Snack feedback has its own channel, so eating never cuts off an English sentence. */
export function playAdventureEffect(effect: AudioEffect): void {
  if (!unlocked || typeof document === "undefined" || document.hidden || Date.now() - lastAdventureEffect < 160) return;
  lastAdventureEffect = Date.now();
  let sound = adventureSounds.get(effect);
  if (!sound) {
    sound = new Howl({ src: [assetSource(manifest.effects[effect])], volume: settings.volume * 0.22 });
    adventureSounds.set(effect, sound);
  }
  sound.volume(settings.volume * 0.22);
  sound.play();
}

/** Each bite plays independently of narration and the teaching-effect throttle. */
export function playAdventureEat(): void {
  if (!unlocked || typeof document === "undefined" || document.hidden || settings.volume === 0) return;
  if (!adventureEatSound) {
    const release = (id: number) => {
      const index = adventureEatVoices.indexOf(id);
      if (index !== -1) adventureEatVoices.splice(index, 1);
    };
    const sound = new Howl({
      src: [assetSource(manifest.effects.eat)], format: ["wav"], pool: 4, volume: eatVolume(),
      onend: release, onstop: release, onplayerror: release,
      onloaderror: () => {
        if (adventureEatSound !== sound) return;
        sound.unload(); adventureEatSound = undefined; adventureEatVoices.length = 0;
      },
    });
    adventureEatSound = sound;
  }
  const sound = adventureEatSound;
  // Howler's pool controls retained idle voices, so enforce the active cap here.
  while (adventureEatVoices.length >= 4) sound.stop(adventureEatVoices.shift()!);
  sound.volume(eatVolume());
  adventureEatVoices.push(sound.play());
}

export function setAudioSettings(next: AudioSettings): void {
  settings = {
    music: next.music,
    volume: Math.max(0, Math.min(1, Number.isFinite(next.volume) ? next.volume : 0.7)),
  };
  foreground?.sound.volume(settings.volume);
  for (const sound of adventureSounds.values()) sound.volume(settings.volume * 0.22);
  adventureEatSound?.volume(eatVolume());
  if (typeof document !== "undefined") updateMusic();
}

/** Used on navigation and recording, so microphone input excludes teaching audio. */
export function stopAllAudio(): void {
  unlocked = false;
  stopSpeech();
  background?.stop();
  for (const sound of adventureSounds.values()) sound.stop();
  // Unload also clears bites queued during a slow initial download.
  adventureEatSound?.stop(); adventureEatSound?.unload(); adventureEatSound = undefined;
  adventureEatVoices.length = 0;
}

/** Question transitions cancel narration while the destination melody keeps playing. */
export function stopSpeech(): void {
  ++request;
  foreground?.cancel();
  foreground = undefined;
  ducked = false;
  clearSpeechCaption();
}

/** Optional preload for the next exercise; failures are retried by playSpeech. */
export function preloadSpeech(text: string, language: SpeechLanguage = "en"): void {
  if (typeof window === "undefined") return;
  const source = speechManifest[language][text];
  if (!source) return;
  const sound = getSound(source);
  if (sound.state() === "unloaded") sound.load();
}

