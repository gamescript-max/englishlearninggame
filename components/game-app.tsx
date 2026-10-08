"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowLeft, Box, Brain, CaseLower, Check, CheckCircle2, CircleDot, Clock3, Compass, Crown, Download, Hand, Headphones, HelpCircle, Images, Leaf, Link2, LockKeyhole, Mic, Music2, Package, PawPrint, Play, RefreshCw, Settings2, ShieldCheck, Sparkles, Star, Table2, Trash2, Upload, Utensils, Volume2, Worm } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Recorder } from "@/components/recorder";
import { LearningStudio } from "@/components/learning-studio";
import { LearningReport } from "@/components/learning-report";
import { InstallPanel } from "@/components/install-panel";
import { Playground, PlaygroundEntries, PlaygroundReport } from "@/components/playground";
import { playgroundInfo, type PlaygroundMode } from "@/lib/playground-content";
import { initNativePlatform, exitNativeApp, saveBackup } from "@/lib/native-platform";
import { WordArt } from "@/components/word-art";
import { MemoryGame, SceneGame, SpellingGame } from "@/components/bonus-games";
import { CatchGame } from "@/components/catch-game";
import { WorldMap, LessonTrail } from "@/components/adventure-map";
import { SnakeGame } from "@/components/snake-game";
import { AdventureEntries, AdventureReport, ContinuousAdventure } from "@/components/continuous-adventure";
import { getCurrentAdventureTask, startAdventure } from "@/lib/adventure-progress";
import type { AdventureMode } from "@/lib/adventure-content";
import { BubbleGame, ConnectionGame, DeliveryGame } from "@/components/exploration-games";
import { destinationLessons, type DestinationId } from "@/lib/destinations";
import { SpeechCaption } from "@/components/speech-caption";
import { useWebMCP } from "@/components/use-webmcp";
import { bonusInstructions, getLesson, getTopic, getWord, lessons, positions, supportWords, topics, type Exercise, type Lesson } from "@/lib/course";
import { createProgress, dayKey, getDueWords, getFollowingLesson, getNextLesson, getStats, isLessonUnlocked, parseBackup, recordListen, recordSpeaking, serializeBackup, settleRun, startRun, submitAnswer, updateSettings, useHint as markHint, type AnswerRecord, type Progress } from "@/lib/progress";
import { useProgress } from "@/lib/use-progress";
import { playEffect, playSpeech, preloadSpeech, setAudioSettings, setMusicTheme, stopSpeech, stopAllAudio, unlockAudio, type MusicTheme } from "@/lib/audio";

type Screen = "map" | "trail" | "game" | "result" | "pet" | "parent" | "learning" | "adventure" | "playground";
type Feedback = { correct: boolean; exercise: Exercise; selected: string };
type Result = { lesson: Lesson; answers: AnswerRecord[]; earned: number };
type Confirmation = { kind: "reset" } | { kind: "import"; progress: Progress } | { kind: "switch"; lessonId: string };

const guidance = {
  listen: "听一听，找到图片，点一下。", match: "看单词，找到对应的图片。", place: "先点物品，再点要放的位置。也可以拖过去。",
  ...bonusInstructions,
};
const bonusGames = [
  { order: 7, name: "记忆翻牌", description: "记住图片位置，听声音翻开宝藏。", Icon: Brain, color: "memory" },
  { order: 8, name: "听音拼单词", description: "把小字母排好队，拼出听到的词。", Icon: CaseLower, color: "spell" },
  { order: 9, name: "听音选场景", description: "听一句英语，找到意思一样的图片。", Icon: Images, color: "scene" },
  { order: 10, name: "英语贪吃蛇", description: "大蛇吃小蛇，边长大边听下一个英语目标。", Icon: Worm, color: "snake" },
  { order: 11, name: "听音泡泡", description: "找齐两种目标图片，点破泡泡收宝藏。", Icon: CircleDot, color: "bubble" },
  { order: 12, name: "快递订单", description: "装满托盘，再送给乐乐，可以拿回重装。", Icon: Package, color: "serve" },
  { order: 13, name: "图词连线", description: "点单词，再点图片，架起三座词语桥。", Icon: Link2, color: "connect" },
  { order: 14, name: "听音接星星", description: "移动小篮子，接住从天空落下的英语图卡。", Icon: Star, color: "catch" },
] as const;
const growthNames = ["小小探险家", "森林好朋友", "勇敢探险家"];

function Fox({ stage = 1, large = false }: { stage?: number; large?: boolean }) {
  // The bundled transparent PNG is already sized for this character slot.
  // eslint-disable-next-line @next/next/no-img-element
  return <div className={`fox-wrap ${large ? "large-fox" : ""} fox-stage-${stage}`}><img src="/images/fox.png" className="fox-image" alt="橙色狐狸乐乐背着青绿色的小背包，微笑着向你挥手" />{stage > 1 && <span className="fox-badge" aria-label="伙伴成长徽章">{stage === 3 ? <Crown size={25}/> : <Sparkles size={25}/>}</span>}<span className="fox-name">乐乐 · {growthNames[stage - 1]}</span></div>;
}

function PositionDiagram({ position, wordId = "ball" }: { position: string; wordId?: string }) {
  return <span className={`position-example example-${position}`} aria-hidden="true">{position === "in" ? <Box size={56}/> : <Table2 size={56}/>}<WordArt id={wordId} className="position-token"/></span>;
}

function OperationDemo({ lesson, onReplay }: { lesson: Lesson; onReplay: () => void }) {
  const kind = lesson.exercises[0].kind;
  const id = lesson.exercises[0].wordId;
  return <div className={`operation-demo demo-${kind}`}><span className="eyebrow">跟着乐乐的小手试一试</span><div className="demo-stage" aria-label={guidance[kind]}><div className="demo-tile">{kind === "listen" ? <Volume2 size={40}/> : kind === "match" ? <strong>{getWord(id).en}</strong> : <WordArt id={id}/>}<small>{kind === "listen" ? "先听声音" : kind === "match" ? "看英文" : "先点图卡"}</small></div><div className="demo-tile demo-destination">{kind === "place" ? <PositionDiagram position="in" wordId={id}/> : <WordArt id={id}/>}<small>{kind === "place" ? "再点盒子里面" : "点对应的图片"}</small></div><Hand className="demo-hand" size={32} aria-hidden="true"/></div><button className="text-button" onClick={onReplay}><Play size={18}/>听乐乐讲怎么玩</button></div>;
}

function Placement({ exercise, disabled, hinted, onAnswer }: { exercise: Exercise; disabled: boolean; hinted: boolean; onAnswer: (answer: string) => void }) {
  const [selected, setSelected] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  function move(event: PointerEvent<HTMLButtonElement>) {
    if (!origin.current || disabled) return;
    if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 8) setDrag({ x: event.clientX, y: event.clientY });
  }
  function end(event: PointerEvent<HTMLButtonElement>) {
    if (drag) {
      const zone = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-dropzone]");
      if (zone?.dataset.dropzone) onAnswer(zone.dataset.dropzone);
    }
    setDrag(null); origin.current = null;
  }
  return <div className="placement-game"><button className={`place-object ${selected ? "selected" : ""}`} disabled={disabled} aria-label={`选择${getWord(exercise.wordId).zh}图卡`} onClick={() => setSelected(true)} onPointerDown={event => { if (disabled) return; origin.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); setSelected(true); }} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { setDrag(null); origin.current = null; }}><WordArt id={exercise.wordId}/><span>{selected ? "已选好，点一个位置" : "先点我，再选择位置"}</span></button>{drag && <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}><WordArt id={exercise.wordId}/></div>}<div className="drop-zones">{positions.map(position => <button key={position.id} data-dropzone={position.id} className={`drop-zone ${hinted && exercise.answer === position.id ? "hinted" : ""}`} disabled={disabled || !selected} aria-label={`放到${position.zh}`} onClick={() => onAnswer(position.id)} onDragOver={event => event.preventDefault()}><PositionDiagram position={position.id}/><strong>{position.id}</strong><small>{position.zh}</small></button>)}</div><p className="operation-note">也可以把图卡拖到想放的位置。</p></div>;
}

export default function GameApp() {
  const { progress, current, commit, ready, firstVisit, storageError, retry, externalChange, demoMode } = useProgress();
  const [screen, setScreen] = useState<Screen>("map");
  const [adventureMode, setAdventureMode] = useState<AdventureMode>("fish");
  const [playgroundMode, setPlaygroundMode] = useState<PlaygroundMode>("garden");
  const [learningInitial, setLearningInitial] = useState<string|null>(null);
  const [destinationOpen, setDestinationOpen] = useState<DestinationId | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [intro, setIntro] = useState(false);
  const [phrasePractice, setPhrasePractice] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hintRequest, setHintRequest] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [audioError, setAudioError] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState("");
  const [rest, setRest] = useState(false);
  const [visibilityEpoch, setVisibilityEpoch] = useState(0);
  const [layoutStress, setLayoutStress] = useState(false);
  const speechToken = useRef(0);
  const pageActive = useRef(true);
  const firstQuestion = useRef("");
  const sessionStart = useRef(0);
  const importInput = useRef<HTMLInputElement>(null);
  const run = progress.activeRun;
  const lesson = run ? getLesson(run.lessonId) : null;
  const exercise = feedback?.correct ? feedback.exercise : run?.exercises[run.index];
  const stats = getStats(progress);
  const next = getNextLesson(progress);
  const following = result ? getFollowingLesson(progress, result.lesson.id) : null;
  useWebMCP(current, ready);

  // Hydration from browser storage decides whether first-time setup is needed.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (ready && firstVisit) setSetupOpen(true); }, [ready, firstVisit]);
  useEffect(() => { setAudioSettings(progress.settings); }, [progress.settings]);
  useEffect(()=>{if(settingsOpen||setupOpen||confirmation)window.dispatchEvent(new Event("learning-pause"));},[settingsOpen,setupOpen,confirmation]);
  const kind = lesson?.exercises[0].kind;
  const theme: MusicTheme = screen === "playground" ? playgroundInfo[playgroundMode].theme : screen === "adventure" ? adventureMode === "fish" ? "bubbles" : "animals" : screen === "game" ? kind === "bubble" ? "bubbles" : kind === "serve" ? "delivery" : kind === "connect" ? "connect" : kind === "catch" ? "catch" : lesson?.topicId ?? "world" : screen === "trail" ? destinationOpen === "connections" ? "connect" : destinationOpen === "stars" ? "catch" : destinationOpen ?? "world" : "world";
  useEffect(() => { setMusicTheme(theme); }, [theme]);
  useEffect(() => {
    if (screen === "game" && lesson?.exercises[0].kind === "snake" && run?.exercises[run.index + 1]) preloadSpeech(run.exercises[run.index + 1].promptEn);
  }, [screen, lesson, run?.id, run?.index, run?.exercises]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 6000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (screen !== "game") return;
    const timer = setInterval(() => { if (sessionStart.current && Date.now() - sessionStart.current > 15 * 60 * 1000) setRest(true); }, 30000);
    return () => clearInterval(timer);
  }, [screen]);
  useEffect(() => () => { speechToken.current++; stopAllAudio(); }, []);
  useEffect(()=>{let cleanup:(()=>void)|undefined,disposed=false;void initNativePlatform().then(remove=>{if(disposed)remove();else cleanup=remove;});return()=>{disposed=true;cleanup?.();};},[]);
  useEffect(()=>{
    const back=()=>{if(settingsOpen||setupOpen){setSettingsOpen(false);setSetupOpen(false);return;}if(confirmation){setConfirmation(null);return;}if(screen==="learning"){window.dispatchEvent(new Event("learning-back"));return;}if(screen!=="map"){navigate(screen==="game"?"trail":"map");return;}if(window.confirm("要结束今天的英语冒险吗？学习记录已经保存在这台平板上。"))void exitNativeApp();};
    window.addEventListener("native-back",back);return()=>window.removeEventListener("native-back",back);
  },[screen,settingsOpen,setupOpen,confirmation]);
  useEffect(() => {
    if (screen !== "game") return;
    const stop = () => { pageActive.current = false; speechToken.current++; stopAllAudio(); setSpeaking(false); };
    const show = () => { if (!document.hidden) { pageActive.current = true; setVisibilityEpoch(value => value + 1); } };
    const visibility = () => { if (document.hidden) stop(); else show(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", stop);
    window.addEventListener("native-background", stop);
    window.addEventListener("pageshow", show);
    window.addEventListener("native-foreground", show);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", stop); window.removeEventListener("pageshow", show); window.removeEventListener("native-background", stop); window.removeEventListener("native-foreground", show); };
  }, [screen]);
  useEffect(() => {
    if (!externalChange) return;
    // A storage event invalidates the old on-screen run and its microphone/audio.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    navigate("map"); setSetupOpen(false);
    setNotice("另一个标签更新了学习记录。这里已经同步，继续冒险就能接着玩。");
  }, [externalChange]);

  function navigate(to: Screen) {
    speechToken.current++; stopAllAudio(); setSpeaking(false); setAudioError(""); setScreen(to); setFeedback(null); setIntro(false); setPhrasePractice(false);
    if (to !== "game" && !document.hidden && pageActive.current) void unlockAudio().catch(() => {});
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function speak(text: string, language: "en" | "zh" = "en") {
    const token = ++speechToken.current;
    setAudioError(""); setSpeaking(true);
    try { await playSpeech(text, language); } catch (error) { if (token === speechToken.current) setAudioError(error instanceof Error ? error.message : "声音暂时没有播放成功，请重试。"); }
    finally { if (token === speechToken.current) setSpeaking(false); }
  }
  async function speakQuestion(withGuide = false) {
    const active = current.current.activeRun;
    const item = active?.exercises[active.index];
    if (!active || !item || document.hidden || !pageActive.current) return;
    const token = ++speechToken.current;
    setAudioError(""); setSpeaking(true);
    try {
      if (withGuide) { await playSpeech(guidance[item.kind], "zh"); if (token !== speechToken.current) return; }
      await playSpeech(item.promptEn, "en");
      if (!document.hidden && pageActive.current && token === speechToken.current && current.current.activeRun?.id === active.id && current.current.activeRun?.index === active.index) commit(p => recordListen(p));
    } catch (error) { if (token === speechToken.current) setAudioError(error instanceof Error ? error.message : "点小喇叭，可以重新听一次。"); }
    finally { if (token === speechToken.current) setSpeaking(false); }
  }
  useEffect(() => {
    if (screen !== "game" || document.hidden || !pageActive.current || intro || feedback?.correct || !run || run.index >= run.exercises.length) return;
    const key = `${run.id}:${run.exercises[run.index].kind}`;
    const withGuide = firstQuestion.current !== key;
    firstQuestion.current = key;
    void speakQuestion(withGuide);
    // This ref is a cancellation counter, not a captured DOM node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { speechToken.current++; stopSpeech(); };
    // Audio counts change progress without changing the current exercise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, intro, run?.id, run?.index, Boolean(feedback?.correct), visibilityEpoch]);

  useEffect(() => {
    if (!feedback || screen !== "game") return;
    let cancelled = false;
    void playEffect(feedback.correct ? "correct" : "retry").catch(() => {}).then(() => {
      if (cancelled) return;
      if (!feedback.correct) { if (!document.hidden) void speakQuestion(); }
      else if (["snake", "bubble", "serve", "connect", "catch"].includes(feedback.exercise.kind)) {
        // Let feedback cleanup finish before the question effect owns the next voice.
        // No recorder or per-answer continue button interrupts this game.
        const active = current.current.activeRun;
        if (!active || active.id !== run?.id) return;
        if (active.index >= active.exercises.length) finish();
        else setFeedback(null);
      }
    });
    // Invalidate any speech that was started by this feedback request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { cancelled = true; speechToken.current++; stopSpeech(); };
    // Feedback audio starts after the previous question and recorder clean up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, feedback]);

  useEffect(() => {
    if (!hintRequest || screen !== "game" || document.hidden || !pageActive.current) return;
    const active = current.current.activeRun;
    const item = active?.exercises[active.index];
    if (!item) return;
    const token = ++speechToken.current;
    // Synchronize the indicator with this newly scheduled external audio request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpeaking(true); setAudioError("");
    void (async () => {
      try {
        await playSpeech(item.promptZh, "zh");
        if (token === speechToken.current) await playSpeech(item.promptEn, "en");
      } catch (error) { if (token === speechToken.current) setAudioError(error instanceof Error ? error.message : "提示声音没有播放成功，请重试。"); }
      finally { if (token === speechToken.current) setSpeaking(false); }
    })();
    // Invalidate the current hint playback when a new hint or screen replaces it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { speechToken.current++; stopSpeech(); };
    // Start after the old feedback has cleaned up, including when hinting after a wrong answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintRequest]);

  useEffect(() => {
    if (screen !== "result" || !result || document.hidden || !pageActive.current) return;
    void playEffect("reward").catch(() => {});
    return () => stopAllAudio();
  }, [screen, result]);

  function finish() {
    const active = current.current.activeRun;
    if (!active || active.index < active.exercises.length) return;
    const before = current.current.stars;
    const finished = commit(p => settleRun(p));
    setResult({ lesson: getLesson(active.lessonId), answers: active.answers, earned: finished.stars - before });
    navigate("result");
  }
  function begin(lessonId: string, discard = false) {
    if (!ready) return;
    if (!document.hidden) pageActive.current = true;
    const p = current.current;
    if (p.activeRun && p.activeRun.lessonId !== lessonId && !discard) { setConfirmation({ kind: "switch", lessonId }); return; }
    try {
      const nextProgress = commit(startRun(discard ? { ...p, activeRun: null } : p, lessonId));
      if (screen !== "trail" && (!destinationOpen || !destinationLessons(destinationOpen).some(item => item.id === lessonId))) setDestinationOpen(getLesson(lessonId).topicId);
      navigate("game");
      if (!sessionStart.current) sessionStart.current = Date.now();
      if (nextProgress.activeRun && nextProgress.activeRun.index >= nextProgress.activeRun.exercises.length) { finish(); return; }
      void unlockAudio().catch(error => setAudioError(error.message));
    } catch (error) { setNotice(error instanceof Error ? error.message : "这一关暂时还没有开放。"); }
  }
  function answer(selected: string, exerciseId?: string) {
    if (!exercise || feedback?.correct) return;
    const active = current.current.activeRun;
    if (!active || active.id !== run?.id || active.exercises[active.index]?.id !== (exerciseId ?? exercise.id)) return;
    const checked = submitAnswer(current.current, selected);
    commit(checked.progress);
    setFeedback({ correct: checked.correct, exercise, selected });
    speechToken.current++; stopSpeech();
    // Keep movement blocked throughout feedback and the following voice, including retry.
    setSpeaking(["snake", "bubble", "serve", "connect", "catch"].includes(exercise.kind));
  }
  function hint() { if (!exercise) return; commit(p => markHint(p)); setFeedback(null); setHintRequest(value => value + 1); }
  async function backup() {
    try { await saveBackup(serializeBackup(current.current), `${demoMode ? "demo-" : ""}english-island-${dayKey()}.json`);setNotice("已打开备份保存方式，请保存在家长方便找到的位置。"); }
    catch { setNotice("备份没有完成保存。请重试并选择一个保存位置。"); }
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try { if (file.size > 8 * 1024 * 1024) throw new Error("请选择 8 MB 以内的 JSON 备份。"); setConfirmation({ kind: "import", progress: parseBackup(await file.text()) }); }
    catch (error) { setNotice(error instanceof Error ? error.message : "备份读取失败。"); }
    if (importInput.current) importInput.current.value = "";
  }
  function confirm() {
    if (!confirmation) return;
    if (confirmation.kind === "reset") { commit(createProgress(), true); setResult(null); setNotice("学习记录已清空，可以重新开始小冒险。"); navigate("map"); }
    if (confirmation.kind === "import") { commit(confirmation.progress, true); setResult(null); setNotice("备份已恢复，可以继续上次的冒险。"); navigate("map"); }
    if (confirmation.kind === "switch") begin(confirmation.lessonId, true);
    setConfirmation(null);
  }

  function openDestination(id: DestinationId) {
    setDestinationOpen(id); navigate("trail"); void unlockAudio().catch(() => {});
  }
  function openLearning(unitId:string|null=null){setLearningInitial(unitId);navigate("learning");}
  function openAdventure(mode: AdventureMode) { commit(p => ({ ...p, adventure: startAdventure(p.adventure, mode) })); setAdventureMode(mode); navigate("adventure"); }
  function openPlayground(mode: PlaygroundMode) { if (!ready) return; setPlaygroundMode(mode); navigate("playground"); }

  const heard = Boolean(run?.current.listenCount);
  const hinted = Boolean(run?.current.hintUsed);
  const inputLocked = (!heard && !hinted) || speaking || Boolean(feedback?.correct) || Boolean(audioError) || settingsOpen || setupOpen || Boolean(confirmation);
  const isContinuous = screen === "adventure";
  const isSnake = screen === "game" && lesson?.exercises[0].kind === "snake";
  const isExploration = screen === "game" && lesson && ["bubble", "serve", "connect", "catch"].includes(lesson.exercises[0].kind);
  // The displayed question may be the answered one while run.index already points ahead.
  const connectionIndex = exercise?.kind === "connect" && run ? run.exercises.findIndex(item => item.id === exercise.id) : -1;
  const connectionOptions = connectionIndex >= 0 && run ? run.exercises[Math.floor(connectionIndex / 3) * 3]?.options : undefined;

  return <div onPointerDown={() => { if (screen !== "game" && !settingsOpen && !setupOpen) void unlockAudio().catch(() => {}); }} className={`island-app ${screen === "playground" ? "playground-session" : isContinuous ? "continuous-session" : isSnake ? "snake-session" : isExploration ? `exploration-session ${kind === "catch" ? "catch-session" : ""}` : ""}`}>
    <header className="topbar"><a className="brand" href="#map" onClick={event => { event.preventDefault(); navigate("map"); }}><span className="brand-symbol"><Compass size={28}/></span><span>萌宠英语探索岛<small>ENGLISH LEARNING GAME</small></span></a><nav aria-label="主要导航"><button className={`nav-button ${["map", "trail", "game", "result"].includes(screen) ? "active" : ""}`} onClick={() => navigate("map")}><Compass size={20}/>去探险</button><button className={`nav-button ${screen === "learning" ? "active" : ""}`} onClick={() => openLearning()}><Leaf size={20}/>每日学习</button><button className={`nav-button ${screen === "pet" ? "active" : ""}`} onClick={() => navigate("pet")}><PawPrint size={20}/>伙伴小屋</button><button className={`nav-button ${screen === "parent" ? "active" : ""}`} onClick={() => navigate("parent")}><ShieldCheck size={19}/>家长</button></nav><button className="star-pill" aria-label={`已有${progress.stars}颗星星，查看伙伴成长`} onClick={() => navigate("pet")}><Star size={20} fill="currentColor"/>{progress.stars}</button><button className="icon-button" aria-label="声音设置" onClick={() => setSettingsOpen(true)}><Settings2 size={21}/></button></header>
    <main className={`main-content ${screen === "map" ? "map-page" : isSnake ? "snake-page" : ""}`}>
      {demoMode && <div className="demo-banner"><span>演示档案 · 测试不会修改孩子的学习记录</span><button onClick={() => setLayoutStress(value => !value)}>{layoutStress ? "收起测试提示" : "测试提示布局"}</button></div>}
      {demoMode && layoutStress && <><div className="error-banner" role="alert"><span>保存失败提示样例：当前练习仍保留，请重试保存或导出备份，长文字和多个按钮都应完整显示。</span><button onClick={() => setLayoutStress(false)}>重试保存</button><button onClick={backup}>导出演示备份</button></div><div className="error-banner" role="alert"><span>声音失败提示样例：请检查网络后重听当前目标，学习进度不会丢失。</span><button onClick={() => setLayoutStress(false)}>重试声音</button></div></>}
      {storageError && <div className="error-banner" role="alert"><span>{storageError}</span><button onClick={retry}>重试保存</button><button onClick={backup}>导出备份</button></div>}
      {audioError && <div className="error-banner" role="alert"><span>{audioError}</span><button onClick={() => screen === "game" && !intro && !feedback?.correct ? void speakQuestion() : void speak("点小喇叭，可以再听一次。", "zh")}>重试声音</button></div>}
      {notice && <div className="notice-banner" role="status">{notice}</div>}

      {screen === "map" && <>
        <section className="welcome-row"><div><span className="eyebrow">你的英语小冒险，现在开始</span><h1>{stats.completedLessons ? "欢迎回来，继续发现新朋友！" : "今天，一起发现新朋友！"}</h1><p>听一听、玩一玩，和乐乐一起探索这座小岛。</p></div><span className="level-tag"><Leaf size={16}/>启蒙探索 · Pre-A1</span></section>
        {run && <div className="continue-banner"><span><Play size={20}/>上次的小冒险还在这里：{getTopic(run.topicId).title} · 第 {getLesson(run.lessonId).order} 关</span><button className="secondary-button" onClick={() => begin(run.lessonId)}>继续冒险</button></div>}
        <section className="daily-map-invitation"><div><span className="eyebrow">每天一点，让英语变熟悉</span><h2>今日任务：温习 → 发现 → 自己说</h2><p>跟乐乐走记忆小路，学一站新内容，再说一句自己的英语。</p></div><button className="primary-button" onClick={() => openLearning()} disabled={!ready}><Leaf size={22}/>开启今日学习</button></section><AdventureEntries progress={progress} ready={ready} onOpen={openAdventure}/><WorldMap progress={progress} ready={ready} onOpen={openDestination} onLearn={openLearning}/>
        <div className="map-companion-note"><PawPrint size={23}/><span>乐乐已经准备好啦！每天玩 10–15 分钟，收集一点新发现。</span><button className="primary-button" disabled={!ready} onClick={() => begin((next ?? lessons[0]).id)}><Play size={20}/>{run ? "继续小冒险" : "去找第一个朋友"}</button></div>
        <PlaygroundEntries progress={progress} ready={ready} onOpen={openPlayground}/>
        <section className="bonus-hub" aria-labelledby="bonus-heading">
          <div className="bonus-heading"><div><span className="eyebrow">乐乐的新宝藏</span><h2 id="bonus-heading"><Sparkles size={24}/>更多趣味挑战</h2></div><span className="bonus-count">{bonusGames.length} 种玩法 · {lessons.filter(item => item.isBonus).length} 个挑战关卡</span></div>
          <div className="bonus-cards">{bonusGames.map(game => <article className={`bonus-card bonus-${game.color}`} key={game.order}>
            <div className="bonus-card-heading"><span className="bonus-icon"><game.Icon size={27}/></span><div><h3>{game.name}</h3><p>{game.description}</p></div></div>
            <div className={`bonus-preview preview-${game.color}`} aria-hidden="true">{game.color === "memory" ? <><span className="preview-card"><WordArt id="cat"/></span><span className="preview-card preview-hidden"><Sparkles size={35}/></span><span className="preview-card preview-hidden"><Sparkles size={35}/></span></> : game.color === "spell" ? <><WordArt id="cat"/><span className="preview-letters">{"cat".split("").map(letter => <span key={letter}>{letter}</span>)}</span></> : game.color === "snake" ? <><Worm size={67}/><span className="snake-preview-trail"/><span className="scene-preview-frame"><WordArt id="apple"/></span></> : <>{["cat", "dog", "bird"].map(id => <span className="scene-preview-frame" key={id}><WordArt id={id}/></span>)}</>}</div>
            <div className="bonus-topic-buttons">{topics.map(topic => { const item = getLesson(`${topic.id}-${game.order}`); const unlocked = isLessonUnlocked(progress, item.id); const done = Boolean(progress.completed[item.id]); return <button className="bonus-topic-button" key={item.id} disabled={!ready || !unlocked} onClick={() => begin(item.id)} aria-label={`${topic.title}，${game.name}${!unlocked ? `，完成本主题第${getLesson(item.prerequisiteLessonId!).order}关后开放` : done ? "，再次挑战" : "，开始挑战"}`}>{done ? <Check size={17}/> : unlocked ? <Play size={16} fill="currentColor"/> : <LockKeyhole size={16}/>}<span>{topic.title.slice(0, 2)}</span></button>; })}</div>
            <p className="bonus-unlock-note">完成本主题第 {getLesson(`animals-${game.order}`).prerequisiteLessonId?.split("-")[1]} 关，开启这个挑战</p>
          </article>)}</div>
        </section>
        <section className="journey-strip"><span>我们的探险路线</span><span><Volume2 size={19}/>听一听</span><span><Compass size={19}/>玩一玩</span><span><PawPrint size={19}/>陪伴成长</span><span><Star size={19}/>明天再发现</span></section>
      </>}

      {screen === "adventure" && <ContinuousAdventure key={adventureMode} mode={adventureMode} progress={progress} commit={commit} onBack={() => navigate("map")} onSettings={() => setSettingsOpen(true)} suspended={settingsOpen || setupOpen || Boolean(confirmation)}/> }
      {screen === "playground" && <Playground key={playgroundMode} mode={playgroundMode} progress={progress} commit={commit} onBack={() => navigate("map")} onSwitch={openPlayground} onSettings={() => setSettingsOpen(true)} suspended={settingsOpen || setupOpen || Boolean(confirmation)}/>}
      {screen === "trail" && destinationOpen && <LessonTrail destinationId={destinationOpen} progress={progress} ready={ready} onBack={() => navigate("map")} onBegin={begin} onLocked={setNotice}/>}

      {screen === "game" && run && lesson && <section className={isSnake ? "game-panel snake-panel" : lesson.isReview ? "game-panel review-lesson" : "game-panel"}><div className="game-top"><button className="text-button" onClick={() => navigate(destinationOpen ? "trail" : "map")}><ArrowLeft size={20}/>{isSnake ? "返回" : "暂停冒险"}</button><span>{getTopic(lesson.topicId).title} · {isSnake ? "大蛇吃小蛇" : `第 ${lesson.order} 关`}</span><span className="question-counter">{Math.min(run.index + (feedback?.correct ? 0 : 1), 6)}/6</span>{(isSnake || isExploration) && <button className="icon-button" aria-label="声音设置" onClick={() => setSettingsOpen(true)}><Settings2 size={24}/></button>}</div><ProgressBar className="lesson-progress" value={run.index / 6 * 100} aria-label="关卡进度"/>
        {rest && <div className="continue-banner"><span>已经玩了一会儿，眼睛也想休息一下。</span><button className="secondary-button" onClick={() => { sessionStart.current = 0; setRest(false); navigate("map"); }}>先休息</button></div>}
        {isSnake && exercise ? <>
          <div className="snake-target"><div className="english-prompt"><span><Volume2 size={18}/>{speaking ? "正在播报目标…" : "听英语，吃到带着这张图的小蛇"}</span><p lang="en">{exercise.promptEn}</p></div><div className="question-controls"><button className={`speech-button ${speaking ? "is-speaking" : ""}`} disabled={Boolean(feedback?.correct)} onClick={() => void speakQuestion()} aria-label="重听英语题目"><Volume2 size={25}/><span>重听</span></button><button className="hint-button" disabled={Boolean(feedback?.correct)} onClick={hint}><HelpCircle size={24}/><span>提示</span></button></div></div>
          <SnakeGame key={run.id} exercise={exercise} disabled={(!heard && !hinted) || Boolean(feedback?.correct) || Boolean(audioError)} busy={speaking} suspended={settingsOpen || setupOpen || Boolean(confirmation)} hinted={hinted} found={run.index} collectedWordIds={run.answers.map(item => item.wordId)} onAnswer={answer}/>
        </> : isExploration && exercise ? <>
          <span className="eyebrow">{exercise.kind === "bubble" ? "泡泡海湾" : exercise.kind === "serve" ? "快递码头" : exercise.kind === "catch" ? "星星草地" : "连线乐园"}</span>
          <div className="english-prompt"><span><Volume2 size={18}/>{speaking ? "正在听目标…" : "完整英文目标"}</span><p lang="en">{exercise.promptEn}</p></div>
          <div className="question-controls"><button className={`speech-button ${speaking ? "is-speaking" : ""}`} disabled={Boolean(feedback?.correct)} onClick={() => void speakQuestion()} aria-label="重听英语题目"><Volume2 size={24}/>重听目标</button><button className="hint-button" disabled={Boolean(feedback?.correct)} onClick={hint}><HelpCircle size={22}/>乐乐帮一下</button></div>
          {exercise.kind === "catch" ? <CatchGame key={run.id} exercise={exercise} disabled={!heard && !hinted || Boolean(feedback?.correct) || Boolean(audioError)} busy={speaking} suspended={settingsOpen || setupOpen || Boolean(confirmation)} hinted={hinted} onAnswer={answer}/> : exercise.kind === "bubble" ? <BubbleGame key={`${run.id}:${exercise.id}`} exercise={exercise} disabled={!heard && !hinted || Boolean(feedback?.correct) || Boolean(audioError)} busy={speaking} suspended={settingsOpen || setupOpen || Boolean(confirmation)} hinted={hinted} onAnswer={answer}/> : exercise.kind === "serve" ? <DeliveryGame key={`${run.id}:${exercise.id}`} exercise={exercise} disabled={!heard && !hinted || Boolean(feedback?.correct) || Boolean(audioError)} busy={speaking} suspended={settingsOpen || setupOpen || Boolean(confirmation)} hinted={hinted} onAnswer={answer}/> : <ConnectionGame key={`${run.id}:${[...exercise.options].sort().join(":")}`} exercise={{ ...exercise, options: connectionOptions ?? exercise.options }} disabled={!heard && !hinted || Boolean(feedback?.correct) || Boolean(audioError)} busy={speaking} suspended={settingsOpen || setupOpen || Boolean(confirmation)} hinted={hinted} completedWordIds={run.answers.map(item => item.wordId)} onAnswer={answer}/>}
        </> : intro ? <div className="intro-panel"><span className="eyebrow">乐乐的示范时间</span><h1>{lesson.title}</h1><p>先认识这些词语，点图片就能听声音。</p><div className="intro-words">{[...new Set(lesson.exercises.map(item => item.wordId))].slice(0, 4).map(id => <button key={id} className="word-card" onClick={() => void speak(getWord(id).en)}><WordArt id={id}/><strong>{getWord(id).en}</strong><small>{getWord(id).zh} <Volume2 size={16}/></small></button>)}</div><div className="phrase-card"><span>今天也能说一句</span><button onClick={() => void speak(getTopic(lesson.topicId).phrases[Math.min(lesson.order - 1, 2)].en)}><Volume2 size={20}/>{getTopic(lesson.topicId).phrases[Math.min(lesson.order - 1, 2)].en}</button><p>{getTopic(lesson.topicId).phrases[Math.min(lesson.order - 1, 2)].zh}</p><button className="text-button phrase-practice-button" onClick={() => setPhrasePractice(value => !value)}><Mic size={18}/>{phrasePractice ? "收起这句跟读" : "读给乐乐听（可选）"}</button>{phrasePractice && <Recorder key={`${run.id}:phrase`} text={getTopic(lesson.topicId).phrases[Math.min(lesson.order - 1, 2)].en} onRecorded={() => commit(p => recordSpeaking(p))}/>}</div>{lesson.topicId === "animals" && lesson.order === 2 && <div className="support-words">{supportWords.slice(0, 7).map(word => <button className="support-word" key={word.en} onClick={() => void speak(word.en)}>{["red", "blue", "green", "yellow"].includes(word.en) && <i style={{ background: { red: "#ee716a", blue: "#65b5ed", green: "#60b68c", yellow: "#f2c445" }[word.en] }}/>}<strong>{word.en}</strong><small>{word.zh}</small></button>)}</div>}<OperationDemo lesson={lesson} onReplay={() => void speak(guidance[lesson.exercises[0].kind], "zh")}/>{lesson.order === 4 && <div className="position-teaching">{positions.map(position => <button className="position-word" key={position.id} onClick={() => void speak(`Put the ${getWord(lesson.exercises[0].wordId).en} ${position.promptSuffix}.`)}><PositionDiagram position={position.id}/><strong>{position.id}</strong><small>{position.zh}</small><Volume2 size={18}/></button>)}</div>}<button className="primary-button centered" onClick={() => { speechToken.current++; stopSpeech(); setIntro(false); }}><Play size={20} fill="currentColor"/>准备好啦，去找找！</button></div> : exercise ? <>
          <span className="eyebrow">{feedback?.correct ? "小小发现，大大进步" : lesson.isBonus ? "乐乐的趣味挑战" : exercise.kind === "place" ? "帮乐乐整理图卡" : exercise.kind === "match" ? "给词语找到图片朋友" : "谁来找我们玩？"}</span><h1>{feedback?.correct ? "找到啦，真棒！" : exercise.kind === "place" ? "听一听，摆一摆" : exercise.kind === "match" ? getWord(exercise.wordId).en : exercise.kind === "memory" ? "记一记，翻一翻" : exercise.kind === "spell" ? "听一听，拼一拼" : exercise.kind === "scene" ? "听句子，找场景" : exercise.kind === "snake" ? "小蛇出发，收集英语！" : "听一听，找到它"}</h1>
          <div className="english-prompt"><span><Volume2 size={18}/>听一听，也看看完整英文</span><p lang="en">{exercise.promptEn}</p></div>
          {!feedback?.correct && <><div className="question-controls"><button className={`speech-button ${speaking ? "is-speaking" : ""}`} onClick={() => void speakQuestion()} aria-label="重听英语题目"><Volume2 size={25}/>{speaking ? "正在听声音…" : "点我，再听一次"}</button><button className="hint-button" onClick={hint}><HelpCircle size={19}/>乐乐帮一下</button></div>{!lesson.isBonus && <button className="text-button optional-demo" onClick={() => { stopSpeech(); setIntro(true); }}><Hand size={22}/>看看乐乐怎么做</button>}{hinted ? <p className="hint-text">{exercise.kind === "scene" ? "听整句话，看看乐乐圈出的画面。" : exercise.kind === "spell" ? "照着英文，把字母按顺序排好。" : `${getWord(exercise.wordId).zh}${exercise.kind === "place" ? `，放到${positions.find(item => item.id === exercise.answer)?.zh}` : "，找一找这张图片。"}`}</p> : <p className="operation-note">{exercise.kind === "place" ? "先点图卡，再点位置；也可以拖一拖。" : exercise.kind === "match" ? "看看上面的英文，点对应的图片。" : exercise.kind === "memory" ? "先记住位置，再听声音翻卡片。" : exercise.kind === "spell" ? "听完声音，点字母排好队，再点检查。" : exercise.kind === "scene" ? "听英语，选出意思一样的图。" : exercise.kind === "snake" ? "先听英语，再控制小蛇收集目标。" : "带上耳朵，听完就可以选图片啦。"}</p>}
          {exercise.kind === "memory" ? <MemoryGame key={`${run.id}:${exercise.id}`} exercise={exercise} disabled={inputLocked} hinted={hinted} onAnswer={answer} onHint={hint} onPreviewEnd={() => void speakQuestion()}/> : exercise.kind === "spell" ? <SpellingGame key={`${run.id}:${exercise.id}`} exercise={exercise} disabled={inputLocked} hinted={hinted} onAnswer={answer}/> : exercise.kind === "scene" ? <SceneGame key={`${run.id}:${exercise.id}`} exercise={exercise} disabled={inputLocked} hinted={hinted} onAnswer={answer}/> : exercise.kind === "snake" ? null : exercise.kind === "place" ? <Placement key={`${run.id}:${exercise.id}`} exercise={exercise} disabled={inputLocked} hinted={hinted} onAnswer={answer}/> : <div className="option-grid">{exercise.options.map((id, index) => <button className={`word-card ${hinted && id === exercise.answer ? "hinted" : ""} ${feedback && !feedback.correct && feedback.selected === id ? "try-again" : ""}`} key={id} disabled={inputLocked} onClick={() => answer(id)} aria-label={`选择${getWord(id).zh}图片，选项${index + 1}`}><WordArt id={id}/><span className="choice-label">{["A", "B", "C", "D"][index]}</span>{hinted && id === exercise.answer && <span className="hint-mark">乐乐的提示</span>}</button>)}</div>}
          {feedback && !feedback.correct && <div className="feedback retry-feedback" role="status">再听一次，你可以的！这个词会在明天再和你见面。</div>}</>}
          {isExploration && feedback && !feedback.correct && <div className="feedback retry-feedback" role="status">再听一次，你可以的！已收集的图片会保留，这个词也会在明天再见面。</div>}
          {feedback?.correct && <div className="correct-panel"><div className="found-word"><WordArt id={exercise.wordId}/><div><span className="success-tag"><CheckCircle2 size={18}/>完成一次练习</span><strong>{getWord(exercise.wordId).en}</strong><span>{getWord(exercise.wordId).zh}</span></div></div><Recorder key={`${run.id}:${exercise.id}`} text={getWord(exercise.wordId).en} onRecorded={() => commit(p => recordSpeaking(p))}/><button className="primary-button centered" onClick={() => run.index >= run.exercises.length ? finish() : setFeedback(null)}>{run.index >= run.exercises.length ? <><Star size={22}/>完成冒险，领取星星</> : <><Play size={20} fill="currentColor"/>继续找朋友</>}</button></div>}
        </> : <div className="correct-panel"><h1>冒险已经完成啦！</h1><button className="primary-button centered" onClick={finish}><Star/>领取星星</button></div>}
      </section>}

      {screen === "result" && result && <section className={result.lesson.isReview ? "result-panel review-lesson" : "result-panel"}><div className="celebration-icon"><Star size={48} fill="currentColor"/></div><span className="eyebrow">{getTopic(result.lesson.topicId).title} · 第 {result.lesson.order} 关完成</span><h1>又完成了一次小冒险！</h1><p>{result.earned ? `乐乐为你收好了 ${result.earned} 颗新星星。` : "这次重玩也很棒！每关首次完成和每日首轮复习会获得星星。"}</p>{following && <div className="next-adventure"><button className="primary-button" onClick={() => begin(following.id)}><Play size={24}/>{progress.completed[following.id] ? "再玩一个冒险" : "继续下一冒险"}</button><p>下一站：{getTopic(following.topicId).title} · {following.title}{progress.completed[following.id] && <span> · 重玩练习</span>}</p></div>}{rest && <p className="result-rest-note">已经玩了一会儿，先让眼睛休息一下，再继续小冒险吧。</p>}<div className="result-numbers"><div><strong>{result.answers.length}</strong><span>次词语练习</span></div><div><strong>{result.answers.filter(item => item.firstCorrect).length}</strong><span>次首次答对</span></div><div><strong>+{result.earned}</strong><span>颗星星</span></div></div><div className="learned-words">{[...new Set(result.answers.map(item => item.wordId))].map(id => <button key={id} onClick={() => void speak(getWord(id).en)}><WordArt id={id}/><span>{getWord(id).en}</span><Volume2 size={16}/></button>)}</div><p className="result-note">需要提示的词，会安排再次练习。星星记录努力，学习记录帮助我们发现进步。</p><div className="result-actions"><button className="secondary-button" onClick={() => navigate("pet")}><PawPrint size={20}/>看看乐乐</button><button className="secondary-button" onClick={() => navigate("map")}><Compass size={20}/>回到探索地图</button></div></section>}

      {screen === "pet" && <><section className="welcome-row"><div><span className="eyebrow">伙伴小屋</span><h1>你的每一步，乐乐都陪着。</h1><p>完成小冒险，解锁伙伴的成长和纪念装饰。</p></div><span className="level-tag"><Star size={16}/>{progress.stars} 颗星星</span></section><div className="pet-layout"><section className="pet-room"><Fox stage={stats.growthStage} large/><h2>{growthNames[stats.growthStage - 1]}</h2><p>乐乐喜欢和你一起学英语。<br/>明天再来，也会开心地迎接你。</p><button className="secondary-button" onClick={() => void speak("你好，我是小狐狸乐乐。我们一起去探险吧！", "zh")}><Volume2 size={20}/>听乐乐说话</button></section><section className="growth-panel"><h2><Sparkles size={23}/>我们的成长足迹</h2><div className="growth-steps">{growthNames.map((name, index) => <div key={name} className={stats.growthStage >= index + 1 ? "unlocked" : ""}><span>{stats.growthStage >= index + 1 ? <Check size={18}/> : index + 1}</span><strong>{name}</strong><small>{index === 0 ? "见面就开始" : index === 1 ? "收集 5 颗星星" : "收集 12 颗星星"}</small></div>)}</div><h2 className="collection-heading">小岛纪念装饰</h2><div className="decoration-list">{topics.map((topic, index) => { const unlocked = Boolean(progress.completed[`${topic.id}-5`]); const Icon = [Leaf, Utensils, Crown][index]; return <div className={`decoration ${unlocked ? "unlocked" : ""}`} key={topic.id}><span><Icon size={28}/></span><div><strong>{["森林围巾徽章", "野餐纪念徽章", "星星小帽徽章"][index]}</strong><small>{unlocked ? "已经收藏，乐乐收到啦！" : `完成${topic.title}第5关后解锁`}</small></div>{unlocked ? <CheckCircle2 size={21}/> : <LockKeyhole size={19}/>}</div>; })}</div><button className="primary-button" onClick={() => navigate("map")}><Compass size={20}/>一起去探险</button></section></div></>}

      {screen === "learning" && <LearningStudio key={learningInitial ?? "hub"} progress={progress} commit={commit} onBack={() => navigate("map")} initialUnit={learningInitial}/>}{screen === "parent" && <><LearningReport progress={progress} onOpenDiagnostic={() => openLearning("a1-readiness")} onOpenLearning={() => openLearning()}/><InstallPanel/><AdventureReport progress={progress}/><PlaygroundReport progress={progress}/><section className="welcome-row"><div><span className="eyebrow">家长观察小站</span><h1>看看孩子的小小进步</h1><p>这里记录练习表现；跟读次数和游戏奖励分别展示。</p></div><span className="level-tag"><ShieldCheck size={16}/>记录只保存在此浏览器</span></section><div className="stats-grid">{[{ label: "首次回答正确率", value: stats.answered ? `${Math.round(stats.accuracy * 100)}%` : "—", note: `${stats.firstCorrect}/${stats.answered} 次，不含提示后答对`, Icon: CheckCircle2 }, { label: "待复习词语", value: stats.reviewWords, note: `${stats.dueWords} 个已经到复习时间`, Icon: RefreshCw }, { label: "跟读练习", value: stats.speakingCount, note: "仅记录完成次数，不评价发音", Icon: Mic }, { label: "学习时间", value: `${Math.floor((stats.totalSeconds + progress.learning.totalSeconds) / 60)} 分钟`, note: "按操作间隔估算，排除长时间闲置", Icon: Clock3 }].map(item => <div className="stat-card" key={item.label}><item.Icon size={23}/><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></div>)}</div><div className="parent-layout"><section className="report-panel"><h2>主题学习记录</h2>{stats.byTopic.map(item => <div className="topic-report" key={item.topicId}><div><strong>{getTopic(item.topicId).title}</strong><span>{item.completedLessons}/{lessons.filter(lesson => lesson.topicId === item.topicId).length} 关 · {item.answered} 次练习</span></div><ProgressBar value={item.completedLessons / lessons.filter(lesson => lesson.topicId === item.topicId).length * 100} aria-label={`${getTopic(item.topicId).title}完成度`}/><small>首次正确率 {item.answered ? `${Math.round(item.accuracy * 100)}%` : "暂无记录"}</small></div>)}<div className="report-details"><span>使用提示：{stats.hints} 次</span><span>播放题目：{stats.listenCount} 次</span><span>游戏奖励：{stats.stars} 颗星星</span></div><h3>需要再次见面的词</h3>{progress.review.length ? <div className="review-chips">{progress.review.map(item => <button className="review-chip" key={item.wordId} onClick={() => void speak(getWord(item.wordId).en)}><Volume2 size={16}/>{getWord(item.wordId).en}<small>{getWord(item.wordId).zh} · {getDueWords(progress).includes(item.wordId) ? "可复习" : "明天再见"}</small></button>)}</div> : <p className="empty-note">暂时没有待复习词。继续观察孩子在新图片、新顺序下是否仍能听懂。</p>}</section><aside className="backup-panel"><h2><Download size={22}/>保存这段小旅程</h2><p>清除浏览器数据或更换设备前，请先下载备份。恢复会覆盖当前记录。</p><button className="secondary-button" onClick={backup}><Download size={19}/>下载 JSON 备份</button><button className="secondary-button" onClick={() => importInput.current?.click()}><Upload size={19}/>选择备份恢复</button><input hidden ref={importInput} type="file" accept="application/json,.json" aria-label="选择学习记录备份" onChange={event => void importBackup(event.target.files?.[0])}/><button className="text-button danger-button" onClick={() => setConfirmation({ kind: "reset" })}><Trash2 size={18}/>清空学习记录</button><div className="parent-note"><ShieldCheck size={20}/><p>孩子的录音只在当前练习中回放，离开即释放，不上传，也不包含在备份中。</p></div></aside></div><div className="learning-note"><h2>怎样知道孩子真的记住了？</h2><p>隔日换图片、换顺序，让孩子独立听音选择。开口时可以从跟读，慢慢过渡到只看图片说词。首版是 Pre-A1 启蒙探索，完成三主题不代表完整 A1 达标。</p><p><a href="https://www.cambridgeenglish.org/qualifications-young-learners/" target="_blank" rel="noreferrer">剑桥少儿英语级别说明</a> · <a href="https://www.cambridgeenglish.org/Images/506166-starters-movers-flyers-word-list-2025.pdf" target="_blank" rel="noreferrer">课程参考词表</a></p></div></>}
    </main><footer className="site-footer"><span>每一小步，都让英语更熟悉。</span><span>启蒙探索版 · 为 A1 学习做准备</span></footer>

    <Dialog open={settingsOpen || setupOpen} onOpenChange={open => { if (!open) { setSettingsOpen(false); setSetupOpen(false); if (firstVisit) commit(current.current); } }}><DialogContent className="settings-dialog"><DialogHeader><DialogTitle>{setupOpen ? "和家长一起，准备好耳朵" : "声音小设置"}</DialogTitle><DialogDescription>{setupOpen ? "先试试声音。跟读需要麦克风，可以在练习时开启，也可以跳过。" : "示范声音播放时，背景音乐会自动变轻。"}</DialogDescription></DialogHeader><div className="setting-row"><span><Music2 size={21}/>背景音乐</span><Switch className="music-switch" checked={progress.settings.music} onCheckedChange={music => commit(p => updateSettings(p, { music }))} aria-label="背景音乐"/></div><div className="volume-setting"><label id="volume-label"><Volume2 size={21}/>声音音量 · {Math.round(progress.settings.volume * 100)}%</label><Slider aria-labelledby="volume-label" value={[progress.settings.volume]} min={0} max={1} step={0.05} onValueChange={values => commit(p => updateSettings(p, { volume: values[0] }))}/></div><button className="secondary-button" onClick={() => void speak("你好，我是小狐狸乐乐。我们一起去探险吧！", "zh")}><Headphones size={20}/>{speaking ? "正在试声音…" : "听听乐乐的声音"}</button>{setupOpen && <Recorder text="cat" onRecorded={() => commit(p => recordSpeaking(p))}/>}<button className="primary-button" onClick={() => { setSettingsOpen(false); setSetupOpen(false); commit(current.current); speechToken.current++; stopSpeech(); setSpeaking(false); }}>准备好啦</button><p className="settings-note">使用普通浏览器保存记录；无痕模式和清除浏览器数据可能使本地进度丢失。</p></DialogContent></Dialog>

    <SpeechCaption inlineText={screen === "adventure" ? getCurrentAdventureTask(progress.adventure, adventureMode).promptEn : screen === "game" && !intro ? exercise?.promptEn : undefined}/>
    <AlertDialog open={Boolean(confirmation)} onOpenChange={open => { if (!open) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmation?.kind === "reset" ? "清空学习记录？" : confirmation?.kind === "import" ? "用备份恢复这段旅程？" : "开始另一关？"}</AlertDialogTitle><AlertDialogDescription>{confirmation?.kind === "reset" ? "关卡、星星、伙伴成长和学习记录都会清空。建议先下载备份。" : confirmation?.kind === "import" ? "已检查备份格式。恢复后将覆盖此浏览器的现有记录，建议先下载当前备份。" : "当前关卡已经完成的作答记录会保留，但未完成的关卡将结束；还没有领取星星。"}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="min-h-14 rounded-xl">取消，保留现在的记录</AlertDialogCancel><AlertDialogAction className="min-h-14 rounded-xl" onClick={confirm}>{confirmation?.kind === "reset" ? "确认清空" : confirmation?.kind === "import" ? "确认恢复" : "开始另一关"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}



