/** Deterministic, continuous worlds. Teaching targets never share food scoring. */
import { adventureCardWordIds, oceanEvolution, oceanSpecies, oceanSizeLevel, snakeBreeds } from "./adventure-catalog";

export type AdventureMode = "fish" | "snake";
export interface Vec { x: number; y: number }
export type AdventureColor = "red" | "blue" | "yellow" | "green";
export interface MissionSpec {
  id: string;
  options: { id: string; color?: AdventureColor; wordId?: string; size?: "small" | "big" }[];
  answer: string;
  requiredCount: number;
}
interface Bounds { left: number; right: number; top: number; bottom: number }
export interface AdventureActor extends Vec {
  id: string;
  radius: number;
  heading: number;
  kind: "food" | "bot" | "mission" | "hazard";
  color: AdventureColor;
  choiceId?: string;
  wordId?: string;
  taskId?: string;
  stage?: number;
  speciesId?: string;
  tier?: number;
  breedId?: string;
  /** Logical snake length can exceed the bounded drawing/history buffer. */
  length?: number;
  collectedWords?: string[];
  body?: Vec[];
  remnant?: boolean;
  bornAt?: number;
  card?: boolean;
  consumed?: boolean;
  wander?: number;
  trail?: Vec[];
  spawnIndex?: number;
  bounds?: Bounds;
}
export interface AdventurePlayer extends Vec {
  ateAt?: number;
  heading: number;
  radius: number;
  xp: number;
  stage: number;
  speciesId?: string;
  tier?: number;
  breedId?: string;
  length: number;
  body: Vec[];
  collectedWords: string[];
  trail: Vec[];
  bounds?: Bounds;
}
export interface AdventureWorld {
  mode: AdventureMode;
  width: number;
  height: number;
  player: AdventurePlayer;
  actors: AdventureActor[];
  mission: MissionSpec | null;
  missionProgress: number;
  missionCollectedIds: string[];
  missionComplete: boolean;
  elapsed: number;
  sessionXP: number;
  protectionUntil: number;
  rngState: number;
  /** Card boosts have their own random stream and expire in active play time. */
  boostRngState: number;
  speedBoost: { multiplier: 2 | 4; expiresAt: number } | null;
  nextId: number;
  accumulator: number;
  pendingRespawns: { slot: number; at: number }[];
  nextEcologyAt: number;
  /** Walk the mixed-category deck; sparse cards still expose every word. */
  cardCursor?: number;
  /** Camera annotation lets repopulation happen outside the visible rectangle. */
  viewBounds?: Bounds;
  /** Actual prey budget follows the device viewport; cards use a separate quota. */
  oceanPreyBudget?: number;
}
export type AdventureEvent = {
  kind: "mission" | "eat" | "bump" | "death";
  choiceId?: string;
  taskId?: string;
  complete?: boolean;
  wordId?: string;
  amount?: number;
  pickupId?: string;
  source?: "player" | "bot";
};
export const adventureStageThresholds = oceanEvolution.map(stage => stage.xp);
export const ADVENTURE_MOVE_SPEED = { fish: 300, snake: 330 } as const;
/** Shared sprite-width factors keep the larger-fish game rule visibly larger. */
export const FISH_DRAW_FACTOR = { player: 3.2, ambient: 2.7 } as const;
export const CARD_GROWTH = 50;
export const SHELL_TASK_GROWTH = 100;
export const CARD_BOOST_SECONDS = 6;
const snakeStageThresholds = [0, 20, 50, 95, 160, 250];
const colors: AdventureColor[] = ["blue", "yellow", "red", "green"];
const stepSeconds = 1 / 120;
const maxBodyLength = 160;
const maxLogicalLength = 1_000_000;
const maxActors = 180;
const oceanCardCount = 10;
const oceanPreyCount = 12;
const oceanPhonePreyCount = 8;
const oceanLargerRadiusMin = 1.36;
const oceanLargerRadiusMax = 1.41;
const foodCount = (mode: AdventureMode) => mode === "fish" ? oceanCardCount + oceanPreyCount : 116;
const hazardCount = (world: AdventureWorld) => world.mode === "fish" && world.player.stage < oceanEvolution.length - 1 ? 1 : 0;
const botCount = (world: AdventureWorld) => world.mode === "snake" ? 14 : hazardCount(world);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const distanceSquared = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
function segmentDistanceSquared(point: Vec, from: Vec, to: Vec) {
  const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
  const t = length ? clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / length, 0, 1) : 0;
  return distanceSquared(point, { x: from.x + dx * t, y: from.y + dy * t });
}
const angleDifference = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
function random(world: AdventureWorld) {
  world.rngState = (Math.imul(world.rngState, 1664525) + 1013904223) >>> 0;
  return world.rngState / 4294967296;
}
export function getAdventureSpeedBoost(world: AdventureWorld): { multiplier: 1 | 2 | 4; remaining: number } {
  const remaining = world.speedBoost ? Math.max(0, world.speedBoost.expiresAt - world.elapsed) : 0;
  return { multiplier: remaining > 0 ? world.speedBoost!.multiplier : 1, remaining };
}
function collectCardBoost(world: AdventureWorld) {
  world.boostRngState = (Math.imul(world.boostRngState, 1664525) + 1013904223) >>> 0;
  const roll = world.boostRngState / 4294967296;
  const multiplier = roll < .05 ? 4 : roll < .25 ? 2 : 1;
  if (multiplier === 1) return;
  const active = getAdventureSpeedBoost(world).multiplier;
  world.speedBoost = { multiplier: Math.max(active, multiplier) as 2 | 4, expiresAt: world.elapsed + CARD_BOOST_SECONDS };
}
function id(world: AdventureWorld, prefix: string) { return `${prefix}-${world.nextId++}`; }
function worldPosition(world: AdventureWorld, margin = 60): Vec {
  return { x: margin + random(world) * (world.width - margin * 2), y: margin + random(world) * (world.height - margin * 2) };
}
function insideView(world: AdventureWorld, point: Vec, padding = 0) {
  const view = world.viewBounds;
  return !!view && point.x >= view.left - padding && point.x <= view.right + padding && point.y >= view.top - padding && point.y <= view.bottom + padding;
}
function freePosition(world: AdventureWorld, radius: number, nearby = false, initial = false, initialSpread = 480, avoidBodies = false, card = false, forward = false): Vec {
  const view = world.viewBounds ?? { left: world.player.x - 480, right: world.player.x + 480, top: world.player.y - 330, bottom: world.player.y + 330 };
  let best = worldPosition(world, radius + 12), bestScore = -Infinity;
  for (let attempt = 0; attempt < (avoidBodies ? 80 : 42); attempt++) {
    let point: Vec;
    if (initial && nearby) {
      if (world.mode === "fish" && !card && !avoidBodies) point = { x: world.player.x - 350 + random(world) * 700, y: world.player.y - 245 + random(world) * 490 };
      else {
        const angle = random(world) * Math.PI * 2, range = world.player.radius + radius + 75 + random(world) * initialSpread;
        point = { x: world.player.x + Math.cos(angle) * range, y: world.player.y + Math.sin(angle) * range };
      }
    } else if (nearby && attempt < 42) {
      const directionX = Math.cos(world.player.heading), directionY = Math.sin(world.player.heading);
      const side = forward && attempt < 24 ? Math.abs(directionX) > Math.abs(directionY) ? directionX < 0 ? 0 : 1 : directionY < 0 ? 2 : 3 : Math.floor(random(world) * 4);
      const offset = forward && world.mode === "fish" ? radius + 14 + random(world) * 35 : radius + 45 + random(world) * 80;
      point = side < 2
        ? { x: side === 0 ? view.left - offset : view.right + offset, y: view.top + random(world) * (view.bottom - view.top) }
        : { x: view.left + random(world) * (view.right - view.left), y: side === 2 ? view.top - offset : view.bottom + offset };
    } else point = worldPosition(world, radius + 12);
    point = { x: clamp(point.x, radius + 12, world.width - radius - 12), y: clamp(point.y, radius + 12, world.height - radius - 12) };
    if (!initial && insideView(world, point, radius + 12)) continue;
    let space = distance(point, world.player) - world.player.radius - radius - (initial && world.mode === "fish" && !card && !avoidBodies ? 28 : 70);
    for (const actor of world.actors) {
      if (actor.consumed) continue;
      const separation = card && actor.wordId ? 150 : actor.kind === "mission" ? 35 : actor.kind === "food" ? 8 : 25;
      space = Math.min(space, distance(point, actor) - actor.radius - radius - separation);
    }
    if (avoidBodies && world.mode === "snake") {
      for (const snake of [world.player, ...world.actors.filter(actor => actor.kind === "bot" && !actor.consumed)]) {
        const bounds = snake.bounds, reach = radius + snake.radius + 30;
        if (bounds && (point.x < bounds.left - reach || point.x > bounds.right + reach || point.y < bounds.top - reach || point.y > bounds.bottom + reach)) continue;
        for (const segment of snake.body ?? []) space = Math.min(space, distance(point, segment) - reach);
      }
    }
    if (space > bestScore) { best = point; bestScore = space; }
    if (space >= 0) break;
  }
  return best;
}
export function stageForXP(xp: number, mode: AdventureMode = "fish"): number {
  const thresholds = mode === "fish" ? adventureStageThresholds : snakeStageThresholds;
  const safeXP = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  let stage = 0;
  for (let index = 1; index < thresholds.length; index++) if (safeXP >= thresholds[index]) stage = index;
  return stage;
}
function playerRadius(mode: AdventureMode, stage: number) {
  return mode === "fish" ? 22 + stage * 4.6 : [19, 21, 23, 25, 27, 29][stage];
}
function updatePlayerSpecies(world: AdventureWorld) {
  if (world.mode !== "fish") return;
  const species = oceanSpecies.find(species => species.id === oceanEvolution[world.player.stage].speciesId) ?? oceanSpecies[0];
  world.player.speciesId = species.id;
  world.player.tier = species.tier;
}
function fishSpecies(world: AdventureWorld, larger: boolean) {
  const stage = world.player.stage;
  const candidates = oceanSpecies.filter(species => {
    const level = oceanSizeLevel(species.id);
    // Every earlier species remains eligible, including the first tiny animals.
    // The first form has juvenile neighbours from its own size level.
    return larger ? level > stage && level <= stage + 2 : level < stage || stage === 0 && level === 0;
  });
  return candidates.length ? candidates[Math.floor(random(world) * candidates.length)] : undefined;
}
function preyRadius(world: AdventureWorld, speciesId: string) {
  // Old tiny species stay tiny after the player grows; later prey never fills the screen.
  return Math.min(40, 8 + oceanSizeLevel(speciesId) * 1.4) * (.8 + random(world) * .2);
}
function largerRadius(world: AdventureWorld) {
  return world.player.radius * (oceanLargerRadiusMin + random(world) * (oceanLargerRadiusMax - oceanLargerRadiusMin));
}
function cardWord(world: AdventureWorld) {
  world.cardCursor ??= Math.floor(random(world) * adventureCardWordIds.length);
  return adventureCardWordIds[world.cardCursor++ % adventureCardWordIds.length];
}
function addFood(world: AdventureWorld, index = 0, initial = false, forward = false, fishCard = false) {
  const species = world.mode === "fish" ? fishSpecies(world, false)! : undefined;
  const radius = species ? preyRadius(world, species.id) : 10 + random(world) * 4;
  const quota = world.mode === "fish" ? oceanCardCount : 14;
  const liveCards = world.actors.filter(actor => actor.kind === "food" && actor.card && !actor.remnant && !actor.consumed).length;
  const card = world.mode === "fish" ? fishCard : !forward && liveCards < quota && (initial ? index % 12 === 0 : random(world) < .18);
  const nearby = initial ? world.mode === "fish" ? card ? index < 4 : index < oceanCardCount + 10 : index < 62 : true;
  let position = freePosition(world, radius, nearby, initial, card ? 580 : 320, false, card, forward);
  if (world.mode === "fish" && initial && !card && !nearby) position = freePosition(world, radius);
  world.actors.push({ ...position, id: id(world, "food"), kind: "food", color: colors[index % colors.length], radius, heading: random(world) * Math.PI * 2, wander: random(world) * Math.PI * 2, ...(species ? { speciesId: species.id, tier: species.tier } : {}), ...(card ? { card: true, wordId: cardWord(world) } : {}) });
}
function addBot(world: AdventureWorld, index = 0, initial = false) {
  const mode = world.mode;
  const species = mode === "fish" ? fishSpecies(world, true) : undefined;
  if (mode === "fish" && !species) return;
  const radius = mode === "snake" ? 15 + index % 4 * 2 : largerRadius(world);
  let position = freePosition(world, radius, index < (mode === "snake" ? 8 : 20), initial, 480, true);
  if (mode === "snake" && initial && index < 2) {
    // At least two neighbours are visible on a tablet's first frame. Their tails
    // extend away from the child, and the English choices use a closer ring.
    position = { x: world.player.x + (index === 0 ? -1 : 1) * 335, y: world.player.y + (index === 0 ? -1 : 1) * 90 };
  }
  if (mode === "fish" && initial) position = { x: world.player.x - 430, y: world.player.y - 60 };
  // Bodies point away from the player at spawn rather than silently crossing its head.
  const heading = Math.atan2(world.player.y - position.y, world.player.x - position.x);
  const breed = snakeBreeds[index % snakeBreeds.length];
  const length = mode === "snake" ? 3 + index % 12 : 1;
  const actor: AdventureActor = { ...position, id: id(world, "bot"), kind: "bot", color: colors[index % colors.length], radius, heading, stage: index % 6, spawnIndex: index, wander: random(world) * Math.PI * 2, body: [], length, collectedWords: [], trail: [{ ...position }], ...(species ? { speciesId: species.id, tier: species.tier } : { breedId: breed.id }) };
  actor.body = bodyAlongTrail(actor, length, radius * 1.65, world);
  actor.bounds = bodyBounds(actor.body);
  world.actors.push(actor);
}
function addHazard(world: AdventureWorld, index: number, initial = false) {
  const species = fishSpecies(world, true);
  if (!species) return;
  const radius = largerRadius(world);
  const position = initial ? { x: world.player.x + 430, y: world.player.y + 60 } : freePosition(world, radius, true);
  world.actors.push({ ...position, id: id(world, "hazard"), kind: "hazard", color: colors[index % colors.length], radius, heading: random(world) * Math.PI * 2, wander: random(world) * Math.PI * 2, stage: world.player.stage + 1, speciesId: species.id, tier: species.tier });
}
export function createAdventureWorld(mode: AdventureMode, seed = 1, xp = 0, collectedWords: string[] = [], runLength?: number): AdventureWorld {
  const safeXP = Number.isFinite(xp) ? clamp(Math.floor(xp), 0, mode === "fish" ? 20_000_000_000 : 1_000_000_000) : 0;
  const stage = stageForXP(safeXP, mode), length = mode === "snake" ? clamp(Math.floor(Number.isFinite(runLength) ? runLength! : 1 + safeXP), 1, maxLogicalLength) : 1;
  const player: AdventurePlayer = { x: 2100, y: 1400, heading: 0, radius: playerRadius(mode, stage), xp: safeXP, stage, length, body: [{ x: 2100, y: 1400 }], collectedWords: collectedWords.filter(word => typeof word === "string" && word.length > 0).slice(0, maxBodyLength - 1), trail: [{ x: 2100, y: 1400 }], ...(mode === "snake" ? { breedId: snakeBreeds[0].id } : {}) };
  const world: AdventureWorld = { mode, width: 4200, height: 2800, player, actors: [], mission: null, missionProgress: 0, missionCollectedIds: [], missionComplete: false, elapsed: 0, sessionXP: 0, protectionUntil: 3, rngState: Number.isFinite(seed) ? seed >>> 0 : 1, boostRngState: ((Number.isFinite(seed) ? seed >>> 0 : 1) ^ 0x9e3779b9) >>> 0, speedBoost: null, nextId: 1, accumulator: 0, pendingRespawns: [], nextEcologyAt: 1 };
  updatePlayerSpecies(world);
  player.body = bodyAlongTrail(player, player.length, player.radius * 1.65, world);
  player.bounds = bodyBounds(player.body);
  // Two larger individuals is the whole ocean's cap; the final form has none.
  if (mode === "fish") {
    for (let index = 0; index < botCount(world); index++) addBot(world, index, true);
    for (let index = 0; index < hazardCount(world); index++) addHazard(world, index, true);
  }
  for (let index = 0; index < foodCount(mode); index++) addFood(world, index, true, false, mode === "fish" && index < oceanCardCount);
  if (mode === "snake") for (let index = 0; index < botCount(world); index++) addBot(world, index, true);
  return world;
}
/** Multiple copies are spread over the sea; one of each option stays reachable. */
export function setWorldMission(world: AdventureWorld, mission: MissionSpec): void {
  world.actors = world.actors.filter(actor => actor.kind !== "mission");
  world.missionProgress = 0; world.missionCollectedIds = []; world.missionComplete = false;
  if (!mission.options.length || !mission.options.some(option => option.id === mission.answer)) { world.mission = null; return; }
  const requiredCount = Number.isFinite(mission.requiredCount) ? clamp(Math.floor(mission.requiredCount), 1, 8) : 1;
  world.mission = { ...mission, options: mission.options.map(option => ({ ...option })), requiredCount };
  const entries = mission.options.flatMap(option => Array.from({ length: option.id === mission.answer ? requiredCount : 1 }, () => option));
  for (let index = entries.length - 1; index > 0; index--) { const other = Math.floor(random(world) * (index + 1)); [entries[index], entries[other]] = [entries[other], entries[index]]; }
  for (let copy = 0; copy < 3; copy++) for (let index = 0; index < entries.length; index++) {
    const option = entries[index], radius = option.size === "big" ? 28 : option.size === "small" ? 15 : world.mode === "snake" ? 18 : 20;
    let best = worldPosition(world, radius + 20), bestSpace = -Infinity;
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = world.player.heading + index * Math.PI * 2 / entries.length + attempt * .29;
      const range = copy === 0 ? world.player.radius + 125 + (attempt % 3) * 50 : copy === 1 ? 650 + random(world) * 350 : 1300 + random(world) * 500;
      const position = { x: clamp(world.player.x + Math.cos(angle) * range, radius + 20, world.width - radius - 20), y: clamp(world.player.y + Math.sin(angle) * range, radius + 20, world.height - radius - 20) };
      let space = distance(position, world.player) - world.player.radius - radius - 65;
      for (const actor of world.actors) if (actor.kind === "mission" || actor.card) space = Math.min(space, distance(position, actor) - radius - actor.radius - (actor.kind === "mission" ? 50 : 100));
      if (space > bestSpace) { best = position; bestSpace = space; }
      if (space >= 15) break;
    }
    world.actors.push({ ...best, id: id(world, "mission"), kind: "mission", color: option.color ?? colors[index % colors.length], radius, heading: world.player.heading, taskId: mission.id, choiceId: option.id, ...(option.wordId ? { wordId: option.wordId, card: true } : {}) });
  }
  trimActors(world);
}
function steer(entity: { heading: number }, goal: number, speed: number, dt: number) { entity.heading += clamp(angleDifference(entity.heading, goal), -speed * dt, speed * dt); }
function moveInsideWorld(entity: Vec & { heading: number; radius: number }, speed: number, world: AdventureWorld, dt: number) {
  entity.x += Math.cos(entity.heading) * speed * dt; entity.y += Math.sin(entity.heading) * speed * dt;
  const min = entity.radius + 4, maxX = world.width - min, maxY = world.height - min;
  if (entity.x < min || entity.x > maxX) { entity.x = clamp(entity.x, min, maxX); entity.heading = Math.PI - entity.heading; }
  if (entity.y < min || entity.y > maxY) { entity.y = clamp(entity.y, min, maxY); entity.heading = -entity.heading; }
}
function bodyAlongTrail(entity: Vec & { heading: number; radius: number; trail?: Vec[] }, logicalLength: number, spacing: number, world: AdventureWorld): Vec[] {
  const trail = entity.trail ?? [{ x: entity.x, y: entity.y }], length = Math.min(maxBodyLength, logicalLength);
  const result = [{ x: entity.x, y: entity.y }]; let cursor = 1, passed = 0;
  for (let index = 1; index < length; index++) {
    const targetDistance = index * spacing;
    while (cursor < trail.length && passed + distance(trail[cursor - 1], trail[cursor]) < targetDistance) { passed += distance(trail[cursor - 1], trail[cursor]); cursor++; }
    let point: Vec;
    if (cursor < trail.length) {
      const previous = trail[cursor - 1], next = trail[cursor], span = distance(previous, next), ratio = span > 0 ? clamp((targetDistance - passed) / span, 0, 1) : 0;
      point = { x: previous.x + (next.x - previous.x) * ratio, y: previous.y + (next.y - previous.y) * ratio };
    } else {
      const last = trail[trail.length - 1], before = trail.length > 1 ? trail[trail.length - 2] : null, angle = before ? Math.atan2(before.y - last.y, before.x - last.x) : entity.heading, remainder = targetDistance - passed;
      point = { x: last.x - Math.cos(angle) * remainder, y: last.y - Math.sin(angle) * remainder };
    }
    result.push({ x: clamp(point.x, entity.radius, world.width - entity.radius), y: clamp(point.y, entity.radius, world.height - entity.radius) });
  }
  return result;
}
function bodyBounds(body: Vec[]): Bounds {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const point of body) { left = Math.min(left, point.x); right = Math.max(right, point.x); top = Math.min(top, point.y); bottom = Math.max(bottom, point.y); }
  return { left, right, top, bottom };
}
function updateTrail(entity: Vec & { heading: number; radius: number; trail?: Vec[]; body?: Vec[]; bounds?: Bounds }, length: number, world: AdventureWorld) {
  const trail = entity.trail ??= []; if (!trail.length || distance(entity, trail[0]) > .55) trail.unshift({ x: entity.x, y: entity.y });
  const spacing = entity.radius * 1.65; let travelled = 0, keep = 1;
  while (keep < trail.length && travelled < spacing * Math.max(Math.min(length, maxBodyLength) + 2, 10)) { travelled += distance(trail[keep - 1], trail[keep]); keep++; }
  trail.length = keep; entity.body = bodyAlongTrail(entity, length, spacing, world); entity.bounds = bodyBounds(entity.body);
}
function grow(world: AdventureWorld, wordId?: string, amount = 1, lengthAmount = amount) {
  if (world.mode === "fish") world.player.ateAt = world.elapsed;
  const previousStage = world.player.stage;
  const maxGrowth = world.mode === "fish" ? 20_000_000_000 : 1_000_000_000;
  world.player.xp = Math.min(maxGrowth, world.player.xp + amount); world.sessionXP = Math.min(maxGrowth, world.sessionXP + amount); world.player.stage = stageForXP(world.player.xp, world.mode); world.player.radius = playerRadius(world.mode, world.player.stage);
  updatePlayerSpecies(world);
  if (world.mode === "fish" && previousStage !== world.player.stage) {
    // Earlier prey remains in the sea. Refresh only the two larger neighbours
    // when their species no longer belongs to a later size level.
    for (const actor of world.actors) if ((actor.kind === "bot" || actor.kind === "hazard") && actor.speciesId) {
      const level = oceanSizeLevel(actor.speciesId);
      if (level <= world.player.stage || level > world.player.stage + 2) actor.consumed = true;
      else actor.radius = Math.max(actor.radius, world.player.radius * oceanLargerRadiusMin);
    }
  }
  world.player.x = clamp(world.player.x, world.player.radius + 4, world.width - world.player.radius - 4); world.player.y = clamp(world.player.y, world.player.radius + 4, world.height - world.player.radius - 4);
  if (world.mode === "snake") world.player.length = Math.min(maxLogicalLength, world.player.length + lengthAmount);
  if (wordId) { world.player.collectedWords.unshift(wordId); world.player.collectedWords.length = Math.min(world.player.collectedWords.length, maxBodyLength - 1); }
}
function actorMotion(world: AdventureWorld, dt: number) {
  const foods = world.actors.filter(actor => actor.kind === "food" && !actor.consumed);
  for (const actor of world.actors) {
    if (actor.consumed || actor.kind === "mission") continue;
    if (actor.kind === "food") {
      if (world.mode === "fish" && !actor.remnant && !actor.card) {
        const phase = actor.wander ?? actor.heading;
        steer(actor, phase + Math.sin(world.elapsed * (.38 + phase / (Math.PI * 2) * .32) + phase * 1.7) * .7, 1.1, dt);
        moveInsideWorld(actor, 14 + phase / (Math.PI * 2) * 14, world, dt);
      }
      continue;
    }
    let nearest: AdventureActor | undefined, nearestDistance = 600 ** 2;
    if (world.mode === "snake") for (const food of foods) {
      if (food.consumed) continue;
      const range = distanceSquared(food, actor); if (range < nearestDistance) { nearest = food; nearestDistance = range; }
    }
    const phase = actor.wander ?? actor.heading;
    const baseAngle = nearest ? Math.atan2(nearest.y - actor.y, nearest.x - actor.x) : world.mode === "fish"
      ? phase + Math.sin(world.elapsed * (.18 + phase / (Math.PI * 2) * .12) + phase * 1.7) * 1.35
      : phase + Math.sin(world.elapsed * .24 + (actor.spawnIndex ?? 1)) * 1.6;
    steer(actor, baseAngle, actor.kind === "hazard" ? .55 : 1.45, dt);
    // Every fish follows its own current, including the two starting neighbours.
    // New neighbours enter from outside the view; no living fish tracks the player.
    const speed = world.mode === "snake" ? 82 + (actor.spawnIndex ?? 0) % 4 * 9
      : (actor.kind === "hazard" ? 30 : 38) + phase / (Math.PI * 2) * 30;
    moveInsideWorld(actor, speed, world, dt);
    if (nearest && distanceSquared(nearest, actor) < (actor.radius + nearest.radius * .55) ** 2) {
      nearest.consumed = true;
      if (world.mode === "snake" && actor.kind === "bot") {
        actor.length = Math.min(maxLogicalLength, (actor.length ?? actor.body?.length ?? 3) + 1);
        if (nearest.wordId) { (actor.collectedWords ??= []).unshift(nearest.wordId); actor.collectedWords.length = Math.min(maxBodyLength - 1, actor.collectedWords.length); }
      }
    }
    if (world.mode === "snake" && actor.kind === "bot") updateTrail(actor, actor.length ?? 4, world);
  }
}
function touchesBody(head: Vec & { radius: number }, snake: { body?: Vec[]; radius: number; bounds?: Bounds }, from: Vec = head, to: Vec = head) {
  const bounds = snake.bounds, reach = head.radius + snake.radius * .64;
  if (bounds && (Math.max(from.x, to.x) < bounds.left - reach || Math.min(from.x, to.x) > bounds.right + reach || Math.max(from.y, to.y) < bounds.top - reach || Math.min(from.y, to.y) > bounds.bottom + reach)) return false;
  return (snake.body ?? []).slice(1).some(point => segmentDistanceSquared(point, from, to) < reach ** 2);
}
function dropRemnants(world: AdventureWorld, snake: AdventureActor | AdventurePlayer) {
  const body = snake.body ?? [snake], words = snake.collectedWords ?? [];
  for (let index = 0; index < Math.min(body.length, 80); index++) {
    const point = body[index], wordId = index > 0 ? words[index - 1] : undefined;
    world.actors.push({ x: clamp(point.x, 18, world.width - 18), y: clamp(point.y, 18, world.height - 18), id: id(world, "remnant"), kind: "food", radius: 11, heading: 0, color: "yellow", remnant: true, bornAt: world.elapsed, ...(wordId ? { wordId, card: true } : {}) });
  }
}
function removeBot(world: AdventureWorld, actor: AdventureActor, remnants: boolean) {
  if (actor.consumed) return;
  actor.consumed = true;
  if (remnants) dropRemnants(world, actor);
  const slot = actor.spawnIndex ?? 0;
  if (!world.pendingRespawns.some(entry => entry.slot === slot)) world.pendingRespawns.push({ slot, at: world.elapsed + 2.5 });
}
function playerDeath(world: AdventureWorld, events: AdventureEvent[]) {
  dropRemnants(world, world.player);
  const player = world.player, radius = player.radius;
  const spawn = freePosition(world, radius, true);
  player.x = spawn.x; player.y = spawn.y; player.length = 1; player.body = [{ ...spawn }]; player.trail = [{ ...spawn }]; player.collectedWords = []; player.bounds = bodyBounds(player.body);
  world.protectionUntil = world.elapsed + 4;
  world.speedBoost = null;
  events.push({ kind: "death", source: "player" });
}
function snakeBotInteractions(world: AdventureWorld) {
  const bots = world.actors.filter(actor => actor.kind === "bot" && !actor.consumed);
  for (let first = 0; first < bots.length; first++) for (let second = first + 1; second < bots.length; second++) {
    const a = bots[first], b = bots[second]; if (a.consumed || b.consumed) continue;
    const aLength = a.length ?? a.body?.length ?? 1, bLength = b.length ?? b.body?.length ?? 1;
    if (aLength < bLength && touchesBody(a, b)) { removeBot(world, a, true); continue; }
    if (bLength < aLength && touchesBody(b, a)) { removeBot(world, b, true); continue; }
    if (distanceSquared(a, b) > (a.radius + b.radius * .7) ** 2) continue;
    if (aLength === bLength) { a.heading += .3; b.heading -= .3; continue; }
    const larger = aLength > bLength ? a : b, smaller = larger === a ? b : a;
    larger.length = Math.min(maxLogicalLength, (larger.length ?? 1) + (smaller.length ?? 1));
    if (smaller.collectedWords?.length) larger.collectedWords = [...smaller.collectedWords, ...(larger.collectedWords ?? [])].slice(0, maxBodyLength - 1);
    removeBot(world, smaller, false); updateTrail(larger, larger.length, world);
  }
  // The player is another larger body to computer snakes, including during voice playback.
  for (const bot of bots) if (!bot.consumed && (bot.length ?? 1) < world.player.length && touchesBody(bot, world.player)) removeBot(world, bot, true);
}
function collisions(world: AdventureWorld, gates: { answerEnabled: boolean; safe: boolean; cardEnabled?: boolean }, events: AdventureEvent[], from: Vec, to: Vec) {
  const player = world.player;
  if (world.mode === "snake" && !gates.safe && world.elapsed >= world.protectionUntil) {
    const fatal = world.actors.some(actor => actor.kind === "bot" && !actor.consumed && (actor.length ?? actor.body?.length ?? 1) > player.length && (touchesBody(player, actor, from, to) || segmentDistanceSquared(actor, from, to) < (player.radius + actor.radius * .7) ** 2));
    if (fatal) { playerDeath(world, events); return; }
  }
  for (const actor of world.actors) {
    if (actor.consumed || segmentDistanceSquared(actor, from, to) > (player.radius + actor.radius * .7) ** 2) continue;
    // One readable card at a time. Other food and swimming remain continuous.
    if (actor.wordId && (gates.cardEnabled === false || events.some(event => event.wordId))) continue;
    if (actor.kind === "mission") {
      if (!gates.answerEnabled || events.some(event => event.kind === "mission") || !world.mission || world.missionComplete || actor.taskId !== world.mission.id) continue;
      actor.consumed = true;
      const correct = actor.choiceId === world.mission.answer;
      if (correct && !world.missionCollectedIds.includes(actor.id)) { world.missionCollectedIds.push(actor.id); world.missionProgress = world.missionCollectedIds.length; }
      const complete = correct && world.missionProgress >= world.mission.requiredCount;
      if (correct) {
        if (world.mode === "fish") world.player.ateAt = world.elapsed;
        const amount = world.mode === "fish" ? Number(Boolean(actor.wordId)) * CARD_GROWTH + Number(complete) * SHELL_TASK_GROWTH : actor.wordId ? CARD_GROWTH : 1;
        if (amount) grow(world, actor.wordId, amount, 1);
        if (actor.wordId) collectCardBoost(world);
      }
      events.push({ kind: "mission", taskId: actor.taskId, choiceId: actor.choiceId, complete, ...(actor.wordId ? { wordId: actor.wordId, pickupId:actor.id } : {}) });
      if (complete) { world.missionComplete = true; for (const other of world.actors) if (other.kind === "mission") other.consumed = true; }
      continue;
    }
    const smaller = world.mode === "snake" && actor.kind === "bot" ? player.length > (actor.length ?? actor.body?.length ?? 3) : player.radius > actor.radius * 1.12;
    if (actor.kind === "food" || smaller) {
      const amount = actor.wordId ? CARD_GROWTH : world.mode === "snake" && actor.kind === "bot" ? actor.length ?? actor.body?.length ?? 1 : actor.kind === "food" ? 1 : 3;
      if (actor.kind === "bot" && world.mode === "snake") removeBot(world, actor, false); else actor.consumed = true;
      grow(world, actor.wordId, amount, actor.wordId && actor.kind !== "bot" ? 1 : amount);
      if (actor.wordId) collectCardBoost(world);
      if (world.mode === "snake" && actor.kind === "bot" && actor.collectedWords?.length) player.collectedWords = [...actor.collectedWords, ...player.collectedWords].slice(0, maxBodyLength - 1);
      events.push({ kind: "eat", ...(actor.wordId ? { wordId: actor.wordId, pickupId:actor.id } : {}), ...(amount > 1 ? { amount } : {}) }); continue;
    }
    if (gates.safe || world.elapsed < world.protectionUntil) continue;
    world.sessionXP = Math.max(0, world.sessionXP - 2); world.protectionUntil = world.elapsed + 3;
    const away = Math.atan2(player.y - actor.y, player.x - actor.x);
    player.x = clamp(actor.x + Math.cos(away) * (player.radius + actor.radius + 10), player.radius + 4, world.width - player.radius - 4); player.y = clamp(actor.y + Math.sin(away) * (player.radius + actor.radius + 10), player.radius + 4, world.height - player.radius - 4); player.heading = away;
    events.push({ kind: "bump" });
    // The push away from a large fish is not a swimming/feeding path.
    return;
  }
}
function trimActors(world: AdventureWorld) {
  const excess = world.actors.length - maxActors;
  if (excess <= 0) return;
  const candidates = world.actors.filter(actor => actor.kind === "food").sort((a, b) => distanceSquared(b, world.player) - distanceSquared(a, world.player));
  const remove = new Set(candidates.slice(0, excess).map(actor => actor.id)); world.actors = world.actors.filter(actor => !remove.has(actor.id));
}
function replenish(world: AdventureWorld) {
  world.actors = world.actors.filter(actor => !actor.consumed);
  if (world.mode === "fish") { replenishOcean(world); return; }
  const due = world.pendingRespawns.filter(entry => entry.at <= world.elapsed);
  world.pendingRespawns = world.pendingRespawns.filter(entry => entry.at > world.elapsed);
  for (const entry of due) addBot(world, entry.slot);
  const occupied = new Set([...world.actors.filter(actor => actor.kind === "bot").map(actor => actor.spawnIndex), ...world.pendingRespawns.map(entry => entry.slot)]);
  for (let slot = 0; slot < botCount(world); slot++) if (!occupied.has(slot)) addBot(world, slot);
  const missing = foodCount(world.mode) - world.actors.filter(actor => actor.kind === "food").length;
  for (let index = 0; index < missing; index++) addFood(world, world.nextId + index);
  if (world.elapsed >= world.nextEcologyAt) {
    world.nextEcologyAt = world.elapsed + 1;
    // Far-away ordinary life recycles outside the camera; existing visible fish never blink away.
    const farFoods = world.actors.filter(actor => actor.kind === "food" && !actor.wordId && (!actor.remnant || world.elapsed - (actor.bornAt ?? 0) > 20) && distanceSquared(actor, world.player) > 1200 ** 2 && !insideView(world, actor, actor.radius));
    for (const actor of farFoods.slice(0, 8)) { world.actors = world.actors.filter(other => other.id !== actor.id); addFood(world, world.nextId); }
  }
  trimActors(world);
}
function setOceanPreyBudget(world: AdventureWorld, budget: number) {
  world.oceanPreyBudget = budget;
  const prey = world.actors.filter(actor => actor.kind === "food" && !actor.wordId);
  if (prey.length <= budget) return;
  // A viewport resize lowers the actual population, removing distant prey first.
  const remove = new Set(prey.sort((a, b) => distanceSquared(b, world.player) - distanceSquared(a, world.player)).slice(0, prey.length - budget).map(actor => actor.id));
  world.actors = world.actors.filter(actor => !remove.has(actor.id));
}
function replenishOcean(world: AdventureWorld) {
  const budget = world.oceanPreyBudget ?? oceanPreyCount;
  setOceanPreyBudget(world, budget);
  for (let index = world.actors.filter(actor => actor.kind === "bot").length; index < botCount(world); index++) addBot(world, index);
  for (let index = world.actors.filter(actor => actor.kind === "hazard").length; index < hazardCount(world); index++) addHazard(world, index);
  const missingCards = oceanCardCount - world.actors.filter(actor => actor.kind === "food" && actor.wordId).length;
  for (let index = 0; index < missingCards; index++) addFood(world, world.nextId, false, false, true);
  const missingPrey = budget - world.actors.filter(actor => actor.kind === "food" && !actor.wordId).length;
  for (let index = 0; index < missingPrey; index++) addFood(world, world.nextId, false, true);
  if (world.elapsed >= world.nextEcologyAt) {
    world.nextEcologyAt = world.elapsed + (getAdventureSpeedBoost(world).multiplier > 1 ? .1 : .2);
    // A small off-screen reserve enters ahead of the child. Recycling never
    // increases the global budget or removes a currently visible animal.
    const nearbyTarget = budget - 2;
    const nearPrey = world.actors.filter(actor => actor.kind === "food" && !actor.wordId && insideView(world, actor)).length;
    const farPrey = world.actors.filter(actor => actor.kind === "food" && !actor.wordId && !insideView(world, actor, actor.radius) && (nearPrey < nearbyTarget || distanceSquared(actor, world.player) > 1200 ** 2));
    for (const actor of farPrey.slice(0, Math.min(3, Math.max(0, nearbyTarget - nearPrey)))) { world.actors = world.actors.filter(other => other.id !== actor.id); addFood(world, world.nextId, false, true); }
    for (const actor of world.actors.filter(actor => (actor.kind === "bot" || actor.kind === "hazard") && !insideView(world, actor, actor.radius) && distanceSquared(actor, world.player) > 1100 ** 2)) {
      world.actors = world.actors.filter(other => other.id !== actor.id);
      if (actor.kind === "bot") addBot(world, actor.spawnIndex); else addHazard(world, world.nextId);
    }
  }
  trimActors(world);
}
export function advanceAdventure(world: AdventureWorld, dtSeconds: number, input: { target?: Vec; direction?: Vec; followId?: string; moving: boolean }, gates: { answerEnabled: boolean; safe: boolean; cardEnabled?: boolean; playerSpeedScale?: number }): AdventureEvent[] {
  const events: AdventureEvent[] = [];
  if (!input.moving || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return events;
  world.accumulator += Math.min(dtSeconds, .1);
  while (world.accumulator + 1e-9 >= stepSeconds) {
    world.accumulator = Math.max(0, world.accumulator - stepSeconds); world.elapsed += stepSeconds;
    const player = world.player, followed = input.followId ? world.actors.find(actor => actor.id === input.followId && !actor.consumed) : undefined, target = followed ?? input.target;
    if (world.speedBoost && world.elapsed >= world.speedBoost.expiresAt) world.speedBoost = null;
    const boost = getAdventureSpeedBoost(world).multiplier, turnSpeed = 7.6 * boost;
    const from = { x: player.x, y: player.y };
    if (target && Number.isFinite(target.x) && Number.isFinite(target.y) && distance(target, player) > 4) {
      const nearTurn = followed ? Math.max(turnSpeed, ADVENTURE_MOVE_SPEED[world.mode] * boost * 1.4 / Math.max(player.radius, distance(target, player))) : turnSpeed;
      steer(player, Math.atan2(target.y - player.y, target.x - player.x), nearTurn, stepSeconds);
    } else if (input.direction && Number.isFinite(input.direction.x) && Number.isFinite(input.direction.y) && Math.hypot(input.direction.x, input.direction.y) > .01) steer(player, Math.atan2(input.direction.y, input.direction.x), turnSpeed, stepSeconds);
    const pace = Number.isFinite(gates.playerSpeedScale) ? clamp(gates.playerSpeedScale!, .25, 1) : 1;
    moveInsideWorld(player, ADVENTURE_MOVE_SPEED[world.mode] * boost * pace, world, stepSeconds); actorMotion(world, stepSeconds);
    if (world.mode === "snake") snakeBotInteractions(world);
    collisions(world, gates, events, from, { x: player.x, y: player.y }); updateTrail(player, player.length, world); replenish(world);
  }
  return events;
}
/** Camera is a clamped world-space top-left; screen = (point − camera) * zoom. */
export function cameraForWorld(world: AdventureWorld, viewportW: number, viewportH: number): { x: number; y: number; zoom: number } {
  const width = Number.isFinite(viewportW) && viewportW > 0 ? viewportW : 800, height = Number.isFinite(viewportH) && viewportH > 0 ? viewportH : 600;
  const zoom = Math.max(clamp(Math.min(width / 780, height / 560, 1.15), .42, 1.15), width / world.width, height / world.height), visibleWidth = width / zoom, visibleHeight = height / zoom;
  const x = clamp(world.player.x - visibleWidth / 2, 0, Math.max(0, world.width - visibleWidth)), y = clamp(world.player.y - visibleHeight / 2, 0, Math.max(0, world.height - visibleHeight));
  world.viewBounds = { left: x, right: x + visibleWidth, top: y, bottom: y + visibleHeight };
  if (world.mode === "fish") {
    const budget = Math.min(width, height) < 500 ? oceanPhonePreyCount : oceanPreyCount;
    if (world.oceanPreyBudget !== budget) setOceanPreyBudget(world, budget);
  }
  return { x, y, zoom };
}
