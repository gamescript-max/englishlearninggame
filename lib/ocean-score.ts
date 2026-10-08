import { z } from "zod";
import { adventureVocabulary } from "./adventure-catalog";

export interface OceanScore { cardCount: number; taskBaseline: number; recentPickups: string[] }
export const oceanScoreSchema = z.object({ cardCount: z.number().int().min(0).max(1_000_000_000), taskBaseline: z.number().int().min(0).max(1_000_000_000), recentPickups: z.array(z.string().min(1).max(128)).max(128) }).strict();
const words = new Set(adventureVocabulary.map(word => word.id));
export function createOceanScore(taskBaseline = 0): OceanScore { return { cardCount: 0, taskBaseline, recentPickups: [] }; }
export function oceanPoints(score: OceanScore, completedTasks: number): number { return score.cardCount * 5 + Math.max(0, completedTasks - score.taskBaseline) * 10; }
/** Different cards of the same word earn points; replaying a recent entity does not. */
export function collectOceanPoints(score: OceanScore, word: string, pickup: string): OceanScore {
  if (!words.has(word) || !pickup || pickup.length > 128 || score.recentPickups.includes(pickup) || score.cardCount >= 1_000_000_000) return score;
  return { ...score, cardCount: score.cardCount + 1, recentPickups: [...score.recentPickups, pickup].slice(-128) };
}
export function validateOceanScore(value: unknown, completedTasks: number): OceanScore {
  if (value === undefined) return createOceanScore(completedTasks);
  const score = oceanScoreSchema.parse(value);
  if (score.taskBaseline > completedTasks || new Set(score.recentPickups).size !== score.recentPickups.length || score.recentPickups.length > score.cardCount) throw new Error("海洋积分记录无效。");
  return score;
}
