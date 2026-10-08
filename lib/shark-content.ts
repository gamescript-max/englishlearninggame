export type SharkTier = "letters" | "words" | "sentences";
export type SharkFoodKind = "fish" | "boat" | "ship" | "island" | "earth" | "planet" | "star" | "galaxy" | "universe";
export interface SharkToken { id: string; en: string; zh: string; speech: string }
export interface SharkStage { id: string; title: string; en: string; at: number; tier: SharkTier; kind: SharkFoodKind; color: string }

/** Each letter is an exact, standalone speech key, never a word spelling prompt. */
export const sharkLetters: SharkToken[] = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", letter => ({ id: letter, en: letter, zh: `字母 ${letter}`, speech: letter }));
const wordRows = [
  ["cat", "猫"], ["dog", "狗"], ["bird", "鸟"], ["fish", "鱼"], ["rabbit", "兔子"], ["duck", "鸭子"],
  ["apple", "苹果"], ["banana", "香蕉"], ["orange", "橙子"], ["bread", "面包"], ["milk", "牛奶"], ["water", "水"],
  ["ball", "球"], ["book", "书"], ["bag", "书包"], ["pencil", "铅笔"], ["kite", "风筝"], ["robot", "机器人"],
  ["tree", "树"], ["flower", "花"], ["sun", "太阳"], ["cloud", "云"], ["boat", "小船"], ["car", "汽车"],
] as const;
export const sharkWords: SharkToken[] = wordRows.map(([en, zh]) => ({ id: en, en, zh, speech: en }));
const sentenceRows = [
  ["can-run", "I can run.", "我会跑。"],
  ["this-cat", "This is a cat.", "这是一只猫。"],
  ["like-apples", "I like apples.", "我喜欢苹果。"],
  ["can-read", "I can read.", "我会读书。"],
  ["drink-water", "I drink water.", "我喝水。"],
  ["my-ball", "This is my ball.", "这是我的球。"],
  ["my-book", "This is my book.", "这是我的书。"],
  ["my-mother", "This is my mother.", "这是我的妈妈。"],
  ["my-teacher", "This is my teacher.", "这是我的老师。"],
  ["two-hands", "I have two hands.", "我有两只手。"],
  ["two-eyes", "I have two eyes.", "我有两只眼睛。"],
  ["have-sister", "I have a sister.", "我有一个姐姐或妹妹。"],
  ["like-bananas", "I like bananas.", "我喜欢香蕉。"],
  ["like-play", "I like to play.", "我喜欢玩。"],
  ["like-read", "I like to read.", "我喜欢读书。"],
  ["see-sun", "I can see the sun.", "我能看见太阳。"],
  ["see-cloud", "I can see a cloud.", "我能看见一朵云。"],
  ["see-rainbow", "I can see a rainbow.", "我能看见彩虹。"],
  ["cat-happy", "The cat is happy.", "小猫很开心。"],
  ["bird-blue", "The bird is blue.", "小鸟是蓝色的。"],
  ["hot-today", "It is hot today.", "今天很热。"],
  ["cold-today", "It is cold today.", "今天很冷。"],
  ["book-bag", "My book is in my bag.", "我的书在书包里。"],
  ["play-friend", "I play with my friend.", "我和朋友一起玩。"],
] as const;
export const sharkSentences: SharkToken[] = sentenceRows.map(([id, en, zh]) => ({ id: `sentence-${id}`, en, zh, speech: en }));

export const sharkStages: SharkStage[] = [
  { id: "baby-shark", title: "小鲨鱼出发", en: "Baby shark", at: 0, tier: "letters", kind: "fish", color: "#27bfcf" },
  { id: "bigger-fish", title: "大鱼也能吃", en: "Bigger fish", at: 12, tier: "letters", kind: "fish", color: "#299ad3" },
  { id: "small-boats", title: "小船上的单词", en: "Small boats", at: 26, tier: "words", kind: "boat", color: "#329eb0" },
  { id: "large-fish", title: "大鱼上的句子", en: "Large fish", at: 46, tier: "sentences", kind: "fish", color: "#3985bf" },
  { id: "big-ships", title: "大船也能吃", en: "Big ships", at: 56, tier: "sentences", kind: "ship", color: "#5a82c8" },
  { id: "islands", title: "海岛大餐", en: "Islands", at: 72, tier: "sentences", kind: "island", color: "#52aa92" },
  { id: "earth", title: "地球大餐", en: "Earth", at: 96, tier: "sentences", kind: "earth", color: "#389cda" },
  { id: "planets", title: "行星大餐", en: "Planets", at: 124, tier: "sentences", kind: "planet", color: "#a47edf" },
  { id: "sun", title: "太阳大餐", en: "The sun", at: 158, tier: "sentences", kind: "star", color: "#f5ba45" },
  { id: "galaxies", title: "银河大餐", en: "Galaxies", at: 198, tier: "sentences", kind: "galaxy", color: "#b789e2" },
  { id: "universe", title: "宇宙大餐", en: "The universe", at: 244, tier: "sentences", kind: "universe", color: "#d298ed" },
];
export const SHARK_COSMIC_CYCLE = 56;
export interface SharkStageState extends SharkStage { stageIndex: number; currentAt: number; nextAt: number; cycle: number }
/** Growth celebrates collecting and listening; it does not assess English ability. */
export function stageForShark(total: number): SharkStageState {
  const count = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  let stageIndex = 0;
  for (let index = 1; index < sharkStages.length; index++) if (count >= sharkStages[index].at) stageIndex = index;
  const stage = sharkStages[stageIndex];
  const cycle = stageIndex === sharkStages.length - 1 ? Math.floor((count - stage.at) / SHARK_COSMIC_CYCLE) : 0;
  return { ...stage, stageIndex, cycle, currentAt: stage.at + cycle * SHARK_COSMIC_CYCLE,
    nextAt: sharkStages[stageIndex + 1]?.at ?? stage.at + (cycle + 1) * SHARK_COSMIC_CYCLE };
}
export function sharkTierForTotal(total: number): SharkTier { return stageForShark(total).tier; }
export function sharkContentForTier(tier: SharkTier): SharkToken[] { return tier === "letters" ? sharkLetters : tier === "words" ? sharkWords : sharkSentences; }
const tokens = new Map([...sharkLetters, ...sharkWords, ...sharkSentences].map(token => [token.id, token]));
export function getSharkToken(id: string): SharkToken | undefined { return tokens.get(id); }
export function sharkTierForToken(id: string): SharkTier | undefined {
  if (sharkLetters.some(token => token.id === id)) return "letters";
  if (sharkWords.some(token => token.id === id)) return "words";
  if (sharkSentences.some(token => token.id === id)) return "sentences";
  return undefined;
}
export const sharkGuides = {
  welcome: "小鲨鱼出发啦！吃小鱼，听英语，一起长大吧！",
  controls: "拖动手指，或用方向键，带小鲨鱼自由游。吃比你小的，听一听，跟着读。",
  letters: "先吃带字母的小鱼。听一听，跟着读一个字母。",
  words: "小鲨鱼长大啦！吃小船和大鱼，听一听英语单词。",
  sentences: "现在来听短句子吧。吃到大鱼或大船，跟着读一句英语。",
  larger: "这个还太大，轻轻碰一下没关系。先吃比你小的吧。",
  cosmic: "宇宙还有好多好吃的！继续游，继续听英语吧。",
  rest: "玩了一会儿，可以停下来休息眼睛，再回来继续游。",
} as const;
export const sharkWelcomeGuide = sharkGuides.welcome;
/** Exact keys used by offline audio generation and missing-speech checks. */
export const sharkSpeech = {
  en: [...new Set([...tokens.values()].map(token => token.speech).concat(sharkStages.map(stage => stage.en)))],
  zh: [...new Set(Object.values(sharkGuides))],
};
