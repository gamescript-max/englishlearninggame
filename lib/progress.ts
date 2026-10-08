import { bonusInstructions, createRun, getLesson, getTopic, getWord, lessons, topics, words, type Exercise, type Lesson, type SceneChoice, type TopicId } from "./course";
import { createLearningProgress, recordRecall, validateLearningProgress, normalizeLearningAnswer, type LearningProgress } from "./learning-state";
import { allLearningWords, learningActivities, learningTasks, diagnosticActivity, getLearningActivity } from "./learning-content";
import { createAdventureProgress, validateAdventureProgress, type AdventureProgress } from "./adventure-progress";
import { createPlaygroundProgress, validatePlaygroundProgress, type PlaygroundProgress } from "./playground-progress";
import { createSharkProgress, validateSharkProgress, type SharkProgress } from "./shark-progress";

export interface AnswerRecord {
  id: string;
  runId: string;
  lessonId: string;
  exerciseId: string;
  wordId: string;
  firstCorrect: boolean;
  hintUsed: boolean;
  listenCount: number;
  attempts: number;
  answeredAt: number;
}

export interface QuestionState {
  attempts: number;
  hintUsed: boolean;
  listenCount: number;
  firstCorrect: boolean | null;
}

export interface PracticeRun {
  id: string;
  lessonId: string;
  topicId: TopicId;
  startedAt: number;
  lastActiveAt: number;
  exercises: Exercise[];
  index: number;
  current: QuestionState;
  answers: AnswerRecord[];
}

export interface Completion {
  completedAt: number;
  lastCompletedAt: number;
  completions: number;
}

export interface ReviewItem {
  wordId: string;
  dueAt: number;
  mistakes: number;
}

export interface Progress {
  version: 1;
  learning: LearningProgress;
  adventure: AdventureProgress;
  playground: PlaygroundProgress;
  shark: SharkProgress;
  completed: Record<string, Completion>;
  attempts: AnswerRecord[];
  review: ReviewItem[];
  stars: number;
  reviewRewardDays: string[];
  settledRuns: string[];
  settings: { music: boolean; volume: number };
  activeRun: PracticeRun | null;
  totalSeconds: number;
  speakingCount: number;
}

export interface LearningStats {
  answered: number;
  firstCorrect: number;
  accuracy: number;
  hints: number;
  listenCount: number;
  dueWords: number;
  reviewWords: number;
  completedLessons: number;
  stars: number;
  totalSeconds: number;
  speakingCount: number;
  growthStage: 1 | 2 | 3;
  byTopic: { topicId: TopicId; answered: number; accuracy: number; completedLessons: number }[];
}

const emptyQuestion = (): QuestionState => ({ attempts: 0, hintUsed: false, listenCount: 0, firstCorrect: null });
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });

export function dayKey(now: number | Date = Date.now()): string {
  const parts = dayFormatter.formatToParts(now instanceof Date ? now : new Date(now));
  return `${parts.find((part) => part.type === "year")!.value}-${parts.find((part) => part.type === "month")!.value}-${parts.find((part) => part.type === "day")!.value}`;
}

export function nextDayAt(now: number): number {
  const [year, month, day] = dayKey(now).split("-").map(Number);
  return Date.UTC(year, month - 1, day + 1) - 8 * 60 * 60 * 1000;
}

export function createProgress(): Progress {
  return { version: 1, learning: createLearningProgress(), adventure: createAdventureProgress(), playground: createPlaygroundProgress(), shark: createSharkProgress(), completed: {}, attempts: [], review: [], stars: 0, reviewRewardDays: [], settledRuns: [], settings: { music: true, volume: 0.75 }, activeRun: null, totalSeconds: 0, speakingCount: 0 };
}

export function isTopicUnlocked(progress: Progress, topicId: string): boolean {
  const index = topics.findIndex((topic) => topic.id === topicId);
  return index >= 0 && (index === 0 || Boolean(progress.completed[`${topics[index - 1].id}-5`]));
}

export function isLessonUnlocked(progress: Progress, lessonId: string, now = Date.now()): boolean {
  const lesson = getLesson(lessonId);
  if (!isTopicUnlocked(progress, lesson.topicId)) return false;
  if (lesson.isBonus) return Boolean(lesson.prerequisiteLessonId && progress.completed[lesson.prerequisiteLessonId]);
  if (lesson.order === 1) return true;
  const previous = progress.completed[`${lesson.topicId}-${lesson.order - 1}`];
  if (!previous) return false;
  return !lesson.isReview || dayKey(previous.completedAt) < dayKey(now);
}

export function getDueWords(progress: Progress, now = Date.now()): string[] {
  return progress.review.filter((item) => item.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt).map((item) => item.wordId);
}

export function getNextLesson(progress: Progress, now = Date.now()): Lesson | null {
  if (progress.activeRun) return getLesson(progress.activeRun.lessonId);
  const due = getDueWords(progress, now);
  const dueReview = lessons.find((lesson) => lesson.isReview && isLessonUnlocked(progress, lesson.id, now) && due.some((id) => getWord(id).topicId === lesson.topicId));
  if (dueReview) return dueReview;
  const newLesson = lessons.find((lesson) => !lesson.isBonus && !lesson.isReview && !progress.completed[lesson.id] && isLessonUnlocked(progress, lesson.id, now));
  if (newLesson) return newLesson;
  const newReview = lessons.find((lesson) => lesson.isReview && !progress.completed[lesson.id] && isLessonUnlocked(progress, lesson.id, now));
  if (newReview) return newReview;
  if (lessons.some((lesson) => !lesson.isBonus && !progress.completed[lesson.id])) return null;
  return lessons.find((lesson) => lesson.isBonus && !progress.completed[lesson.id] && isLessonUnlocked(progress, lesson.id, now)) ?? null;
}

/** Continue from a celebration without reopening the map or bypassing lesson locks. */
export function getFollowingLesson(progress: Progress, completedLessonId: string, now = Date.now()): Lesson | null {
  if (progress.activeRun) return getLesson(progress.activeRun.lessonId);
  const completed = getLesson(completedLessonId);
  const playable = lessons.filter(lesson => isLessonUnlocked(progress, lesson.id, now));
  const sameGame = completed.isBonus ? playable.filter(lesson => lesson.isBonus && lesson.exercises[0].kind === completed.exercises[0].kind) : [];
  const newGame = sameGame.find(lesson => !progress.completed[lesson.id]);
  if (newGame) return newGame;
  const recommended = getNextLesson(progress, now);
  if (recommended && recommended.id !== completedLessonId) return recommended;
  const unfinished = playable.find(lesson => !progress.completed[lesson.id]);
  if (unfinished) return unfinished;
  // Completed courses still offer a fresh round; rotate rather than repeating the final review.
  const route = sameGame.length > 1 ? sameGame : playable;
  if (!route.length) return null;
  return route[(route.findIndex(lesson => lesson.id === completedLessonId) + 1) % route.length];
}

export function startRun(progress: Progress, lessonId: string, now = Date.now()): Progress {
  if (!isLessonUnlocked(progress, lessonId, now)) throw new Error("这个关卡还没有开放，先完成前面的任务吧。");
  if (progress.activeRun?.lessonId === lessonId) return progress;
  const lesson = getLesson(lessonId);
  const id = `run-${now}-${Math.random().toString(36).slice(2, 10)}`;
  return { ...progress, activeRun: { id, lessonId, topicId: lesson.topicId, startedAt: now, lastActiveAt: now, exercises: createRun(lessonId, getDueWords(progress, now)), index: 0, current: emptyQuestion(), answers: [] } };
}

/** Exclude long idle gaps from displayed learning time. */
function activity(progress: Progress, now: number): Progress {
  if (!progress.activeRun) return progress;
  const seconds = Math.max(0, Math.min(120, Math.floor((now - progress.activeRun.lastActiveAt) / 1000)));
  return { ...progress, totalSeconds: progress.totalSeconds + seconds, activeRun: { ...progress.activeRun, lastActiveAt: now } };
}

export function recordListen(progress: Progress, now = Date.now()): Progress {
  const updated = activity(progress, now);
  const run = updated.activeRun;
  if (!run || run.index >= run.exercises.length) return updated;
  return { ...updated, activeRun: { ...run, current: { ...run.current, listenCount: run.current.listenCount + 1 } } };
}

export function useHint(progress: Progress, now = Date.now()): Progress {
  const updated = activity(progress, now);
  const run = updated.activeRun;
  if (!run || run.index >= run.exercises.length) return updated;
  return { ...updated, activeRun: { ...run, current: { ...run.current, hintUsed: true, firstCorrect: false } } };
}

function scheduleReview(review: ReviewItem[], wordId: string, now: number): ReviewItem[] {
  const existing = review.find((item) => item.wordId === wordId);
  return [...review.filter((item) => item.wordId !== wordId), { wordId, dueAt: nextDayAt(now), mistakes: (existing?.mistakes ?? 0) + 1 }];
}

export function submitAnswer(progress: Progress, selected: string, now = Date.now()): { progress: Progress; correct: boolean } {
  const updated = activity(progress, now);
  const run = updated.activeRun;
  if (!run || run.index >= run.exercises.length) return { progress: updated, correct: false };
  const exercise = run.exercises[run.index];
  if (!exercise.options.includes(selected)) return { progress: updated, correct: false };
  const correct = selected === exercise.answer;
  const firstCorrect = run.current.firstCorrect ?? (correct && !run.current.hintUsed);
  const current = { ...run.current, attempts: run.current.attempts + 1, firstCorrect };
  if (!correct) {
    return { correct, progress: { ...updated, review: scheduleReview(updated.review, exercise.wordId, now), activeRun: { ...run, current } } };
  }
  const record: AnswerRecord = {
    id: `${run.id}:${exercise.id}`, runId: run.id, lessonId: run.lessonId, exerciseId: exercise.id,
    wordId: exercise.wordId, firstCorrect, hintUsed: current.hintUsed, listenCount: current.listenCount,
    attempts: current.attempts, answeredAt: now,
  };
  const review = current.hintUsed ? scheduleReview(updated.review, exercise.wordId, now) : getLesson(run.lessonId).isReview && firstCorrect ? updated.review.filter((item) => item.wordId !== exercise.wordId) : updated.review;
  return { correct, progress: { ...updated, learning: recordRecall(updated.learning, exercise.wordId, firstCorrect && !current.hintUsed, getLesson(run.lessonId).isReview, now), review, attempts: [...updated.attempts, record], activeRun: { ...run, index: run.index + 1, current: emptyQuestion(), answers: [...run.answers, record] } } };
}

/** Repeat calls after settlement are harmless; the completed run ID prevents stale-run rewards. */
export function settleRun(progress: Progress, now = Date.now()): Progress {
  const updated = activity(progress, now);
  const run = updated.activeRun;
  if (!run || run.index < run.exercises.length) return updated;
  if (updated.settledRuns.includes(run.id)) return { ...updated, activeRun: null };
  const previous = updated.completed[run.lessonId];
  const reviewDay = dayKey(now);
  const reviewReward = getLesson(run.lessonId).isReview && !updated.reviewRewardDays.includes(reviewDay);
  return {
    ...updated,
    completed: { ...updated.completed, [run.lessonId]: { completedAt: previous?.completedAt ?? now, lastCompletedAt: now, completions: (previous?.completions ?? 0) + 1 } },
    stars: updated.stars + (previous ? 0 : 1) + (reviewReward ? 1 : 0),
    reviewRewardDays: reviewReward ? [...updated.reviewRewardDays, reviewDay] : updated.reviewRewardDays,
    settledRuns: [...updated.settledRuns, run.id], activeRun: null,
  };
}

export function recordSpeaking(progress: Progress): Progress {
  return { ...progress, speakingCount: progress.speakingCount + 1 };
}

export function updateSettings(progress: Progress, settings: Partial<Progress["settings"]>): Progress {
  return { ...progress, settings: { music: settings.music ?? progress.settings.music, volume: Math.max(0, Math.min(1, settings.volume ?? progress.settings.volume)) } };
}

export function getStats(progress: Progress, now = Date.now()): LearningStats {
  const firstCorrect = progress.attempts.filter((attempt) => attempt.firstCorrect).length;
  return {
    answered: progress.attempts.length, firstCorrect,
    accuracy: progress.attempts.length ? firstCorrect / progress.attempts.length : 0,
    hints: progress.attempts.filter((attempt) => attempt.hintUsed).length,
    listenCount: progress.attempts.reduce((total, attempt) => total + attempt.listenCount, 0),
    dueWords: getDueWords(progress, now).length, reviewWords: progress.review.length,
    completedLessons: Object.keys(progress.completed).length, stars: progress.stars,
    totalSeconds: progress.totalSeconds, speakingCount: progress.speakingCount,
    growthStage: progress.stars >= 12 ? 3 : progress.stars >= 5 ? 2 : 1,
    byTopic: topics.map((topic) => {
      const attempts = progress.attempts.filter((attempt) => getWord(attempt.wordId).topicId === topic.id);
      return { topicId: topic.id, answered: attempts.length, accuracy: attempts.length ? attempts.filter((attempt) => attempt.firstCorrect).length / attempts.length : 0, completedLessons: lessons.filter((lesson) => lesson.topicId === topic.id && progress.completed[lesson.id]).length };
    }),
  };
}

const knownLessonIds = new Set(lessons.map((lesson) => lesson.id));
const knownWordIds = new Set(words.map((word) => word.id));
const maxTimestamp = Date.UTC(2100, 0, 1);

function invalid(): never { throw new Error("备份内容无效或版本不兼容，请选择本网站导出的 JSON 备份。"); }
function object(value: unknown, keys?: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const result = value as Record<string, unknown>;
  if (keys && Object.keys(result).some((key) => !keys.includes(key))) invalid();
  return result;
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) invalid();
  return value;
}
function boolean(value: unknown): boolean { if (typeof value !== "boolean") invalid(); return value; }
function string(value: unknown, max = 200): string { if (typeof value !== "string" || !value.length || value.length > max) invalid(); return value; }
function list(value: unknown, max = 100000): unknown[] { if (!Array.isArray(value) || value.length > max) invalid(); return value; }
function dateKey(value: unknown): string {
  const result = string(value, 10);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(result) || dayKey(Date.parse(`${result}T00:00:00+08:00`)) !== result) invalid();
  return result;
}
function lessonId(value: unknown): string { const result = string(value); if (!knownLessonIds.has(result)) invalid(); return result; }
function wordId(value: unknown): string { const result = string(value); if (!knownWordIds.has(result)) invalid(); return result; }
function unique<T>(values: T[]): T[] { if (new Set(values).size !== values.length) invalid(); return values; }
function parseAnswer(value: unknown): AnswerRecord {
  const answer = object(value, ["id", "runId", "lessonId", "exerciseId", "wordId", "firstCorrect", "hintUsed", "listenCount", "attempts", "answeredAt"]);
  const parsed: AnswerRecord = {
    id: string(answer.id), runId: string(answer.runId), lessonId: lessonId(answer.lessonId),
    exerciseId: string(answer.exerciseId), wordId: wordId(answer.wordId), firstCorrect: boolean(answer.firstCorrect),
    hintUsed: boolean(answer.hintUsed), listenCount: integer(answer.listenCount, 10000),
    attempts: integer(answer.attempts, 10000), answeredAt: integer(answer.answeredAt, maxTimestamp),
  };
  if (!parsed.attempts || !new RegExp(`^${parsed.lessonId}-q[1-6]$`).test(parsed.exerciseId) || parsed.id !== `${parsed.runId}:${parsed.exerciseId}` || getLesson(parsed.lessonId).topicId !== getWord(parsed.wordId).topicId || (parsed.firstCorrect && (parsed.hintUsed || parsed.attempts !== 1))) invalid();
  const lesson = getLesson(parsed.lessonId);
  if (lesson.isBonus && lesson.exercises.find((exercise) => exercise.id === parsed.exerciseId)?.wordId !== parsed.wordId) invalid();
  return parsed;
}
function parseExercise(value: unknown, runLessonId: string): Exercise {
  const data = object(value, ["id", "kind", "wordId", "promptEn", "promptZh", "answer", "options", "scenes", "requiredCount"]);
  const id = string(data.id);
  if (!new RegExp(`^${runLessonId}-q[1-6]$`).test(id)) invalid();
  const kind = string(data.kind);
  if (kind !== "listen" && kind !== "match" && kind !== "place" && kind !== "memory" && kind !== "spell" && kind !== "scene" && kind !== "snake" && kind !== "bubble" && kind !== "serve" && kind !== "connect" && kind !== "catch") invalid();
  const lesson = getLesson(runLessonId);
  const template = lesson.exercises.find((exercise) => exercise.id === id)!;
  if (kind !== template.kind) invalid();
  const parsedWord = getWord(wordId(data.wordId));
  const topic = getTopic(getLesson(runLessonId).topicId);
  if (parsedWord.topicId !== topic.id) invalid();
  if ((lesson.order <= 4 || lesson.isBonus) && parsedWord.id !== template.wordId) invalid();
  const answer = string(data.answer);
  const options = unique(list(data.options, 4).map((option) => string(option)));
  if (!options.includes(answer)) invalid();
  if (data.requiredCount !== template.requiredCount) invalid();
  if (kind === "bubble" || kind === "serve" || kind === "connect" || kind === "catch") {
    if (answer !== template.answer || options.length !== template.options.length || options.some(option => !template.options.includes(option)) || data.promptEn !== template.promptEn || data.promptZh !== template.promptZh || data.scenes !== undefined) invalid();
    return { id, kind, wordId: parsedWord.id, promptEn: template.promptEn, promptZh: template.promptZh, answer, options, ...(template.requiredCount ? { requiredCount: template.requiredCount } : {}) };
  }
  if (kind === "scene") {
    if (answer !== template.answer || data.promptEn !== template.promptEn || data.promptZh !== template.promptZh || options.length !== 3 || options.some((option) => !template.options.includes(option))) invalid();
    const scenes = list(data.scenes, 3).map((value): SceneChoice => {
      const item = object(value, ["id", "wordId", "count", "variant", "position"]);
      const id = string(item.id);
      const expected = template.scenes!.find((scene) => scene.id === id);
      if (!expected || item.wordId !== expected.wordId || item.count !== expected.count || item.variant !== expected.variant || item.position !== expected.position) invalid();
      return { ...expected };
    });
    if (scenes.length !== 3 || new Set(scenes.map((scene) => scene.id)).size !== 3) invalid();
    return { id, kind, wordId: parsedWord.id, promptEn: template.promptEn, promptZh: template.promptZh, answer, options, scenes };
  }
  if (data.scenes !== undefined) invalid();
  if (kind === "place") {
    if (options.length !== 3 || options.some((option) => !["in", "on", "under"].includes(option))) invalid();
  } else if (answer !== parsedWord.id || options.length !== 4 || options.some((option) => !topic.wordIds.includes(option))) invalid();
  const suffix = answer === "in" ? "in the box" : answer === "on" ? "on the table" : "under the table";
  const expectedPrompt = kind === "memory" || kind === "spell" ? parsedWord.en : kind === "listen" || kind === "snake" ? `Listen and find the ${parsedWord.en}.` : kind === "match" ? `Find the ${parsedWord.en}.` : `Put the ${parsedWord.en} ${suffix}.`;
  const expectedZh = kind === "memory" || kind === "spell" || kind === "snake" ? bonusInstructions[kind] : kind === "listen" ? "听一听，找到图片，点一下。" : kind === "match" ? "看单词，找到对应的图片。" : answer === "in" ? "把物品放到盒子里面。" : answer === "on" ? "把物品放到桌子上面。" : "把物品放到桌子下面。";
  if (data.promptEn !== expectedPrompt || data.promptZh !== expectedZh) invalid();
  return { id, kind, wordId: parsedWord.id, promptEn: expectedPrompt, promptZh: expectedZh, answer, options };
}

/** Validate and reconstruct every field rather than trusting imported object properties. */
export function validateProgress(value: unknown): Progress {
  const data = object(value, ["version", "learning", "adventure", "playground", "shark", "completed", "attempts", "review", "stars", "reviewRewardDays", "settledRuns", "settings", "activeRun", "totalSeconds", "speakingCount"]);
  if (data.version !== 1) invalid();
  const completedData = object(data.completed);
  const completed: Record<string, Completion> = {};
  for (const [id, value] of Object.entries(completedData)) {
    lessonId(id);
    const item = object(value, ["completedAt", "lastCompletedAt", "completions"]);
    const parsed = { completedAt: integer(item.completedAt, maxTimestamp), lastCompletedAt: integer(item.lastCompletedAt, maxTimestamp), completions: integer(item.completions, 100000) };
    if (!parsed.completions || parsed.lastCompletedAt < parsed.completedAt) invalid();
    completed[id] = parsed;
  }
  const attempts = list(data.attempts).map(parseAnswer);
  unique(attempts.map((answer) => answer.id));
  const review = list(data.review, 24).map((value) => {
    const item = object(value, ["wordId", "dueAt", "mistakes"]);
    const result = { wordId: wordId(item.wordId), dueAt: integer(item.dueAt, maxTimestamp), mistakes: integer(item.mistakes, 100000) };
    if (!result.mistakes) invalid();
    return result;
  });
  unique(review.map((item) => item.wordId));
  const settings = object(data.settings, ["music", "volume"]);
  if (typeof settings.volume !== "number" || !Number.isFinite(settings.volume) || settings.volume < 0 || settings.volume > 1) invalid();
  const progress: Progress = {
    adventure: validateAdventureProgress(data.adventure),
    playground: validatePlaygroundProgress(data.playground),
    shark: validateSharkProgress(data.shark),
    version: 1, learning: data.learning === undefined ? migrateLearning(attempts, review) : validateLearningProgress(data.learning, new Set(allLearningWords.map(word=>word.id)), new Set(learningTasks.keys()), new Set(learningActivities.map(activity=>activity.id))), completed, attempts, review, stars: integer(data.stars, 100000),
    reviewRewardDays: unique(list(data.reviewRewardDays, 40000).map(dateKey)),
    settledRuns: unique(list(data.settledRuns).map((value) => string(value))),
    settings: { music: boolean(settings.music), volume: settings.volume }, activeRun: null,
    totalSeconds: integer(data.totalSeconds, 1000000000), speakingCount: integer(data.speakingCount, 1000000),
  };
  // Sequential completion and reward totals must be possible within this course.
  for (const id of Object.keys(completed)) {
    const lesson = getLesson(id);
    if (!isTopicUnlocked(progress, lesson.topicId)) invalid();
    if (lesson.isBonus) {
      if (!lesson.prerequisiteLessonId || !completed[lesson.prerequisiteLessonId]) invalid();
    } else if (lesson.order > 1 && !completed[`${lesson.topicId}-${lesson.order - 1}`]) invalid();
    if (lesson.isReview && dayKey(completed[id].completedAt) <= dayKey(completed[`${lesson.topicId}-5`].completedAt)) invalid();
  }
  if (progress.stars !== Object.keys(completed).length + progress.reviewRewardDays.length) invalid();
  const recordsByRun = new Map<string, AnswerRecord[]>();
  for (const answer of attempts) {
    const group = recordsByRun.get(answer.runId) ?? [];
    group.push(answer);
    recordsByRun.set(answer.runId, group);
    if (group.length > 6 || group.some((record) => record.lessonId !== answer.lessonId)) invalid();
  }
  const completionsByLesson = new Map<string, number>();
  for (const runId of progress.settledRuns) {
    const group = recordsByRun.get(runId);
    if (!group || group.length !== 6) invalid();
    const id = group[0].lessonId;
    if (!completed[id] || group.some((answer) => answer.answeredAt > completed[id].lastCompletedAt)) invalid();
    completionsByLesson.set(id, (completionsByLesson.get(id) ?? 0) + 1);
  }
  for (const [id, completion] of Object.entries(completed)) {
    if (completionsByLesson.get(id) !== completion.completions) invalid();
  }
  if (data.activeRun !== null) {
    const raw = object(data.activeRun, ["id", "lessonId", "topicId", "startedAt", "lastActiveAt", "exercises", "index", "current", "answers"]);
    const id = string(raw.id);
    const runLessonId = lessonId(raw.lessonId);
    const runLesson = getLesson(runLessonId);
    if (raw.topicId !== runLesson.topicId || progress.settledRuns.includes(id)) invalid();
    const exercises = list(raw.exercises, 6).map((exercise) => parseExercise(exercise, runLessonId));
    if (exercises.length !== 6) invalid();
    unique(exercises.map((exercise) => exercise.id));
    if (runLesson.exercises[0].kind === "connect") {
      for (const offset of [0, 3]) {
        const group = exercises.slice(offset, offset + 3);
        const ids = [...group[0].options].sort().join(":");
        if (group.some(exercise => [...exercise.options].sort().join(":") !== ids) || new Set(group.map(exercise => exercise.wordId)).size !== 3) invalid();
      }
    }
    const currentData = object(raw.current, ["attempts", "hintUsed", "listenCount", "firstCorrect"]);
    const current: QuestionState = { attempts: integer(currentData.attempts, 10000), hintUsed: boolean(currentData.hintUsed), listenCount: integer(currentData.listenCount, 10000), firstCorrect: currentData.firstCorrect === null ? null : boolean(currentData.firstCorrect) };
    if (current.firstCorrect === true || (current.attempts > 0 && current.firstCorrect !== false) || (current.hintUsed && current.firstCorrect !== false) || (!current.attempts && !current.hintUsed && current.firstCorrect !== null)) invalid();
    const answers = list(raw.answers, 6).map(parseAnswer);
    const index = integer(raw.index, 6);
    const startedAt = integer(raw.startedAt, maxTimestamp);
    const lastActiveAt = integer(raw.lastActiveAt, maxTimestamp);
    if (answers.length !== index || lastActiveAt < startedAt || !isLessonUnlocked(progress, runLessonId, startedAt)) invalid();
    if ((recordsByRun.get(id)?.length ?? 0) !== index || (index === 6 && (current.attempts || current.hintUsed || current.listenCount || current.firstCorrect !== null))) invalid();
    for (let offset = 0; offset < answers.length; offset++) {
      const answer = answers[offset];
      if (answer.runId !== id || answer.lessonId !== runLessonId || answer.exerciseId !== exercises[offset].id || answer.wordId !== exercises[offset].wordId || !attempts.some((saved) => JSON.stringify(saved) === JSON.stringify(answer))) invalid();
    }
    progress.activeRun = { id, lessonId: runLessonId, topicId: runLesson.topicId, startedAt, lastActiveAt, exercises, index, current, answers };
  }
  validateLearningContent(progress.learning);
  return progress;
}

function migrateLearning(attempts: AnswerRecord[], review: ReviewItem[]): LearningProgress {
  let p = createLearningProgress();
  for (const answer of attempts) p = recordRecall(p, answer.wordId, answer.firstCorrect && !answer.hintUsed, false, answer.answeredAt);
  for (const item of review) p.cards[item.wordId] = { ...(p.cards[item.wordId] ?? { stage: 0, lastAt: Math.max(0,item.dueAt-86400000), independent: 0, helped: item.mistakes }), stage: 0, dueAt: item.dueAt };
  return p;
}
function validateLearningContent(p: LearningProgress) {
  const records = [...p.records, ...p.reports.flatMap(report=>report.answers), ...(p.active?.answers ?? [])];
  for (const answer of records) {
    const task = learningTasks.get(answer.taskId)!;
    if (answer.skill !== task.skill || ((task.kind === "speak" || task.adultReviewRecommended) ? answer.rating === undefined || answer.correct !== (answer.rating === 2) : answer.rating !== undefined)) invalid();
    if (answer.rating === 1 && !answer.hintUsed) invalid();
    if (answer.rating === undefined) {
      const accepted = [task.answer, ...(task.acceptedAnswers ?? [])].filter((value):value is string=>Boolean(value));
      if (answer.correct !== accepted.some(value=>normalizeLearningAnswer(value)===normalizeLearningAnswer(answer.answer)) || (task.kind === "choose" && !task.options?.some(option=>option.id===answer.answer))) invalid();
    }
  }
  for (const report of p.reports) if (report.answers.length !== diagnosticActivity.tasks.length || report.answers.some((answer,index)=>answer.taskId !== diagnosticActivity.tasks[index].id)) invalid();
  for (const [id,item] of Object.entries(p.completed)) { const activity=getLearningActivity(id)!;if(!activity.review && id!=="daily-speaking" && item.total!==activity.tasks.length)invalid(); }
  if (p.active) {
    const activity = getLearningActivity(p.active.activityId)!;
    const ids = new Set(activity.tasks.map(task=>task.id));
    if (p.active.taskIds.some(id=>!ids.has(id)) || (!activity.review && activity.id !== "daily-speaking" && p.active.taskIds.length !== activity.tasks.length) || (activity.diagnostic && p.active.taskIds.some((id,index)=>id!==activity.tasks[index].id))) invalid();
    if (p.active.answers.some(answer=>!p.records.some(record=>JSON.stringify(record)===JSON.stringify(answer)))) invalid();
  }
}

export function serializeBackup(progress: Progress, now = Date.now()): string {
  return JSON.stringify({ format: "english-island", version: 3, exportedAt: new Date(now).toISOString(), progress }, null, 2);
}

export function parseBackup(text: string): Progress {
  if (text.length > 8 * 1024 * 1024) throw new Error("备份文件太大，请选择 8 MB 以内的备份。");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { invalid(); }
  const envelope = object(parsed, ["format", "version", "exportedAt", "progress"]);
  if (envelope.format !== "english-island" || ![1,2,3].includes(envelope.version as number) || typeof envelope.exportedAt !== "string" || !Number.isFinite(Date.parse(envelope.exportedAt))) invalid();
  if (envelope.version !== 1 && object(envelope.progress).learning === undefined) invalid();
  if (envelope.version === 3) {
    const adventure = object(object(envelope.progress).adventure);
    const modes = object(adventure.modes);
    if (object(modes.fish).bodyWords === undefined || object(modes.snake).bodyWords === undefined) invalid();
  }
  return validateProgress(envelope.progress);
}
