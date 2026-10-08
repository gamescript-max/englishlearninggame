import { z } from "zod";
import type { LearningSkill, LearningTask } from "./learning-types";

export interface LearningAnswer { taskId: string; skill: LearningSkill; firstCorrect: boolean; correct: boolean; hintUsed: boolean; answer: string; rating?: 0 | 1 | 2; at: number }
export interface RecallCard { stage: 0 | 1 | 2 | 3; dueAt: number; lastAt: number; independent: number; helped: number }
export interface LearningSession { id: string; activityId: string; taskIds: string[]; index: number; startedAt: number; lastActiveAt: number; answers: LearningAnswer[]; hinted: boolean; mistakes: number }
export interface DiagnosticReport { at: number; answers: LearningAnswer[] }
export interface LearningProgress { version: 1; completed: Record<string, { at: number; independent: number; total: number }>; cards: Record<string, RecallCard>; active: LearningSession | null; reports: DiagnosticReport[]; records: LearningAnswer[]; speakingPractice: number; totalSeconds: number; daily: Record<string, { review: boolean; learn: boolean; speak: boolean }> }
export function createLearningProgress(): LearningProgress { return { version: 1, completed: {}, cards: {}, active: null, reports: [], records: [], speakingPractice: 0, totalSeconds: 0, daily: {} }; }

export function learningDay(now = Date.now()): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function recallDueAt(now: number, days: number): number { return Date.parse(`${learningDay(now)}T00:00:00+08:00`) + days * 86400000; }
/** Independent retrieval advances 1 → 3 → 7 days; help starts the short interval again. */
export function recordRecall(progress: LearningProgress, wordId: string, independent: boolean, review: boolean, now = Date.now()): LearningProgress {
  const previous = progress.cards[wordId];
  const spaced = review && previous && previous.dueAt <= now && learningDay(previous.lastAt) < learningDay(now);
  const stage = independent && spaced ? Math.min(3, previous.stage + 1) as RecallCard["stage"] : independent ? previous?.stage ?? 0 : 0;
  const days = [1, 3, 7, 7][stage];
  return { ...progress, cards: { ...progress.cards, [wordId]: { stage, dueAt: spaced || !independent || !previous ? recallDueAt(now, days) : previous.dueAt, lastAt: previous && independent && !review ? previous.lastAt : now, independent: (previous?.independent ?? 0) + Number(independent), helped: (previous?.helped ?? 0) + Number(!independent) } } };
}
export function dueRecallWords(progress: LearningProgress, now = Date.now()): string[] { return Object.entries(progress.cards).filter(([, card]) => card.dueAt <= now).sort((a,b) => a[1].dueAt-b[1].dueAt).map(([id]) => id); }
export function startLearning(progress: LearningProgress, activityId: string, taskIds: string[], now = Date.now()): LearningProgress {
  if (progress.active?.activityId === activityId) return progress;
  if (!taskIds.length || new Set(taskIds).size !== taskIds.length) throw new Error("这次学习的题目还没有准备好。");
  return { ...progress, active: { id: `learn-${now}-${Math.random().toString(36).slice(2,8)}`, activityId, taskIds, index: 0, startedAt: now, lastActiveAt: now, answers: [], hinted: false, mistakes: 0 } };
}
export function markLearningHint(progress: LearningProgress): LearningProgress { return progress.active ? { ...progress, active: { ...progress.active, hinted: true } } : progress; }
export function normalizeLearningAnswer(answer: string): string { return answer.trim().toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g," "); }
export function answerLearning(progress: LearningProgress, task: LearningTask, answer: string, rating?: 0|1|2, now = Date.now(), diagnostic = false): { progress: LearningProgress; correct: boolean; completed: boolean } {
  const run = progress.active;
  if (!run || run.taskIds[run.index] !== task.id) return { progress, correct: false, completed: false };
  const seconds = Math.max(0,Math.min(120,Math.floor((now-run.lastActiveAt)/1000)));
  const timed = { ...progress, totalSeconds: progress.totalSeconds + seconds };
  const accepted = [task.answer, ...(task.acceptedAnswers ?? [])].filter((value): value is string => Boolean(value));
  const manual = task.kind === "speak" || Boolean(task.adultReviewRecommended);
  if (manual && rating === undefined) return { progress, correct: false, completed: false };
  const correct = manual ? rating === 2 : accepted.some(value => normalizeLearningAnswer(value) === normalizeLearningAnswer(answer));
  if (!correct && !diagnostic && !manual) return { progress: { ...timed, active: { ...run, lastActiveAt: now, mistakes: run.mistakes + 1 } }, correct: false, completed: false };
  const helped = run.hinted || rating === 1;
  const firstCorrect = correct && !helped && !run.mistakes;
  const record: LearningAnswer = { taskId: task.id, skill: task.skill, firstCorrect, correct, hintUsed: helped, answer: answer.slice(0,500), ...(rating !== undefined ? { rating } : {}), at: now };
  const answers = [...run.answers, record], completed = answers.length === run.taskIds.length;
  return { correct, completed, progress: { ...timed, records: [...progress.records, record].slice(-10000), active: { ...run, lastActiveAt: now, index: run.index + 1, answers, hinted: false, mistakes: 0 } } };
}
export function finishLearning(progress: LearningProgress, diagnostic: boolean, now = Date.now()): LearningProgress {
  const run = progress.active;
  if (!run || run.index !== run.taskIds.length) return progress;
  return { ...progress, active: null, completed: { ...progress.completed, [run.activityId]: { at: now, independent: run.answers.filter(answer => answer.firstCorrect).length, total: run.answers.length } }, ...(diagnostic ? { reports: [...progress.reports, { at: now, answers: run.answers }].slice(-12) } : {}) };
}
export function markDaily(progress: LearningProgress, part: "review"|"learn"|"speak", now = Date.now()): LearningProgress { const day=learningDay(now); return { ...progress, daily: { ...progress.daily, [day]: { ...(progress.daily[day] ?? { review:false,learn:false,speak:false }), [part]:true } } }; }

const timestamp = z.number().int().min(0).max(Date.UTC(2100,0,1));
const answerSchema = z.object({ taskId:z.string().min(1).max(100), skill:z.enum(["listening","reading","writing","speaking"]), firstCorrect:z.boolean(), correct:z.boolean(), hintUsed:z.boolean(), answer:z.string().max(500), rating:z.union([z.literal(0),z.literal(1),z.literal(2)]).optional(), at:timestamp }).strict();
const schema = z.object({ version:z.literal(1), completed:z.record(z.object({at:timestamp,independent:z.number().int().min(0).max(100),total:z.number().int().min(1).max(100)}).strict()), cards:z.record(z.object({stage:z.union([z.literal(0),z.literal(1),z.literal(2),z.literal(3)]),dueAt:timestamp,lastAt:timestamp,independent:z.number().int().nonnegative(),helped:z.number().int().nonnegative()}).strict()), active:z.object({id:z.string().min(1).max(100),activityId:z.string().min(1).max(100),taskIds:z.array(z.string().min(1).max(100)).min(1).max(100),index:z.number().int().min(0).max(100),startedAt:timestamp,lastActiveAt:timestamp.optional(),answers:z.array(answerSchema).max(100),hinted:z.boolean(),mistakes:z.number().int().min(0).max(10000)}).strict().nullable(),reports:z.array(z.object({at:timestamp,answers:z.array(answerSchema).max(100)}).strict()).max(12),records:z.array(answerSchema).max(10000),speakingPractice:z.number().int().min(0).max(1000000),totalSeconds:z.number().int().min(0).max(1000000000).default(0),daily:z.record(z.object({review:z.boolean(),learn:z.boolean(),speak:z.boolean()}).strict()) }).strict();
export function validateLearningProgress(value: unknown, knownWords: Set<string>, knownTasks?: Set<string>, knownActivities?: Set<string>): LearningProgress {
  const data = schema.parse(value) as LearningProgress;
  if (data.active) data.active.lastActiveAt ??= data.active.startedAt;
  if (Object.keys(data.cards).some(id=>!knownWords.has(id)) || Object.values(data.completed).some(item=>item.independent>item.total)) throw new Error("学习记录无效。");
  if (Object.keys(data.daily).some(day=>!/^20\d{2}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0,10)!==day)) throw new Error("学习日期无效。");
  const records=[...data.records,...data.reports.flatMap(report=>report.answers),...(data.active?.answers ?? [])];
  if (records.some(answer=>answer.firstCorrect && (answer.hintUsed || !answer.correct)) || (knownTasks && records.some(answer=>!knownTasks.has(answer.taskId)))) throw new Error("学习答案无效。");
  if (knownActivities && Object.keys(data.completed).some(id=>!knownActivities.has(id))) throw new Error("学习关卡无效。");
  if (data.active && (data.active.index!==data.active.answers.length || data.active.index>data.active.taskIds.length || new Set(data.active.taskIds).size!==data.active.taskIds.length || data.active.answers.some((answer,index)=>answer.taskId!==data.active!.taskIds[index]) || (knownTasks && data.active.taskIds.some(id=>!knownTasks.has(id))) || (knownActivities && !knownActivities.has(data.active.activityId)))) throw new Error("续玩记录无效。");
  return data;
}

