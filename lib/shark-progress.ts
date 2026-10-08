import { z } from "zod";
import { getSharkToken, sharkLetters, sharkSentences, sharkTierForToken, sharkTierForTotal, sharkWords } from "./shark-content";

export interface SharkProgress {
  version: 1;
  /** Physical collection counts; these are not scores for correct answers. */
  letters: number;
  words: number;
  sentences: number;
  /** Completed English token playbacks, including intentional replays. */
  listenCount: number;
  totalSeconds: number;
  lastAt: number;
  learned: string[];
  recentPickups: string[];
}
export interface SharkPickupEvent { pickupId: string; tokenId: string }
export const MAX_SHARK_PICKUPS = 256;
export const MAX_SHARK_TOTAL = 1_000_000_000;
const maxTimestamp = Date.UTC(2100, 0, 1);
const allTokens = [...sharkLetters, ...sharkWords, ...sharkSentences];
export function createSharkProgress(): SharkProgress {
  return { version: 1, letters: 0, words: 0, sentences: 0, listenCount: 0, totalSeconds: 0, lastAt: 0, learned: [], recentPickups: [] };
}
export function sharkTotal(progress: SharkProgress): number { return progress.letters + progress.words + progress.sentences; }
const integer = z.number().int().nonnegative().max(MAX_SHARK_TOTAL);
const nativePickupPattern = /^shark:\d+:\d+:\d+:(\d+)$/;
const pickupIdSchema = z.string().min(1).max(160).refine(value => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value) &&
  (!value.startsWith("shark:") || nativePickupPattern.test(value)));
export const sharkProgressSchema = z.object({
  version: z.literal(1), letters: integer.max(26), words: integer.max(20), sentences: integer.max(MAX_SHARK_TOTAL - 46),
  listenCount: integer, totalSeconds: integer, lastAt: z.number().int().nonnegative().max(maxTimestamp),
  learned: z.array(z.string().min(1).max(100)).max(allTokens.length),
  recentPickups: z.array(pickupIdSchema).max(MAX_SHARK_PICKUPS),
}).strict().superRefine((progress, context) => {
  const total = sharkTotal(progress);
  const learnedCounts = { letters: 0, words: 0, sentences: 0 };
  for (const id of progress.learned) {
    const tier = sharkTierForToken(id);
    if (tier) learnedCounts[tier]++;
    else context.addIssue({ code: z.ZodIssueCode.custom, path: ["learned"], message: "鲨鱼英语内容无效。" });
  }
  if ((progress.letters < 26 && progress.words !== 0) || ((progress.letters < 26 || progress.words < 20) && progress.sentences !== 0) ||
    total > MAX_SHARK_TOTAL || new Set(progress.learned).size !== progress.learned.length ||
    new Set(progress.recentPickups).size !== progress.recentPickups.length || progress.recentPickups.length !== Math.min(total, MAX_SHARK_PICKUPS) ||
    progress.recentPickups.some(id => {
      const match = nativePickupPattern.exec(id);
      return match !== null && (Number(match[1]) < Math.max(0, total - MAX_SHARK_PICKUPS) || Number(match[1]) >= total);
    }) ||
    (["letters", "words", "sentences"] as const).some(tier => learnedCounts[tier] > progress[tier] || (progress[tier] > 0 && learnedCounts[tier] === 0))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "鲨鱼成长和收集记录不一致。" });
  }
});
/** Old backups without a shark field migrate. Present, damaged data is rejected. */
export function validateSharkProgress(value: unknown): SharkProgress {
  return value === undefined ? createSharkProgress() : sharkProgressSchema.parse(value);
}
function safeNow(now: number, previous: number): number {
  return Math.max(previous, Math.min(maxTimestamp, Math.max(0, Math.floor(Number.isFinite(now) ? now : previous))));
}
/** Any edible token in the current tier is an encounter; no quiz or correctness gate. */
export function recordSharkPickup(progress: SharkProgress, event: SharkPickupEvent, now = Date.now()): SharkProgress {
  const total = sharkTotal(progress), tier = sharkTierForTotal(total);
  const nativePickup = nativePickupPattern.exec(event.pickupId);
  if (total >= MAX_SHARK_TOTAL || !pickupIdSchema.safeParse(event.pickupId).success || progress.recentPickups.includes(event.pickupId) ||
    (nativePickup !== null && Number(nativePickup[1]) !== total) ||
    !getSharkToken(event.tokenId) || sharkTierForToken(event.tokenId) !== tier) return progress;
  return { ...progress, [tier]: progress[tier] + 1, lastAt: safeNow(now, progress.lastAt),
    learned: progress.learned.includes(event.tokenId) ? progress.learned : [...progress.learned, event.tokenId],
    recentPickups: [...progress.recentPickups, event.pickupId].slice(-MAX_SHARK_PICKUPS) };
}
/** Call only after English token playback completes, never when it is queued. */
export function recordSharkListen(progress: SharkProgress, tokenId: string, now = Date.now()): SharkProgress {
  if (!getSharkToken(tokenId) || (sharkTierForToken(tokenId) !== sharkTierForTotal(sharkTotal(progress)) && !progress.learned.includes(tokenId)) ||
    progress.listenCount >= MAX_SHARK_TOTAL) return progress;
  return { ...progress, listenCount: progress.listenCount + 1, lastAt: safeNow(now, progress.lastAt) };
}
export function recordSharkTime(progress: SharkProgress, seconds: number, now = Date.now()): SharkProgress {
  const increment = Math.min(15, Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)));
  return !increment ? progress : { ...progress, totalSeconds: Math.min(MAX_SHARK_TOTAL, progress.totalSeconds + increment), lastAt: safeNow(now, progress.lastAt) };
}
