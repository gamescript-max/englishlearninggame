"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, Ear, Footprints, Lightbulb, MessageCircle, PencilLine, RotateCcw, Volume2 } from "lucide-react";
import { playEffect, playSpeech, stopAllAudio, stopSpeech, unlockAudio } from "@/lib/audio";
import { dailySpeaking, diagnosticActivity, getLearningActivity, getLearningWord, getNextLearningActivity, learningTasks, learningUnits, phonicsActivities, recallActivity, storyActivities } from "@/lib/learning-content";
import { answerLearning, dueRecallWords, finishLearning, learningDay, markDaily, markLearningHint, recordRecall, startLearning, type LearningAnswer } from "@/lib/learning-state";
import { skillNames, type LearningActivity, type LearningOption, type LearningSkill, type LearningTask } from "@/lib/learning-types";
import type { Progress } from "@/lib/progress";
import { Recorder } from "./recorder";
import { LearningSceneArt, LearningWordArt } from "./learning-art";

type Props = { progress: Progress; commit: (update: Progress | ((p: Progress) => Progress)) => Progress; onBack: () => void; initialUnit?: string | null };
type View = "hub" | "unit" | "task" | "story" | "result" | "diagnostic";
type Feedback = { task: LearningTask; correct: boolean; recorded: boolean; independent: boolean; answer: string };
type Result = { activity: LearningActivity; answers: LearningAnswer[]; fresh: boolean };
const skillIcons = { listening: Ear, reading: BookOpen, writing: PencilLine, speaking: MessageCircle };
const unitDecorations: Record<string, string> = { family: "🌻", school: "🏫", body: "🌈", daily: "🎈", weather: "☁️" };

function shuffle<T>(items: T[], seed: string): T[] {
  let value = [...seed].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; const other = value % (index + 1); [result[index], result[other]] = [result[other], result[index]]; }
  return result;
}

function TaskChoiceArt({ option, review }: { option: LearningOption; review: boolean }) {
  if (option.scene) return <LearningSceneArt scene={option.scene} variant={review ? "review" : "base"} />;
  if (option.wordIds?.length) return option.textEn && option.wordIds.every(id => !getLearningWord(id)) ? null : <div className="learning-option-pictures">{option.wordIds.map((id, index) => <LearningWordArt key={`${id}-${index}`} id={id} variant={review ? "review" : "base"} />)}</div>;
  return null;
}

export function LearningStudio({ progress, commit, onBack, initialUnit = null }: Props) {
  const [view, setView] = useState<View>(initialUnit === "diagnostic" || initialUnit === diagnosticActivity.id ? "diagnostic" : initialUnit && learningUnits.some(unit => unit.id === initialUnit) ? "unit" : "hub");
  const [unitId, setUnitId] = useState(initialUnit ?? learningUnits[0].id);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [storyPage, setStoryPage] = useState(0);
  const [input, setInput] = useState("");
  const [tiles, setTiles] = useState<number[]>([]);
  const [hintVisible, setHintVisible] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pendingActivity, setPendingActivity] = useState<LearningActivity | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [adultOpen, setAdultOpen] = useState(false);
  const [heard, setHeard] = useState(false);
  const [pagePaused, setPagePaused] = useState(false);
  const progressRef = useRef(progress);
  const commitRef = useRef(commit);
  const voiceGeneration = useRef(0);
  const initialized = useRef(false);
  const answerLock = useRef(false);
  const pageActive = useRef(true);
  useEffect(() => { progressRef.current = progress; commitRef.current = commit; }, [progress, commit]);
  const learning = progress.learning;
  const run = learning.active;
  const activity = activityId ? getLearningActivity(activityId) : undefined;
  const currentTask = run && activity && run.activityId === activity.id ? learningTasks.get(run.taskIds[run.index]) : undefined;
  const task = feedback?.task ?? currentTask;
  const currentUnit = learningUnits.find(unit => unit.id === unitId) ?? learningUnits[0];
  const dueWords = dueRecallWords(learning);
  const daily = learning.daily[learningDay()] ?? { review: false, learn: false, speak: false };
  const next = getNextLearningActivity(learning.completed);

  const changeView = useCallback((to: View) => {
    ++voiceGeneration.current; stopAllAudio(); setVoiceBusy(false); setAudioError(null); setView(to);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const resetQuestion = useCallback(() => { answerLock.current = false; setInput(""); setTiles([]); setHintVisible(false); setFeedback(null); setAdultOpen(false); setAudioError(null); setHeard(false); setPagePaused(false); }, []);

  const beginActivity = useCallback((target: LearningActivity, replace = false) => {
    pageActive.current = !document.hidden;
    const current = progressRef.current.learning.active;
    if (current && current.activityId !== target.id && !replace) { setPendingActivity(target); return; }
    let taskIds = target.tasks.map(item => item.id);
    if (target.review) {
      const state = progressRef.current.learning;
      const words = dueRecallWords(state);
      const candidates = words.length ? words : Object.keys(state.cards);
      taskIds = shuffle(candidates, `${learningDay()}-recall`).slice(0, 8).map(id => `recall-${id}`).filter(id => learningTasks.has(id));
      if (!taskIds.length) { setUnitId(learningUnits[0].id); changeView("unit"); return; }
    }
    if (target.id === dailySpeaking.id) {
      const latestUnit = [...learningUnits].sort((a, b) => Math.max(0, ...b.activities.map(item => progressRef.current.learning.completed[item.id]?.at ?? 0)) - Math.max(0, ...a.activities.map(item => progressRef.current.learning.completed[item.id]?.at ?? 0)))[0];
      const selected = latestUnit?.activities.find(item => item.skill === "speaking")?.tasks[0] ?? target.tasks[0];
      taskIds = [selected.id];
    }
    const updated = commitRef.current(p => ({ ...p, learning: startLearning(p.learning, target.id, taskIds) }));
    progressRef.current = updated;
    setActivityId(target.id); if (target.unitId) setUnitId(target.unitId);
    setPendingActivity(null); setStoryPage(0); resetQuestion(); setResult(null);
    changeView(target.pages && updated.learning.active?.index === 0 ? "story" : "task");
    void unlockAudio().catch(() => setAudioError("点一下小喇叭，让声音一起出发。"));
  }, [changeView, resetQuestion]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (initialUnit && initialUnit !== "diagnostic" && initialUnit !== diagnosticActivity.id && getLearningActivity(initialUnit)) beginActivity(getLearningActivity(initialUnit)!);
  }, [initialUnit, beginActivity]);

  const speak = useCallback(async (text: string, language: "en" | "zh", caption = true) => {
    if (document.hidden) return;
    pageActive.current = true; setPagePaused(false);
    const generation = ++voiceGeneration.current;
    stopSpeech(); setAudioError(null); setVoiceBusy(true);
    try { await playSpeech(text, language, { caption }); if (voiceGeneration.current === generation && pageActive.current && language === "en") setHeard(true); }
    catch { if (voiceGeneration.current === generation) setAudioError("这段声音暂时没播放出来，点重听再试一次。练习已经保留。" ); }
    finally { if (voiceGeneration.current === generation) setVoiceBusy(false); }
  }, []);

  const cancelPrompt = useCallback(() => { ++voiceGeneration.current; stopSpeech(); }, []);

  useEffect(() => {
    if (view !== "task" || feedback || !currentTask || !pageActive.current || document.hidden) return;
    const generation = ++voiceGeneration.current;
    stopSpeech();
    async function prompt() {
      setVoiceBusy(true); setAudioError(null);
      try {
        await playSpeech(currentTask!.promptZh, "zh", { caption: false });
        if (voiceGeneration.current !== generation || document.hidden || !pageActive.current) return;
        await playSpeech(currentTask!.audioText ?? currentTask!.promptEn, "en", { caption: currentTask!.captionMode !== "after-answer" });
        if (voiceGeneration.current === generation && pageActive.current && !document.hidden) setHeard(true);
      } catch { if (voiceGeneration.current === generation) setAudioError("点重听再试一次，练习会继续保留。" ); }
      finally { if (voiceGeneration.current === generation) setVoiceBusy(false); }
    }
    void prompt();
    return cancelPrompt;
  }, [view, currentTask, feedback, cancelPrompt]);

  useEffect(() => {
    if (view !== "story" || !activity?.pages?.[storyPage] || !pageActive.current || document.hidden) return;
    const page = activity.pages[storyPage];
    void speak(page.en, "en");
  }, [view, activity, storyPage, speak]);

  useEffect(() => () => { ++voiceGeneration.current; stopAllAudio(); }, []);

  function hint() {
    if (!task || feedback) return;
    const updated = commitRef.current(p => ({ ...p, learning: markLearningHint(p.learning) }));
    progressRef.current = updated; setHintVisible(true);
    if (task.hintZh) void speak(task.hintZh, "zh", false);
  }

  function recordPractice() {
    const updated = commitRef.current(p => ({ ...p, learning: { ...p.learning, speakingPractice: p.learning.speakingPractice + 1 } }));
    progressRef.current = updated;
  }

  function submit(answer: string, rating?: 0 | 1 | 2) {
    if (!task || !activity || feedback || answerLock.current) return;
    if ((task.kind === "type" || task.kind === "blend") && !answer.trim()) return;
    answerLock.current = true;
    ++voiceGeneration.current; stopSpeech(); setVoiceBusy(false);
    let observed: Feedback = { task, correct: false, recorded: false, independent: false, answer };
    const updated = commitRef.current(p => {
      const assessment = answerLearning(p.learning, task, answer, rating, Date.now(), Boolean(activity.diagnostic));
      const recorded = (assessment.progress.active?.index ?? 0) > (p.learning.active?.index ?? 0);
      const lastAnswer = recorded ? assessment.progress.active?.answers.at(-1) : undefined;
      let nextLearning = assessment.progress;
      const correctOption = task.options?.find(option => option.id === task.answer);
      const wordIds = task.wordIds ?? correctOption?.wordIds ?? task.scenes?.flatMap(scene => (scene.objects ?? []).map(item => item.wordId)) ?? [];
      if (!activity.diagnostic || !assessment.correct) for (const wordId of new Set(wordIds.filter(id => Boolean(getLearningWord(id))))) nextLearning = recordRecall(nextLearning, wordId, !activity.diagnostic && Boolean(lastAnswer?.firstCorrect), Boolean(activity.review));
      observed = { task, correct: assessment.correct, recorded, independent: Boolean(lastAnswer?.firstCorrect), answer };
      return { ...p, learning: nextLearning };
    });
    progressRef.current = updated; setFeedback(observed);
    void playEffect(observed.correct ? "correct" : "retry").catch(() => {});
  }

  function finish() {
    const active = progressRef.current.learning.active;
    if (!activity || !active || active.index !== active.taskIds.length) return;
    const fresh = !progressRef.current.learning.completed[activity.id];
    const updated = commitRef.current(p => {
      let state = finishLearning(p.learning, Boolean(activity.diagnostic));
      if (!activity.diagnostic) {
        if (activity.review) state = markDaily(state, "review");
        else if (activity.skill === "speaking" || activity.id === dailySpeaking.id) { if (active.answers.some(answer => answer.firstCorrect)) state = markDaily(state, "speak"); }
        else state = markDaily(state, "learn");
      }
      return { ...p, learning: state };
    });
    progressRef.current = updated; setResult({ activity, answers: active.answers, fresh }); resetQuestion(); changeView("result");
    void playEffect("reward").catch(() => {});
  }

  function advance() {
    if (!feedback) return;
    if (!feedback.recorded) { resetQuestion(); return; }
    if (progressRef.current.learning.active && progressRef.current.learning.active.index === progressRef.current.learning.active.taskIds.length) finish();
    else resetQuestion();
  }

  function back() {
    if (view === "hub") { ++voiceGeneration.current; stopAllAudio(); onBack(); }
    else { resetQuestion(); changeView(["task", "story", "result"].includes(view) && activity?.unitId ? "unit" : "hub"); }
  }

  useEffect(() => {
    const pause = () => { pageActive.current = false; ++voiceGeneration.current; stopAllAudio(); setVoiceBusy(false); setPagePaused(true); setHeard(false); };
    const visibility = () => { if (document.hidden) pause(); else pageActive.current = true; };
    window.addEventListener("native-background", pause); window.addEventListener("learning-pause", pause); window.addEventListener("pagehide", pause); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("native-background", pause); window.removeEventListener("learning-pause", pause); window.removeEventListener("pagehide", pause); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  useEffect(() => {
    const nativeBack = () => {
      ++voiceGeneration.current; stopAllAudio(); resetQuestion();
      if (view === "hub") onBack();
      else changeView(["task", "story", "result"].includes(view) && activity?.unitId ? "unit" : "hub");
    };
    window.addEventListener("learning-back", nativeBack);
    return () => window.removeEventListener("learning-back", nativeBack);
  }, [view, activity, onBack, changeView, resetQuestion]);

  const hiddenCaption = Boolean(task?.captionMode === "after-answer" && !feedback);
  const options = task?.options ? shuffle(task.options, `${run?.id}-${task.id}`) : [];
  const letters = task?.letters ? shuffle(task.letters.map((letter, index) => ({ letter, index })), `${run?.id}-${task.id}-tiles`) : [];
  const built = task?.letters ? tiles.map(index => task.letters![index]).join("") : input;
  const nextActivity = result ? getNextLearningActivity(learning.completed, result.activity.id) : next;
  const manual = Boolean(task && (task.kind === "speak" || task.adultReviewRecommended));
  const page = activity?.pages?.[storyPage];
  const sessionFinished = Boolean(activity && run && run.activityId === activity.id && run.index === run.taskIds.length);

  return <section className={`learning-studio learning-view-${view}`} aria-label="学习探索站">
    <header className="learning-topline"><button className="learning-button learning-button-secondary" onClick={back}><ArrowLeft size={20} />{view === "hub" ? "回探索岛" : "回学习地图"}</button><span className="learning-footprint-pill"><Footprints size={20} />学习足迹 {Object.keys(learning.completed).filter(id => ![diagnosticActivity.id, recallActivity.id, dailySpeaking.id].includes(id)).length}</span></header>

    {pendingActivity && <div className="learning-switch-confirm" role="alertdialog" aria-labelledby="learning-switch-title"><h2 id="learning-switch-title">换一条探险小路？</h2><p>当前这次还没结束。切换后保留已经答过的学习记录，结束当前续玩，开始“{pendingActivity.title}”。</p><div className="learning-actions"><button className="learning-button" onClick={() => beginActivity(pendingActivity, true)}>开始新的探险</button><button className="learning-button learning-button-secondary" onClick={() => setPendingActivity(null)}>继续当前这次</button></div></div>}

    {view === "hub" && <>
      <div className="learning-hero"><div><p className="learning-eyebrow">每天一点点，自己会表达</p><h1>乐乐的学习探索站</h1><p>听一听、找一找、拼一拼，再把今天会的英语告诉家人。</p><span className="learning-level-pill">Pre-A1 基础 → A1 衔接</span></div><img src="/images/fox.png" alt="小狐狸乐乐" /></div>
      {run && <div className="learning-resume"><span>上次的小路还没走完 · 已完成 {run.index} / {run.taskIds.length}</span><button className="learning-button" onClick={() => { const found = getLearningActivity(run.activityId); if (found) beginActivity(found); }}>继续这次探险 <ArrowRight size={20} /></button></div>}
      <div className="learning-daily"><h2>今天的 10–15 分钟小冒险</h2><div className="learning-daily-grid">
        <button className={`learning-daily-card ${daily.review ? "is-done" : ""}`} onClick={() => beginActivity(recallActivity)}><span className="learning-daily-number">{daily.review ? <Check size={26} /> : "1"}</span><strong>回忆旧朋友</strong><small>{dueWords.length ? `${dueWords.length} 个词等你再认一次` : Object.keys(learning.cards).length ? "今天没有到期词，也可以温习" : "先认识新词，明天开始复习"}</small><span>2–4 分钟</span></button>
        <button className={`learning-daily-card ${daily.learn ? "is-done" : ""}`} onClick={() => beginActivity(next)}><span className="learning-daily-number">{daily.learn ? <Check size={26} /> : "2"}</span><strong>认识新朋友</strong><small>{next.title}</small><span>5–7 分钟</span></button>
        <button className={`learning-daily-card ${daily.speak ? "is-done" : ""}`} onClick={() => beginActivity(dailySpeaking)}><span className="learning-daily-number">{daily.speak ? <Check size={26} /> : "3"}</span><strong>我来告诉你</strong><small>自己说一句，让家长听一听</small><span>2–3 分钟</span></button>
      </div><p>隔 1、3、7 天再回忆。看过提示的回答会记为练习，和独立想起来分开记录。</p></div>
      <h2 className="learning-section-title">新的主题小路 <small>横向滑动，看看每一站</small></h2>
      <div className="learning-unit-scroll"><div className="learning-unit-map"><div className="learning-unit-map-road" aria-hidden="true" />{learningUnits.map((unit, index) => <button key={unit.id} className={`learning-unit-node node-${index}`} onClick={() => { setUnitId(unit.id); changeView("unit"); }}><span className="learning-unit-landmark" aria-hidden="true">{unitDecorations[unit.id]}</span><LearningWordArt id={unit.words[0].id} /><strong>{unit.title}</strong><small>8 个词 · 4 个冒险站</small><span className="learning-node-progress">{unit.activities.filter(item => learning.completed[item.id]).length} / 4 <Footprints size={15} /></span></button>)}</div></div>
      <div className="learning-library-grid"><div className="learning-library"><h2><BookOpen size={25} />故事小剧场</h2><p>听完整故事，再自己读、说和写。</p>{storyActivities.map(story => <button className="learning-library-item" key={story.id} onClick={() => beginActivity(story)}><span>{story.title}<small>{story.description}</small></span>{learning.completed[story.id] ? <Check size={22} /> : <ArrowRight size={22} />}</button>)}</div><div className="learning-library"><h2>拼读小火车</h2><p>听整词，找词尾，再点字母拼一拼。</p><div className="learning-phonics-grid">{phonicsActivities.map(group => <button key={group.id} onClick={() => beginActivity(group)}><strong lang="en">{group.phonics?.words.join(" · ")}</strong><small>{learning.completed[group.id] ? "再练一次" : "上车拼一拼"}</small></button>)}</div></div></div>
      <div className="learning-diagnostic-invite"><div><h2>给家长的四技能观察站</h2><p>24 个原创任务，观察听、读、写、说。可以分次完成，记录首次独立回答与提示。</p><small>这份有限范围观察不是官方 A1 认证，也不代表完整 A1 已学完。</small></div><button className="learning-button learning-button-secondary" onClick={() => changeView("diagnostic")}>一起去观察 <ArrowRight size={20} /></button></div>
    </>}

    {view === "diagnostic" && <div className="learning-task-card learning-diagnostic-intro"><p className="learning-eyebrow">请家长陪同 · 可以分次做完</p><h1>听说读写观察站</h1><p>每技能 6 个原创任务，一起看看孩子哪些会独立完成，哪些还需要练习。</p><div className="learning-diagnostic-rules"><p><Ear size={24} /><span><strong>听力先用耳朵找线索</strong>回答前不显示英文原文或中文翻译；可以重听。</span></p><p><BookOpen size={24} /><span><strong>阅读自己读，书写自己写</strong>提示会单独记录。开放句子由家长观察合理表达。</span></p><p><MessageCircle size={24} /><span><strong>口语先自己表达，再由家长观察</strong>不用示范答案带着说，不要求母语口音。录音可选，只在当前练习回放。</span></p></div><p className="learning-task-note">这份有限范围观察不是官方 A1 认证，也不能判断完整 A1 课程已完成。网站四技能记录与官方考试的盾牌不是同一套标准。</p><button className="learning-button" onClick={() => beginActivity(diagnosticActivity)}>{run?.activityId === diagnosticActivity.id ? "继续上次观察" : "开始观察"}<ArrowRight size={22} /></button></div>}

    {view === "unit" && <>
      <div className="learning-hero learning-unit-hero"><div><p className="learning-eyebrow">四站小冒险 · 可以随时休息</p><h1>{currentUnit.title}</h1><p>{currentUnit.subtitle}</p><span className="learning-level-pill">{currentUnit.level === "A1-bridge" ? "A1 衔接" : "Pre-A1 基础"}</span></div><LearningWordArt id={currentUnit.words[0].id} /></div>
      <div className="learning-trail-scroll"><div className="learning-four-trail"><div className="learning-trail-road" aria-hidden="true" />{currentUnit.activities.map((item, index) => { const Icon = skillIcons[item.skill!]; return <button key={item.id} className={`learning-trail-node trail-step-${index} ${learning.completed[item.id] ? "is-complete" : ""}`} onClick={() => beginActivity(item)}><span className="learning-trail-number">{learning.completed[item.id] ? <Check size={26} /> : index + 1}</span><Icon size={35} /><strong>{item.title}</strong><small>{item.tasks.length} 个任务 · {skillNames[item.skill!]}</small><span>{run?.activityId === item.id ? "继续冒险" : learning.completed[item.id] ? "再玩一次" : "出发探险"}</span></button>; })}</div></div>
      <div className="learning-word-shelf"><h2>这条小路上的朋友</h2><div>{currentUnit.words.map(word => <button key={word.id} onClick={() => void speak(word.en, "en")}><LearningWordArt id={word.id} /><strong lang="en">{word.en}</strong><small>{word.zh}</small><Volume2 size={17} /></button>)}</div></div>
      <div className="learning-phrase-shelf"><h2>今天可以说给家人听</h2>{currentUnit.phrases.map(phrase => <button key={phrase.en} onClick={() => void speak(phrase.en, "en")}><Volume2 size={22} /><span><strong lang="en">{phrase.en}</strong><small>{phrase.zh}</small></span></button>)}</div>
    </>}

    {view === "story" && page && activity && <div className="learning-task-card learning-story-card"><p className="learning-eyebrow">故事小剧场 · 第 {storyPage + 1} / {activity.pages!.length} 页</p><h1>{activity.title}</h1><div className="learning-story-art">{page.scene ? <LearningSceneArt scene={page.scene} /> : page.wordIds.map(id => <LearningWordArt key={id} id={id} />)}</div><p className="learning-story-en" lang="en">{page.en}</p><p className="learning-story-zh">{page.zh}</p><div className="learning-actions"><button className="learning-button learning-button-secondary" onClick={() => void speak(page.en, "en")}><Volume2 size={22} />再听一遍</button>{storyPage > 0 && <button className="learning-button learning-button-secondary" onClick={() => setStoryPage(storyPage - 1)}><ArrowLeft size={20} />上一页</button>}<button className="learning-button" onClick={() => { if (storyPage + 1 === activity.pages!.length) changeView("task"); else setStoryPage(storyPage + 1); }}>{storyPage + 1 === activity.pages!.length ? "走进故事挑战" : "下一页"}<ArrowRight size={22} /></button></div></div>}

    {view === "task" && task && activity && <div className={`learning-task-card ${activity.diagnostic ? "is-diagnostic" : ""}`}>
      <div className="learning-task-heading"><span className="learning-eyebrow">{activity.title} · {skillNames[task.skill]}</span><span className="learning-task-counter">{Math.min(run?.taskIds.length ?? 1, (run?.index ?? 0) + (feedback?.recorded ? 0 : 1))} / {run?.taskIds.length ?? 1}</span></div>
      <div className="learning-task-progress" aria-hidden="true"><span style={{ width: `${run ? run.index / run.taskIds.length * 100 : 0}%` }} /></div>
      <h1>{task.promptZh}</h1>
      {hiddenCaption ? <div className="learning-listen-secret"><Ear size={30} /><span>{activity.diagnostic ? "先用耳朵找线索，作答后再看完整英语。" : "先听一听，自己想起来。回答后再看英文。"}</span></div> : <p className="learning-full-prompt" lang="en">{task.audioText ?? task.promptEn}</p>}
      <div className="learning-task-tools"><button className="learning-button learning-button-secondary" onClick={() => void speak(task.audioText ?? task.promptEn, "en", !hiddenCaption)}><Volume2 size={21} />{voiceBusy ? "正在播放 · 点此重听" : "重听英语"}</button>{!feedback && <button className="learning-button learning-button-hint" onClick={hint}><Lightbulb size={20} />需要一点帮助</button>}</div>
      {audioError && <p className="learning-audio-error" role="alert">{audioError}</p>}
      {pagePaused && <p className="learning-audio-error" role="status">刚才暂停了声音。点“重听英语”，准备好后继续。</p>}
      {hintVisible && <div className="learning-hint" role="status"><Lightbulb size={21} /><span>{task.hintZh ?? "先听一遍示范，再试一次。"}<small>本题已记录使用帮助。</small></span></div>}
      {task.stimulusEn && <div className="learning-stimulus" lang="en">{task.stimulusEn}</div>}
      {activity.phonics && <div className="learning-phonics-demo"><span>先听这组整词：</span>{activity.phonics.words.map(word => <button key={word} onClick={() => void speak(word, "en")} lang="en"><Volume2 size={18} />{word}</button>)}<small>字母按钮用来拼词；示范播放完整单词，不把字母名称当作音素。</small></div>}
      {task.scenes?.length ? <div className={`learning-task-scenes scenes-${task.scenes.length}`}>{task.scenes.map((scene, index) => <div key={index}>{task.scenes!.length > 1 && <span className="learning-scene-label">{index + 1}</span>}<LearningSceneArt scene={scene} variant={activity.review || (activity.diagnostic && ["a1-speaking-2", "a1-writing-6"].includes(task.id) && scene.actionWordId === "read") ? "review" : "base"} /></div>)}</div> : null}
      {task.wordCues?.length ? <p className="learning-word-cues" lang="en">{task.wordCues.join(" · ")}</p> : null}
      {task.kind === "choose" && <div className="learning-options">{options.map((option, index) => <button key={option.id} disabled={Boolean(feedback) || (task.skill === "listening" && !heard)} className={`learning-option ${feedback?.answer === option.id ? feedback.correct ? "selected-correct" : "selected-retry" : ""}`} onClick={() => submit(option.id)} aria-label={option.textEn ?? `选择图片 ${index + 1}`}><span className="learning-choice-index" aria-hidden="true">{index + 1}</span><TaskChoiceArt option={option} review={Boolean(activity.review)} />{option.textEn && <span className="learning-choice-text" lang="en">{option.textEn}</span>}</button>)}</div>}
      {task.kind === "blend" && <div className="learning-blend"><div className="learning-built-word" lang="en" aria-live="polite">{built || "_ _ _"}</div><div className="learning-letter-tiles">{letters.map(tile => <button key={tile.index} disabled={Boolean(feedback) || tiles.includes(tile.index)} onClick={() => setTiles([...tiles, tile.index])} lang="en">{tile.letter}</button>)}</div>{!feedback && <div className="learning-actions"><button className="learning-button learning-button-secondary" onClick={() => setTiles(tiles.slice(0, -1))} disabled={!tiles.length}><RotateCcw size={20} />退一个字母</button><button className="learning-button" onClick={() => submit(built)} disabled={!tiles.length}>检查我的单词 <Check size={20} /></button></div>}</div>}
      {task.kind === "type" && <form className="learning-writing" onSubmit={event => { event.preventDefault(); if (!manual) submit(input); else setAdultOpen(true); }}><label htmlFor={`learning-input-${task.id}`}>{task.adultReviewRecommended ? "用自己的英语写一个句子" : "输入英文单词"}</label><textarea id={`learning-input-${task.id}`} lang="en" inputMode="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={500} rows={task.adultReviewRecommended ? 3 : 1} value={input} onChange={event => setInput(event.target.value)} disabled={Boolean(feedback)} placeholder={task.adultReviewRecommended ? "Write your sentence here." : "Type here."} />{!feedback && <button className="learning-button" type="submit" disabled={!input.trim()}>{manual ? "写好了，请家长看看" : "检查我的答案"}<Check size={20} /></button>}</form>}
      {task.kind === "speak" && !feedback && <div className="learning-independent"><p>先自己说，可以直接说给家长听，也可以录下来回放。无需打开麦克风也能完成。</p><Recorder key={`${run?.id}-${task.id}`} independent text={task.id} onRecorded={recordPractice} /><button className="learning-button learning-button-secondary" onClick={() => setAdultOpen(true)}>说好了，请家长看看 <MessageCircle size={20} /></button></div>}
      {manual && adultOpen && !feedback && <div className="learning-adult-observer"><h2>请家长观察这一次</h2><p>{task.kind === "speak" ? "先听孩子自己的回答，再选择观察结果。停顿、口音和不影响理解的小错都可以接受。" : "看孩子写的句子是否表达了图片的意思。可以接受与示例不同、但有意义的英语表达。"}</p>{task.adultRubric?.length ? <ul>{task.adultRubric.map(criterion => <li key={criterion}>{criterion}</li>)}</ul> : <p>无需翻译或答案示范，能表达题意，就是独立完成。</p>}<div className="learning-rating-buttons"><button onClick={() => submit(task.kind === "type" ? input : "成人观察：还需练习", 0)}>还需练习<small>没有独立表达题意</small></button><button onClick={() => submit(task.kind === "type" ? input : "成人观察：提示后完成", 1)}>有帮助完成<small>用了翻译、关键词或示范</small></button><button onClick={() => submit(task.kind === "type" ? input : "成人观察：独立完成", 2)}>独立完成<small>自己表达，可理解</small></button></div><small>这份记录是成人观察，不是自动评分。</small></div>}
      {feedback && <div className={`learning-feedback ${feedback.correct ? "is-success" : "is-practice"}`} role="status"><h2>{feedback.correct ? feedback.independent ? "你自己想出来了！" : "又练会了一点！" : feedback.recorded ? "记下来，下次一起练！" : "再听一遍，试试看！"}</h2><p>{feedback.recorded ? feedback.independent ? "这一次记录为首次独立完成。" : "这一次记录为练习，和独立完成分开保存。" : "答案记录已经保存。可以重听，也可以查看一点帮助。"}</p>{feedback.recorded && task.captionMode === "after-answer" && <p className="learning-feedback-english" lang="en">{task.audioText ?? task.promptEn}</p>}{feedback.recorded && task.exampleAnswers?.length ? <div className="learning-example-after"><span>观察完成后，再看示范：</span>{task.exampleAnswers.map(example => <button key={example} onClick={() => void speak(example, "en")} lang="en"><Volume2 size={18} />{example}</button>)}</div> : null}<button className="learning-button" onClick={advance}>{feedback.recorded ? run?.index === run?.taskIds.length ? "收下学习足迹" : "下一道小冒险" : "再试一次"}<ArrowRight size={21} /></button>{!feedback.recorded && <button className="learning-button learning-button-hint" onClick={() => { resetQuestion(); const updated = commitRef.current(p => ({ ...p, learning: markLearningHint(p.learning) })); progressRef.current = updated; setHintVisible(true); }}>看看提示 <Lightbulb size={20} /></button>}</div>}
      <p className="learning-task-note">{activity.diagnostic ? "这是学习观察，可以随时回地图休息，稍后继续。" : "作答后立即保存。先自己想，需要时再看提示。"}</p>
    </div>}

    {view === "task" && !task && sessionFinished && <div className="learning-task-card"><h1>小路已经走完啦！</h1><p>收下这次的学习记录，然后继续下一次冒险。</p><button className="learning-button" onClick={finish}>收下学习足迹 <Footprints size={22} /></button></div>}
    {view === "task" && !task && !sessionFinished && <div className="learning-task-card"><h1>从学习地图继续出发吧</h1><p>这条小路的状态已经更新。学习记录仍然保留，可以选择下一次冒险。</p><button className="learning-button" onClick={() => changeView("hub")}>打开学习地图 <ArrowRight size={22} /></button></div>}

    {view === "result" && result && <div className="learning-result"><span className="learning-result-medal" aria-hidden="true"><Footprints size={54} /></span><p className="learning-eyebrow">{result.activity.diagnostic ? "这次四技能观察已保存" : "又走过一条小路"}</p><h1>{result.activity.diagnostic ? "看见自己的进步，也找到下一步" : "小冒险完成啦！"}</h1><p>{result.activity.title}</p><div className="learning-result-numbers"><div><strong>{result.answers.length}</strong><span>完成的任务</span></div><div><strong>{result.answers.filter(answer => answer.firstCorrect).length}</strong><span>首次独立完成</span></div><div><strong>{result.answers.filter(answer => answer.hintUsed).length}</strong><span>使用了帮助</span></div></div>{result.activity.diagnostic ? <><div className="learning-result-skills">{(["listening", "reading", "writing", "speaking"] as LearningSkill[]).map(skill => <span key={skill}>{skillNames[skill]} <strong>{result.answers.filter(answer => answer.skill === skill && answer.firstCorrect).length} / 6</strong></span>)}</div><p className="learning-result-note">这里只观察了每技能 6 个原创任务，不能认定已完成 A1。继续练习，再尝试官方 Movers 样题；口语和开放写作采用成人观察。</p></> : <p className="learning-result-note">{result.fresh ? "新的学习足迹已留下！" : "又认真练习了一次！"}学习记录和游戏星星分开保存。隔日再回忆，比同一题重复很多遍更有帮助。</p>}<button className="learning-button learning-next-adventure" onClick={() => beginActivity(nextActivity)}>继续下一冒险 <ArrowRight size={24} /><small>{nextActivity.title}</small></button><div className="learning-actions"><button className="learning-button learning-button-secondary" onClick={() => beginActivity(result.activity)}>再玩这条小路 <RotateCcw size={20} /></button><button className="learning-button learning-button-secondary" onClick={() => changeView("hub")}>回地图休息一下</button></div></div>}
  </section>;
}
