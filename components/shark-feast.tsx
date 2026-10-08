"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Maximize2, Minimize2, Pause, Play, Settings2, Volume2 } from "lucide-react";
import type { Progress } from "@/lib/progress";
import { createAdventureFullscreen } from "@/lib/adventure-fullscreen";
import { playAdventureEat, playSpeech, stopAllAudio, unlockAudio } from "@/lib/audio";
import { getSharkToken, sharkGuides, sharkStages, stageForShark, type SharkToken } from "@/lib/shark-content";
import { createSharkWorld, ensureSharkViewport, requestSharkJump, sharkIsOcean, sharkCamera, sharkScreenToWorld, sharkWorldToScreen, stepSharkWorld, type SharkControl, type SharkPickup, type SharkPoint } from "@/lib/shark-engine";
import { recordSharkListen, recordSharkPickup, recordSharkTime, sharkTotal } from "@/lib/shark-progress";
import { naturalOceanArt, naturalSpriteClip } from "@/lib/natural-ocean-art";
import { loadSharkImages, paintSharkWorld, type SharkFoodLabelRect, type SharkImages } from "./shark-renderer";
import "./shark-feast.css";

type Commit = (next: Progress | ((progress: Progress) => Progress)) => Progress;
type SharkFeastProps = { progress: Progress; commit: Commit; onBack: () => void; onSettings: () => void; suspended?: boolean; storageError?: string; onRetryStorage?: () => void; onBackup?: () => void };
type SpeechItem = { tokenId?: string; guide?: string };
const directionKeys: Record<string, SharkPoint> = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
};

/** The same naturally coloured shark used by the moving game sprites. */
export function SharkFeastArt({ className = "" }: { className?: string }) {
  const clipId = useId(), source = naturalOceanArt(70);
  return <svg className={`shark-feast-art ${className}`} viewBox={`0 0 ${source.w} ${source.h}`} aria-hidden="true"><defs><clipPath id={clipId}><path d={naturalSpriteClip(source)} clipRule="evenodd"/></clipPath></defs><g transform={source.flipX ? `translate(${source.w},0) scale(-1,1)` : undefined}><g clipPath={`url(#${clipId})`}><image href={source.src} x={-source.x} y={-source.y} width={source.imageWidth} height={source.imageHeight}/></g></g></svg>;
}

export function SharkFeastEntry({ progress, ready = true, onOpen, compact = false }: { progress: Progress; ready?: boolean; onOpen: () => void; compact?: boolean }) {
  const total = sharkTotal(progress.shark), stage = stageForShark(total);
  return <button className={compact ? "adventure-entry entry-shark" : "shark-feast-entry"} disabled={!ready} onClick={onOpen} aria-label="打开鲨鱼英语吞吞乐">
    <SharkFeastArt className={compact ? "adventure-sprite" : ""}/>{compact ? <span><strong>鲨鱼英语吞吞乐</strong><b>{total ? "继续长大" : "吃字母出发"}</b></span> : <><span className="shark-entry-copy"><small>自由游 · 听英语</small><strong>鲨鱼英语吞吞乐</strong><span>{total ? `${stage.title} · 继续长大` : "从小鱼，一路吃到宇宙"}</span></span><span className="shark-entry-go"><Play size={19} fill="currentColor"/>出发</span></>}
  </button>;
}

export function SharkFeastReport({ progress }: { progress: Progress }) {
  const state = progress.shark, total = sharkTotal(state);
  return <section className="shark-feast-report" aria-label="鲨鱼英语接触记录">
    <div><strong>鲨鱼英语吞吞乐</strong><span>{stageForShark(total).title}</span></div>
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
  const images = useRef<SharkImages | null>(null), retryImages = useRef<() => void>(() => {});
  const mounted = useRef(true), leaving = useRef(false), conflict = useRef(false), paused = useRef(false), active = useRef(false);
  const gates = useRef({ suspended }), fullscreen = useRef<ReturnType<typeof createAdventureFullscreen> | null>(null);
  const startFrame = useRef<() => void>(() => {}), paintFrame = useRef<() => void>(() => {});
  const speechGeneration = useRef(0), speechRunning = useRef(false), speechQueue = useRef<SpeechItem[]>([]);
  const currentSpeech = useRef<SpeechItem | null>(null), pausedSpeech = useRef<SpeechItem[]>([]);
  const replayInFlight = useRef(false);
  const guideUsed = useRef(progress.shark.lastAt !== 0), lastEaten = useRef<string | null>(null), failedSpeech = useRef<SpeechItem | null>(null);
  const [started, setStarted] = useState(false), [isPaused, setPaused] = useState(false), [expanded, setExpanded] = useState(true);
  const [hasConflict, setConflict] = useState(false);
  const [hud, setHud] = useState({ total: sharkTotal(progress.shark), seconds: progress.shark.totalSeconds, now: 0, jumpPhase: initialWorld.jump.phase });
  const [eatenId, setEatenId] = useState<string | null>(null), [readingId, setReadingId] = useState<string | null>(null);
  const [isReading, setReading] = useState(false), [audioError, setAudioError] = useState("");
  const [recent, setRecent] = useState<{ ids: string[]; until: number }>({ ids: [], until: 0 });
  const [notice, setNotice] = useState("");
  const [imageError, setImageError] = useState("");

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
  function jump() {
    if (!sharkIsOcean(world.current) || !startSwimming()) return;
    if (!requestSharkJump(world.current)) return;
    followingFood.current = null;
    control.current = { moving: true, direction: { x: Math.cos(world.current.player.angle) < 0 ? -1 : 1, y: 0 } };
    setHud(previous => ({ ...previous, jumpPhase: world.current.jump.phase }));
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
    event.currentTarget.focus?.({ preventScroll: true });
    event.preventDefault(); pointer.current = event.pointerId; dragStart.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId);
    paintFrame.current();
    const bounds = event.currentTarget.getBoundingClientRect();
    const screenPoint = { x: (event.clientX - bounds.left) * size.current.width / bounds.width, y: (event.clientY - bounds.top) * size.current.height / bounds.height };
    const camera = sharkCamera(world.current, size.current.width, size.current.height);
    const eligible = world.current.foods.filter(item => {
      if (!item.edible || item.size >= world.current.player.size * .9 || (world.current.nearbyFoodIds && !world.current.nearbyFoodIds.includes(item.id))) return false;
      const at = sharkWorldToScreen(item, camera), radius = Math.max(21, item.size);
      return at.x >= -radius && at.x <= size.current.width + radius && at.y >= -radius && at.y <= size.current.height + radius;
    });
    const label = [...foodLabels.current].reverse().find(rect => screenPoint.x >= rect.x && screenPoint.x <= rect.x + rect.w && screenPoint.y >= rect.y && screenPoint.y <= rect.y + rect.h && eligible.some(item => item.id === rect.foodId));
    const screenDistance = (item: SharkPoint) => { const at = sharkWorldToScreen(item, camera); return Math.hypot(at.x - screenPoint.x, at.y - screenPoint.y); };
    const food = eligible.find(item => item.id === label?.foodId) ?? eligible.filter(item => screenDistance(item) <= item.size + 30).sort((a, b) => screenDistance(a) - screenDistance(b))[0];
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
      const nodes = element.querySelectorAll<HTMLElement>(".shark-caption,.shark-growth,.shark-next-peek,.shark-top-left,.shark-top-right,.shark-direction-pad,.shark-recent,.shark-first-guide,.shark-alert-stack,.shark-jump-control");
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
      foodLabels.current = paintSharkWorld(context, world.current, size.current.width, size.current.height, { reducedMotion: reducedMotion.current, hudRects: hudRects.current, images: images.current ?? undefined }) ?? [];
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
      if (!followingFood.current && control.current.target) {
        const camera = sharkCamera(world.current, size.current.width, size.current.height), target = sharkWorldToScreen(control.current.target, camera), player = sharkWorldToScreen(world.current.player, camera);
        if (Math.hypot(target.x - player.x, target.y - player.y) < 16) control.current = { moving: true, direction: { x: Math.cos(world.current.player.angle), y: Math.sin(world.current.player.angle) } };
      }
      const result = stepSharkWorld(world.current, { ...control.current, canCollect: speechQueue.current.length < 3 && !failedSpeech.current }, dt);
      for (const event of result.pickups) { pickup(event); if (conflict.current) break; }
      if (world.current.elapsed - savedElapsed.current >= 10) saveTime();
      paint();
      if (now - lastHud.current >= 120) {
        lastHud.current = now; setHud({ total: world.current.total, seconds: props.current.progress.shark.totalSeconds + Math.floor(world.current.elapsed - savedElapsed.current), now: Date.now(), jumpPhase: world.current.jump.phase });
      }
      if (!paused.current && canInteract() && active.current) frame.current = requestAnimationFrame(tick);
    };
    startFrame.current = () => { if (frame.current === null && canInteract() && active.current && !paused.current) { lastFrame.current = 0; frame.current = requestAnimationFrame(tick); } };
    const observer = new ResizeObserver(resize); if (scene.current) observer.observe(scene.current);
    window.addEventListener("resize", resize); resize();
    let imageAttempt = 0;
    const loadImages = () => {
      const attempt = ++imageAttempt; setImageError("");
      void loadSharkImages().then(loaded => {
        if (!mounted.current || leaving.current || attempt !== imageAttempt) return;
        images.current = loaded; paint(true);
      }).catch(() => {
        if (mounted.current && !leaving.current && attempt === imageAttempt) setImageError("鱼的图片暂时没加载出来，成长记录会保留。");
      });
    };
    retryImages.current = loadImages; loadImages();
    const keyDirection = () => {
      const direction = { x: 0, y: 0 };
      for (const key of heldKeys.current) { direction.x += directionKeys[key].x; direction.y += directionKeys[key].y; }
      if (direction.x || direction.y) swimDirection(direction);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,[contenteditable=true]")) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (directionKeys[key]) { if (!canInteract() || paused.current) return; event.preventDefault(); heldKeys.current.add(key); keyDirection(); }
      if (event.code === "Space" && !event.repeat && !paused.current && canInteract()) {
        if (event.target instanceof HTMLElement && event.target.closest("button,a,[role=button]")) return;
        event.preventDefault(); jump();
      }
    };
    const keyUp = (event: KeyboardEvent) => { const key = event.key.length === 1 ? event.key.toLowerCase() : event.key; heldKeys.current.delete(key); keyDirection(); };
    const hidden = () => { if (document.hidden) pause("离开了一会儿。点继续游，再出发。") };
    const background = () => pause("离开了一会儿。点继续游，再出发。");
    const learningPause = () => pause("到休息时间啦。休息好了，再继续游。");
    document.addEventListener("keydown", keyDown); document.addEventListener("keyup", keyUp); document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", background); window.addEventListener("native-background", background); window.addEventListener("learning-pause", learningPause); window.addEventListener("blur", background);
    return () => {
      mounted.current = false; imageAttempt++; images.current = null; saveTime(); leaving.current = true; stopFrames(); cancelNarration();
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
  }, [started, isPaused, eatenId, readingId, audioError, storageError, imageError, recent, hud.total]);

  const stage = stageForShark(hud.total), nextStage = sharkStages[stage.stageIndex + 1];
  const fraction = Math.max(0, Math.min(1, (hud.total - stage.currentAt) / (stage.nextAt - stage.currentAt)));
  const remaining = stage.nextAt - hud.total;
  const goal = hud.total < 26 ? `再吃 ${26 - hud.total} 个字母，解锁单词` : hud.total < 46 ? `再吃 ${46 - hud.total} 个单词，解锁句子` : `再吃 ${remaining} 句英语，${nextStage ? `长大吃${nextStage.title.replace(/大餐|也能吃/g, "")}` : "去下一片宇宙"}`;
  const displayToken: SharkToken | undefined = getSharkToken(readingId ?? eatenId ?? "");
  const preview = stage.tier === "letters" ? { en: "A · B · C", zh: "字母 → 单词 → 短句" } : stage.tier === "words" ? { en: "cat · dog", zh: "猫 · 狗" } : { en: "I can run.", zh: "我会跑。" };
  return <section className={`shark-feast ${expanded ? "shark-feast-expanded" : ""}`} aria-label="鲨鱼英语吞吞乐">
    <div className="shark-feast-scene" ref={scene}>
      <canvas ref={canvas} tabIndex={0} className="shark-feast-canvas" aria-label="自由游动的鲨鱼，点击或拖动海面，方向键和 W A S D 也可以控制，空格键跃出海面" onPointerDown={beginPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={endPointer}/>
      <div className="shark-top-left"><button className="shark-tool" onClick={leave} aria-label="返回地图" title="返回地图"><ArrowLeft/></button><span className="shark-game-name">鲨鱼英语吞吞乐</span></div>
      <div className="shark-top-right"><button className="shark-tool" onClick={() => { pause("设置打开了。准备好后，点继续游。"); onSettings(); }} aria-label="声音和设置" title="设置"><Settings2/></button><button className="shark-tool" onClick={() => fullscreen.current?.toggle()} aria-label={expanded ? "退出全屏" : "全屏游玩"} title={expanded ? "退出全屏" : "全屏"}>{expanded ? <Minimize2/> : <Maximize2/>}</button><button className="shark-tool" onClick={() => isPaused ? resume() : pause()} disabled={suspended || hasConflict} aria-label={isPaused ? "继续游" : "暂停游玩"} title={isPaused ? "继续游" : "暂停"}>{isPaused ? <Play/> : <Pause/>}</button></div>
      <div className={`shark-caption ${displayToken ? "shark-caption-filled" : ""}`} aria-live="polite" aria-atomic="true">
        <span className="shark-caption-tag">{isReading ? "听一听 · 跟着读" : displayToken ? "刚刚吃到" : stage.tier === "letters" ? "吃小鱼，听英语" : "吃目标，听英语"}</span>
        <strong lang="en">{displayToken?.en ?? preview.en}</strong><span className="shark-caption-meaning">{displayToken?.zh ?? preview.zh}</span>
        {displayToken && <button className="shark-replay" onClick={() => replay(displayToken.id)} disabled={isPaused || suspended} aria-label={`再听一次 ${displayToken.en}`}><Volume2 size={20}/>{isReading ? "再听" : "听一遍"}</button>}
      </div>
      {!started && !isPaused && <div className="shark-first-guide"><span>拖动海面就出发</span><small>方向键 / WASD / 触屏方向键</small><p>吃比你小的，鲨鱼会慢慢长大</p><small>左下角或空格键 · 跃出海面</small></div>}
      {!isPaused && (!!storageError || !!audioError || !!imageError) && <div className="shark-alert-stack">
        {!!storageError && <div className="shark-storage-error" role="alert"><strong>成长暂时没有保存</strong><span>成长暂存在本页面，请重试保存或备份。</span><small>{storageError}</small><div>{onRetryStorage && <button onClick={onRetryStorage}>重试保存</button>}{onBackup && <button onClick={onBackup}>备份成长</button>}</div></div>}
        {!!audioError && !isPaused && <div className="shark-audio-error" role="status"><span>声音暂时没播出来，英语和成长记录仍在本页面。</span><button onClick={() => replay()}><Volume2 size={18}/>重试声音</button></div>}
        {!!imageError && <div className="shark-audio-error" role="status"><span>{imageError}</span><button onClick={() => retryImages.current()}>重试图片</button></div>}
      </div>}
      {recent.until > hud.now && recent.ids.length > 0 && <div className="shark-recent" aria-label="最近吃到的英语，点击可以重听"><span>吃到了</span>{recent.ids.map((id, index) => <button lang="en" key={`${id}-${index}`} onClick={() => replay(id)} disabled={isPaused || suspended} aria-label={`重听 ${getSharkToken(id)?.en}`}><Volume2 size={13}/>{getSharkToken(id)?.en}</button>)}</div>}
      <div className="shark-left-panel">
      {stage.stageIndex < 6 && <button className="shark-jump-control" onClick={jump} disabled={isPaused || suspended || hasConflict || hud.jumpPhase !== "idle"} aria-label="跃出海面"><ArrowUp size={21}/><span>{hud.jumpPhase === "approach" ? "冲向海面" : hud.jumpPhase === "air" ? "飞起来啦" : hud.jumpPhase === "cooldown" ? "落水啦" : "跃出海面"}<small>空格键 / 点击</small></span></button>}
      <aside className="shark-next-peek"><span>{nextStage ? "下一个大餐" : "宇宙还在变大"}</span><strong>{nextStage?.en ?? `Universe ${stage.cycle + 2}`}</strong><small>{nextStage?.title ?? "继续听英语，继续探索"}</small></aside>
      </div>
      <div className="shark-growth"><div><strong lang="en">{stage.en}{stage.cycle ? ` ${stage.cycle + 1}` : ""}</strong><span>{hud.total} 口英语</span></div><div className="shark-growth-track" role="progressbar" aria-label="鲨鱼成长" aria-valuenow={hud.total} aria-valuemin={stage.currentAt} aria-valuemax={stage.nextAt}><span style={{ width: `${fraction * 100}%` }}/></div><p>{goal}</p></div>
      <div className="shark-direction-pad" aria-label="游动方向"><button className="shark-pad-up" onPointerDown={() => swimDirection({ x: 0, y: -1 })} onClick={() => swimDirection({ x: 0, y: -1 })} aria-label="向上游"><ArrowUp/></button><button className="shark-pad-left" onPointerDown={() => swimDirection({ x: -1, y: 0 })} onClick={() => swimDirection({ x: -1, y: 0 })} aria-label="向左游"><ArrowLeft/></button><span aria-hidden="true">游</span><button className="shark-pad-right" onPointerDown={() => swimDirection({ x: 1, y: 0 })} onClick={() => swimDirection({ x: 1, y: 0 })} aria-label="向右游"><ArrowRight/></button><button className="shark-pad-down" onPointerDown={() => swimDirection({ x: 0, y: 1 })} onClick={() => swimDirection({ x: 0, y: 1 })} aria-label="向下游"><ArrowDown/></button></div>
      {isPaused && <div className="shark-pause-overlay"><div className="shark-pause-card"><SharkFeastArt/><h2>{hasConflict ? "成长记录更新了" : "小鲨鱼休息一下"}</h2><p>{notice}</p><span role={storageError ? "alert" : undefined}>{hud.total} 口英语 · {storageError ? "成长暂存在本页面，请重试保存或备份。" : "已经保存"}</span>{!!storageError && <div className="shark-pause-storage-actions">{onRetryStorage && <button onClick={onRetryStorage}>重试保存</button>}{onBackup && <button onClick={onBackup}>备份成长</button>}</div>}{!hasConflict && <button className="shark-continue" onClick={resume} disabled={suspended}><Play size={22} fill="currentColor"/>{suspended ? "先关闭设置" : "继续游"}</button>}<button className="shark-pause-back" onClick={leave}>返回地图</button></div></div>}
    </div>
  </section>;
}
