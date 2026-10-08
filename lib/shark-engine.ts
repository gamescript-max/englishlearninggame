import { SHARK_COSMIC_CYCLE, sharkContentForTier, sharkStages, sharkTierForToken, stageForShark, type SharkFoodKind, type SharkTier } from "./shark-content";
import { MAX_SHARK_TOTAL, sharkTotal, type SharkProgress } from "./shark-progress";

export interface SharkPoint { x: number; y: number }
export interface SharkFood extends SharkPoint {
  id: string; tokenId: string; kind: SharkFoodKind; vx: number; vy: number; size: number; angle: number; phase: number; edible: boolean;
}
export interface SharkPickup { pickupId: string; tokenId: string; kind: SharkFoodKind }
export interface SharkControl { moving: boolean; direction?: SharkPoint; target?: SharkPoint; canCollect?: boolean }
export interface SharkJump {
  phase: "idle" | "approach" | "air" | "cooldown";
  velocityY: number;
  cooldown: number;
  /** Landing count and remaining seconds for its splash animation. */
  splash: number;
  splashTimer: number;
  splashX: number;
}
export interface SharkWorld {
  player: SharkPoint & { angle: number; size: number };
  foods: SharkFood[];
  elapsed: number;
  /** Chomp animation in seconds; it never blocks movement. */
  bite: number;
  jump: SharkJump;
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
export interface SharkCamera { x: number; y: number; width: number; height: number; wrapY?: boolean }
export const SHARK_WORLD_WIDTH = 3200;
export const SHARK_WORLD_HEIGHT = 2000;
export const SHARK_MOVE_SPEED = 370;
export const SHARK_FOOD_COUNT = 14;
export const SHARK_SURFACE_Y = 400;
export function sharkSurfaceScreenY(height: number): number { return height * (height < 600 ? .46 : .4); }
export function sharkIsOcean(world: SharkWorld): boolean { return world.stageIndex < 6; }
const edibleCount = 12;
const fixedStep = 1 / 120;
const tau = Math.PI * 2;
const wrap = (value: number, limit: number) => ((value % limit) + limit) % limit;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
function wrapDelta(value: number, limit: number): number { return wrap(value + limit / 2, limit) - limit / 2; }
function viewportSize(world: SharkWorld): { width: number; height: number } { return world.viewport ?? { width: 900, height: 600 }; }
function verticalDelta(world: SharkWorld, a: number, b: number): number { return sharkIsOcean(world) ? a - b : wrapDelta(a - b, world.height); }
function worldDistance(world: SharkWorld, a: SharkPoint, b: SharkPoint): number {
  return Math.hypot(wrapDelta(a.x - b.x, world.width), verticalDelta(world, a.y, b.y));
}
function surfaceFood(food: Pick<SharkFood, "kind">): boolean { return food.kind === "boat" || food.kind === "ship" || food.kind === "island"; }
function waterBounds(world: SharkWorld, size: number, player = false): { top: number; bottom: number } {
  const height = viewportSize(world).height;
  const top = SHARK_SURFACE_Y + (player ? size * .35 : Math.max(32, size * 1.4));
  const bottom = Math.max(top, SHARK_SURFACE_Y + height - sharkSurfaceScreenY(height) - Math.max(18, size * .6) - 16);
  return { top, bottom };
}
function seaFoodBand(world: SharkWorld, size: number): { top: number; bottom: number } {
  const { width, height } = viewportSize(world);
  const phone = width <= 560 && width < height;
  const reserve = height < 600 ? 100 : phone ? 320 : 150;
  const bounds = waterBounds(world, size);
  const cameraY = SHARK_SURFACE_Y - sharkSurfaceScreenY(height);
  return { top: bounds.top, bottom: Math.max(bounds.top, Math.min(bounds.bottom, Math.max(bounds.top + 24, cameraY + height - reserve))) };
}
function foodPopulation(world: SharkWorld): { edible: number; preview: number } {
  const { width, height } = viewportSize(world), tier = stageForShark(world.total).tier;
  if (!sharkIsOcean(world)) {
    const portrait = width < 900;
    return { edible: tier === "sentences" ? portrait ? 4 : 6 : tier === "words" ? portrait ? 6 : 8 : portrait ? 8 : 12,
      preview: portrait ? 1 : 2 };
  }
  const phone = width <= 560 && width < height;
  const maximum = tier === "sentences" ? phone ? 3 : 4 : tier === "words" ? phone ? 4 : 6 : phone ? 6 : 8;
  const size = Math.max(12, ...world.foods.filter(food => food.edible && !surfaceFood(food)).map(food => food.size));
  const band = seaFoodBand(world, size), bandHeight = band.bottom - band.top;
  const columns = Math.max(1, Math.floor((width - 48) / Math.max(72, size * 3 + 20)));
  const limited = bandHeight < 50 ? Math.ceil(maximum / 2) : maximum;
  return { edible: Math.max(1, Math.min(maximum, limited, columns * (bandHeight >= 60 ? 2 : 1))), preview: phone ? 1 : 2 };
}
function surfaceFoodY(world: SharkWorld, food: SharkFood): number { return SHARK_SURFACE_Y + Math.sin(world.elapsed * 1.8 + food.phase) * 2; }
function containSeaFood(world: SharkWorld, food: SharkFood): void {
  if (!sharkIsOcean(world)) return;
  if (surfaceFood(food)) { food.y = surfaceFoodY(world, food); return; }
  const bounds = world.viewport && world.nearbyFoodIds?.includes(food.id) ? seaFoodBand(world, food.size) : waterBounds(world, food.size);
  food.y = clamp(food.y, bounds.top, bounds.bottom);
}
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
  const food: SharkFood = { id: `food:${world.sessionId}:${world.nextId++}`, tokenId: tokenId(world, stageForShark(world.total).tier), kind,
    x: wrap(world.player.x + Math.cos(bearing) * distance, world.width), y: wrap(world.player.y + Math.sin(bearing) * distance * .7, world.height),
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size, angle, phase: random(world) * tau, edible: slot < edibleCount };
  if (sharkIsOcean(world)) {
    const bounds = waterBounds(world, size);
    food.y = clamp(world.player.y + Math.sin(bearing) * distance * .7, bounds.top, bounds.bottom);
    if (surfaceFood(food)) {
      food.angle = food.vx < 0 ? Math.PI : 0;
      food.vx = (food.vx < 0 ? -1 : 1) * speed; food.vy = 0;
    }
    containSeaFood(world, food);
    if (initial && worldDistance(world, food, world.player) < 120) {
      const side = Math.cos(bearing) < 0 ? -1 : 1;
      food.x = wrap(world.player.x + side * 120, world.width);
    }
  }
  return food;
}
/** Deterministic with an explicit seed. All simulation changes occur in stepSharkWorld. */
export function createSharkWorld(progress: SharkProgress, seed = Date.now()): SharkWorld {
  const total = sharkTotal(progress);
  const safeSeed = (Number.isFinite(seed) ? Math.floor(seed) : 20261008) >>> 0;
  const stageIndex = stageForShark(total).stageIndex;
  const world: SharkWorld = { player: { x: SHARK_WORLD_WIDTH / 2, y: stageIndex < 6 ? SHARK_SURFACE_Y + 600 * .58 - sharkSurfaceScreenY(600) : SHARK_WORLD_HEIGHT / 2, angle: 0, size: sharkPlayerSize(total) },
    foods: [], elapsed: 0, bite: 0, jump: { phase: "idle", velocityY: 0, cooldown: 0, splash: 0, splashTimer: 0, splashX: SHARK_WORLD_WIDTH / 2 },
    total, pickups: [], width: SHARK_WORLD_WIDTH, height: SHARK_WORLD_HEIGHT,
    stageIndex, learned: [...progress.learned], rngState: safeSeed, nextId: 0,
    tokenCursor: total, accumulator: 0, sessionId: `${safeSeed}:${total}:${progress.lastAt}` };
  for (let slot = 0; slot < SHARK_FOOD_COUNT; slot++) world.foods.push(createFood(world, slot, true));
  return world;
}
function refreshFood(world: SharkWorld, previousTier: SharkTier, eatenId: string): void {
  const stage = stageForShark(world.total), changedStage = stage.stageIndex !== world.stageIndex;
  world.stageIndex = stage.stageIndex;
  if (!sharkIsOcean(world)) {
    world.jump.phase = "idle"; world.jump.velocityY = 0; world.jump.cooldown = 0; world.jump.splashTimer = 0;
  }
  for (let slot = 0; slot < world.foods.length; slot++) {
    const food = world.foods[slot];
    if (changedStage) {
      food.kind = foodKind(world, slot);
      food.size = world.player.size * (slot < edibleCount ? .38 + random(world) * .2 : 1.3 + random(world) * .3);
      const speed = foodSpeed(food.kind) * (.65 + random(world) * .85);
      food.vx = Math.cos(food.angle) * speed; food.vy = Math.sin(food.angle) * speed;
      food.edible = slot < edibleCount;
      if (sharkIsOcean(world) && surfaceFood(food)) {
        food.angle = food.vx < 0 ? Math.PI : 0;
        food.vx = (food.vx < 0 ? -1 : 1) * speed; food.vy = 0;
      }
      containSeaFood(world, food);
    }
    // Fish change duplicate labels so fresh play exposes 26 distinct letters
    // and 20 distinct common words, regardless of the order of physical pickups.
    if (previousTier !== stage.tier || (stage.tier !== "sentences" && food.tokenId === eatenId) || sharkTierForToken(food.tokenId) !== stage.tier) {
      food.tokenId = tokenId(world, stage.tier);
    }
  }
}
/** Starts a physical jump; further requests wait for landing and a short cooldown. */
export function requestSharkJump(world: SharkWorld): boolean {
  if (!sharkIsOcean(world) || world.jump.phase !== "idle") return false;
  world.jump.phase = "approach";
  world.jump.velocityY = 0;
  return true;
}
function playerDirection(world: SharkWorld, control: SharkControl): SharkPoint | undefined {
  if (!control.moving) return;
  const direction = control.target
    ? { x: wrapDelta(control.target.x - world.player.x, world.width), y: verticalDelta(world, control.target.y, world.player.y) }
    : control.direction;
  if (!direction || !Number.isFinite(direction.x) || !Number.isFinite(direction.y)) return;
  if (Math.hypot(direction.x, direction.y) < (control.target ? 8 : .0001)) return;
  return direction;
}
function turnPlayer(world: SharkWorld, x: number, y: number): void {
  const desired = Math.atan2(y, x);
  const turn = Math.atan2(Math.sin(desired - world.player.angle), Math.cos(desired - world.player.angle));
  world.player.angle += turn * (1 - Math.exp(-12 * fixedStep));
}
function stepPlayer(world: SharkWorld, control: SharkControl): void {
  const direction = playerDirection(world, control);
  const length = direction ? Math.hypot(direction.x, direction.y) : 0;
  const distance = control.target ? Math.min(SHARK_MOVE_SPEED * fixedStep, length) : SHARK_MOVE_SPEED * fixedStep;
  const jump = world.jump;
  if (sharkIsOcean(world) && (jump.phase === "approach" || jump.phase === "air")) {
    const horizontal = direction ? direction.x / length * distance : 0;
    world.player.x = wrap(world.player.x + horizontal, world.width);
    if (jump.phase === "approach") {
      world.player.y = Math.max(SHARK_SURFACE_Y, world.player.y - 760 * fixedStep);
      turnPlayer(world, horizontal / fixedStep || Math.cos(world.player.angle) * 80, -760);
      if (world.player.y <= SHARK_SURFACE_Y) {
        jump.phase = "air";
        const height = viewportSize(world).height;
        const headroom = Math.max(0, sharkSurfaceScreenY(height) - world.player.size * 1.45 - 10);
        const rise = Math.min(108, height * .16, headroom);
        jump.velocityY = -Math.sqrt(2 * 1450 * rise);
      }
    } else {
      jump.velocityY += 1450 * fixedStep;
      world.player.y += jump.velocityY * fixedStep;
      turnPlayer(world, horizontal / fixedStep || Math.cos(world.player.angle) * 120, jump.velocityY);
      if (jump.velocityY > 0 && world.player.y >= SHARK_SURFACE_Y) {
        world.player.y = waterBounds(world, world.player.size, true).top;
        jump.phase = "cooldown"; jump.velocityY = 0; jump.cooldown = .28;
        jump.splash++; jump.splashTimer = .52; jump.splashX = world.player.x;
      }
    }
    return;
  }
  if (direction) {
    turnPlayer(world, direction.x, direction.y);
    world.player.x = wrap(world.player.x + direction.x / length * distance, world.width);
    world.player.y += direction.y / length * distance;
  }
  if (sharkIsOcean(world)) {
    const bounds = waterBounds(world, world.player.size, true);
    world.player.y = clamp(world.player.y, bounds.top, bounds.bottom);
  } else world.player.y = wrap(world.player.y, world.height);
}
function stepFoods(world: SharkWorld): void {
  for (const food of world.foods) {
    const speed = Math.hypot(food.vx, food.vy);
    if (sharkIsOcean(world) && surfaceFood(food)) {
      food.vy = 0;
      food.vx = (Math.cos(food.angle) < 0 ? -1 : 1) * speed;
      food.angle = food.vx < 0 ? Math.PI : 0;
      food.x = wrap(food.x + food.vx * fixedStep, world.width);
      food.y = surfaceFoodY(world, food);
      continue;
    }
    const wobble = food.kind === "fish" ? .75 : food.kind === "boat" || food.kind === "ship" ? .11 : .05;
    food.angle += Math.sin(world.elapsed * .9 + food.phase) * wobble * fixedStep;
    food.vx = Math.cos(food.angle) * speed; food.vy = Math.sin(food.angle) * speed;
    food.x = wrap(food.x + food.vx * fixedStep, world.width);
    food.y += food.vy * fixedStep;
    if (sharkIsOcean(world)) {
      const bounds = world.viewport && world.nearbyFoodIds?.includes(food.id) ? seaFoodBand(world, food.size) : waterBounds(world, food.size);
      if (food.y < bounds.top || food.y > bounds.bottom) {
        food.y = clamp(food.y, bounds.top, bounds.bottom);
        food.angle = -food.angle; food.vy = -food.vy;
      }
    } else food.y = wrap(food.y, world.height);
  }
}
function collectFoods(world: SharkWorld, pickups: SharkPickup[], canCollect: boolean): void {
  for (let slot = 0; slot < world.foods.length; slot++) {
    const food = world.foods[slot];
    if (world.viewport && (!world.nearbyFoodIds?.includes(food.id) || !foodInViewport(world, food))) continue;
    if (sharkIsOcean(world) && world.jump.phase === "air" && !surfaceFood(food)) continue;
    const dx = wrapDelta(food.x - world.player.x, world.width), dy = verticalDelta(world, food.y, world.player.y);
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
      food.y = world.player.y + Math.sin(angle) * (contact + 3);
      if (sharkIsOcean(world)) containSeaFood(world, food);
      else food.y = wrap(food.y, world.height);
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
    world.jump.splashTimer = Math.max(0, world.jump.splashTimer - fixedStep);
    if (world.jump.phase === "cooldown") {
      world.jump.cooldown = Math.max(0, world.jump.cooldown - fixedStep);
      if (world.jump.cooldown === 0) world.jump.phase = "idle";
    }
    stepPlayer(world, control); stepFoods(world); collectFoods(world, pickups, control.canCollect !== false);
    if (world.viewport) rehomeForViewport(world);
  }
  return { world, pickups };
}
function foodInViewport(world: SharkWorld, food: SharkFood, fully = false): boolean {
  const viewport = world.viewport;
  if (!viewport) return true;
  const radius = Math.max(24, food.size);
  const point = sharkWorldToScreen(food, sharkCamera(world, viewport.width, viewport.height));
  const xMargin = fully ? food.size + 12 : -radius, yMargin = fully ? food.size + 24 : -radius;
  const visible = point.x > xMargin && point.x < viewport.width - xMargin && point.y > yMargin && point.y < viewport.height - yMargin;
  if (!visible || !fully || !sharkIsOcean(world) || surfaceFood(food)) return visible;
  const band = seaFoodBand(world, food.size);
  return food.y >= band.top - 1e-8 && food.y <= band.bottom + 1e-8;
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
  if (sharkIsOcean(world)) {
    const population = foodPopulation(world).edible;
    const columns = surfaceFood(food) ? population : Math.max(1, Math.ceil(population / 2));
    const column = index % columns, rows = Math.max(1, Math.ceil(population / columns)), row = Math.floor(index / columns) % rows;
    const left = food.size + 28, span = Math.max(0, viewport.width - left * 2);
    food.x = wrap(world.player.x - viewport.width / 2 + left + (column + .5 + (random(world) - .5) * .22) / columns * span, world.width);
    if (surfaceFood(food)) food.y = surfaceFoodY(world, food);
    else {
      const band = seaFoodBand(world, food.size);
      food.y = band.top + (band.bottom - band.top) * (row + .5 + (random(world) - .5) * .25) / rows;
    }
  }
}
function placeOutsideViewport(world: SharkWorld, food: SharkFood, index: number): void {
  const viewport = world.viewport!;
  const sign = index % 2 ? -1 : 1;
  food.x = wrap(world.player.x + sign * (viewport.width / 2 + Math.max(300, food.size + 120)), world.width);
  food.y = wrap(world.player.y + (index % 3 - 1) * (viewport.height * .2 + 47), world.height);
  containSeaFood(world, food);
}
function rehomeForViewport(world: SharkWorld): void {
  const viewport = world.viewport;
  if (!viewport) return;
  const population = foodPopulation(world);
  const existing = new Set(world.nearbyFoodIds ?? []);
  const nearest = (a: SharkFood, b: SharkFood) => worldDistance(world, a, world.player) - worldDistance(world, b, world.player) || a.id.localeCompare(b.id);
  const choose = (edible: boolean, limit: number): SharkFood[] => {
    const pool = world.foods.filter(food => food.edible === edible);
    const visible = (food: SharkFood) => foodInViewport(world, food, edible);
    const retained = pool.filter(food => existing.has(food.id) && visible(food));
    const incoming = pool.filter(food => !existing.has(food.id) && visible(food)).sort(nearest);
    const distant = pool.filter(food => !visible(food)).sort(nearest);
    return [...retained, ...incoming, ...distant].slice(0, limit);
  };
  const selected = [...choose(true, population.edible), ...choose(false, population.preview)];
  const selectedIds = new Set(selected.map(food => food.id));
  selected.forEach((food, index) => { if (!foodInViewport(world, food, food.edible)) placeNearby(world, food, index); });
  world.foods.forEach((food, index) => { if (!selectedIds.has(food.id) && foodInViewport(world, food)) placeOutsideViewport(world, food, index); });
  world.nearbyFoodIds = [...selectedIds];
}
/** Set the CSS canvas dimensions on resize; then steps maintain nearby prey. */
export function ensureSharkViewport(world: SharkWorld, width: number, height: number): SharkWorld {
  if (Number.isFinite(width) && Number.isFinite(height) && width >= 160 && height >= 160) {
    const previous = viewportSize(world);
    if (sharkIsOcean(world) && height !== previous.height && world.jump.phase !== "air" && world.jump.phase !== "approach") {
      const screenRatio = (world.player.y - SHARK_SURFACE_Y + sharkSurfaceScreenY(previous.height)) / previous.height;
      world.player.y = SHARK_SURFACE_Y + screenRatio * height - sharkSurfaceScreenY(height);
    }
    world.viewport = { width, height };
    if (sharkIsOcean(world) && world.jump.phase !== "air" && world.jump.phase !== "approach") {
      const bounds = waterBounds(world, world.player.size, true);
      world.player.y = clamp(world.player.y, bounds.top, bounds.bottom);
    }
    world.foods.forEach(food => containSeaFood(world, food));
    rehomeForViewport(world);
  }
  return world;
}
export function sharkCamera(world: SharkWorld, width: number, height: number): SharkCamera {
  return { x: world.player.x - width / 2, y: sharkIsOcean(world) ? SHARK_SURFACE_Y - sharkSurfaceScreenY(height) : world.player.y - height / 2,
    width, height, wrapY: !sharkIsOcean(world) };
}
export function sharkWorldToScreen(point: SharkPoint, camera: SharkCamera): SharkPoint {
  return { x: wrapDelta(point.x - camera.x - camera.width / 2, SHARK_WORLD_WIDTH) + camera.width / 2,
    y: camera.wrapY === false ? point.y - camera.y : wrapDelta(point.y - camera.y - camera.height / 2, SHARK_WORLD_HEIGHT) + camera.height / 2 };
}
export function sharkScreenToWorld(point: SharkPoint, camera: SharkCamera): SharkPoint {
  return { x: wrap(point.x + camera.x, SHARK_WORLD_WIDTH), y: camera.wrapY === false ? point.y + camera.y : wrap(point.y + camera.y, SHARK_WORLD_HEIGHT) };
}
