"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CarFront, Coins, Flower2, HelpCircle, Pause, PawPrint, Play, Settings2, Volume2 } from "lucide-react";
import { GardenGame, PlantArt } from "./garden-game";
import { PetTownGame, PetAvatar } from "./pet-town-game";
import { RacingGame, CarArt } from "./racing-game";
import { getPlaygroundTask, playgroundInfo, playgroundModes, playgroundTasks, type PlaygroundMode, type PlaygroundTask } from "@/lib/playground-content";
import { markPlaygroundHint, markPlaygroundListen, playgroundCursor, recordPlaygroundTime, submitPlaygroundAnswer, type PlaygroundModeState, type PlaygroundProgress } from "@/lib/playground-progress";
import { playAdventureEffect, playSpeech, stopSpeech, unlockAudio } from "@/lib/audio";
import type { Progress } from "@/lib/progress";
import "./playground.css";

type Commit = (next: Progress | ((progress: Progress) => Progress)) => Progress;
const icons = { garden: Flower2, pets: PawPrint, racing: CarFront };
export function PlaygroundEntries({ progress, onOpen, ready }: { progress: Progress; onOpen: (mode: PlaygroundMode) => void; ready: boolean }) {
  return <section className="playground-entries" aria-label="三个新伙伴游戏"><div className="playground-entries-heading"><span>听懂英语，创造自己的小世界</span><small>随时开始 · 会记住你的成长</small></div><div className="playground-entry-grid">{playgroundModes.map(mode => {
    const info = playgroundInfo[mode], Icon = icons[mode], state = progress.playground.modes[mode];
    return <button key={mode} className={`playground-entry playground-entry-${mode}`} disabled={!ready} onClick={() => onOpen(mode)} aria-label={`打开${info.title}`}><div className="playground-entry-art" aria-hidden="true"><span className="playground-entry-sun"/>{mode === "garden" ? <PlantArt plant="sunflower"/> : mode === "pets" ? <PetAvatar pet="puppy"/> : <CarArt/>}<span className="playground-entry-hill"/><span className="playground-entry-spark">✦</span></div><div><span className="playground-new"><Icon size={13}/>新伙伴游戏</span><strong>{info.title}</strong><p>{info.subtitle}</p><b>{state.completed ? `继续玩 · 已完成 ${state.completed} 个任务` : "点一下，出发！"} <Play size={17}/></b></div></button>;
  })}</div></section>;
}

export function Playground({ mode, progress, commit, onBack, onSettings, onSwitch, suspended = false }: { mode: PlaygroundMode; progress: Progress; commit: Commit; onBack: () => void; onSettings: () => void; onSwitch: (mode: PlaygroundMode) => void; suspended?: boolean }) {
  const state = progress.playground.modes[mode], info = playgroundInfo[mode];
  const [paused, setPaused] = useState(false), [hidden, setHidden] = useState(false), [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [celebration, setCelebration] = useState<{ task: PlaygroundTask; state: PlaygroundModeState } | null>(null);
  const live = useRef({ progress, commit }), token = useRef(0), mounted = useRef(true), locked = useRef(false), introPlayed = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gates = useRef({ paused, hidden, suspended });
  const task = celebration?.task ?? getPlaygroundTask(mode, state.round, state.index), visualState = celebration?.state ?? state;
  const stopped = paused || hidden || suspended;
  useEffect(() => { live.current = { progress, commit }; }, [progress, commit]);
  useEffect(() => { gates.current = { paused, hidden, suspended }; }, [paused, hidden, suspended]);
  function update(fn: (value: PlaygroundProgress) => PlaygroundProgress) {
    const result = live.current.commit(p => ({ ...p, playground: fn(p.playground) })); live.current = { ...live.current, progress: result }; return result;
  }
  async function narrate(withGuide = false) {
    if (!mounted.current || document.hidden || gates.current.paused || gates.current.hidden || gates.current.suspended || locked.current) return;
    const expected = playgroundCursor(live.current.progress.playground, mode), active = getPlaygroundTask(mode, expected.round, expected.index), request = ++token.current;
    setError(""); setSpeaking(true);
    try {
      if (withGuide) {
        // Children can start interacting during the welcome. Never repeat it over every new task.
        introPlayed.current = true;
        await playSpeech(info.guide, "zh"); if (!mounted.current || token.current !== request) return;
      }
      await playSpeech(active.promptEn);
      if (mounted.current && token.current === request && !document.hidden && !gates.current.paused && !gates.current.hidden && !gates.current.suspended) update(p => markPlaygroundListen(p, mode, expected));
    } catch (cause) { if (mounted.current && token.current === request) setError(cause instanceof Error ? cause.message : "点小喇叭，可以再听一次。"); }
    finally { if (mounted.current && token.current === request) setSpeaking(false); }
  }
  useEffect(() => {
    if (stopped || celebration) return;
    void narrate(!introPlayed.current);
    // This ref is a cancellation counter, not a captured DOM node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { token.current++; stopSpeech(); };
    // Listening updates must not restart the same sentence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, state.round, state.index, stopped, Boolean(celebration)]);
  useEffect(() => {
    const visibility = () => { gates.current.hidden = document.hidden; setHidden(document.hidden); if (document.hidden) { token.current++; stopSpeech(); setSpeaking(false); } };
    const pause = () => { gates.current.paused = true; token.current++; stopSpeech(); setSpeaking(false); setPaused(true); };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("learning-pause", pause); window.addEventListener("native-background", pause); window.addEventListener("pagehide", pause);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("learning-pause", pause); window.removeEventListener("native-background", pause); window.removeEventListener("pagehide", pause); };
  }, []);
  useEffect(() => {
    let previous = Date.now(), accumulated = 0;
    const time = setInterval(() => {
      const now = Date.now(), elapsed = now - previous; previous = now;
      if (!document.hidden && !gates.current.paused && !gates.current.hidden && !gates.current.suspended && elapsed <= 2500) accumulated += elapsed;
      if (accumulated >= 10000) { const seconds = Math.floor(accumulated / 1000); accumulated -= seconds * 1000; update(p => recordPlaygroundTime(p, mode, seconds)); }
    }, 1000);
    return () => { clearInterval(time); if (accumulated >= 1000) update(p => recordPlaygroundTime(p, mode, Math.floor(accumulated / 1000))); };
    // This component owns one game session; current progress is read from live.
  }, [mode]);
  useEffect(() => {
    mounted.current = true;
    // This ref is a cancellation counter, not a captured DOM node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { mounted.current = false; token.current++; stopSpeech(); if (timer.current) clearTimeout(timer.current); };
  }, []);
  function interact() { void unlockAudio().catch(() => {}); }
  function answer(selected: string, taskId?: string) {
    if (locked.current || gates.current.paused || gates.current.hidden || gates.current.suspended || document.hidden) return;
    const before = live.current.progress.playground, expected = playgroundCursor(before, mode);
    if (taskId && taskId !== expected.taskId) return;
    const result = submitPlaygroundAnswer(before, mode, expected, selected);
    if (!result.applied) return;
    let applied = false;
    update(p => { if (playgroundCursor(p, mode).round !== expected.round || playgroundCursor(p, mode).index !== expected.index) return p; applied = true; return submitPlaygroundAnswer(p, mode, expected, selected).progress; });
    if (!applied) return;
    token.current++; stopSpeech(); setSpeaking(false);
    if (!result.correct) {
      setMessage("再听一听，换一个试试。小伙伴会等你！");
      playAdventureEffect("retry"); void narrate(); return;
    }
    locked.current = true; setCelebration({ task: getPlaygroundTask(mode, expected.round, expected.index), state: before.modes[mode] });
    setMessage(`太棒了！+10 快乐金币${result.progress.modes[mode].index === 0 ? " · 新一轮冒险开始啦！" : ""}`);
    playAdventureEffect("correct");
    timer.current = setTimeout(() => { if (!mounted.current) return; locked.current = false; setCelebration(null); setMessage(""); }, mode === "racing" ? 1300 : 1400);
  }
  function hint() {
    const expected = playgroundCursor(live.current.progress.playground, mode);
    update(p => markPlaygroundHint(p, mode, expected)); setMessage("亮着光的是需要的物品和小伙伴，跟着试一次吧。");
  }
  const shared = { state: visualState, hinted: visualState.current.hintUsed, disabled: stopped || Boolean(celebration), onAnswer: answer, onInteract: interact };
  const Icon = icons[mode];
  return <section className={`playground-shell playground-shell-${mode}`} aria-label={info.title}>
    <header className="playground-topbar"><button className="secondary-button" aria-label="探索地图" onClick={onBack}><ArrowLeft size={20}/><span>探索地图</span></button><div className="playground-title"><Icon size={25}/><h1>{info.title}</h1></div><button className="secondary-button" aria-label="游戏声音设置" onClick={onSettings}><Settings2 size={22}/></button></header>
    <div className="playground-command"><div><span className="playground-command-label">乐乐的英语小任务 · {visualState.index + 1}/{playgroundTasks[mode].length}</span><strong lang="en">{task.promptEn}</strong><p>{visualState.current.hintUsed ? task.promptZh : mode === "racing" ? "听英语，把车上的礼物送到正确的地方。" : "先听英语，再选物品，让小世界动起来。"}</p></div><div className="playground-command-buttons"><button className="secondary-button" aria-label="重听英语任务" disabled={Boolean(celebration) || stopped} onClick={() => void narrate()}><Volume2 className={speaking ? "playground-speaking" : ""} size={23}/><span>再听一次</span></button><button className="secondary-button" disabled={Boolean(celebration) || stopped} onClick={hint}><HelpCircle size={22}/><span>帮帮我</span></button><button className="secondary-button" aria-label={paused ? "继续游戏" : "暂停游戏"} onClick={() => setPaused(value => !value)}>{paused ? <Play size={22}/> : <Pause size={22}/>}</button></div></div>
    {error && <div className="playground-audio-error" role="alert">{error}<button disabled={stopped || Boolean(celebration)} onClick={() => void narrate()}>重试声音</button></div>}
    <div className={`playground-stage ${stopped ? "playground-stage-paused" : ""}`}>
      {task.mode === "garden" && <GardenGame {...shared} task={task}/>}{task.mode === "pets" && <PetTownGame {...shared} task={task}/>}{task.mode === "racing" && <RacingGame {...shared} task={task}/>}
      {paused && !suspended && <button className="playground-resume" onClick={() => { interact(); setPaused(false); }}><Play size={26}/>继续和伙伴玩</button>}
    </div>
    <div className={`playground-feedback ${celebration ? "playground-feedback-success" : ""}`} role="status">{message || "点选或拖动都能玩 · 做错了可以马上再试"}</div>
    <footer className="playground-footer"><div><Coins size={23}/><strong>{state.coins}</strong><span>快乐金币</span><i/>已完成 {state.completed} 个任务</div><nav aria-label="继续下一个伙伴游戏">{playgroundModes.filter(item => item !== mode).map(item => { const Next = icons[item]; return <button key={item} onClick={() => onSwitch(item)}><Next size={21}/>{playgroundInfo[item].title}</button>; })}</nav></footer>
  </section>;
}

export function PlaygroundReport({ progress }: { progress: Progress }) {
  return <section className="playground-report"><h2>生活游戏里的英语练习</h2><p>记录第一次回答和提示使用；快乐金币表示游戏中的努力。</p><div className="playground-report-grid">{playgroundModes.map(mode => { const state = progress.playground.modes[mode], Icon = icons[mode]; return <article key={mode}><Icon size={26}/><h3>{playgroundInfo[mode].title}</h3><strong>{state.completed ? `${Math.round(state.firstCorrect / state.completed * 100)}%` : "—"}</strong><p>首次独立答对 {state.firstCorrect}/{state.completed}</p><span>使用提示 {state.hints} 次 · {Math.ceil(state.totalSeconds / 60)} 分钟</span><small>{state.coins} 快乐金币 · 第 {state.round + 1} 轮</small></article>; })}</div><p>这些是启蒙生活任务，游戏奖励和通关次数不代表达到完整 A1。</p></section>;
}
