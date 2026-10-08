import { words } from "./course";
import { adventureVocabulary } from "./adventure-catalog";

export type AdventureMode = "fish" | "snake";
export type AdventureColor = "red" | "blue" | "yellow" | "green";
export interface MissionOption { id: string; color?: AdventureColor; wordId?: string; size?: "small" | "big" }
export interface MissionSpec { id: string; options: MissionOption[]; answer: string; requiredCount: number }
export interface AdventureTask extends MissionSpec {
  promptEn: string;
  promptZh: string;
  skill: "color" | "count" | "size" | "word";
  wordId?: string;
  /** Runtime target identity; the stable curriculum ID remains id. */
  instanceKey?: string;
}

export const ADVENTURE_ROUND_LENGTH = 12;
export const adventureGuidance = {
  fish: "拖动手指，小鱼就会跟着你游。吃普通小鱼慢慢长大，听英语找到带贝壳标记的任务鱼。",
  snake: "拖动手指，带着小蛇去冒险。听英语吃到正确的图卡，图片会留在蛇的身体上。比你小的电脑蛇也能吃哦。",
  hint: "再听一遍，乐乐来帮你找。带亮光的就是这次的英语目标。",
  retry: "再找找看，你可以重听英语。乐乐会陪你一起找到目标。",
  round: "真棒！这一轮完成啦，下一轮英语冒险马上开始。你也可以休息一下。",
} as const;

const colors: AdventureColor[] = ["red", "blue", "yellow", "green"];
const colorNames = { red: "红色", blue: "蓝色", yellow: "黄色", green: "绿色" };
const countNames = ["", "one", "two", "three"];
const countChinese = ["", "一", "两", "三"];
const colorOptions: MissionOption[] = colors.map(color => ({ id: color, color }));

const fishColors: AdventureTask[] = colors.map(color => ({
  id: `fish-color-${color}`, skill: "color", options: colorOptions,
  answer: color, requiredCount: 1,
  promptEn: `Find the ${color} fish.`, promptZh: `找到${colorNames[color]}的任务鱼。`,
}));
const fishCounts: AdventureTask[] = colors.flatMap(color => [1, 2, 3].map(count => ({
  id: `fish-count-${count}-${color}`, skill: "count" as const, options: colorOptions,
  answer: color, requiredCount: count,
  promptEn: `Find ${countNames[count]} ${color} fish.`, promptZh: `找到${countChinese[count]}条${colorNames[color]}的任务鱼。`,
})));
const fishSizes: AdventureTask[] = (["small", "big"] as const).map(size => ({
  id: `fish-size-${size}`, skill: "size", options: [{ id: "small", size: "small" }, { id: "big", size: "big" }],
  answer: size, requiredCount: 1,
  promptEn: `Find the ${size} fish.`, promptZh: `找到${size === "small" ? "较小" : "较大"}的任务鱼。`,
}));
const snakeTasks: AdventureTask[] = adventureVocabulary.map((word, index) => ({
  id: `snake-word-${word.id}`, skill: "word", wordId: word.id,
  // The original 24 options and meanings are preserved for existing saved rounds.
  options: [word, ...(index < words.length
    ? [words[(index + 7) % words.length], words[(index + 13) % words.length]]
    : [adventureVocabulary[(index + 11) % adventureVocabulary.length], adventureVocabulary[(index + 29) % adventureVocabulary.length]])]
    .map(value => ({ id: value.id, wordId: value.id })),
  answer: word.id, requiredCount: 1,
  promptEn: word.category === "actions" || word.en === "hot" || word.en === "cold"
    ? `Find the picture for ${word.en}.` : `Listen and find the ${word.en}.`,
  promptZh: `听英语，找到${word.zh}图卡。`,
}));

/** Fixed, authored teaching content. Growing a game character is never a CEFR achievement. */
export const adventureTasks: AdventureTask[] = [...fishColors, ...fishCounts, ...fishSizes, ...snakeTasks];
const byId = new Map(adventureTasks.map(task => [task.id, task]));
export function getAdventureTaskById(id: string): AdventureTask {
  const task = byId.get(id);
  if (!task) throw new Error("这次冒险的英语目标还没有准备好。");
  return { ...task, options: task.options.map(option => ({ ...option })) };
}
export function adventureTaskMode(taskId: string): AdventureMode | undefined {
  return byId.has(taskId) ? taskId.startsWith("fish-") ? "fish" : "snake" : undefined;
}

function shuffle<T>(items: T[], seed: number): T[] {
  const shuffled = [...items];
  let state = (Math.trunc(seed) >>> 0) || 0x7f4a7c15;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  for (let index = shuffled.length - 1; index > 0; index--) {
    const next = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[next]] = [shuffled[next], shuffled[index]];
  }
  return shuffled;
}

const firstFishRound = [
  "fish-color-blue", "fish-color-red", "fish-color-yellow", "fish-color-green",
  "fish-count-1-blue", "fish-count-2-yellow", "fish-count-3-red",
  "fish-size-small", "fish-size-big", "fish-count-2-green", "fish-count-3-blue", "fish-count-1-yellow",
];

/** Each round has 12 targets. Later rounds include up to four recent practice targets. */
export function getAdventureRound(mode: AdventureMode, round: number, seed: number, reviewIds: string[] = []): string[] {
  if (mode === "fish" && round === 0) return [...firstFishRound];
  const pool = adventureTasks.filter(task => adventureTaskMode(task.id) === mode).map(task => task.id);
  const review = [...new Set(reviewIds.map(id => byId.has(id) ? id : `snake-word-${id}`))]
    .filter(id => adventureTaskMode(id) === mode).slice(-4);
  // Preserve the first two authored core-word rounds; subsequent rounds mix every category.
  const mixed = mode === "snake" && round < 2 && !review.length
    ? [...pool.slice((round % 2) * 12, 24), ...pool.slice(0, (round % 2) * 12)]
    : shuffle(pool.filter(id => !review.includes(id)), (seed + (round + 1) * 104729) >>> 0);
  return [...review, ...mixed.filter(id => !review.includes(id))].slice(0, ADVENTURE_ROUND_LENGTH);
}

export function getAdventureTask(mode: AdventureMode, index: number, round: number, seed: number, reviewIds: string[] = []): AdventureTask {
  const ids = getAdventureRound(mode, Math.max(0, Math.trunc(round)), seed, reviewIds);
  const task = getAdventureTaskById(ids[((Math.trunc(index) % ids.length) + ids.length) % ids.length]);
  // Option order changes on replay; every item still retains its authored meaning.
  task.options = shuffle(task.options, (seed + round * 8191 + index * 127) >>> 0);
  task.instanceKey = `${mode}/${round}/${index}/${seed}`;
  return task;
}
