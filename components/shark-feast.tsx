"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Maximize2, Minimize2, Pause, Play, Settings2, Volume2 } from "lucide-react";
import type { Progress } from "@/lib/progress";
import { createAdventureFullscreen } from "@/lib/adventure-fullscreen";
import { playAdventureEat, playSpeech, stopAllAudio, unlockAudio } from "@/lib/audio";
import { getSharkToken, sharkGuides, sharkStages, stageForShark, type SharkToken } from "@/lib/shark-content";
import { createSharkWorld, ensureSharkViewport, sharkCamera, sharkDistance, sharkScreenToWorld, sharkWorldToScreen, stepSharkWorld, type SharkControl, type SharkPickup, type SharkPoint } from "@/lib/shark-engine";
import { recordSharkListen, recordSharkPickup, recordSharkTime, sharkTotal } from "@/lib/shark-progress";
import { paintSharkWorld, type SharkFoodLabelRect } from "./shark-renderer";
import "./shark-feast.css";

type Commit = (next: Progress | ((progress: Progress) => Progress)) => Progress;
type SharkFeastProps = { progress: Progress; commit: Commit; onBack: () => void; onSettings: () => void; suspended?: boolean; storageError?: string; onRetryStorage?: () => void; onBackup?: () => void };
type SpeechItem = { tokenId?: string; guide?: string };
const directionKeys: Record<string, SharkPoint> = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
};

/** An original, friendly shark illustration, shared by the home entry and pause card. */
export function SharkFeastArt({ className = "" }: { className?: string }) {
  return <svg className={`shark-feast-art ${className}`} viewBox="0 0 230 170" aria-hidden="true">
    <circle cx="191" cy="36" r="22" fill="#ebd3fa"/><ellipse cx="191" cy="36" rx="31" ry="9" fill="none" stroke="#c594e5" strokeWidth="4" transform="rotate(-22 191 36)"/><circle cx="185" cy="29" r="4" fill="#fff4ff"/>
    <path d="m27 80-20-29 7 46-7 38 28-24" fill="#3b95bb" stroke="#216a91" strokeWidth="4" strokeLinejoin="round"/>
    <path d="M34 77Q62 43 94 58L103 25Q126 42 130 65Q174 67 197 100Q176 132 103 131Q65 132 34 108Z" fill="#53c4db" stroke="#216a91" strokeWidth="4" strokeLinejoin="round"/>
    <path d="M45 108Q94 95 149 108Q174 110 187 103Q178 127 105 129Q65 130 45 108" fill="#ddf7f6"/>
    <path d="m89 119 30 31 10-27" fill="#41a8cb" stroke="#216a91" strokeWidth="4" strokeLinejoin="round"/>
    <circle cx="160" cy="86" r="11" fill="white"/><circle cx="164" cy="86" r="6" fill="#244b68"/><circle cx="166" cy="83" r="2" fill="white"/>
    <path d="M168 108q12 8 24-5" fill="none" stroke="#244b68" strokeWidth="4" strokeLinecap="round"/><path d="m175 111 4 6 3-6" fill="white"/><path d="M120 88q-6 9-2 17m-9-19q-6 9-2 17" fill="none" stroke="#2c91b2" strokeWidth="3" strokeLinecap="round"/>
    <circle cx="196" cy="137" r="5" fill="#a7e9ec"/><circle cx="207" cy="122" r="3" fill="#a7e9ec"/>
    <g fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="19" textAnchor="middle"><circle cx="40" cy="33" r="16" fill="#ffe3aa"/><text x="40" y="40" fill="#88601e">A</text><circle cx="73" cy="19" r="14" fill="#ffd2d5"/><text x="73" y="26" fill="#a04c59">B</text><circle cx="17" cy="151" r="13" fill="#d1edbf"/><text x="17" y="158" fill="#4c7742">C</text></g>
  </svg>;
}

export function SharkFeastEntry({ progress, ready = true, onOpen }: { progress: Progress; ready?: boolean; onOpen: () => void }) {
  const total = sharkTotal(progress.shark);
  const stage = stageForShark(total);
  return <button className="shark-feast-entry" disabled={!ready} onClick={onOpen} aria-label="打开鲨鱼英语大餐">
    <SharkFeastArt/><span className="shark-entry-copy"><small>自由游 · 听英语</small><strong>鲨鱼英语大餐</strong><span>{total ? `${stage.title} · 继续长大` : "从小鱼，一路吃到宇宙"}</span></span><span className="shark-entry-go"><Play size={19} fill="currentColor"/>出发</span>
  </button>;
}

export function SharkFeastReport({ progress }: { progress: Progress }) {
  const state = progress.shark, total = sharkTotal(state);
  return <section className="shark-feast-report" aria-label="鲨鱼英语接触记录">
    <div><strong>鲨鱼英语大餐</strong><span>{stageForShark(total).title}</span></div>
    <dl><div><dt>字母接触</dt><dd>{state.letters}</dd></div><div><dt>单词接触</dt><dd>{state.words}</dd></div><div><dt>句子接触</dt><dd>{state.sentences}</dd></div><div><dt>完整听读</dt><dd>{state.listenCount}</dd></div><div><dt>接触内容</dt><dd>{state.learned.length}<small> 种</small></dd></div><div><dt>游玩时间</dt><dd>{Math.floor(state.totalSeconds / 60)}<small> 分</small></dd></div></dl>
    <p>这是收集和重复听读的接触记录，不是 A1 测试，也不代表已经掌握。收集记录与完整听读分别统计；可以重听最近吃到的英语。</p>
  </section>;
}

/** The canvas owns frame-by-frame motion; React only updates the learning HUD. */
export function SharkFeast({ progress, commit, onBack, onSettings, suspended = false, storageError = "", onRetryStorage, onBackup }: SharkFeastProps) {
  const [initialWorld] = useState(() => createSharkWorld(progress.shark));
  const world = useRef(initialWorld), props = useRef({ progress, commit });
  const localSnapshots = useRef(new WeakSet([progress.shark]));
  const canvas = useRef<HTMLCanvasElement>(null), scene = useRef<HTMLDivElement>(null);
  const control = useRef<SharkControl>({ moving: false }), heldKeys = useRef(new Set<string>()), pointer = useRef<number | null>(null);
  const followingFood = useRef<string | null>(null), dragStart = useRef<SharkPoint | null>(null);
  const frame = useRef<number | null>(null), lastFrame = useRef(0), savedElapsed = useRef(0), lastHud = useRef(0);
  const size = useRef({ width: 900, height: 600, dpr: 1 }), reducedMotion = useRef(false);
  const hudRects = useRef<{ x: number; y: number; w: number; h: number }[]>([]);
  const foodLabels = useRef<SharkFoodLabelRect[]>([]);
  const mounted = useRef(true), leaving = useRef(false), conflict = useRef(false), paused = useRef(false), active = useRef(false);
  const gates = useRef({ suspended }), fullscreen = useRef<ReturnType<typeof createAdventureFullscreen> | null>(null);
  const startFrame = useRef<() => void>(() => {}), paintFrame = useRef<() => void>(() => {});
  const speechGeneration = useRef(0), speechRunning = useRef(false), speechQueue = useRef<SpeechItem[]>([]);
  const currentSpeech = useRef<SpeechItem | null>(null), pausedSpeech = useRef<SpeechItem[]>([]);
  const replayInFlight = useRef(false);
  const guideUsed = useRef(progress.shark.lastAt !== 0), lastEaten = useRef<string | null>(null), failedSpeech = useRef<SpeechItem | null>(null);
  const [started, setStarted] = useState(false), [isPaused, setPaused] = useState(false), [expanded, setExpanded] = useState(true);
  const [hasConflict, setConflict] = useState(false);
  const [hud, setHud] = useState({ total: sharkTotal(progress.shark), seconds: progress.shark.totalSeconds, now: 0 });
  const [eatenId, setEatenId] = useState<string | null>(null), [readingId, setReadingId] = useState<string | null>(null);
  const [isReading, setReading] = useState(false), [audioError, setAudioError] = useState("");
  const [recent, setRecent] = useState<{ ids: string[]; until: number }>({ ids: [], until: 0 });
  const [notice, setNotice] = useState("");

  function canInteract() { return mounted.current && !leaving.current && !conflict.current && !gates.current.suspended && !document.hidden; }
  function cancelNarration(preserve = false) {
    if (preserve) pausedSpeech.current = [currentSpeech.current, failedSpeech.current, ...speechQueue.current].filter((item): item is SpeechItem => !!item?.tokenId);
    else pausedSpeech.current = [];
    speechGeneration.current++; speechQueue.current = []; speechRunning.current = false; currentSpeech.current = null; replayInFlight.current = false;
    stopAllAudio();
    if (mounted.current) { setReading(false); setReadingId(null); }
  }
  function stopFrames() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null; lastFrame.current = 0;
  }
  function freezeConflict() {
    if (conflict.current) return;
    conflict.current = true; paused.current = true; active.current = false; control.current.moving = false;
    stopFrames(); cancelNarration();
    if (mounted.current) { setConflict(true); setPaused(true); setNotice("记录已在别处更新。返回地图，再继续游吧。"); }
  }
  function update(mutate: (current: Progress) => Progress) {
    const expected = props.current.progress.shark;
    let applied = false;
    const next = props.current.commit(current => {
      if (current.shark !== expected) return current;
      applied = true; return mutate(current);
    });
    if (!applied) { freezeConflict(); return next; }
    props.current.progress = next; localSnapshots.current.add(next.shark);
    return next;
  }
  function saveTime() {
    if (conflict.current) return;
    const seconds = Math.min(15, Math.floor(world.current.elapsed - savedElapsed.current));
    if (!seconds) return;
    update(current => ({ ...current, shark: recordSharkTime(current.shark, seconds) }));
    if (!conflict.current) savedElapsed.current += seconds;
  }
  function pause(reason = "休息一下，准备好后继续游。") {
    if (leaving.current || paused.current) return;
    saveTime(); paused.current = true; active.current = false; control.current.moving = false; heldKeys.current.clear(); pointer.current = null; followingFood.current = null; dragStart.current = null;
    stopFrames(); cancelNarration(true);
    if (mounted.current) { setPaused(true); setNotice(reason); }
  }

  async function drainSpeech() {
    if (speechRunning.current || !canInteract() || paused.current || !active.current) return;
    speechRunning.current = true;
    const generation = speechGeneration.current;
    const live = () => generation === speechGeneration.current && canInteract() && !paused.current && active.current;
    while (speechQueue.current.length && live()) {
      const item = speechQueue.current.shift()!;
      const token = item.tokenId ? getSharkToken(item.tokenId) : undefined;
      if (!token && !item.guide) continue;
      currentSpeech.current = item;
      setReading(true); setReadingId(token?.id ?? null);
      try {
        await playSpeech(token?.speech ?? item.guide!, token ? "en" : "zh");
        if (!live()) return;
        if (token) update(current => ({ ...current, shark: recordSharkListen(current.shark, token.id) }));
        if (!live()) return;
        failedSpeech.current = null; currentSpeech.current = null; setAudioError("");
      } catch (error) {
        if (!live()) return;
        failedSpeech.current = item; currentSpeech.current = null;
        setAudioError(error instanceof Error ? error.message : "声音暂时没有播出来，点小喇叭重试。");
        // Keep swimming and records intact. A failed download must not retry every bite.
        speechRunning.current = false; setReading(false); setReadingId(null);
        return;
      }
    }
    if (live()) { speechRunning.current = false; setReading(false); setReadingId(null); }
  }
  function enqueue(item: SpeechItem, retry = false) {
    if (!canInteract() || paused.current || !active.current || (failedSpeech.current && !retry)) return;
    if (retry) { failedSpeech.current = null; setAudioError(""); }
    // The simulation waits to collect another snack when three voices are pending.
    // A frame can contain a short burst, and every successful pickup stays in order.
    speechQueue.current.push(item);
    void drainSpeech();
  }
  function startSwimming() {
    if (!canInteract() || paused.current) return false;
    if (!active.current) {
      active.current = true; setStarted(true); startFrame.current();
      const generation = speechGeneration.current;
      void unlockAudio().catch(error => {
        if (generation === speechGeneration.current && canInteract() && !paused.current) setAudioError(error instanceof Error ? error.message : "点小喇叭开启声音。");
      });
      if (!guideUsed.current) { guideUsed.current = true; enqueue({ guide: sharkGuides.welcome }); }
    }
    fullscreen.current?.requestNative();
    return true;
  }
  function swimDirection(direction: SharkPoint) {
    if (!startSwimming()) return;
    followingFood.current = null;
    control.current = { moving: true, direction };
  }
  function resume() {
    if (!canInteract()) return;
    paused.current = false; active.current = true; setPaused(false); setStarted(true); setNotice("");
    control.current = { moving: true, direction: { x: Math.cos(world.current.player.angle), y: Math.sin(world.current.player.angle) } };
    speechQueue.current = pausedSpeech.current.splice(0); failedSpeech.current = null;
    if (!guideUsed.current) { guideUsed.current = true; speechQueue.current.unshift({ guide: sharkGuides.welcome }); }
    startFrame.current(); fullscreen.current?.requestNative();
    const generation = speechGeneration.current;
    void unlockAudio().then(() => {
      if (generation !== speechGeneration.current || !canInteract() || paused.current) return;
      void drainSpeech();
    }).catch(error => {
      if (generation === speechGeneration.current && canInteract() && !paused.current) setAudioError(error instanceof Error ? error.message : "点小喇叭开启声音。");
    });
  }
  async function replay(chosenId?: string) {
    if (!canInteract() || paused.current || replayInFlight.current) return;
    const failed = failedSpeech.current;
    const id = chosenId ?? failed?.tokenId ?? readingId ?? lastEaten.current;
    if (!failed && speechQueue.current.length >= 3) return;
    replayInFlight.current = true;
    const generation = speechGeneration.current;
    try {
      await unlockAudio();
      if (generation !== speechGeneration.current || !canInteract() || paused.current) return;
      if (!failed && speechQueue.current.length >= 3) return;
      setAudioError(""); failedSpeech.current = null;
      if (failed) speechQueue.current.unshift(failed);
      if (id && id !== failed?.tokenId) speechQueue.current.push({ tokenId: id });
      void drainSpeech();
    } catch (error) {
      if (generation === speechGeneration.current && canInteract() && !paused.current) setAudioError(error instanceof Error ? error.message : "声音没有开启，请再点一次小喇叭。");
    } finally {
      if (generation === speechGeneration.current) replayInFlight.current = false;
    }
  }
  function pickup(event: SharkPickup) {
    if (props.current.progress.shark.recentPickups.includes(event.pickupId)) return;
    const next = update(current => ({ ...current, shark: recordSharkPickup(current.shark, event) }));
    if (conflict.current) return;
    if (!next.shark.recentPickups.includes(event.pickupId)) { freezeConflict(); return; }
    lastEaten.current = event.tokenId; setEatenId(event.tokenId);
    setRecent(previous => ({ ids: [...(previous.until > Date.now() ? previous.ids : []), event.tokenId].slice(-3), until: Date.now() + 3500 }));
    playAdventureEat(); enqueue({ tokenId: event.tokenId });
  }
  function movePointer(event: PointerEvent<HTMLCanvasElement>) {
    if (!canInteract() || paused.current || pointer.current !== event.pointerId) return;
    if (followingFood.current && dragStart.current) {
      if (Math.hypot(event.clientX - dragStart.current.x, event.clientY - dragStart.current.y) <= 10) return;
      followingFood.current = null;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: (event.clientX - bounds.left) * size.current.width / bounds.width, y: (event.clientY - bounds.top) * size.current.height / bounds.height };
    control.current = { moving: true, target: sharkScreenToWorld(point, sharkCamera(world.current, size.current.width, size.current.height)) };
  }
  function beginPointer(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || pointer.current !== null || !startSwimming()) return;
    event.preventDefault(); pointer.current = event.pointerId; dragStart.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId);
    paintFrame.current();
    const bounds = event.currentTarget.getBoundingClientRect();
    const screenPoint = { x: (event.clientX - bounds.left) * size.current.width / bounds.width, y: (event.clientY - bounds.top) * size.current.height / bounds.height };
    const camera = sharkCamera(world.current, size.current.width, size.current.height), point = sharkScreenToWorld(screenPoint, camera);
    const eligible = world.current.foods.filter(item => {
      if (!item.edible || item.size >= world.current.player.size * .9 || (world.current.nearbyFoodIds && !world.current.nearbyFoodIds.includes(item.id))) return false;
      const at = sharkWorldToScreen(item, camera), radius = Math.max(21, item.size);
      return at.x >= -radius && at.x <= size.current.width + radius && at.y >= -radius && at.y <= size.current.height + radius;
    });
    const label = [...foodLabels.current].reverse().find(rect => screenPoint.x >= rect.x && screenPoint.x <= rect.x + rect.w && screenPoint.y >= rect.y && screenPoint.y <= rect.y + rect.h && eligible.some(item => item.id === rect.foodId));
    const food = eligible.find(item => item.id === label?.foodId) ?? eligible.filter(item => sharkDistance(item, point) <= item.size + 30).sort((a, b) => sharkDistance(a, point) - sharkDistance(b, point))[0];
    followingFood.current = food?.id ?? null;
    if (food) control.current = { moving: true, target: { x: food.x, y: food.y } };
    else movePointer(event);
  }
  function endPointer(event: PointerEvent<HTMLCanvasElement>) {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null; dragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function leave() {
    saveTime(); leaving.current = true; stopFrames(); cancelNarration(); fullscreen.current?.dispose(); fullscreen.current = null; onBack();
  }

  useEffect(() => {
    gates.current = { suspended };
    if (suspended) pause("设置打开了。准备好后，点继续游。");
    // Suspension must freeze this session without restarting its world.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suspended]);
  useEffect(() => {
    if (progress.shark !== props.current.progress.shark) {
      if (localSnapshots.current.has(progress.shark)) { props.current.commit = commit; return; }
      freezeConflict();
    }
    props.current = { progress, commit };
    // Ref guards also cover updates delivered during RAF or cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, commit]);
  useEffect(() => {
    mounted.current = true; leaving.current = false;
    const controller = createAdventureFullscreen(document, setExpanded);
    fullscreen.current = controller; controller.enter();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = media.matches;
    const motionChange = () => { reducedMotion.current = media.matches; paintFrame.current(); };
    media.addEventListener("change", motionChange);
    let dprMedia: MediaQueryList | null = null;
    let measuredAt = -Infinity;
    const measureHud = () => {
      const element = scene.current;
      if (!element || typeof element.querySelectorAll !== "function") { hudRects.current = []; return; }
      const bounds = element.getBoundingClientRect();
      const nodes = element.querySelectorAll<HTMLElement>(".shark-caption,.shark-growth,.shark-next-peek,.shark-top-left,.shark-top-right,.shark-direction-pad,.shark-recent,.shark-first-guide,.shark-alert-stack");
      hudRects.current = Array.from(nodes, node => {
        const rectangle = node.getBoundingClientRect();
        return { x: rectangle.left - bounds.left, y: rectangle.top - bounds.top, w: rectangle.width, h: rectangle.height };
      }).filter(rectangle => rectangle.w > 0 && rectangle.h > 0);
      measuredAt = world.current.elapsed * 1000;
    };
    const paint = (measure = false) => {
      const context = canvas.current?.getContext("2d");
      if (!context) { foodLabels.current = []; return; }
      if (measure || world.current.elapsed * 1000 - measuredAt >= 120) measureHud();
      context.setTransform(size.current.dpr, 0, 0, size.current.dpr, 0, 0);
      foodLabels.current = paintSharkWorld(context, world.current, size.current.width, size.current.height, { reducedMotion: reducedMotion.current, hudRects: hudRects.current }) ?? [];
    };
    paintFrame.current = () => paint(true);
    const resize = () => {
      if (!canvas.current || !scene.current) return;
      const bounds = scene.current.getBoundingClientRect();
      const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height), dpr = Math.min(3, window.devicePixelRatio || 1);
      size.current = { width, height, dpr }; canvas.current.width = Math.round(width * dpr); canvas.current.height = Math.round(height * dpr);
      ensureSharkViewport(world.current, width, height); paint(true);
      dprMedia?.removeEventListener("change", resize);
      dprMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); dprMedia.addEventListener("change", resize);
    };
    const tick = (now: number) => {
      frame.current = null;
      if (!canInteract() || paused.current || !active.current) { lastFrame.current = 0; return; }
      const dt = lastFrame.current ? Math.min(.1, Math.max(0, (now - lastFrame.current) / 1000)) : 0;
      lastFrame.current = now;
      if (followingFood.current) {
        const food = world.current.foods.find(item => item.id === followingFood.current);
        if (food) control.current = { moving: true, target: { x: food.x, y: food.y } };
        else { followingFood.current = null; control.current = { moving: true, direction: { x: Math.cos(world.current.player.angle), y: Math.sin(world.current.player.angle) } }; }
      }
      if (!followingFood.current && control.current.target && sharkDistance(control.current.target, world.current.player) < 16) control.current = { moving: true, direction: { x: Math.cos(world.current.player.angle), y: Math.sin(world.current.player.angle) } };
      const result = stepSharkWorld(world.current, { ...control.current, canCollect: speechQueue.current.length < 3 && !failedSpeech.current }, dt);
      for (const event of result.pickups) { pickup(event); if (conflict.current) break; }
      if (world.current.elapsed - savedElapsed.current >= 10) saveTime();
      paint();
      if (now - lastHud.current >= 120) {
        lastHud.current = now; setHud({ total: world.current.total, seconds: props.current.progress.shark.totalSeconds + Math.floor(world.current.elapsed - savedElapsed.current), now: Date.now() });
      }
      if (!paused.current && canInteract() && active.current) frame.current = requestAnimationFrame(tick);
    };
    startFrame.current = () => { if (frame.current === null && canInteract() && active.current && !paused.current) { lastFrame.current = 0; frame.current = requestAnimationFrame(tick); } };
    const observer = new ResizeObserver(resize); if (scene.current) observer.observe(scene.current);
    window.addEventListener("resize", resize); resize();
    const keyDirection = () => {
      const direction = { x: 0, y: 0 };
      for (const key of heldKeys.current) { direction.x += directionKeys[key].x; direction.y += directionKeys[key].y; }
      if (direction.x || direction.y) swimDirection(direction);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,[contenteditable=true]")) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (directionKeys[key]) { if (!canInteract() || paused.current) return; event.preventDefault(); heldKeys.current.add(key); keyDirection(); }
      if (event.code === "Space" && active.current && !paused.current && canInteract()) { event.preventDefault(); pause(); }
    };
    const keyUp = (event: KeyboardEvent) => { const key = event.key.length === 1 ? event.key.toLowerCase() : event.key; heldKeys.current.delete(key); keyDirection(); };
    const hidden = () => { if (document.hidden) pause("离开了一会儿。点继续游，再出发。") };
    const background = () => pause("离开了一会儿。点继续游，再出发。");
    const learningPause = () => pause("到休息时间啦。休息好了，再继续游。");
    document.addEventListener("keydown", keyDown); document.addEventListener("keyup", keyUp); document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", background); window.addEventListener("native-background", background); window.addEventListener("learning-pause", learningPause); window.addEventListener("blur", background);
    return () => {
      mounted.current = false; saveTime(); leaving.current = true; stopFrames(); cancelNarration();
      controller.dispose(); if (fullscreen.current === controller) fullscreen.current = null;
      observer.disconnect(); dprMedia?.removeEventListener("change", resize); media.removeEventListener("change", motionChange); window.removeEventListener("resize", resize);
      document.removeEventListener("keydown", keyDown); document.removeEventListener("keyup", keyUp); document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", background); window.removeEventListener("native-background", background); window.removeEventListener("learning-pause", learningPause); window.removeEventListener("blur", background);
    };
    // The entire animation lifecycle deliberately reads refs; HUD renders never replace listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    paintFrame.current();
  }, [started, isPaused, eatenId, readingId, audioError, storageError, recent, hud.total]);

  const stage = stageForShark(hud.total), nextStage = sharkStages[stage.stageIndex + 1];
  const fraction = Math.max(0, Math.min(1, (hud.total - stage.currentAt) / (stage.nextAt - stage.currentAt)));
  const remaining = stage.nextAt - hud.total;
  const goal = hud.total < 26 ? `再吃 ${26 - hud.total} 个字母，解锁单词` : hud.total < 46 ? `再吃 ${46 - hud.total} 个单词，解锁句子` : `再吃 ${remaining} 句英语，${nextStage ? `长大吃${nextStage.title.replace(/大餐|也能吃/g, "")}` : "去下一片宇宙"}`;
  const displayToken: SharkToken | undefined = getSharkToken(readingId ?? eatenId ?? "");
  const preview = stage.tier === "letters" ? { en: "A · B · C", zh: "字母 → 单词 → 短句" } : stage.tier === "words" ? { en: "cat · dog", zh: "猫 · 狗" } : { en: "I can run.", zh: "我会跑。" };
  return <section className={`shark-feast ${expanded ? "shark-feast-expanded" : ""}`} aria-label="鲨鱼英语大餐">
    <div className="shark-feast-scene" ref={scene}>
      <canvas ref={canvas} className="shark-feast-canvas" aria-label="自由游动的鲨鱼，点击或拖动海面，方向键和 W A S D 也可以控制" onPointerDown={beginPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={endPointer}/>
      <div className="shark-top-left"><button className="shark-tool" onClick={leave} aria-label="返回地图" title="返回地图"><ArrowLeft/></button><span className="shark-game-name">英语大餐</span></div>
      <div className="shark-top-right"><button className="shark-tool" onClick={() => { pause("设置打开了。准备好后，点继续游。"); onSettings(); }} aria-label="声音和设置" title="设置"><Settings2/></button><button className="shark-tool" onClick={() => fullscreen.current?.toggle()} aria-label={expanded ? "退出全屏" : "全屏游玩"} title={expanded ? "退出全屏" : "全屏"}>{expanded ? <Minimize2/> : <Maximize2/>}</button><button className="shark-tool" onClick={() => isPaused ? resume() : pause()} disabled={suspended || hasConflict} aria-label={isPaused ? "继续游" : "暂停游玩"} title={isPaused ? "继续游" : "暂停"}>{isPaused ? <Play/> : <Pause/>}</button></div>
      <div className={`shark-caption ${displayToken ? "shark-caption-filled" : ""}`} aria-live="polite" aria-atomic="true">
        <span className="shark-caption-tag">{isReading ? "听一听 · 跟着读" : displayToken ? "刚刚吃到" : stage.tier === "letters" ? "吃小鱼，听英语" : "吃目标，听英语"}</span>
        <strong lang="en">{displayToken?.en ?? preview.en}</strong><span className="shark-caption-meaning">{displayToken?.zh ?? preview.zh}</span>
        {displayToken && <button className="shark-replay" onClick={() => replay(displayToken.id)} disabled={isPaused || suspended} aria-label={`再听一次 ${displayToken.en}`}><Volume2 size={20}/>{isReading ? "再听" : "听一遍"}</button>}
      </div>
      {!started && !isPaused && <div className="shark-first-guide"><span>拖动海面就出发</span><small>方向键 / WASD / 右下角方向键</small><p>吃比你小的，鲨鱼会慢慢长大</p></div>}
      {!isPaused && (!!storageError || !!audioError) && <div className="shark-alert-stack">
        {!!storageError && <div className="shark-storage-error" role="alert"><strong>成长暂时没有保存</strong><span>成长暂存在本页面，请重试保存或备份。</span><small>{storageError}</small><div>{onRetryStorage && <button onClick={onRetryStorage}>重试保存</button>}{onBackup && <button onClick={onBackup}>备份成长</button>}</div></div>}
        {!!audioError && !isPaused && <div className="shark-audio-error" role="status"><span>声音暂时没播出来，英语和成长记录仍在本页面。</span><button onClick={() => replay()}><Volume2 size={18}/>重试声音</button></div>}
      </div>}
      {recent.until > hud.now && recent.ids.length > 0 && <div className="shark-recent" aria-label="最近吃到的英语，点击可以重听"><span>吃到了</span>{recent.ids.map((id, index) => <button lang="en" key={`${id}-${index}`} onClick={() => replay(id)} disabled={isPaused || suspended} aria-label={`重听 ${getSharkToken(id)?.en}`}><Volume2 size={13}/>{getSharkToken(id)?.en}</button>)}</div>}
      <aside className="shark-next-peek"><span>{nextStage ? "下一个大餐" : "宇宙还在变大"}</span><strong>{nextStage?.en ?? `Universe ${stage.cycle + 2}`}</strong><small>{nextStage?.title ?? "继续听英语，继续探索"}</small></aside>
      <div className="shark-growth"><div><strong lang="en">{stage.en}{stage.cycle ? ` ${stage.cycle + 1}` : ""}</strong><span>{hud.total} 口英语</span></div><div className="shark-growth-track" role="progressbar" aria-label="鲨鱼成长" aria-valuenow={hud.total} aria-valuemin={stage.currentAt} aria-valuemax={stage.nextAt}><span style={{ width: `${fraction * 100}%` }}/></div><p>{goal}</p></div>
      <div className="shark-direction-pad" aria-label="游动方向"><button className="shark-pad-up" onPointerDown={() => swimDirection({ x: 0, y: -1 })} onClick={() => swimDirection({ x: 0, y: -1 })} aria-label="向上游"><ArrowUp/></button><button className="shark-pad-left" onPointerDown={() => swimDirection({ x: -1, y: 0 })} onClick={() => swimDirection({ x: -1, y: 0 })} aria-label="向左游"><ArrowLeft/></button><span aria-hidden="true">游</span><button className="shark-pad-right" onPointerDown={() => swimDirection({ x: 1, y: 0 })} onClick={() => swimDirection({ x: 1, y: 0 })} aria-label="向右游"><ArrowRight/></button><button className="shark-pad-down" onPointerDown={() => swimDirection({ x: 0, y: 1 })} onClick={() => swimDirection({ x: 0, y: 1 })} aria-label="向下游"><ArrowDown/></button></div>
      {isPaused && <div className="shark-pause-overlay"><div className="shark-pause-card"><SharkFeastArt/><h2>{hasConflict ? "成长记录更新了" : "小鲨鱼休息一下"}</h2><p>{notice}</p><span role={storageError ? "alert" : undefined}>{hud.total} 口英语 · {storageError ? "成长暂存在本页面，请重试保存或备份。" : "已经保存"}</span>{!!storageError && <div className="shark-pause-storage-actions">{onRetryStorage && <button onClick={onRetryStorage}>重试保存</button>}{onBackup && <button onClick={onBackup}>备份成长</button>}</div>}{!hasConflict && <button className="shark-continue" onClick={resume} disabled={suspended}><Play size={22} fill="currentColor"/>{suspended ? "先关闭设置" : "继续游"}</button>}<button className="shark-pause-back" onClick={leave}>返回地图</button></div></div>}
    </div>
  </section>;
}
