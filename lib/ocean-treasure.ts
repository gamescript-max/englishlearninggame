import { z } from "zod";
import { adventureVocabulary } from "./adventure-catalog";

export const TREASURE_CARD_TARGET = 5;
export const oceanStickerIds = ["goldfish", "guppy", "betta", "zebrafish", "neon-tetra", "small-seahorse", "turtle", "dolphin"] as const;
export interface OceanTreasure {
  roundCards: string[];
  creditedCards: number;
  earned: number;
  opened: number;
  prizes: Record<string, number>;
  lastPrize: string | null;
  recentPickups: string[];
}
const wordIds = new Set(adventureVocabulary.map(word => word.id));
const MAX_PICKUPS = 128;
export function createOceanTreasure(): OceanTreasure {
  return { roundCards: [], creditedCards: 0, earned: 0, opened: 0, prizes: {}, lastPrize: null, recentPickups: [] };
}
/** A saved shuffle bag awards all eight stickers before it repeats. No money or rarity tiers. */
function stickerBag(seed: number): string[] {
  let rng = (seed ^ 0x51a7c3d9) >>> 0;
  const bag: string[] = [...oceanStickerIds];
  for (let i = bag.length - 1; i > 0; i--) {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    const j = Math.floor(rng / 4294967296 * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}
/** Duplicate words in one five-card set and repeated pickup receipts do not earn credit. */
export function collectOceanCard(state: OceanTreasure, wordId: string, pickup: string): OceanTreasure {
  if (!wordIds.has(wordId) || !pickup || pickup.length > 128 || state.recentPickups.includes(pickup)) return state;
  const next = { ...state, recentPickups: [...state.recentPickups, pickup].slice(-MAX_PICKUPS) };
  if (state.roundCards.includes(wordId) || state.creditedCards >= 1_000_000_000) return next;
  const cards = [...state.roundCards, wordId], complete = cards.length === TREASURE_CARD_TARGET;
  return { ...next, creditedCards: state.creditedCards + 1, roundCards: complete ? [] : cards, earned: state.earned + Number(complete) };
}
/** The displayed ticket index is a receipt: a double tap or stale callback cannot charge twice. */
export function openOceanTreasure(state: OceanTreasure, seed: number, expectedOpened: number): OceanTreasure {
  if (state.opened !== expectedOpened || state.opened >= state.earned) return state;
  const prize = stickerBag(seed)[state.opened % oceanStickerIds.length];
  return { ...state, opened: state.opened + 1, prizes: { ...state.prizes, [prize]: (state.prizes[prize] ?? 0) + 1 }, lastPrize: prize };
}
const integer = z.number().int().min(0).max(1_000_000_000);
export const oceanTreasureSchema = z.object({
  roundCards: z.array(z.string().max(100)).max(TREASURE_CARD_TARGET - 1), creditedCards: integer, earned: integer, opened: integer,
  prizes: z.record(z.string(), z.number().int().min(1).max(1_000_000_000)), lastPrize: z.string().max(100).nullable(),
  recentPickups: z.array(z.string().min(1).max(128)).max(MAX_PICKUPS),
}).strict();
export function validateOceanTreasure(value: unknown, seed: number): OceanTreasure {
  if (value === undefined) return createOceanTreasure();
  const data = oceanTreasureSchema.parse(value);
  if (new Set(data.roundCards).size !== data.roundCards.length || data.roundCards.some(id => !wordIds.has(id)) ||
      new Set(data.recentPickups).size !== data.recentPickups.length || data.opened > data.earned ||
      data.creditedCards !== data.earned * TREASURE_CARD_TARGET + data.roundCards.length) throw new Error("海洋宝箱记录无效。");
  const bag = stickerBag(seed), cycles = Math.floor(data.opened / bag.length), remainder = data.opened % bag.length;
  const expected: Record<string,number> = {};
  for (let i = 0; i < bag.length; i++) { const count = cycles + Number(i < remainder); if (count) expected[bag[i]] = count; }
  if (Object.keys(data.prizes).length !== Object.keys(expected).length || Object.entries(data.prizes).some(([id,count]) => expected[id] !== count) ||
      data.lastPrize !== (data.opened ? bag[(data.opened - 1) % bag.length] : null)) throw new Error("海洋贴纸记录无效。");
  return data;
}
