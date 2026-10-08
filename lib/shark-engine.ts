import { SHARK_COSMIC_CYCLE, sharkContentForTier, sharkStages, sharkTierForToken, stageForShark, type SharkFoodKind, type SharkTier } from "./shark-content";
import { MAX_SHARK_TOTAL, sharkTotal, type SharkProgress } from "./shark-progress";

export interface SharkPoint { x: number; y: number }
export interface SharkFood extends SharkPoint {
  id: string; tokenId: string; kind: SharkFoodKind; vx: number; vy: number; size: number; angle: number; phase: number; edible: boolean;
}
export interface SharkPickup { pickupId: string; tokenId: string; kind: SharkFoodKind }
export interface SharkControl { moving: boolean; direction?: SharkPoint; target?: SharkPoint; canCollect?: boolean }
export interface SharkWorld {
  player: SharkPoint & { angle: number; size: number };
  foods: SharkFood[];
  elapsed: number;
  /** Chomp animation in seconds; it never blocks movement. */
  bite: number;
  total: number;
  /** Pickups emitted by the latest call, also returned by stepSharkWorld. */
  pickups: SharkPickup[];
  width: number; height: number; stageIndex: number;
  viewport?: { width: number; height: number };
  /** Visible population stays stable while the rest of the pool swims offscreen. */
  nearbyFoodIds?: string[];
  learned: string[];
  rngState: number; nextId: number; tokenCursor: number; accumulator: number; sessionId: string;
}
export interface SharkCamera { x: number; y: number; width: number; height: number }
export const SHARK_WORLD_WIDTH = 3200;
export const SHARK_WORLD_HEIGHT = 2000;
export const SHARK_MOVE_SPEED = 370;
export const SHARK_FOOD_COUNT = 14;
const edibleCount = 12;
const fixedStep = 1 / 120;
const tau = Math.PI * 2;
const wrap = (value: number, limit: number) => ((value % limit) + limit) % limit;
function wrapDelta(value: number, limit: number): number { return wrap(value + limit / 2, limit) - limit / 2; }
export function sharkDistance(a: SharkPoint, b: SharkPoint): number {
  return Math.hypot(wrapDelta(a.x - b.x, SHARK_WORLD_WIDTH), wrapDelta(a.y - b.y, SHARK_WORLD_HEIGHT));
}
export function sharkPlayerSize(total: number): number {
  const stage = stageForShark(total);
  const span = (sharkStages[stage.stageIndex + 1]?.at ?? stage.at + SHARK_COSMIC_CYCLE) - stage.at;
  const fraction = Math.max(0, (total - stage.at) / span);
  return Math.min(100, 28 + stage.stageIndex * 6 + fraction * 6);
}
function random(world: SharkWorld): number {
  world.rngState = (Math.imul(world.rngState, 1664525) + 1013904223) >>> 0;
  return world.rngState / 4294967296;
}
function tokenId(world: SharkWorld, tier: SharkTier): string {
  const available = tier !== "sentences" ? sharkContentForTier(tier).filter(token => !world.learned.includes(token.id)) : sharkContentForTier(tier);
  const pool = available.length ? available : sharkContentForTier(tier);
  return pool[world.tokenCursor++ % pool.length].id;
}
function foodKind(world: SharkWorld, slot: number): SharkFoodKind {
  const stage = stageForShark(world.total);
  if (slot >= edibleCount) return sharkStages[Math.min(sharkStages.length - 1, stage.stageIndex + 1)].kind;
  if (slot % 4 === 0 && stage.stageIndex > 0) return sharkStages[stage.stageIndex - 1].kind;
  return stage.kind;
}
function foodSpeed(kind: SharkFoodKind): number { return kind === "fish" ? 60 : kind === "boat" || kind === "ship" ? 24 : kind === "island" ? 10 : 5; }
function createFood(world: SharkWorld, slot: number, initial = false): SharkFood {
  const angle = random(world) * tau;
  const kind = foodKind(world, slot);
  const size = world.player.size * (slot < edibleCount ? .34 + random(world) * .25 : 1.3 + random(world) * .35);
  const distance = initial ? 140 + random(world) * 270 : 180 + random(world) * 430;
  const bearing = random(world) * tau;
  const speed = foodSpeed(kind) * (.65 + random(world) * .85);
  return { id: `food:${world.sessionId}:${world.nextId++}`, tokenId: tokenId(world, stageForShark(world.total).tier), kind,
    x: wrap(world.player.x + Math.cos(bearing) * distance, world.width), y: wrap(world.player.y + Math.sin(bearing) * distance * .7, world.height),
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size, angle, phase: random(world) * tau, edible: slot < edibleCount };
}
/** Deterministic with an explicit seed. All simulation changes occur in stepSharkWorld. */
export function createSharkWorld(progress: SharkProgress, seed = Date.now()): SharkWorld {
  const total = sharkTotal(progress);
  const safeSeed = (Number.isFinite(seed) ? Math.floor(seed) : 20261008) >>> 0;
  const world: SharkWorld = { player: { x: SHARK_WORLD_WIDTH / 2, y: SHARK_WORLD_HEIGHT / 2, angle: 0, size: sharkPlayerSize(total) },
    foods: [], elapsed: 0, bite: 0, total, pickups: [], width: SHARK_WORLD_WIDTH, height: SHARK_WORLD_HEIGHT,
    stageIndex: stageForShark(total).stageIndex, learned: [...progress.learned], rngState: safeSeed, nextId: 0,
    tokenCursor: total, accumulator: 0, sessionId: `${safeSeed}:${total}:${progress.lastAt}` };
  for (let slot = 0; slot < SHARK_FOOD_COUNT; slot++) world.foods.push(createFood(world, slot, true));
  return world;
}
function refreshFood(world: SharkWorld, previousTier: SharkTier, eatenId: string): void {
  const stage = stageForShark(world.total), changedStage = stage.stageIndex !== world.stageIndex;
  world.stageIndex = stage.stageIndex;
  for (let slot = 0; slot < world.foods.length; slot++) {
    const food = world.foods[slot];
    if (changedStage) {
      food.kind = foodKind(world, slot);
      food.size = world.player.size * (slot < edibleCount ? .38 + random(world) * .2 : 1.3 + random(world) * .3);
      const speed = foodSpeed(food.kind) * (.65 + random(world) * .85);
      food.vx = Math.cos(food.angle) * speed; food.vy = Math.sin(food.angle) * speed;
      food.edible = slot < edibleCount;
    }
    // Fish change duplicate labels so fresh play exposes 26 distinct letters
    // and 20 distinct common words, regardless of the order of physical pickups.
    if (previousTier !== stage.tier || (stage.tier !== "sentences" && food.tokenId === eatenId) || sharkTierForToken(food.tokenId) !== stage.tier) {
      food.tokenId = tokenId(world, stage.tier);
    }
  }
}
function stepPlayer(world: SharkWorld, control: SharkControl): void {
  if (!control.moving) return;
  let direction = control.direction;
  if (control.target) direction = { x: wrapDelta(control.target.x - world.player.x, world.width), y: wrapDelta(control.target.y - world.player.y, world.height) };
  if (!direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.y)) return;
  const length = Math.hypot(direction.x, direction.y);
  if (length < (control.target ? 8 : .0001)) return;
  const desired = Math.atan2(direction.y, direction.x);
  const turn = Math.atan2(Math.sin(desired - world.player.angle), Math.cos(desired - world.player.angle));
  world.player.angle += turn * (1 - Math.exp(-12 * fixedStep));
  const distance = control.target ? Math.min(SHARK_MOVE_SPEED * fixedStep, length) : SHARK_MOVE_SPEED * fixedStep;
  world.player.x = wrap(world.player.x + direction.x / length * distance, world.width);
  world.player.y = wrap(world.player.y + direction.y / length * distance, world.height);
}
function stepFoods(world: SharkWorld): void {
  for (const food of world.foods) {
    const speed = Math.hypot(food.vx, food.vy);
    const wobble = food.kind === "fish" ? .75 : food.kind === "boat" || food.kind === "ship" ? .11 : .05;
    food.angle += Math.sin(world.elapsed * .9 + food.phase) * wobble * fixedStep;
    food.vx = Math.cos(food.angle) * speed; food.vy = Math.sin(food.angle) * speed;
    food.x = wrap(food.x + food.vx * fixedStep, world.width);
    food.y = wrap(food.y + food.vy * fixedStep, world.height);
  }
}
function collectFoods(world: SharkWorld, pickups: SharkPickup[], canCollect: boolean): void {
  for (let slot = 0; slot < world.foods.length; slot++) {
    const food = world.foods[slot];
    if (world.viewport && (!world.nearbyFoodIds?.includes(food.id) || !foodInViewport(world, food))) continue;
    const dx = wrapDelta(food.x - world.player.x, world.width), dy = wrapDelta(food.y - world.player.y, world.height);
    const distance = Math.hypot(dx, dy);
    // Drawing size is the half-length of a silhouette; collisions use its body.
    const contact = world.player.size * .7 + food.size * .6;
    if (distance > contact) continue;
    const tier = stageForShark(world.total).tier;
    if (canCollect && food.edible && food.size < world.player.size * .9 && sharkTierForToken(food.tokenId) === tier && world.total < MAX_SHARK_TOTAL) {
      const pickup: SharkPickup = { pickupId: `shark:${world.sessionId}:${world.total}`, tokenId: food.tokenId, kind: food.kind };
      pickups.push(pickup);
      world.total++;
      if (!world.learned.includes(food.tokenId)) world.learned.push(food.tokenId);
      world.player.size = sharkPlayerSize(world.total);
      world.bite = .2;
      const previousTier = tier, eatenId = food.tokenId;
      if (tier !== stageForShark(world.total).tier) world.tokenCursor = 0;
      world.foods[slot] = createFood(world, slot);
      refreshFood(world, previousTier, eatenId);
      // One bite per fixed tick gives every accepted token an ordered speech slot.
      break;
    } else {
      // Larger things and prey waiting for speech bounce gently. Swimming continues.
      const angle = distance > .001 ? Math.atan2(dy, dx) : food.phase;
      const speed = Math.max(24, Math.hypot(food.vx, food.vy));
      food.x = wrap(world.player.x + Math.cos(angle) * (contact + 3), world.width);
      food.y = wrap(world.player.y + Math.sin(angle) * (contact + 3), world.height);
      food.angle = angle; food.vx = Math.cos(angle) * speed; food.vy = Math.sin(angle) * speed;
    }
  }
}
/**
 * Mutates and returns the same world for a cheap animation loop. dt is seconds.
 * Fixed substeps keep 30/60/120 fps equal; tab wakeups process at most .25 seconds.
 * The returned pickup array belongs to this call and remains stable next frame.
 */
export function stepSharkWorld(world: SharkWorld, control: SharkControl, dt: number): { world: SharkWorld; pickups: SharkPickup[] } {
  const pickups: SharkPickup[] = [];
  world.pickups = pickups;
  if (!Number.isFinite(dt) || dt <= 0) return { world, pickups };
  world.accumulator += Math.min(.25, dt);
  while (world.accumulator + 1e-10 >= fixedStep) {
    world.accumulator = Math.max(0, world.accumulator - fixedStep);
    world.elapsed += fixedStep;
    world.bite = Math.max(0, world.bite - fixedStep);
    stepPlayer(world, control); stepFoods(world); collectFoods(world, pickups, control.canCollect !== false);
    if (world.viewport) rehomeForViewport(world);
  }
  return { world, pickups };
}
function foodInViewport(world: SharkWorld, food: SharkFood, fully = false): boolean {
  const viewport = world.viewport;
  if (!viewport) return true;
  const radius = Math.max(24, food.size);
  return Math.abs(wrapDelta(food.x - world.player.x, world.width)) < viewport.width / 2 + (fully ? -food.size - 12 : radius) &&
    Math.abs(wrapDelta(food.y - world.player.y, world.height)) < viewport.height / 2 + (fully ? -food.size - 24 : radius);
}
function placeNearby(world: SharkWorld, food: SharkFood, index: number): void {
  const viewport = world.viewport!;
  const signX = index % 2 ? -1 : 1, signY = index % 4 < 2 ? -1 : 1;
  let dx: number, dy: number;
  if (food.edible) {
    const xLimit = Math.max(50, viewport.width / 2 - food.size - 24);
    const yLimit = Math.max(60, viewport.height / 2 - food.size - 36);
    dx = signX * xLimit * (.55 + random(world) * .25); dy = signY * yLimit * (.55 + random(world) * .25);
    if (Math.hypot(dx, dy) < world.player.size * .7 + food.size * .6 + 24) { dx = signX * xLimit; dy = signY * yLimit; }
  } else {
    dx = signX * viewport.width * .3; dy = -signX * viewport.height * .38;
  }
  food.x = wrap(world.player.x + dx, world.width); food.y = wrap(world.player.y + dy, world.height);
}
function placeOutsideViewport(world: SharkWorld, food: SharkFood, index: number): void {
  const viewport = world.viewport!;
  const sign = index % 2 ? -1 : 1;
  food.x = wrap(world.player.x + sign * (viewport.width / 2 + Math.max(300, food.size + 120)), world.width);
  food.y = wrap(world.player.y + (index % 3 - 1) * (viewport.height * .2 + 47), world.height);
}
function rehomeForViewport(world: SharkWorld): void {
  const viewport = world.viewport;
  if (!viewport) return;
  const portrait = viewport.width < 900, tier = stageForShark(world.total).tier;
  const maximum = tier === "sentences" ? portrait ? 4 : 6 : tier === "words" ? portrait ? 6 : 8 : portrait ? 8 : 12;
  const existing = new Set(world.nearbyFoodIds ?? []);
  const nearest = (a: SharkFood, b: SharkFood) => sharkDistance(a, world.player) - sharkDistance(b, world.player) || a.id.localeCompare(b.id);
  const choose = (edible: boolean, limit: number): SharkFood[] => {
    const pool = world.foods.filter(food => food.edible === edible);
    const visible = (food: SharkFood) => foodInViewport(world, food, edible);
    const retained = pool.filter(food => existing.has(food.id) && visible(food));
    const incoming = pool.filter(food => !existing.has(food.id) && visible(food)).sort(nearest);
    const distant = pool.filter(food => !visible(food)).sort(nearest);
    return [...retained, ...incoming, ...distant].slice(0, limit);
  };
  const selected = [...choose(true, maximum), ...choose(false, portrait ? 1 : 2)];
  const selectedIds = new Set(selected.map(food => food.id));
  selected.forEach((food, index) => { if (!foodInViewport(world, food, food.edible)) placeNearby(world, food, index); });
  world.foods.forEach((food, index) => { if (!selectedIds.has(food.id) && foodInViewport(world, food)) placeOutsideViewport(world, food, index); });
  world.nearbyFoodIds = [...selectedIds];
}
/** Set the CSS canvas dimensions on resize; then steps maintain nearby prey. */
export function ensureSharkViewport(world: SharkWorld, width: number, height: number): SharkWorld {
  if (Number.isFinite(width) && Number.isFinite(height) && width >= 160 && height >= 160) {
    world.viewport = { width, height };
    rehomeForViewport(world);
  }
  return world;
}
export function sharkCamera(world: SharkWorld, width: number, height: number): SharkCamera {
  return { x: world.player.x - width / 2, y: world.player.y - height / 2, width, height };
}
export function sharkWorldToScreen(point: SharkPoint, camera: SharkCamera): SharkPoint {
  return { x: wrapDelta(point.x - camera.x - camera.width / 2, SHARK_WORLD_WIDTH) + camera.width / 2,
    y: wrapDelta(point.y - camera.y - camera.height / 2, SHARK_WORLD_HEIGHT) + camera.height / 2 };
}
export function sharkScreenToWorld(point: SharkPoint, camera: SharkCamera): SharkPoint {
  return { x: wrap(point.x + camera.x, SHARK_WORLD_WIDTH), y: wrap(point.y + camera.y, SHARK_WORLD_HEIGHT) };
}
