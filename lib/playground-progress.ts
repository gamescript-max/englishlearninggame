import { z } from "zod";
import { getPlaygroundTask, playgroundModes, playgroundTasks, type PlaygroundMode } from "./playground-content";

export interface PlaygroundQuestion { attempts: number; hintUsed: boolean; listenCount: number; firstCorrect: boolean | null }
export interface PlaygroundModeState {
  round: number; index: number; completed: number; coins: number; firstCorrect: number; hints: number; totalSeconds: number;
  current: PlaygroundQuestion; lastAt: number;
}
export interface PlaygroundRecord { id: string; mode: PlaygroundMode; taskId: string; firstCorrect: boolean; hintUsed: boolean; attempts: number; listenCount: number; at: number }
export interface PlaygroundProgress { version: 1; modes: Record<PlaygroundMode, PlaygroundModeState>; records: PlaygroundRecord[] }
export type PlaygroundCursor = { round: number; index: number; taskId: string };
const emptyQuestion = (): PlaygroundQuestion => ({ attempts: 0, hintUsed: false, listenCount: 0, firstCorrect: null });
const newMode = (): PlaygroundModeState => ({ round: 0, index: 0, completed: 0, coins: 0, firstCorrect: 0, hints: 0, totalSeconds: 0, current: emptyQuestion(), lastAt: 0 });
export function createPlaygroundProgress(): PlaygroundProgress { return { version: 1, modes: { garden: newMode(), pets: newMode(), racing: newMode() }, records: [] }; }
export function playgroundCursor(progress: PlaygroundProgress, mode: PlaygroundMode): PlaygroundCursor {
  const state = progress.modes[mode]; return { round: state.round, index: state.index, taskId: getPlaygroundTask(mode, state.round, state.index).id };
}
function matches(progress: PlaygroundProgress, mode: PlaygroundMode, expected: PlaygroundCursor) {
  const cursor = playgroundCursor(progress, mode); return cursor.round === expected.round && cursor.index === expected.index && cursor.taskId === expected.taskId;
}
function replace(progress: PlaygroundProgress, mode: PlaygroundMode, state: PlaygroundModeState): PlaygroundProgress { return { ...progress, modes: { ...progress.modes, [mode]: state } }; }
export function markPlaygroundListen(progress: PlaygroundProgress, mode: PlaygroundMode, cursor: PlaygroundCursor): PlaygroundProgress {
  if (!matches(progress, mode, cursor)) return progress;
  const state = progress.modes[mode]; return replace(progress, mode, { ...state, current: { ...state.current, listenCount: Math.min(10000, state.current.listenCount + 1) } });
}
export function markPlaygroundHint(progress: PlaygroundProgress, mode: PlaygroundMode, cursor: PlaygroundCursor): PlaygroundProgress {
  if (!matches(progress, mode, cursor)) return progress;
  const state = progress.modes[mode]; return replace(progress, mode, { ...state, current: { ...state.current, hintUsed: true, firstCorrect: false } });
}
export function recordPlaygroundTime(progress: PlaygroundProgress, mode: PlaygroundMode, seconds: number): PlaygroundProgress {
  const state = progress.modes[mode], increment = Math.min(15, Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)));
  return !increment ? progress : replace(progress, mode, { ...state, totalSeconds: Math.min(1000000000, state.totalSeconds + increment) });
}
export function submitPlaygroundAnswer(progress: PlaygroundProgress, mode: PlaygroundMode, cursor: PlaygroundCursor, selected: string, now = Date.now()): { progress: PlaygroundProgress; correct: boolean; applied: boolean } {
  if (!matches(progress, mode, cursor)) return { progress, correct: false, applied: false };
  const state = progress.modes[mode], task = getPlaygroundTask(mode, state.round, state.index);
  if (!task.options.some(option => option.id === selected) && !(mode === "pets" && ["pet:puppy", "pet:kitten", "pet:bunny"].includes(selected))) return { progress, correct: false, applied: false };
  if (state.current.attempts >= 10000 || state.round >= 1000000) return { progress, correct: false, applied: false };
  const correct = selected === task.target;
  const question = { ...state.current, attempts: state.current.attempts + 1, firstCorrect: state.current.firstCorrect ?? (correct && !state.current.hintUsed) };
  if (!correct) return { progress: replace(progress, mode, { ...state, current: question, lastAt: now }), correct, applied: true };
  const completed = state.completed + 1, index = (state.index + 1) % playgroundTasks[mode].length;
  const updated = replace(progress, mode, { ...state, completed, coins: completed * 10, firstCorrect: state.firstCorrect + Number(question.firstCorrect), hints: state.hints + Number(question.hintUsed), index,
    round: state.round + Number(index === 0), current: emptyQuestion(), lastAt: now });
  const record: PlaygroundRecord = { id: `${mode}:${state.round}:${state.index}`, mode, taskId: task.id, firstCorrect: question.firstCorrect!, hintUsed: question.hintUsed, attempts: question.attempts, listenCount: question.listenCount, at: now };
  return { progress: { ...updated, records: [...updated.records, record].slice(-600) }, correct, applied: true };
}
const integer = z.number().int().nonnegative().max(1000000000);
const timestamp = z.number().int().nonnegative().max(Date.UTC(2100, 0, 1));
const questionSchema = z.object({ attempts: integer.max(10000), hintUsed: z.boolean(), listenCount: integer.max(10000), firstCorrect: z.boolean().nullable() }).strict();
const modeSchema = z.object({ round: integer.max(1000000), index: integer, completed: integer, coins: integer, firstCorrect: integer, hints: integer, totalSeconds: integer, current: questionSchema, lastAt: timestamp }).strict();
const recordSchema = z.object({ id: z.string().max(80), mode: z.enum(playgroundModes), taskId: z.string().max(80), firstCorrect: z.boolean(), hintUsed: z.boolean(), attempts: integer.min(1).max(10000), listenCount: integer.max(10000), at: timestamp }).strict();
const schema = z.object({ version: z.literal(1), modes: z.object({ garden: modeSchema, pets: modeSchema, racing: modeSchema }).strict(), records: z.array(recordSchema).max(600) }).strict();
export function validatePlaygroundProgress(value: unknown): PlaygroundProgress {
  if (value === undefined) return createPlaygroundProgress();
  const parsed = schema.parse(value);
  for (const mode of playgroundModes) {
    const state = parsed.modes[mode], count = playgroundTasks[mode].length;
    if (state.index >= count || state.completed !== state.round * count + state.index || state.coins !== state.completed * 10 || state.firstCorrect + state.hints > state.completed ||
      (state.current.hintUsed && state.current.firstCorrect !== false) || (state.current.attempts === 0 && !state.current.hintUsed && state.current.firstCorrect !== null) || (state.current.attempts > 0 && state.current.firstCorrect !== false)) throw new Error("游戏进度内容不一致。");
  }
  const seen = new Set<string>();
  for (const record of parsed.records) {
    const match = /^(garden|pets|racing):(\d+):(\d+)$/.exec(record.id), state = parsed.modes[record.mode];
    const round = match ? Number(match[2]) : -1, index = match ? Number(match[3]) : -1;
    if (!match || match[1] !== record.mode || record.id !== `${record.mode}:${round}:${index}` || index >= playgroundTasks[record.mode].length || round < 0 || index < 0 || round * playgroundTasks[record.mode].length + index >= state.completed ||
      getPlaygroundTask(record.mode, round, index).id !== record.taskId || (record.firstCorrect && (record.hintUsed || record.attempts !== 1)) || seen.has(record.id)) throw new Error("游戏学习记录无效。");
    seen.add(record.id);
  }
  return parsed;
}
