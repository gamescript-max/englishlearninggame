import { z } from "zod";
import { adventureVocabulary, oceanEvolution, getOceanSpecies } from "./adventure-catalog";
import { ADVENTURE_ROUND_LENGTH, adventureTaskMode, getAdventureRound, getAdventureTaskById, type AdventureMode, type AdventureTask } from "./adventure-content";
import { createOceanTreasure, oceanTreasureSchema, validateOceanTreasure, type OceanTreasure } from "./ocean-treasure";
import { createOceanScore, oceanPoints, oceanScoreSchema, validateOceanScore, type OceanScore } from "./ocean-score";

export interface AdventureQuestion { attempts: number; hintUsed: boolean; listenCount: number; firstCorrect: boolean | null }
export interface ModeProgress {
  xp: number;
  collectedWords: string[];
  /** Exact head-to-tail English picture history; repeated words occupy repeated body segments. */
  bodyWords: string[];
  /** Current snake life length; lifetime XP is retained after a collision and new start. */
  runLength: number;
  taskIndex: number;
  round: number;
  seed: number;
  taskIds: string[];
  lastAt: number;
  totalSeconds: number;
  firstChoices: number;
  firstCorrect: number;
  hints: number;
  listenCount: number;
  wrongChoices: number;
  current: AdventureQuestion;
  completedTasks: number;
  unlockedStages: number[];
}
export interface AdventureRecord {
  id: string;
  mode: AdventureMode;
  taskId: string;
  round: number;
  index: number;
  promptEn: string;
  skill: AdventureTask["skill"];
  wordId?: string;
  correct: boolean;
  firstCorrect: boolean;
  hintUsed: boolean;
  listenCount: number;
  attempts: number;
  at: number;
}
export interface AdventureProgress { version: 1; fishGrowthVersion: 2; fishRouteVersion: 2; activeMode: AdventureMode | null; modes: Record<AdventureMode, ModeProgress>; records: AdventureRecord[]; oceanTreasure: OceanTreasure; /** Frozen legacy ledger, retained only for backup compatibility. */ oceanScore: OceanScore }
export const MAX_FISH_GROWTH = 20_000_000_000;
const emptyQuestion = (): AdventureQuestion => ({ attempts: 0, hintUsed: false, listenCount: 0, firstCorrect: null });
const vocabularyIds = new Set(adventureVocabulary.map(word => word.id));
const knownWords = vocabularyIds;
const MAX_BODY_WORDS = 159;
const MAX_RECORDS = 2000;

/** Game growth thresholds; these are rewards, not a language-level assessment. */
export const adventureStages = {
  fish: oceanEvolution.map(stage => ({ xp: stage.xp, title: getOceanSpecies(stage.speciesId)!.zh })),
  snake: [
    { xp: 0, title: "小蛇出发" }, { xp: 20, title: "灵巧小蛇" }, { xp: 50, title: "彩色长蛇" },
    { xp: 95, title: "森林大蛇" }, { xp: 160, title: "冒险巨蛇" }, { xp: 250, title: "继续长长长" },
  ],
} as const;
export function getAdventureStage(mode: AdventureMode, xp: number): number {
  let stage = 0;
  for (let index = 1; index < adventureStages[mode].length; index++) if (xp >= adventureStages[mode][index].xp) stage = index;
  return stage;
}
function createMode(mode: AdventureMode, seed: number): ModeProgress {
  return { xp: 0, collectedWords: [], bodyWords: [], runLength: 1, taskIndex: 0, round: 0, seed, taskIds: getAdventureRound(mode, 0, seed), lastAt: 0, totalSeconds: 0,
    firstChoices: 0, firstCorrect: 0, hints: 0, listenCount: 0, wrongChoices: 0, current: emptyQuestion(), completedTasks: 0, unlockedStages: [0] };
}
export function createAdventureProgress(seed = 20261005): AdventureProgress {
  return { version: 1, fishGrowthVersion: 2, fishRouteVersion: 2, activeMode: null, modes: { fish: createMode("fish", seed), snake: createMode("snake", (seed + 7919) >>> 0) }, records: [], oceanTreasure:createOceanTreasure(), oceanScore:createOceanScore() };
}

function withMode(progress: AdventureProgress, mode: AdventureMode, state: ModeProgress, records = progress.records): AdventureProgress {
  return { ...progress, activeMode: mode, modes: { ...progress.modes, [mode]: state }, records };
}
export function getCurrentAdventureTask(progress: AdventureProgress, mode: AdventureMode): AdventureTask {
  const state = progress.modes[mode];
  return { ...getAdventureTaskById(state.taskIds[state.taskIndex]), instanceKey: `${mode}/${state.round}/${state.taskIndex}/${state.seed}` };
}
export function startAdventure(progress: AdventureProgress, mode: AdventureMode, now = Date.now()): AdventureProgress {
  return withMode(progress, mode, { ...progress.modes[mode], lastAt: now });
}
export function leaveAdventure(progress: AdventureProgress): AdventureProgress { return { ...progress, activeMode: null }; }
export function getAdventureReviewIds(progress: AdventureProgress, mode: AdventureMode): string[] {
  const latest = new Map<string, AdventureRecord>();
  for (const record of progress.records) if (record.mode === mode) latest.set(record.taskId, record);
  return [...latest.values()].filter(record => !record.firstCorrect).sort((a, b) => a.at - b.at).slice(-8).map(record => record.taskId);
}
export function markAdventureHint(progress: AdventureProgress, mode: AdventureMode, now = Date.now()): AdventureProgress {
  const state = progress.modes[mode];
  return withMode(progress, mode, { ...state, lastAt: now, hints: state.hints + Number(!state.current.hintUsed), current: { ...state.current, hintUsed: true } });
}
export function markAdventureListen(progress: AdventureProgress, mode: AdventureMode, now = Date.now()): AdventureProgress {
  const state = progress.modes[mode];
  return withMode(progress, mode, { ...state, lastAt: now, listenCount: state.listenCount + 1, current: { ...state.current, listenCount: state.current.listenCount + 1 } });
}

/** Count tasks are submitted once by the engine after enough distinct target entities were collected. */
export function recordAdventureChoice(progress: AdventureProgress, mode: AdventureMode, task: AdventureTask, selected: string, now = Date.now()): AdventureProgress {
  const state = progress.modes[mode];
  // A late callback from the previous target must not answer or reward the next one.
  if (task.id !== state.taskIds[state.taskIndex] || adventureTaskMode(task.id) !== mode ||
    (task.instanceKey !== undefined && task.instanceKey !== `${mode}/${state.round}/${state.taskIndex}/${state.seed}`)) return progress;
  const authored = getAdventureTaskById(task.id);
  if (!authored.options.some(option => option.id === selected)) return progress;
  const correct = selected === authored.answer;
  const firstChoice = state.current.attempts === 0;
  const independent = correct && firstChoice && !state.current.hintUsed;
  const nextState: ModeProgress = { ...state, lastAt: now, firstChoices: state.firstChoices + Number(firstChoice),
    firstCorrect: state.firstCorrect + Number(independent), wrongChoices: state.wrongChoices + Number(!correct),
    current: { ...state.current, attempts: state.current.attempts + 1, firstCorrect: firstChoice ? independent : state.current.firstCorrect } };
  if (!correct) return withMode(progress, mode, nextState);
  const record: AdventureRecord = { id: `${mode}-${state.round}-${state.taskIndex}`, mode, taskId: authored.id, round: state.round, index: state.taskIndex,
    promptEn: authored.promptEn, skill: authored.skill, ...(authored.wordId ? { wordId: authored.wordId } : {}), correct: true,
    firstCorrect: nextState.current.firstCorrect === true, hintUsed: nextState.current.hintUsed,
    listenCount: nextState.current.listenCount, attempts: nextState.current.attempts, at: now };
  const records = [...progress.records, record].slice(-MAX_RECORDS);
  const roundDone = state.taskIndex === ADVENTURE_ROUND_LENGTH - 1;
  const nextRound = state.round + Number(roundDone);
  const recent = getAdventureReviewIds({ ...progress, records }, mode);
  return withMode(progress, mode, { ...nextState, taskIndex: roundDone ? 0 : state.taskIndex + 1, round: nextRound,
    taskIds: roundDone ? getAdventureRound(mode, nextRound, state.seed, recent) : state.taskIds,
    completedTasks: state.completedTasks + 1, current: emptyQuestion() }, records);
}

/** XP is an absolute total; elapsed seconds are a delta. A duplicate growth snapshot cannot duplicate XP. */
export function saveAdventureGrowth(progress: AdventureProgress, mode: AdventureMode, xp: number, collectedWords: string[], seconds = 0, now = Date.now(), runLength?: number): AdventureProgress {
  const state = progress.modes[mode];
  const safeXp = Math.max(state.xp, Math.min(mode === "fish" ? MAX_FISH_GROWTH : 1000000000, Math.max(0, Math.floor(Number.isFinite(xp) ? xp : state.xp))));
  const elapsed = Math.max(0, Math.min(60, Math.floor(Number.isFinite(seconds) ? seconds : 0)));
  const stage = getAdventureStage(mode, safeXp);
  const validWords = collectedWords.filter(word => knownWords.has(word));
  // Omitted length grows only by new XP, so a repeated old snapshot cannot restore a lost snake life.
  // Fish has no visible body; explicit length 1 still keeps its vocabulary collection separate.
  const safeLength = Math.max(1, Math.min(mode === "snake" ? safeXp + 1 : 1000000, 1000000, Math.floor(runLength === undefined
    ? mode === "snake" ? state.runLength + safeXp - state.xp : Math.max(state.runLength + safeXp - state.xp, Math.min(MAX_BODY_WORDS, validWords.length) + 1)
    : Number.isFinite(runLength) ? runLength : state.runLength)));
  return withMode(progress, mode, { ...state, xp: safeXp, lastAt: now,
    collectedWords: [...new Set([...validWords, ...state.collectedWords])],
    bodyWords: validWords.slice(0, Math.min(MAX_BODY_WORDS, safeLength - 1)), runLength: safeLength,
    totalSeconds: Math.min(1000000000, state.totalSeconds + elapsed),
    unlockedStages: Array.from({ length: stage + 1 }, (_, index) => index) });
}

const integer = z.number().int().min(0).max(1000000000);
const timestamp = z.number().int().min(0).max(Date.UTC(2100, 0, 1));
const questionSchema = z.object({ attempts: integer, hintUsed: z.boolean(), listenCount: integer, firstCorrect: z.boolean().nullable() }).strict();
const modeSchema = z.object({ xp: z.number().int().min(0).max(MAX_FISH_GROWTH), collectedWords: z.array(z.string().max(100)).max(knownWords.size), bodyWords: z.array(z.string().max(100)).max(MAX_BODY_WORDS).optional(),
  runLength: z.number().int().min(1).max(1000000).optional(), taskIndex: z.number().int().min(0).max(11),
  round: integer, seed: z.number().int().min(0).max(4294967295), taskIds: z.array(z.string().max(100)).length(12), lastAt: timestamp,
  totalSeconds: integer, firstChoices: integer, firstCorrect: integer, hints: integer, listenCount: integer, wrongChoices: integer,
  current: questionSchema, completedTasks: integer, unlockedStages: z.array(z.number().int().min(0).max(oceanEvolution.length - 1)).min(1).max(oceanEvolution.length) }).strict();
const recordSchema = z.object({ id: z.string().min(1).max(100), mode: z.enum(["fish", "snake"]), taskId: z.string().min(1).max(100), round: integer,
  index: z.number().int().min(0).max(11), promptEn: z.string().max(150), skill: z.enum(["color", "count", "size", "word"]), wordId: z.string().max(100).optional(),
  correct: z.boolean(), firstCorrect: z.boolean(), hintUsed: z.boolean(), listenCount: integer, attempts: z.number().int().min(1).max(1000000000), at: timestamp }).strict();
const schema = z.object({ version: z.literal(1), fishGrowthVersion: z.literal(2).optional(), fishRouteVersion: z.literal(2).optional(), activeMode: z.enum(["fish", "snake"]).nullable(),
  modes: z.object({ fish: modeSchema, snake: modeSchema }).strict(), records: z.array(recordSchema).max(MAX_RECORDS), oceanTreasure:oceanTreasureSchema.optional(), oceanScore:oceanScoreSchema.optional() }).strict();

/** Only an absent pre-adventure field migrates. Present but damaged data is rejected, never silently reset. */
export function validateAdventureProgress(value: unknown): AdventureProgress {
  if (value === undefined) return createAdventureProgress();
  const data = schema.parse(value) as AdventureProgress;
  const legacyGrowth = data.fishGrowthVersion === undefined;
  const legacyRoute = data.fishRouteVersion === undefined;
  if (!legacyRoute && legacyGrowth) throw new Error("冒险成长版本无效。");
  data.oceanTreasure=validateOceanTreasure(data.oceanTreasure,data.modes.fish.seed);
  data.oceanScore=validateOceanScore(data.oceanScore,data.modes.fish.completedTasks);
  for (const mode of ["fish", "snake"] as const) {
    const state = data.modes[mode];
    if (legacyGrowth && state.xp > 1000000000) throw new Error("旧冒险成长无效。");
    // Local draft profiles from before exact body history existed preserve their available word pictures.
    state.bodyWords ??= [...state.collectedWords].slice(0, MAX_BODY_WORDS);
    state.runLength ??= Math.min(1000000, Math.max(1 + state.xp, 1 + state.bodyWords.length));
    const expectedStages = Array.from({ length: getAdventureStage(mode, state.xp) + 1 }, (_, index) => index);
    // The first release had exactly six fish forms at the same initial thresholds.
    // Only its internally consistent complete prefix migrates; arbitrary unlock arrays still fail.
    const legacyPrefixes = [6, 20].map(length => Array.from({ length: Math.min(length, expectedStages.length) }, (_, index) => index));
    if (mode === "fish" && legacyGrowth && legacyPrefixes.some(prefix => JSON.stringify(state.unlockedStages) === JSON.stringify(prefix))) state.unlockedStages = expectedStages;
    // Append-only routes retain every old threshold. Accept only the exact old
    // 24-form prefix, and only before the new route marker has been saved.
    const oldRouteStages = expectedStages.slice(0, 24);
    if (mode === "fish" && legacyRoute && JSON.stringify(state.unlockedStages) === JSON.stringify(oldRouteStages)) state.unlockedStages = expectedStages;
    if (new Set(state.taskIds).size !== 12 || state.taskIds.some(id => adventureTaskMode(id) !== mode) ||
      new Set(state.collectedWords).size !== state.collectedWords.length || state.collectedWords.some(id => !knownWords.has(id)) ||
      (mode === "snake" && (state.xp > 1000000000 || state.runLength > state.xp + 1)) || state.bodyWords.length > state.runLength - 1 || state.bodyWords.some(id => !knownWords.has(id) || !state.collectedWords.includes(id)) ||
      JSON.stringify(state.unlockedStages) !== JSON.stringify(expectedStages) ||
      state.completedTasks !== state.round * ADVENTURE_ROUND_LENGTH + state.taskIndex ||
      state.firstChoices !== state.completedTasks + Number(state.current.attempts > 0) || state.firstCorrect > state.firstChoices ||
      state.current.listenCount > state.listenCount || Number(state.current.hintUsed) > state.hints ||
      (state.current.attempts === 0 && state.current.firstCorrect !== null) ||
      (state.current.attempts > 0 && state.current.firstCorrect !== false) ||
      state.current.attempts > state.wrongChoices) throw new Error("冒险进度无效。");
  }
  const ids = new Set<string>();
  const counts = { fish: { completed: 0, firstCorrect: 0, hints: 0, listens: 0, mistakes: 0 }, snake: { completed: 0, firstCorrect: 0, hints: 0, listens: 0, mistakes: 0 } };
  for (const record of data.records) {
    if (adventureTaskMode(record.taskId) !== record.mode) throw new Error("冒险目标无效。");
    const task = getAdventureTaskById(record.taskId), state = data.modes[record.mode];
    const position = record.round * 12 + record.index;
    if (ids.has(record.id) || record.id !== `${record.mode}-${record.round}-${record.index}` || position >= state.completedTasks ||
      record.promptEn !== task.promptEn || record.skill !== task.skill || record.wordId !== task.wordId || !record.correct ||
      record.firstCorrect !== (!record.hintUsed && record.attempts === 1) || record.at > state.lastAt) throw new Error("冒险学习记录无效。");
    ids.add(record.id);
    const count = counts[record.mode];
    count.completed++; count.firstCorrect += Number(record.firstCorrect); count.hints += Number(record.hintUsed); count.listens += record.listenCount; count.mistakes += record.attempts - 1;
  }
  for (const mode of ["fish", "snake"] as const) {
    const count = counts[mode], state = data.modes[mode];
    if (count.completed > state.completedTasks || count.firstCorrect > state.firstCorrect || count.hints > state.hints || count.listens + state.current.listenCount > state.listenCount || count.mistakes + state.current.attempts > state.wrongChoices) throw new Error("冒险统计无效。");
    // Before pruning begins all completed target records must exist, including their independent-choice count.
    if (data.modes.fish.completedTasks + data.modes.snake.completedTasks <= MAX_RECORDS &&
      (count.completed !== state.completedTasks || count.firstCorrect !== state.firstCorrect ||
       count.hints + Number(state.current.hintUsed) !== state.hints || count.listens + state.current.listenCount !== state.listenCount ||
       count.mistakes + state.current.attempts !== state.wrongChoices)) throw new Error("冒险学习记录不完整。");
  }
  // Validate the old ledger, unlocks and learning records before converting once.
  if (legacyGrowth) {
    data.modes.fish.xp += oceanPoints(data.oceanScore, data.modes.fish.completedTasks);
    data.modes.fish.unlockedStages = Array.from({ length: getAdventureStage("fish", data.modes.fish.xp) + 1 }, (_, index) => index);
    data.fishGrowthVersion = 2;
  }
  data.fishRouteVersion = 2;
  return data;
}
