"use client";
import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowDown, ArrowRight, ArrowUp, BookOpen, Gift, HelpCircle, Maximize2, Minimize2, Pause, Play, Settings2, Volume2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { advanceAdventure, cameraForWorld, createAdventureWorld, getAdventureSpeedBoost, setWorldMission, type AdventureActor, type Vec } from "@/lib/adventure-engine";
import { adventureGuidance, getAdventureTaskById, type AdventureMode } from "@/lib/adventure-content";
import { adventureStages, getAdventureReviewIds, getCurrentAdventureTask, markAdventureHint, markAdventureListen, recordAdventureChoice, saveAdventureGrowth } from "@/lib/adventure-progress";
import { playAdventureEat, playAdventureEffect, playSpeech, stopSpeech, unlockAudio } from "@/lib/audio";
import type { Progress } from "@/lib/progress";
import { loadAdventureImages, paintAdventure, type AdventureImages } from "./adventure-renderer";
import { naturalOceanArt, naturalSpriteClip } from "@/lib/natural-ocean-art";
import { gameImageURL } from "@/lib/game-image-assets";
import ecologyArt from "@/lib/ecology-art.json";
import flatSnakeArt from "@/lib/snake-flat-art.json";
import { adventureVocabulary, getAdventureWord, getOceanSpecies, oceanEvolution, oceanSpecies, oceanSizeLevel, snakeBreeds, type AdventureWordCategory } from "@/lib/adventure-catalog";
import { collectOceanCard, openOceanTreasure, oceanStickerIds, TREASURE_CARD_TARGET } from "@/lib/ocean-treasure";
import { createAdventureFullscreen } from "@/lib/adventure-fullscreen";
import type { AdventureProgress } from "@/lib/adventure-progress";

type Commit = (next: Progress | ((p: Progress) => Progress)) => Progress;
export function AdventureSprite({ mode, index, speciesId, className = "" }: {mode:AdventureMode;index:number;speciesId?:string;className?:string}) {
  const clipId = useId();
  const species = mode === "fish" ? getOceanSpecies(speciesId ?? oceanEvolution[index]?.speciesId ?? "fish-fry") : undefined;
  const source = species ? naturalOceanArt(species.artIndex) : undefined;
  const rect = source ?? {...flatSnakeArt.snake[index % 8],flipX:false};
  const href = source?.src ?? gameImageURL("/images/snake-breeds-flat-v3.png");
  return <svg viewBox={`0 0 ${rect.w} ${rect.h}`} className={`adventure-sprite ${className}`} aria-hidden="true"><defs><clipPath id={clipId}><path d={naturalSpriteClip(source ?? rect)} clipRule="evenodd"/></clipPath></defs><svg width={rect.w} height={rect.h} overflow="hidden"><g transform={rect.flipX ? `translate(${rect.w},0) scale(-1,1)` : undefined}><g clipPath={`url(#${clipId})`}><image href={href} x={-rect.x} y={-rect.y} width={source?.imageWidth ?? ecologyArt.width} height={source?.imageHeight ?? ecologyArt.height}/></g></g></svg></svg>;
}
function WordPicture({ id }: {id:string}) {
  const word = getAdventureWord(id); if (!word) return null;
  const rect = word.image.endsWith("adventure-cards-v2.png") ? ecologyArt.cards[word.spriteIndex] : word.imageRect ? {x:word.imageRect.x,y:word.imageRect.y,w:word.imageRect.width,h:word.imageRect.height} : {x:word.spriteIndex%6*256,y:Math.floor(word.spriteIndex/6)*256,w:256,h:256};
  return <svg viewBox={`0 0 ${rect.w} ${rect.h}`} className="ecology-word-picture" aria-hidden="true"><svg width={rect.w} height={rect.h} overflow="hidden"><image href={gameImageURL(word.image)} x={-rect.x} y={-rect.y} width={word.imageRect?.imageWidth ?? 1536} height={word.imageRect?.imageHeight ?? 1024}/></svg></svg>;
}
const tierNames = ["", "微小伙伴", "小型伙伴", "中型伙伴", "大型伙伴", "远古与幻想伙伴"];
const categoryNames: Record<AdventureWordCategory,string> = {animals:"动物",plants:"植物",food:"食物",toys:"玩具",transport:"交通",family:"家人",school:"学校",body:"身体",actions:"动作",nature:"天气",home:"家里"};
export function AdventureEntries({ progress, onOpen, ready, children }: {progress:Progress;onOpen:(mode:AdventureMode)=>void;ready:boolean;children?:ReactNode}) {
  return <section className="continuous-entries adventure-side-rail" aria-label="连续成长冒险"><span className="rail-title">随时来玩</span>{(["fish", "snake"] as const).map(mode => {
    const state = progress.adventure.modes[mode], index = Math.max(0, adventureStages[mode].findLastIndex(stage => state.xp >= stage.xp));
    return <button key={mode} className={`adventure-entry entry-${mode}`} disabled={!ready} onClick={() => onOpen(mode)} aria-label={mode === "fish" ? "海洋成长冒险" : "贪吃蛇连续版"}><AdventureSprite mode={mode} index={mode === "fish" ? index : 0}/><span><strong>{mode === "fish" ? "海洋成长" : "贪吃蛇"}</strong><b>{state.lastAt ? "继续游玩" : "拖动出发"}</b></span></button>;
  })}{children}</section>;
}

type AdventureProps = {mode:AdventureMode;progress:Progress;commit:Commit;onBack:()=>void;onSettings:()=>void;suspended?:boolean};
export function ContinuousAdventure(props: AdventureProps) {
  // Each mode owns its saved world; changing modes cannot reuse the previous refs.
  return <ContinuousAdventureSession key={props.mode} {...props}/>;
}
export function ContinuousAdventureSession({ mode, progress, commit, onBack, onSettings, suspended = false }: AdventureProps) {
  const props = useRef({ progress, commit });
  const localSnapshots = useRef(new WeakSet([progress.adventure]));
  const initial = progress.adventure.modes[mode];
  const [world] = useState(() => createAdventureWorld(mode, initial.seed + initial.round * 8191, initial.xp, initial.bodyWords ?? initial.collectedWords, initial.runLength));
  const worldRef = useRef(world);
  const taskRef = useRef(getCurrentAdventureTask(progress.adventure, mode));
  const canvas = useRef<HTMLCanvasElement>(null), frame = useRef<HTMLDivElement>(null);
  const images = useRef<AdventureImages | null>(null), size = useRef({ w: 900, h: 540 });
  const assetsReady = useRef(false), readyFrame = useRef<number | null>(null);
  const [assetPhase, setAssetPhase] = useState<"loading" | "painting" | "ready" | "error">("loading");
  const control = useRef<{moving:boolean;target?:Vec;direction?:Vec;followId?:string}>({ moving: false });
  const active = useRef(false), paused = useRef(false), speech = useRef(false), enabled = useRef(false), token = useRef(0), mounted = useRef(true), savedElapsed = useRef(0), retryAt = useRef(0);
  const pendingCards = useRef<string[]>([]), cardRunning = useRef(false), narrationFailed = useRef(false);
  const savedGrowth = useRef({ xp: initial.xp, words: (initial.bodyWords ?? initial.collectedWords).join("|"), length: world.player.length }), assetToken = useRef(0), conflict = useRef(false), leaving = useRef(false);
  const [started, setStarted] = useState(false), [isPaused, setPaused] = useState(false), [speaking, setSpeaking] = useState(false), [error, setError] = useState(""), [assetError, setAssetError] = useState(""), [book, setBook] = useState(false);
  const [bookTab,setBookTab] = useState("growth"), [bookTier,setBookTier] = useState(0), [bookCategory,setBookCategory] = useState("all"), [bookVoice,setBookVoice] = useState(""), [lastCard,setLastCard] = useState("");
  const [evolutionMessage,setEvolutionMessage] = useState("");
  const [cardVoice,setCardVoice] = useState("");
  const [treasureOpen,setTreasureOpen] = useState(false), [prizeShown,setPrizeShown] = useState("");
  const [pickupSession] = useState(() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  const announcedStage = useRef(world.player.stage), evolutionUntil = useRef(0);
  const [message, setMessage] = useState("拖动海面，或按方向键，就能出发"), [hud, setHud] = useState({ xp: initial.xp, stage: Math.max(...initial.unlockedStages), length: world.player.length, boost: 1 as 1 | 2 | 4, boostSeconds: 0, width: 900, height: 540, count: 0, seconds: 0, missions: [] as AdventureActor[], camera: cameraForWorld(world, 900, 540) });
  const task = getCurrentAdventureTask(progress.adventure, mode), state = progress.adventure.modes[mode];
  const gates = useRef({ suspended, book, assetError, treasureOpen });
  useEffect(() => { gates.current = { suspended, book, assetError, treasureOpen }; }, [suspended, book, assetError, treasureOpen]);
  const [mapFullscreen, setMapFullscreen] = useState(true);
  const [pointNotice, setPointNotice] = useState(0), pointUntil = useRef(0);
  const fullscreen = useRef<ReturnType<typeof createAdventureFullscreen> | null>(null);
  useEffect(() => {
    const controller = createAdventureFullscreen(document, setMapFullscreen, () => !gates.current.suspended && !gates.current.book && !gates.current.treasureOpen);
    fullscreen.current = controller;
    controller.enter();
    return () => { controller.dispose(); fullscreen.current = null; };
  }, []);
  const hintUsed = state.current.hintUsed, hinted = useRef(hintUsed);
  useEffect(() => { hinted.current = hintUsed; }, [hintUsed]);
  function canInteract() { return assetsReady.current && mounted.current && !leaving.current && !conflict.current && !document.hidden && !gates.current.suspended && !gates.current.book && !gates.current.assetError && !gates.current.treasureOpen; }
  function cancelNarration(clearCards = true) {
    token.current++; retryAt.current = 0; enabled.current = false; speech.current = false; cardRunning.current = false; narrationFailed.current = false; stopSpeech();
    if (clearCards) pendingCards.current = [];
    if (mounted.current) setCardVoice("");
  }
  function invalidateAssetLoad() {
    assetToken.current++; assetsReady.current = false;
    if (readyFrame.current !== null) cancelAnimationFrame(readyFrame.current);
    readyFrame.current = null;
  }
  function freezeConflict() {
    conflict.current = true; paused.current = true; control.current.moving = false; cancelNarration();
    if (mounted.current) { setPaused(true); setSpeaking(false); setPointNotice(0); setEvolutionMessage(""); setError("学习记录已更新，请返回地图后继续冒险。"); }
  }
  useEffect(() => {
    // Own commits update the expected adventure synchronously. A different
    // incoming reference is an external import/tab, even when its task is unchanged.
    if (progress.adventure !== props.current.progress.adventure) {
      if (localSnapshots.current.has(progress.adventure)) { props.current.commit = commit; return; }
      freezeConflict();
    }
    props.current = { progress, commit };
    // freezeConflict uses session refs and must not recreate this synchronization each HUD frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, commit]);
  function update(fn: (p: Progress) => Progress) {
    let applied = false;
    const expected = props.current.progress.adventure;
    const next = props.current.commit(p => {
      // Also protect cleanup if a parent removes us in the same render as an
      // import, before this component can receive the new props/effect.
      if (p.adventure !== expected) return p;
      applied = true; return fn(p);
    });
    props.current.progress = next;
    if (applied) localSnapshots.current.add(next.adventure);
    if (!applied) {
      // The storage hook found a newer tab/backup before running our update.
      // Freeze this old simulation instead of overwriting that newer record.
      freezeConflict();
    }
    return next;
  }
  function save(mutate?: (adventure: AdventureProgress) => AdventureProgress | null) {
    if (conflict.current || leaving.current) return;
    const world = worldRef.current, seconds = Math.min(60, Math.floor(world.elapsed - savedElapsed.current)), words = world.player.collectedWords.join("|");
    if (!mutate && !seconds && world.player.xp === savedGrowth.current.xp && words === savedGrowth.current.words && world.player.length === savedGrowth.current.length) return props.current.progress;
    let accepted = false;
    const next = update(p => {
      const adventure = mutate ? mutate(p.adventure) : p.adventure;
      if (!adventure) return p;
      accepted = true;
      return { ...p, adventure: saveAdventureGrowth(adventure, mode, world.player.xp, world.player.collectedWords, seconds, Date.now(), world.player.length) };
    });
    if (!accepted && !conflict.current) freezeConflict();
    if (!conflict.current) { savedElapsed.current += seconds; savedGrowth.current = { xp: world.player.xp, words, length: world.player.length }; }
    return next;
  }
  async function say(guidance = false) {
    if (!canInteract() || paused.current || !active.current) return;
    cancelNarration(false);
    const currentToken = ++token.current, currentTask = taskRef.current;
    const live = () => currentToken === token.current && canInteract() && !paused.current && taskRef.current.instanceKey === currentTask.instanceKey;
    enabled.current = false; speech.current = true; setSpeaking(true); setError("");
    update(p => ({ ...p, adventure: markAdventureListen(p.adventure, mode) }));
    if (!live()) return;
    try {
      await unlockAudio();
      if (!live()) return;
      if (guidance) await playSpeech(adventureGuidance[mode], "zh");
      if (!live()) return;
      await playSpeech(currentTask.promptEn);
      if (!live()) return;
      await drainCards(currentToken, live);
      if (!live()) return;
      speech.current = false; enabled.current = true; setSpeaking(false);
      setMessage(currentTask.requiredCount > 1 ? "数一数，找到不同的任务鱼" : "游向带贝壳标记的目标，自动吃到它");
    } catch (cause) {
      if (!live()) return;
      speech.current = false; enabled.current = false; narrationFailed.current = true; setSpeaking(false); setCardVoice("");
      setError(cause instanceof Error ? cause.message : "声音加载失败，点重听再试试。");
    }
  }
  async function drainCards(currentToken:number, live:()=>boolean) {
    cardRunning.current = true;
    try {
      while (pendingCards.current.length && live()) {
        const id = pendingCards.current[0], word = getAdventureWord(id);
        if (!word) { pendingCards.current.shift(); continue; }
        setCardVoice(word.en); setLastCard(id); setMessage(`听一听：${word.en} · ${word.zh}`);
        await playSpeech(word.en);
        // Canceled speech resolves too. A canceled worker must leave its queue alone.
        if (!live()) return;
        pendingCards.current.shift();
      }
    } finally {
      if (currentToken === token.current && mounted.current) { cardRunning.current = false; setCardVoice(""); }
    }
  }
  async function readCollectedCards() {
    if (!pendingCards.current.length || speech.current || cardRunning.current || narrationFailed.current || !canInteract() || paused.current || !active.current) return;
    const currentToken = token.current, instance = taskRef.current.instanceKey, wasEnabled = enabled.current;
    const live = () => currentToken === token.current && canInteract() && !paused.current && active.current;
    speech.current = true; enabled.current = false; setSpeaking(true);
    try {
      await drainCards(currentToken, live);
      if (!live()) return;
      speech.current = false; setSpeaking(false);
      enabled.current = wasEnabled && instance === taskRef.current.instanceKey && !retryAt.current;
    } catch (cause) {
      if (!live()) return;
      speech.current = false; enabled.current = false; narrationFailed.current = true; setSpeaking(false);
      setError(cause instanceof Error ? cause.message : "词卡声音还没准备好，点重听再试试。");
    }
  }
  function pause() { paused.current = true; control.current.moving = false; cancelNarration(); setSpeaking(false); setPaused(true); save(); }
  function showTreasure() {
    if(!canInteract() || speaking)return;
    pause();gates.current.treasureOpen=true;setPrizeShown("");setBookVoice("");setTreasureOpen(true);
  }
  function closeTreasure(resume=false) {
    cancelNarration();setBookVoice("");gates.current.treasureOpen=false;setTreasureOpen(false);
    if(resume)start();
  }
  function drawTreasure(expectedOpened:number) {
    if(!assetsReady.current || !mounted.current || leaving.current || conflict.current || document.hidden || gates.current.suspended)return;
    let awarded=false;
    const next=update(p=>{const treasure=openOceanTreasure(p.adventure.oceanTreasure,p.adventure.modes.fish.seed,expectedOpened);if(treasure===p.adventure.oceanTreasure)return p;awarded=true;return {...p,adventure:{...p.adventure,oceanTreasure:treasure}};});
    if(awarded && !conflict.current) {
      setPrizeShown(next.adventure.oceanTreasure.lastPrize!);playAdventureEffect("reward");
      const prize=getOceanSpecies(next.adventure.oceanTreasure.lastPrize!)!;void hearName(prize.en);
    }
  }
  function start(narrate = true) {
    if (!canInteract()) return false;
    const needsSpeech = !active.current || paused.current;
    active.current = true; paused.current = false; control.current.moving = true; setStarted(true); setPaused(false);
    if (needsSpeech && narrate) void say();
    return true;
  }
  function replay(guidance = false) { if (start(false)) void say(guidance); }
  async function hearName(text:string) {
    if (!assetsReady.current || !mounted.current || leaving.current || conflict.current || document.hidden) return;
    cancelNarration(); const currentToken = ++token.current; setBookVoice(text);
    try { await unlockAudio(); if (currentToken !== token.current || !mounted.current) return; await playSpeech(text); if (currentToken === token.current && mounted.current) setBookVoice(""); }
    catch { if (currentToken === token.current && mounted.current) setBookVoice("声音还没准备好，再点一次听听"); }
  }
  function direction(x: number, y: number) { if (!canInteract()) return; control.current = { moving: true, direction: { x, y } }; start(); }
  function followMission(id:string) { if (!canInteract()) return; control.current = {moving:true,followId:id}; start(); }
  function aim(event: PointerEvent<HTMLElement>) {
    if (!canInteract() || !frame.current) return;
    const rect = frame.current.getBoundingClientRect(), camera = cameraForWorld(worldRef.current, rect.width, rect.height);
    control.current = { moving: true, target: { x: (event.clientX - rect.left) / camera.zoom + camera.x, y: (event.clientY - rect.top) / camera.zoom + camera.y } }; start();
  }
  function load() {
    invalidateAssetLoad(); const request = assetToken.current;
    images.current = null;
    return loadAdventureImages(mode).then(loaded => {
      if (mounted.current && !leaving.current && request === assetToken.current) { images.current = loaded; setAssetPhase("painting"); }
    }, cause => {
      if (mounted.current && !leaving.current && request === assetToken.current) {
        setAssetError(String(cause instanceof Error ? cause.message : cause)); setAssetPhase("error");
      }
    });
  }
  function retryImages() { setAssetError(""); setAssetPhase("loading"); void load(); }
  useEffect(() => {
    mounted.current = true; setWorldMission(worldRef.current, taskRef.current);
    // External image loading changes error state only after its promise resolves/rejects.
    void load();
    const observer = new ResizeObserver(() => {
      const rect = frame.current?.getBoundingClientRect();
      if (rect) {
        size.current = {w:rect.width,h:rect.height};
        // Resize targets with their canvas now; do not wait for the 120ms HUD timer.
        setHud(previous=>({...previous,width:rect.width,height:rect.height,camera:cameraForWorld(worldRef.current,rect.width,rect.height)}));
      }
    });
    if (frame.current) observer.observe(frame.current);
    let raf = 0, last = 0, lastHud = 0, lastSave = 0;
    function tick(now: number) {
      if (!mounted.current || leaving.current) return;
      const world = worldRef.current, dt = last ? Math.min(.08, (now - last) / 1000) : 0; last = now;
      if (active.current && !paused.current && images.current && canInteract()) {
        const events = advanceAdventure(world, dt, control.current, { answerEnabled: enabled.current, safe: speech.current || !enabled.current, cardEnabled: !speech.current && !pendingCards.current.length && !narrationFailed.current });
        const beforeGrowth = props.current.progress.adventure.modes[mode].xp;
        // Growth, completed target and treasure credit are one storage transaction.
        // No refresh can keep +100 growth while replaying that same unfinished target.
        if (events.length) save(adventure => {
          let next = adventure;
          for (const event of events) {
            if (event.kind === "mission") {
              const answered = taskRef.current;
              if (event.taskId !== answered.id || getCurrentAdventureTask(next, mode).instanceKey !== answered.instanceKey) return null;
              if (event.choiceId !== answered.answer || event.complete) {
                const recorded = recordAdventureChoice(next, mode, answered, event.choiceId!);
                if (recorded === next) return null;
                next = recorded;
              }
            }
            if (mode === "fish" && event.wordId && event.pickupId && (event.kind === "eat" || event.kind === "mission" && event.choiceId === taskRef.current.answer)) {
              next = { ...next, oceanTreasure: collectOceanCard(next.oceanTreasure, event.wordId, `${pickupSession}:${event.pickupId}`) };
            }
          }
          return next;
        });
        const gainedPoints = !conflict.current ? props.current.progress.adventure.modes[mode].xp - beforeGrowth : 0;
        for (const event of events) {
          if (conflict.current) break;
          if (event.kind === "eat") { if (event.wordId) { setLastCard(event.wordId); pendingCards.current.push(event.wordId); } if(mode === "fish") playAdventureEat(); else playAdventureEffect("correct"); }
          if (event.kind === "death") { control.current.followId = undefined; control.current.target = undefined; setMessage("小蛇散成食物啦！保护泡泡带你从一节重新出发"); playAdventureEffect("retry"); }
          if (event.kind === "bump") { setMessage("保护泡泡来啦！换个方向继续游"); playAdventureEffect("retry"); }
          if (event.kind !== "mission" || event.taskId !== taskRef.current.id) continue;
          const answeredTask = taskRef.current;
          if (mode === "fish" && event.choiceId === answeredTask.answer) playAdventureEat();
          if (event.wordId && event.choiceId === answeredTask.answer) { setLastCard(event.wordId); pendingCards.current.push(event.wordId); }
          if (event.choiceId === answeredTask.answer && !event.complete) { playAdventureEffect("correct"); setMessage(`收集到 ${world.missionProgress}/${answeredTask.requiredCount}，继续找下一条`); continue; }
          enabled.current = false; control.current.followId = undefined;
          const next = props.current.progress;
          if (event.choiceId === answeredTask.answer) {
            playAdventureEffect("reward"); taskRef.current = getCurrentAdventureTask(next.adventure, mode); setWorldMission(world, taskRef.current); retryAt.current = now + 600;
            setMessage(next.adventure.modes[mode].taskIndex === 0 ? "这一轮找齐啦！继续下一轮" : "找到啦！听听下一个英语目标");
          } else {
            playAdventureEffect("retry"); setWorldMission(world, answeredTask); retryAt.current = now + 900; setMessage("再听一遍，你可以的！");
          }
        }
        if (gainedPoints && !conflict.current) { setPointNotice(gainedPoints); pointUntil.current = world.elapsed + 1.6; }
        if (pointUntil.current && world.elapsed > pointUntil.current) { pointUntil.current = 0; setPointNotice(0); }
        if (!conflict.current && mode === "fish" && world.player.stage > announcedStage.current) {
          announcedStage.current = world.player.stage; const species = getOceanSpecies(oceanEvolution[world.player.stage].speciesId)!;
          setEvolutionMessage(`变成 ${species.zh} · ${species.en}！`); evolutionUntil.current = now + 5500;
        }
        if (evolutionUntil.current && now > evolutionUntil.current) { evolutionUntil.current = 0; setEvolutionMessage(""); }
        if (!speech.current && !narrationFailed.current && pendingCards.current.length) void readCollectedCards();
        if (retryAt.current && now >= retryAt.current && !speech.current && !pendingCards.current.length && !narrationFailed.current) { retryAt.current = 0; void say(); }
        if (now - lastSave > 2500) { save(); lastSave = now; }
      }
      const element = canvas.current, context = element?.getContext("2d"), { w, h } = size.current;
      if (context && element && images.current && w > 0 && h > 0) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (element.width !== Math.round(w * dpr) || element.height !== Math.round(h * dpr)) { element.width = Math.round(w * dpr); element.height = Math.round(h * dpr); }
        context.setTransform(dpr, 0, 0, dpr, 0, 0); paintAdventure(context, world, images.current, w, h, hinted.current, control.current.followId, window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
        if (!assetsReady.current && readyFrame.current === null) {
          const request = assetToken.current;
          // Let the browser present this fully drawn map before accepting play.
          readyFrame.current = requestAnimationFrame(() => {
            readyFrame.current = null;
            if (!mounted.current || leaving.current || request !== assetToken.current || !images.current) return;
            assetsReady.current = true; setAssetPhase("ready"); setMessage("拖动海面，或按方向键，就能出发");
          });
        }
      }
      if (now - lastHud > 120) {
        const saved = props.current.progress.adventure.modes[mode];
        const boost = conflict.current ? { multiplier: 1 as const, remaining: 0 } : getAdventureSpeedBoost(world);
        setHud({ xp: conflict.current ? saved.xp : world.player.xp, stage: conflict.current ? Math.max(...saved.unlockedStages) : world.player.stage, length: conflict.current ? saved.runLength : world.player.length, boost: boost.multiplier, boostSeconds: Math.ceil(boost.remaining), width: w, height: h, count: world.missionProgress, seconds: world.elapsed, missions: world.actors.filter(a => a.kind === "mission" && !a.consumed).map(a => ({ ...a })), camera: cameraForWorld(world, w, h) }); lastHud = now;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!canInteract() || event.ctrlKey || event.metaKey || event.altKey || target?.matches?.("input, textarea, select, [contenteditable='true']") || target?.closest?.("[role='dialog']")) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const vector = ({ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]} as Record<string,number[]>)[key];
      if (vector) { event.preventDefault(); fullscreen.current?.requestNative(); direction(vector[0], vector[1]); }
    };
    const hide = () => pause(), visibility = () => { if (document.hidden) hide(); };
    window.addEventListener("keydown", keyboard); document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", hide); window.addEventListener("native-background", hide); window.addEventListener("learning-pause", hide);
    return () => { mounted.current = false; save(); invalidateAssetLoad(); cancelNarration(); cancelAnimationFrame(raf); observer.disconnect(); window.removeEventListener("keydown", keyboard); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", hide); window.removeEventListener("native-background", hide); window.removeEventListener("learning-pause", hide); };
    // The mutable simulation survives each immediately saved answer and settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  // A new external profile/task must not receive answers from the old simulation.
  useEffect(() => {
    if (task.instanceKey !== taskRef.current.instanceKey && !localSnapshots.current.has(progress.adventure)) { conflict.current = true; pause(); taskRef.current = task; setWorldMission(worldRef.current, task); setError("学习记录已更新，请返回地图后继续冒险。"); }
    // Own answers update taskRef synchronously before React receives the saved profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.instanceKey, progress.adventure]);
  useEffect(() => {
    // This external modal suspends the imperative game and immediately shows its pause overlay.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (suspended) pause();
    // pause reads live refs; adding its render-local identity would repause on every HUD frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suspended]);
  const stage = adventureStages[mode][hud.stage], nextStage = adventureStages[mode][hud.stage + 1];
  const treasure=progress.adventure.oceanTreasure, tickets=treasure.earned-treasure.opened;
  const displayedPrize=getOceanSpecies(prizeShown || (!tickets ? treasure.lastPrize??"" : ""));
  const currentSpecies = mode === "fish" ? getOceanSpecies(oceanEvolution[hud.stage].speciesId)! : undefined;
  const unlockedSpecies = currentSpecies ? oceanSpecies.filter(item => oceanSizeLevel(item.id) <= hud.stage) : [];
  const currentWord = getAdventureWord(lastCard);
  const nearby = hud.missions.filter(actor => {
    const x = (actor.x-hud.camera.x)*hud.camera.zoom, y = (actor.y-hud.camera.y)*hud.camera.zoom;
    return x >= 25 && x <= hud.width-25 && y >= 25 && y <= hud.height-25;
  });
  const bearings = new Set<string>();
  const distant = hud.missions.filter(actor => !nearby.some(item => item.id === actor.id)).sort((a,b) => {
    const center = {x:hud.camera.x+hud.width/hud.camera.zoom/2,y:hud.camera.y+hud.height/hud.camera.zoom/2};
    return Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y);
  }).filter(actor => { const choice = actor.choiceId ?? actor.id; if (bearings.has(choice)) return false; bearings.add(choice); return true; });
  const navigationPositions: { left: number; top: number; size: number; offscreen: boolean }[] = [];
  const navigationSpacing = Math.max(56, ...hud.missions.map(actor => (actor.radius * 2 + 28) * hud.camera.zoom)) + 6;
  const missionButtons = [...nearby,...distant].map((actor, index) => {
    const x = (actor.x - hud.camera.x) * hud.camera.zoom, y = (actor.y - hud.camera.y) * hud.camera.zoom;
    const touchSize = Math.max(56, (actor.radius * 2 + 28) * hud.camera.zoom), margin = Math.max(35, touchSize / 2 + 4);
    let left = Math.max(margin, Math.min(hud.width - margin, x)), top = Math.max(margin, Math.min(hud.height - margin, y));
    const offscreen = x !== left || y !== top;
    if (offscreen) {
      const alongVertical = Math.abs(x - left) >= Math.abs(y - top), baseLeft = left, baseTop = top;
      // Several offscreen targets can share the same bearing. Keep every touch
      // button reachable instead of piling three invisible choices on one point.
      for (let step = 0; step < 20; step++) {
        const offset = (step % 2 ? 1 : -1) * Math.ceil(step / 2) * navigationSpacing;
        const candidateLeft = alongVertical ? baseLeft : Math.max(margin, Math.min(hud.width - margin, baseLeft + offset));
        const candidateTop = alongVertical ? Math.max(margin, Math.min(hud.height - margin, baseTop + offset)) : baseTop;
        if (navigationPositions.every(previous => !previous.offscreen || Math.abs(previous.left - candidateLeft) >= (previous.size + touchSize) / 2 + 4 || Math.abs(previous.top - candidateTop) >= (previous.size + touchSize) / 2 + 4)) { left = candidateLeft; top = candidateTop; break; }
      }
    }
    navigationPositions.push({ left, top, size: touchSize, offscreen });
    // Mutable controls are read only when this click handler runs, never during this map render.
    // eslint-disable-next-line react-hooks/refs
    return <button key={actor.id} className={`mission-hitbox ${offscreen ? "offscreen" : ""} ${state.current.hintUsed && actor.choiceId === task.answer ? "target-hint" : ""}`} style={{ left, top, width: touchSize, height: touchSize }} aria-label={`游向任务目标${index + 1}`} onClick={() => followMission(actor.id)}><span className="sr-only">游向目标{index + 1}</span>{offscreen && <span className="mission-navigation" aria-hidden="true"><span>🐚</span><ArrowRight size={18} style={{ transform: `rotate(${Math.atan2(y - top, x - left)}rad)` }}/></span>}</button>;
  });
  return <section className={`continuous-adventure adventure-${mode}${mapFullscreen ? " adventure-fullscreen" : ""}`} onPointerDownCapture={() => fullscreen.current?.requestNative()} aria-label={mode === "fish" ? "海洋成长冒险" : "贪吃蛇连续版"}>
    <header className="adventure-toolbar"><button onClick={() => { save(); leaving.current = true; invalidateAssetLoad(); active.current = false; paused.current = true; control.current.moving = false; cancelNarration(); onBack(); }} aria-label="收好冒险返回地图"><ArrowLeft/>地图</button><div><h1>{mode === "fish" ? "海洋成长冒险" : "贪吃蛇连续版"}</h1><small>{currentSpecies ? `${tierNames[currentSpecies.tier]} · ${currentSpecies.en}` : `${snakeBreeds[0].en} · ${hud.length} 节`} · 成长 {hud.xp}</small></div><button disabled={assetPhase !== "ready"} onClick={() => { pause(); setBook(true); }} aria-label="成长图鉴"><BookOpen/></button><button disabled={assetPhase !== "ready" || error.includes("学习记录已更新")} onClick={() => isPaused ? start() : pause()} aria-label={isPaused ? "继续冒险" : "暂停冒险"}>{isPaused ? <Play/> : <Pause/>}</button><button onClick={() => { pause(); onSettings(); }} aria-label="声音设置"><Settings2/></button></header>
    <div className="adventure-mission"><div><small>第 {state.round + 1} 轮 · 英语目标 {state.taskIndex + 1}/12 {task.requiredCount > 1 ? `· 已找到 ${hud.count}/${task.requiredCount}` : ""}</small><strong lang="en">{task.promptEn}</strong><span>{cardVoice ? `正在听词卡：${cardVoice} · 继续游` : speaking ? "先听完整句子，游动时有保护" : state.current.hintUsed ? task.promptZh : mode === "fish" ? "听英语，找到带贝壳圈的目标" : "听英语，游向正确图卡"}</span></div><button disabled={assetPhase !== "ready"} onClick={() => replay()} aria-label="重听英语目标"><Volume2/>{speaking ? "正在听" : "重听"}</button><button disabled={assetPhase !== "ready"} onClick={() => { if (!start(false)) return; update(p => ({ ...p, adventure: markAdventureHint(p.adventure, mode) })); void say(); }} aria-label="乐乐提示"><HelpCircle/>提示</button></div>
    <div className="adventure-world" ref={frame} onPointerDown={event => { if (!canInteract() || (event.target as HTMLElement).closest("button")) return; event.currentTarget.setPointerCapture(event.pointerId); aim(event); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) aim(event); }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); control.current.target = undefined; control.current.followId = undefined; }}>
      <canvas ref={canvas} aria-busy={assetPhase === "loading" || assetPhase === "painting"} data-ocean-renderer={mode === "fish" ? "natural-images" : undefined} aria-label={mode === "fish" ? "写实鱼群海洋地图，可拖动手指控制游动" : "连续冒险地图，可拖动手指控制游动"}/>
      <button className="adventure-fullscreen-toggle" aria-label={mapFullscreen ? "退出全屏地图" : "全屏地图"} aria-pressed={mapFullscreen} title={mapFullscreen ? "退出全屏地图" : "全屏地图"} onClick={() => fullscreen.current?.toggle()}>{mapFullscreen ? <Minimize2/> : <Maximize2/>}<span>{mapFullscreen ? "退出" : "全屏"}</span></button>
      {assetPhase === "ready" && missionButtons}
      <div className="world-legend" aria-label="大小与食物规则"><span className="edible">{mode === "fish" ? "绿色 · 比我小，可以吃" : "小蛇撞大蛇身体会散开"}</span><span className="larger">{mode === "fish" ? "橙色 · 比我大，先绕开" : "散开的碎片也能吃"}</span></div>
      {currentWord && <div className="collected-card" aria-live="polite"><WordPicture id={currentWord.id}/><span><small>刚收集的英语图卡</small><strong lang="en">{currentWord.en}</strong><b>{currentWord.zh}</b></span></div>}
      {evolutionMessage && <div className="evolution-toast" role="status">{evolutionMessage}</div>}
      {assetPhase !== "ready" && <div className="adventure-loading-overlay"><div className="adventure-loading-card" role="status" aria-live="polite" aria-atomic="true"><span className="adventure-loading-symbol" aria-hidden="true">{assetPhase === "error" ? "🐚" : "🌊"}</span><strong>{assetPhase === "error" ? "图片还没准备好" : assetPhase === "painting" ? "正在画出冒险地图" : "正在准备冒险地图"}</strong><p>{assetPhase === "error" ? "小伙伴的图片暂时没加载出来，点一下再试试。" : assetPhase === "painting" ? "伙伴和风景图片准备好了，马上就能出发。" : mode === "fish" ? "正在加载伙伴、海草和英语图卡。准备好后，拖动海面或按方向键出发。" : "正在加载小蛇、风景和英语图卡。准备好后，拖动地图或按方向键出发。"}</p>{assetPhase === "error" && <><small>{assetError}</small><button onClick={retryImages}>重试图片</button></>}</div></div>}
      {assetPhase === "ready" && <div className="adventure-status" role="status">{error || message}{error.includes("学习记录已更新") ? <button onClick={() => { leaving.current = true; invalidateAssetLoad(); cancelNarration(); onBack(); }}>返回地图继续</button> : error && <button onClick={() => replay()}>点我重试</button>}</div>}
      {assetPhase === "ready" && !started && !isPaused && !book && <div className="adventure-overlay"><AdventureSprite mode={mode} index={mode === "fish" ? hud.stage : 0}/><strong>拖动地图或按方向键出发</strong><p>{mode === "fish" ? "吃小鱼慢慢长大，贝壳圈里是英语任务鱼" : "吃一个长一节，听英语收图卡，和电脑蛇一起游"}</p><button className="adventure-explain" onClick={() => replay(true)}><Volume2 size={20}/>听乐乐讲怎么玩</button></div>}
    </div>

    <div className="adventure-bottom">{mode==="fish" && <div className={`ocean-treasure-dock ${tickets ? "ready" : ""}`} aria-label="英语卡片宝箱"><Gift aria-hidden="true"/><div><strong>宝箱卡片 {treasure.roundCards.length}/{TREASURE_CARD_TARGET}</strong><small>{tickets ? `${tickets} 个宝箱等你开启` : "集齐5种不同英语卡，免费抽伙伴贴纸"}</small></div><button disabled={assetPhase !== "ready" || speaking || error.includes("学习记录已更新")} onClick={showTreasure} aria-label={tickets ? `开启海洋宝箱，可开${tickets}个` : "查看海洋宝箱贴纸"}>{tickets ? "开启宝箱" : "我的贴纸"}<span>{Object.keys(treasure.prizes).length}/8</span></button></div>}<div className="adventure-growth"><AdventureSprite mode={mode} index={mode === "fish" ? hud.stage : 0}/><div>{currentSpecies && <div className="current-species"><strong>{currentSpecies.zh} <span lang="en">{currentSpecies.en}</span></strong><small>第 {currentSpecies.tier} 梯队 · {tierNames[currentSpecies.tier]} · 已解锁 {unlockedSpecies.length}/{oceanSpecies.length} 位伙伴</small></div>}<strong className="growth-counter">成长 {hud.xp} 点 <span role="status" aria-live="polite">{pointNotice > 0 ? `+${pointNotice}` : ""}</span></strong>{hud.boost > 1 && <span className="speed-boost-status" role="status">⚡ {hud.boost} 倍速度 · {hud.boostSeconds} 秒</span>}<strong className="next-form">{mode === "snake" ? `已经长到 ${hud.length} 节，吃一份再长一节` : nextStage ? `再吃 ${Math.max(0, nextStage.xp - hud.xp)} 点成长，变成${nextStage.title}` : "继续探索，收集英语目标"}</strong>{mode === "fish" && <div className="growth-track"><i style={{ width: `${nextStage ? (hud.xp - stage.xp) / (nextStage.xp - stage.xp) * 100 : 100}%` }}/></div>}<small>{hud.seconds >= 900 ? "眼睛也想休息一下，随时收好冒险再回来" : mode === "snake" ? `${hud.length} 节 · 电脑蛇也在吃食物长大` : `${oceanSpecies.length} 位伙伴 · ${oceanEvolution.length}种成长形态 · 点图鉴听英文`}</small></div></div><div className="adventure-directions" aria-label="方向控制">{([[0,-1,ArrowUp,"向上"],[-1,0,ArrowLeft,"向左"],[0,1,ArrowDown,"向下"],[1,0,ArrowRight,"向右"]] as const).map(([x,y,Icon,label]) => <button key={label} disabled={assetPhase !== "ready"} aria-label={label} onPointerDown={event => { event.preventDefault(); direction(x,y); }} onClick={() => direction(x,y)}><Icon/></button>)}</div></div>
    {treasureOpen && <Dialog open onOpenChange={open=>{if(!open)closeTreasure();}}><DialogContent className="ocean-treasure-dialog" showCloseButton={false}><div className="treasure-scroll"><DialogTitle>乐乐的海洋宝箱</DialogTitle><DialogDescription>每集齐5种不同英语图卡，获得一个免费宝箱。同一组重复单词不重复计数；集满后点按钮开启。</DialogDescription>
      <div className="treasure-prize" aria-live="polite">{displayedPrize ? <><AdventureSprite mode="fish" index={0} speciesId={displayedPrize.id}/><strong>{displayedPrize.zh} · 伙伴贴纸</strong><button className="name-audio" aria-label={`听贴纸英文 ${displayedPrize.en}`} onClick={()=>void hearName(displayedPrize.en)}><Volume2/><span lang="en">{displayedPrize.en}</span></button></> : <><Gift size={64} aria-hidden="true"/><strong>{tickets ? "你的英语宝藏准备好啦！" : `再收集${TREASURE_CARD_TARGET-treasure.roundCards.length}种英语图卡`}</strong></>}</div>
      {bookVoice && <p className="book-voice" role="status">正在听：{bookVoice}</p>}
      <button className="treasure-draw" disabled={!tickets || error.includes("学习记录已更新")} onClick={()=>drawTreasure(treasure.opened)}>{prizeShown ? "再开一个宝箱" : "打开宝箱抽贴纸"} · 剩余{tickets}个</button>
      <div className="treasure-sticker-grid" aria-label="伙伴贴纸收藏">{oceanStickerIds.map(id=>{const species=getOceanSpecies(id)!;return <div key={id} className={treasure.prizes[id] ? "collected" : "uncollected"}><AdventureSprite mode="fish" index={0} speciesId={id}/><strong>{species.zh}</strong><span lang="en">{species.en}</span><small>{treasure.prizes[id] ? `已收藏 ×${treasure.prizes[id]}` : "等你发现"}</small></div>;})}</div>
      <p className="treasure-rules">每次必得一张贴纸，先集齐8款再重复。贴纸用于收藏；鱼的形态继续靠吃食物成长。</p></div><button className="treasure-return" onClick={()=>closeTreasure(true)}>收好宝藏，继续游 <Play size={18}/></button>
    </DialogContent></Dialog>}
    {book && <div className="adventure-book" role="dialog" aria-modal="true" aria-labelledby="adventure-book-title"><div>
      <div className="ecology-book-heading"><div><h2 id="adventure-book-title">{mode === "fish" ? "海洋成长图鉴" : "小蛇与英语图卡"}</h2><p>{mode === "fish" ? `你是${currentSpecies!.zh} · 已解锁 ${unlockedSpecies.length}/${oceanSpecies.length} 位伙伴` : `${hud.length} 节 · 已收集 ${state.collectedWords.length}/80 张英语图卡`}</p></div><button className="book-close" onClick={() => { cancelNarration(); setBookVoice(""); setBook(false); }}>收好图鉴</button></div>
      <div className="ecology-book-tabs" aria-label="图鉴分类"><button aria-pressed={bookTab === "growth"} onClick={() => setBookTab("growth")}>成长路线</button><button aria-pressed={bookTab === "species"} onClick={() => setBookTab("species")}>{mode === "fish" ? `${oceanSpecies.length} 位水世界伙伴` : "8 种小蛇"}</button><button aria-pressed={bookTab === "words"} onClick={() => setBookTab("words")}>80 张英语图卡</button></div>
      {bookVoice && <p className="book-voice" role="status">正在听：{bookVoice}</p>}
      {bookTab === "growth" && <><p>{mode === "fish" ? "吃英语卡 +50 成长，完成一项贝壳任务 +100 成长。卡片有机会获得2倍或4倍速度，持续6秒；点英文小喇叭听名字。" : "每吃一张英语卡加50成长、长一节；有机会获得2倍或4倍速度，持续6秒。小蛇碰到大蛇的身体会散成食物，从一节重新出发，成长和图卡收藏会留下。"}</p><div className="adventure-stage-grid">{adventureStages[mode].map((item,index) => { const species = mode === "fish" ? getOceanSpecies(oceanEvolution[index].speciesId)! : undefined; return <div key={item.title} className={`${hud.xp >= item.xp ? "unlocked" : "locked"} ${index === hud.stage ? "current-form" : ""}`}><span className="evolution-number">{index+1}</span><AdventureSprite mode={mode} index={mode === "fish" ? index : 0}/><strong>{item.title}</strong>{species && <button className="name-audio" aria-label={`听英文 ${species.en}`} onClick={() => void hearName(species.en)}><Volume2 size={18}/><span lang="en">{species.en}</span></button>}<small>{index === hud.stage ? "你现在的形态" : hud.xp >= item.xp ? "已解锁" : `${item.xp} 点成长后解锁`}</small></div>; })}</div></>}
      {bookTab === "species" && mode === "fish" && <><div className="ecology-filters" aria-label="伙伴梯队">{[0,1,2,3,4,5].map(tier => <button key={tier} aria-pressed={bookTier === tier} onClick={() => setBookTier(tier)}>{tier ? `${tier} · ${tierNames[tier]}` : "全部伙伴"}</button>)}</div><p>灭绝伙伴和幻想伙伴会有标记。伙伴大小和换形态是游戏规则。</p><div className="ecology-species-grid">{oceanSpecies.filter(item => !bookTier || item.tier === bookTier).map(item => <article key={item.id} className={oceanSizeLevel(item.id) <= hud.stage ? "unlocked" : "locked"}><AdventureSprite mode="fish" index={0} speciesId={item.id}/><strong>{item.zh}</strong><button className="name-audio" aria-label={`听英文 ${item.en}`} onClick={() => void hearName(item.en)}><Volume2 size={17}/><span lang="en">{item.en}</span></button><small>{item.fictional ? "幻想伙伴 · " : item.extinct ? "灭绝伙伴 · " : ""}{oceanSizeLevel(item.id) <= hud.stage ? "已解锁" : `成长第${oceanSizeLevel(item.id)+1}级时解锁`}</small></article>)}</div></>}
      {bookTab === "species" && mode === "snake" && <div className="ecology-species-grid snake-breed-grid">{snakeBreeds.map(item => <article key={item.id}><AdventureSprite mode="snake" index={item.artIndex}/><strong>{item.zh}</strong><button className="name-audio" aria-label={`听英文 ${item.en}`} onClick={() => void hearName(item.en)}><Volume2 size={17}/><span lang="en">{item.en}</span></button><small>在地图上一起游动、一起长大</small></article>)}</div>}
      {bookTab === "words" && <><div className="ecology-filters" aria-label="英语图卡类别"><button aria-pressed={bookCategory === "all"} onClick={() => setBookCategory("all")}>全部</button>{Object.entries(categoryNames).map(([id,title]) => <button key={id} aria-pressed={bookCategory === id} onClick={() => setBookCategory(id)}>{title}</button>)}</div><div className="ecology-word-grid">{adventureVocabulary.filter(item => bookCategory === "all" || item.category === bookCategory).map(item => <article key={item.id}><WordPicture id={item.id}/><strong>{item.zh}</strong><button className="name-audio" aria-label={`听英文 ${item.en}`} onClick={() => void hearName(item.en)}><Volume2 size={17}/><span lang="en">{item.en}</span></button><small>{state.collectedWords.includes(item.id) ? "已收集" : categoryNames[item.category]}</small></article>)}</div></>}
    </div></div>}
  </section>;
}

export function AdventureReport({ progress }: {progress:Progress}) {
  return <section className="adventure-report"><h2>连续冒险中的英语练习</h2><p>独立听懂的选择与游戏成长分别记录；提示后找到目标属于练习完成。</p><div>{(["fish","snake"] as const).map(mode => { const state = progress.adventure.modes[mode], review = getAdventureReviewIds(progress.adventure, mode).map(id => getAdventureTaskById(id).promptEn); return <article key={mode}><h3>{mode === "fish" ? "海洋成长冒险" : "贪吃蛇连续版"}</h3><dl><dt>首次独立正确</dt><dd>{state.firstChoices ? `${Math.round(state.firstCorrect / state.firstChoices * 100)}% (${state.firstCorrect}/${state.firstChoices})` : "还没有记录"}</dd><dt>完成英语目标</dt><dd>{state.completedTasks} 次</dd><dt>提示 / 重听</dt><dd>{state.hints} / {state.listenCount} 次</dd><dt>游戏成长 / 游玩时间</dt><dd>{state.xp} 点 / {Math.floor(state.totalSeconds / 60)} 分钟</dd></dl>{review.length > 0 && <p>需要再练：{review.join(" ")}（下一轮安排再见）</p>}</article>; })}</div></section>;
}
