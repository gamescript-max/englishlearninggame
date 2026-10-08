import assert from "node:assert/strict";
import test from "node:test";
import { sharkContentForTier, sharkTierForTotal } from "../lib/shark-content";
import { createSharkProgress, recordSharkPickup, sharkTotal, type SharkProgress } from "../lib/shark-progress";
import { createSharkWorld, ensureSharkViewport, requestSharkJump, sharkCamera, sharkDistance, sharkIsOcean, sharkPlayerSize, sharkScreenToWorld, sharkSurfaceScreenY, sharkWorldToScreen, SHARK_FOOD_COUNT, SHARK_MOVE_SPEED, SHARK_SURFACE_Y, SHARK_WORLD_HEIGHT, SHARK_WORLD_WIDTH, stepSharkWorld, type SharkWorld } from "../lib/shark-engine";

function progressAt(count: number): SharkProgress {
  let progress = createSharkProgress();
  for (let index = 0; index < count; index++) {
    const pool = sharkContentForTier(sharkTierForTotal(index));
    progress = recordSharkPickup(progress, { pickupId: `fixture:${index}`, tokenId: pool[index % pool.length].id }, index);
  }
  return progress;
}
function placeEdibleAtPlayer(world: SharkWorld, visible = false): void {
  const food = world.foods.find(food => food.edible && (!visible || world.nearbyFoodIds!.includes(food.id)))!;
  if (sharkIsOcean(world) && ["boat", "ship", "island"].includes(food.kind)) world.player.y = SHARK_SURFACE_Y + world.player.size * .35;
  else if (visible && sharkIsOcean(world)) world.player.y = food.y;
  food.x = world.player.x; food.y = world.player.y; food.vx = 0; food.vy = 0;
}
test("initial ecology is varied, moving, local and edible with no early planets", () => {
  const world = createSharkWorld(createSharkProgress(), 123);
  assert.equal(world.foods.length, SHARK_FOOD_COUNT);
  assert.equal(world.foods.filter(food => food.edible).length, 12);
  assert.ok(world.foods.every(food => food.kind === "fish"));
  assert.ok(new Set(world.foods.map(food => food.tokenId)).size >= 10);
  assert.ok(new Set(world.foods.map(food => food.angle.toFixed(2))).size >= 10);
  assert.ok(world.foods.every(food => sharkDistance(food, world.player) > 100));
  const before = world.foods.map(food => ({ x: food.x, y: food.y }));
  for (let frame = 0; frame < 30; frame++) stepSharkWorld(world, { moving: false }, 1 / 30);
  assert.ok(world.foods.every((food, index) => sharkDistance(food, before[index]) > 8));
  assert.deepEqual(createSharkWorld(createSharkProgress(), 123), createSharkWorld(createSharkProgress(), 123));
});
test("smooth movement and swimming timing match across 30, 60 and 120 fps", () => {
  const worlds = [30, 60, 120].map(fps => {
    const world = createSharkWorld(createSharkProgress(), 10);
    world.foods = [];
    for (let frame = 0; frame < fps * 2; frame++) stepSharkWorld(world, { moving: true, direction: { x: 1, y: .3 } }, 1 / fps);
    return world;
  });
  for (const world of worlds.slice(1)) {
    assert.ok(sharkDistance(world.player, worlds[0].player) < 1e-8);
    assert.ok(Math.abs(world.player.angle - worlds[0].player.angle) < 1e-8);
    assert.ok(Math.abs(world.elapsed - 2) < 1e-8);
  }
  assert.ok(Math.abs(sharkDistance(worlds[0].player, { x: 1600, y: SHARK_SURFACE_Y + 600 * .58 - sharkSurfaceScreenY(600) }) - SHARK_MOVE_SPEED * 2) < 1e-8);
  const moving = [30, 120].map(fps => {
    const world = createSharkWorld(createSharkProgress(), 4);
    for (let frame = 0; frame < fps; frame++) stepSharkWorld(world, { moving: false }, 1 / fps);
    return world;
  });
  assert.deepEqual(moving[0].foods, moving[1].foods);
});
test("pickups replenish immediately, keep swimming through a bite and expose the alphabet once", () => {
  let progress = createSharkProgress();
  const world = createSharkWorld(progress, 7);
  const heard: string[] = [];
  for (let index = 0; index < 26; index++) {
    placeEdibleAtPlayer(world);
    const beforeX = world.player.x;
    const result = stepSharkWorld(world, { moving: true, direction: { x: 1, y: 0 } }, 1 / 120);
    assert.equal(result.pickups.length, 1);
    assert.ok(world.player.x > beforeX);
    assert.ok(world.bite > 0);
    assert.equal(world.foods.length, SHARK_FOOD_COUNT);
    assert.equal(world.foods.filter(food => food.edible).length, 12);
    for (const pickup of result.pickups) { heard.push(pickup.tokenId); progress = recordSharkPickup(progress, pickup, index); }
    assert.equal(world.total, sharkTotal(progress));
    assert.equal(recordSharkPickup(progress, result.pickups[0], index), progress);
  }
  assert.equal(new Set(heard).size, 26);
  assert.ok(world.foods.every(food => sharkTierForTotal(world.total) === "words" && sharkContentForTier("words").some(token => token.id === food.tokenId)));
  assert.ok(world.foods.some(food => food.kind === "boat" && food.edible));
  assert.ok(world.player.size > 28 && world.player.size < 100);
  const heardWords: string[] = [];
  for (let index = 0; index < 20; index++) {
    placeEdibleAtPlayer(world);
    const result = stepSharkWorld(world, { moving: false }, 1 / 120);
    assert.equal(result.pickups.length, 1);
    heardWords.push(result.pickups[0].tokenId);
    progress = recordSharkPickup(progress, result.pickups[0], index + 26);
    assert.equal(world.total, sharkTotal(progress));
  }
  assert.equal(new Set(heardWords).size, 20);
  assert.ok(world.foods.every(food => food.tokenId.startsWith("sentence-")));
});
test("word to sentence transitions re-label every food, and all future scenes retain edible food", () => {
  const world = createSharkWorld(progressAt(45), 22);
  placeEdibleAtPlayer(world);
  const result = stepSharkWorld(world, { moving: false }, 1 / 60);
  assert.equal(result.pickups.length, 1);
  assert.equal(world.total, 46);
  assert.ok(world.foods.every(food => food.tokenId.startsWith("sentence-")));
  for (const count of [56, 72, 96, 124, 158, 198, 244, 300, 1000]) {
    const stage = createSharkWorld(progressAt(count), count);
    assert.ok(stage.foods.some(food => food.edible && food.size < stage.player.size));
    assert.ok(stage.foods.every(food => food.tokenId.startsWith("sentence-")));
    assert.ok(stage.player.size <= 100);
  }
  assert.equal(sharkPlayerSize(1e9), 100);
});
test("larger objects bounce harmlessly and sea camera follows horizontally across world edges", () => {
  const world = createSharkWorld(createSharkProgress(), 99);
  const larger = world.foods.find(food => !food.edible)!;
  larger.x = world.player.x; larger.y = world.player.y;
  const previous = { ...world.player };
  const result = stepSharkWorld(world, { moving: true, direction: { x: 1, y: 0 } }, 1 / 60);
  assert.equal(result.pickups.length, 0);
  assert.equal(world.total, 0);
  assert.ok(world.player.x > previous.x);
  assert.ok(sharkDistance(larger, world.player) > world.player.size);
  world.foods = []; world.player.x = SHARK_WORLD_WIDTH - 1;
  stepSharkWorld(world, { moving: true, direction: { x: 1, y: 0 } }, 1 / 30);
  assert.ok(world.player.x >= 0 && world.player.x < 20);
  const camera = sharkCamera(world, 800, 500);
  assert.deepEqual(sharkWorldToScreen(world.player, camera), { x: 400, y: world.player.y - SHARK_SURFACE_Y + sharkSurfaceScreenY(500) });
  assert.equal(sharkWorldToScreen({ x: world.player.x, y: SHARK_SURFACE_Y }, camera).y, sharkSurfaceScreenY(500));
  const screen = sharkWorldToScreen({ x: SHARK_WORLD_WIDTH - 8, y: world.player.y }, camera);
  assert.ok(screen.x > 350 && screen.x < 400);
  assert.ok(sharkDistance(sharkScreenToWorld(screen, camera), { x: SHARK_WORLD_WIDTH - 8, y: world.player.y }) < 1e-8);
  const elapsed = world.elapsed;
  stepSharkWorld(world, { moving: true, direction: { x: 1, y: 0 } }, NaN);
  assert.equal(world.elapsed, elapsed);
});
test("portrait view retains edible food while exploring the sea and endless space", () => {
  for (const count of [0, 26, 46, 56, 72, 158, 244, 1000]) {
    const world = ensureSharkViewport(createSharkWorld(progressAt(count), count), 360, 620);
    for (let frame = 0; frame < 240; frame++) {
      stepSharkWorld(world, { moving: true, direction: { x: 1, y: .4 } }, 1 / 60);
      const camera = sharkCamera(world, 360, 620);
      const visible = world.foods.filter(food => {
        const point = sharkWorldToScreen(food, camera);
        return food.edible && point.x > food.size && point.x < 360 - food.size && point.y > food.size && point.y < 620 - food.size;
      });
      assert.ok(visible.length >= (sharkIsOcean(world) ? 2 : 4), `stage ${count}, frame ${frame} retains nearby edible food`);
    }
  }
});
test("waiting for English speech keeps prey intact and swimming at full speed until intake resumes", () => {
  const world = createSharkWorld(createSharkProgress(), 105);
  placeEdibleAtPlayer(world);
  const food = world.foods.find(food => food.edible)!, foodId = food.id;
  const start = { ...world.player };
  for (let frame = 0; frame < 60; frame++) {
    const result = stepSharkWorld(world, { moving: true, direction: { x: 1, y: 0 }, canCollect: false }, 1 / 60);
    assert.deepEqual(result.pickups, []);
    assert.ok(world.foods.some(food => food.id === foodId));
    assert.equal(world.total, 0);
  }
  assert.ok(Math.abs(sharkDistance(start, world.player) - SHARK_MOVE_SPEED) < 1e-8);
  assert.ok(world.foods.some(food => food.id === foodId && sharkDistance(food, start) > 2), "prey continues swimming and gently bounces away");
  placeEdibleAtPlayer(world);
  const resumed = stepSharkWorld(world, { moving: true, direction: { x: 1, y: 0 }, canCollect: true }, 1 / 120);
  assert.equal(resumed.pickups.length, 1);
  assert.equal(world.total, 1);
  assert.ok(world.player.x > start.x + SHARK_MOVE_SPEED);
});
test("a clustered school produces at most one ordered pickup per fixed tick", () => {
  const world = createSharkWorld(createSharkProgress(), 225);
  for (const food of world.foods.filter(food => food.edible)) { food.x = world.player.x; food.y = world.player.y; food.vx = 0; food.vy = 0; }
  const result = stepSharkWorld(world, { moving: false }, 1 / 120);
  assert.equal(result.pickups.length, 1);
  assert.equal(world.total, 1);
  const second = stepSharkWorld(world, { moving: false }, 1 / 120);
  assert.equal(second.pickups.length, 1);
  assert.notEqual(result.pickups[0].pickupId, second.pickups[0].pickupId);
});
test("sentence scenes keep their sea or cosmic labelled population and a small preview population", () => {
  for (const width of [360, 768, 1440]) for (const count of [46, 56, 72, 158, 244]) {
    const height = 820;
    const world = ensureSharkViewport(createSharkWorld(progressAt(count), count), width, height);
    for (let frame = 0; frame < 120; frame++) {
      stepSharkWorld(world, { moving: true, direction: { x: 1, y: .3 }, canCollect: false }, 1 / 60);
      const camera = sharkCamera(world, width, height);
      const visible = world.foods.filter(food => {
        const point = sharkWorldToScreen(food, camera), radius = Math.max(24, food.size);
        return point.x >= -radius && point.x <= width + radius && point.y >= -radius && point.y <= height + radius;
      });
      assert.equal(visible.filter(food => food.edible).length, sharkIsOcean(world) ? width <= 560 ? 3 : 4 : width < 900 ? 4 : 6);
      assert.ok(visible.filter(food => !food.edible).length <= (sharkIsOcean(world) ? width <= 560 ? 1 : 2 : width < 900 ? 1 : 2));
      assert.equal(world.foods.length, SHARK_FOOD_COUNT);
    }
  }
});
test("viewport maintenance retains visible fish and never awards a hidden pool entity", () => {
  const world = ensureSharkViewport(createSharkWorld(progressAt(46), 994), 768, 820);
  const initial = world.foods.map(food => ({ id: food.id, x: food.x, y: food.y }));
  const selected = [...world.nearbyFoodIds!].sort(), random = world.rngState;
  ensureSharkViewport(world, 768, 820);
  assert.deepEqual(world.foods.map(food => ({ id: food.id, x: food.x, y: food.y })), initial);
  assert.deepEqual([...world.nearbyFoodIds!].sort(), selected);
  assert.equal(world.rngState, random);
  const hidden = world.foods.find(food => food.edible && !world.nearbyFoodIds!.includes(food.id))!;
  hidden.x = world.player.x; hidden.y = world.player.y; hidden.vx = 0; hidden.vy = 0;
  const result = stepSharkWorld(world, { moving: false }, 1 / 120);
  assert.deepEqual(result.pickups, []);
  assert.equal(world.total, 46);
  assert.ok(world.foods.some(food => food.id === hidden.id));
  assert.ok(!world.nearbyFoodIds!.includes(hidden.id));
  const point = sharkWorldToScreen(hidden, sharkCamera(world, 768, 820));
  assert.ok(point.x < -hidden.size || point.x > 768 + hidden.size, "extra food is physically beyond renderer culling bounds");
});
test("viewport density limits preserve the distinct alphabet and twenty-word deck", () => {
  const world = ensureSharkViewport(createSharkWorld(createSharkProgress(), 396), 360, 620);
  const tokens: string[] = [];
  for (let index = 0; index < 46; index++) {
    placeEdibleAtPlayer(world, true);
    const result = stepSharkWorld(world, { moving: false }, 1 / 120);
    assert.equal(result.pickups.length, 1);
    tokens.push(result.pickups[0].tokenId);
  }
  assert.equal(new Set(tokens.slice(0, 26)).size, 26);
  assert.equal(new Set(tokens.slice(26)).size, 20);
  assert.equal(world.total, 46);
  assert.equal(world.foods.filter(food => food.edible && world.nearbyFoodIds!.includes(food.id)).length, 2);
});

test("all six sea scenes share a fixed horizon, underwater movement bounds and exact screen coordinates", () => {
  for (const count of [0, 12, 26, 46, 56, 72]) {
    const world = ensureSharkViewport(createSharkWorld(progressAt(count), count), 900, 600);
    assert.equal(sharkIsOcean(world), true);
    assert.equal(sharkWorldToScreen(world.player, sharkCamera(world, 900, 600)).y, 348);
    world.foods = [];
    const cameraY = sharkCamera(world, 900, 600).y;
    for (let frame = 0; frame < 120; frame++) stepSharkWorld(world, { moving: true, direction: { x: 0, y: -1 } }, 1 / 60);
    assert.ok(world.player.y >= SHARK_SURFACE_Y);
    assert.equal(sharkCamera(world, 900, 600).y, cameraY);
    for (let frame = 0; frame < 120; frame++) stepSharkWorld(world, { moving: true, direction: { x: 0, y: 1 } }, 1 / 60);
    const camera = sharkCamera(world, 900, 600);
    assert.ok(sharkWorldToScreen(world.player, camera).y < 600 - world.player.size * .6);
    assert.deepEqual(sharkWorldToScreen({ x: world.player.x, y: SHARK_SURFACE_Y }, camera), { x: 450, y: sharkSurfaceScreenY(600) });
    for (const point of [{ x: 5, y: 50 }, { x: 700, y: 499 }]) {
      const projected = sharkWorldToScreen(sharkScreenToWorld(point, camera), camera);
      assert.ok(Math.hypot(point.x - projected.x, point.y - projected.y) < 1e-8);
    }
    assert.equal(sharkWorldToScreen({ x: world.player.x, y: SHARK_SURFACE_Y + SHARK_WORLD_HEIGHT }, camera).y, SHARK_WORLD_HEIGHT + sharkSurfaceScreenY(600), "sea Y never wraps into view");
  }
});

test("boats, ships and islands float independently while fish stay in visible water", () => {
  for (const count of [26, 56, 72]) {
    const world = ensureSharkViewport(createSharkWorld(progressAt(count), count), 900, 600);
    const floating = world.foods.filter(food => ["boat", "ship", "island"].includes(food.kind));
    assert.ok(floating.length > 0);
    const before = floating.map(food => food.x);
    for (let frame = 0; frame < 120; frame++) stepSharkWorld(world, { moving: false, canCollect: false }, 1 / 60);
    floating.forEach((food, index) => {
      assert.ok(Math.abs(food.y - SHARK_SURFACE_Y) <= 2);
      assert.equal(food.vy, 0);
      assert.ok(Math.abs(food.x - before[index]) > 8, `${food.kind} moves without player input`);
    });
    assert.ok(world.foods.filter(food => food.kind === "fish").every(food => food.y >= SHARK_SURFACE_Y + Math.max(32, food.size * 1.4)));
    const camera = sharkCamera(world, 900, 600);
    assert.ok(world.foods.filter(food => world.nearbyFoodIds!.includes(food.id) && food.edible).every(food => {
      const point = sharkWorldToScreen(food, camera);
      return point.y > food.size && point.y < 600 - food.size;
    }));
  }
});

test("short mobile canvases preserve the initial swim position and a visible leap above their shared horizon", () => {
  for (const height of [480, 580, 620]) {
    const world = ensureSharkViewport(createSharkWorld(createSharkProgress(), 330), 360, height);
    const camera = sharkCamera(world, 360, height);
    assert.ok(Math.abs(sharkWorldToScreen(world.player, camera).y - height * .58) < 1e-8);
    assert.equal(sharkWorldToScreen({ x: world.player.x, y: SHARK_SURFACE_Y }, camera).y, sharkSurfaceScreenY(height));
    world.foods = []; requestSharkJump(world);
    let apex = height;
    for (let frame = 0; frame < 120; frame++) {
      stepSharkWorld(world, { moving: false }, 1 / 120);
      apex = Math.min(apex, sharkWorldToScreen(world.player, camera).y);
    }
    assert.ok(apex < sharkSurfaceScreenY(height) - 60);
    assert.ok(apex > 100, "mobile leap leaves room for the upper English card");
    assert.equal(world.jump.splash, 1);
  }
});

test("sea food density clears phone growth cards and desktop controls while cosmic density stays unchanged", () => {
  for (const { width, height, counts } of [
    { width: 390, height: 844, counts: [6, 4, 3] },
    { width: 1024, height: 768, counts: [8, 6, 4] },
    { width: 1366, height: 900, counts: [8, 6, 4] },
  ]) {
    for (const [index, count] of [0, 26, 46].entries()) {
      const world = ensureSharkViewport(createSharkWorld(progressAt(count), 340 + count), width, height);
      assert.equal(world.foods.filter(food => food.edible && world.nearbyFoodIds!.includes(food.id)).length, counts[index]);
    }
    const cosmic = ensureSharkViewport(createSharkWorld(progressAt(158), 342), width, height);
    assert.equal(cosmic.foods.filter(food => food.edible && cosmic.nearbyFoodIds!.includes(food.id)).length, width < 900 ? 4 : 6);
  }
  for (const { width, height, reserve } of [
    { width: 390, height: 844, reserve: 320 }, { width: 1024, height: 768, reserve: 150 },
    { width: 1366, height: 900, reserve: 150 }, { width: 900, height: 480, reserve: 100 },
  ]) for (const count of [0, 26, 46, 56, 72]) {
    const world = ensureSharkViewport(createSharkWorld(progressAt(count), 343 + count), width, height);
    for (let frame = 0; frame < 180; frame++) {
      stepSharkWorld(world, { moving: true, direction: { x: 1, y: .8 }, canCollect: false }, 1 / 60);
      const camera = sharkCamera(world, width, height);
      for (const food of world.foods.filter(food => food.edible && food.kind === "fish" && world.nearbyFoodIds!.includes(food.id))) {
        const point = sharkWorldToScreen(food, camera);
        assert.ok(point.y >= sharkSurfaceScreenY(height) + Math.max(32, food.size * 1.4) - 1e-8);
        assert.ok(point.y <= height - reserve + 1e-8, `fish in ${width}x${height} avoids the bottom HUD`);
      }
    }
  }
  const cramped = ensureSharkViewport(createSharkWorld(createSharkProgress(), 344), 360, 620);
  assert.equal(cramped.foods.filter(food => food.edible && cramped.nearbyFoodIds!.includes(food.id)).length, 3);
});

test("selected sea fish keep stable positions independently of player depth while the shark can swim below their band", () => {
  const world = ensureSharkViewport(createSharkWorld(createSharkProgress(), 345), 390, 844);
  const food = world.foods.find(food => food.edible && world.nearbyFoodIds!.includes(food.id))!;
  world.foods = [food]; world.nearbyFoodIds = [food.id];
  food.x = world.player.x + 110; food.vx = 0; food.vy = 0;
  const y = food.y, random = world.rngState;
  for (let frame = 0; frame < 120; frame++) stepSharkWorld(world, { moving: true, direction: { x: 0, y: 1 }, canCollect: false }, 1 / 60);
  assert.equal(food.y, y);
  assert.equal(world.rngState, random, "retained fish do not repeatedly respawn");
  assert.deepEqual(world.nearbyFoodIds, [food.id]);
  assert.ok(sharkWorldToScreen(world.player, sharkCamera(world, 390, 844)).y > 844 - 320 + 30, "player water depth remains independent of the NPC band");
});

test("late ocean shark keeps its full steeply pitched silhouette visible during short landscape jumps", () => {
  for (const height of [240, 280, 320]) {
    const world = ensureSharkViewport(createSharkWorld(progressAt(95), 346), 900, height);
    world.foods = []; requestSharkJump(world);
    let airborne = false, aboveSurface = false;
    for (let frame = 0; frame < 120; frame++) {
      stepSharkWorld(world, { moving: false }, 1 / 120);
      if (world.jump.phase !== "air") continue;
      airborne = true;
      const point = sharkWorldToScreen(world.player, sharkCamera(world, 900, height));
      if (world.player.y < SHARK_SURFACE_Y) aboveSurface = true;
      assert.ok(point.y - world.player.size * 1.45 >= 10 - 1e-8, `full shark clears the top in ${height}px landscape`);
    }
    assert.equal(airborne, true);
    assert.equal(aboveSurface, true);
    assert.equal(world.jump.splash, 1);
  }
});

test("jump approaches the surface, follows gravity, splashes, cools down and ignores repeated requests", () => {
  const world = createSharkWorld(createSharkProgress(), 321);
  world.foods = [];
  assert.equal(requestSharkJump(world), true);
  assert.equal(requestSharkJump(world), false);
  const phases = new Set<string>([world.jump.phase]);
  let apex = Infinity, splashSeen = false;
  for (let frame = 0; frame < 120; frame++) {
    stepSharkWorld(world, { moving: true, direction: { x: 1, y: 1 } }, 1 / 120);
    phases.add(world.jump.phase); apex = Math.min(apex, world.player.y);
    if (world.jump.phase === "approach" || world.jump.phase === "air" || world.jump.phase === "cooldown") assert.equal(requestSharkJump(world), false);
    if (world.jump.phase === "cooldown") {
      splashSeen = true;
      assert.equal(world.jump.splash, 1);
      assert.ok(world.jump.splashTimer > 0);
    }
  }
  assert.ok(phases.has("approach") && phases.has("air") && phases.has("cooldown"));
  assert.ok(apex < SHARK_SURFACE_Y - 80, "jump actually rises into the sky");
  assert.ok(apex > sharkCamera(world, 900, 600).y + world.player.size, "jump remains visible above the water");
  assert.equal(splashSeen, true);
  assert.ok(world.player.x > 1600, "horizontal steering works in the air");
  assert.ok(world.player.y >= SHARK_SURFACE_Y, "gravity returns the shark to water");
  for (let frame = 0; frame < 60; frame++) stepSharkWorld(world, { moving: false }, 1 / 120);
  assert.equal(world.jump.phase, "idle");
  assert.equal(requestSharkJump(world), true);
});

test("jump timing matches at 30, 60 and 120 fps and zero-time paused frames freeze its physics", () => {
  const worlds = [30, 60, 120].map(fps => {
    const world = createSharkWorld(createSharkProgress(), 322);
    world.foods = [];
    requestSharkJump(world);
    for (let frame = 0; frame < fps * 2; frame++) stepSharkWorld(world, { moving: true, direction: { x: 1, y: 0 } }, 1 / fps);
    return world;
  });
  for (const world of worlds.slice(1)) {
    assert.ok(sharkDistance(world.player, worlds[0].player) < 1e-8);
    assert.deepEqual(world.jump, worlds[0].jump);
  }
  assert.ok(Math.abs(worlds[0].player.x - 1600 - SHARK_MOVE_SPEED * 2) < 1e-8);
  const paused = createSharkWorld(createSharkProgress(), 323);
  paused.foods = []; requestSharkJump(paused);
  stepSharkWorld(paused, { moving: false }, .25);
  assert.equal(paused.jump.phase, "air");
  const snapshot = JSON.stringify(paused);
  for (let frame = 0; frame < 20; frame++) stepSharkWorld(paused, { moving: true, direction: { x: 1, y: 0 } }, 0);
  assert.equal(JSON.stringify(paused), snapshot);
});

test("airborne shark ignores underwater fish and can collect a visible surface ship", () => {
  for (const kind of ["fish", "ship"] as const) {
    const world = createSharkWorld(progressAt(56), 324);
    const food = world.foods.find(food => food.edible && food.kind === kind)!;
    world.foods = [food];
    world.player.y = SHARK_SURFACE_Y - 1;
    food.x = world.player.x; food.y = kind === "fish" ? SHARK_SURFACE_Y + 32 : SHARK_SURFACE_Y;
    food.vx = 0; food.vy = 0;
    world.jump.phase = "air"; world.jump.velocityY = 0;
    const result = stepSharkWorld(world, { moving: false }, 1 / 120);
    assert.equal(result.pickups.length, kind === "fish" ? 0 : 1);
    assert.equal(world.total, kind === "fish" ? 56 : 57);
  }
});

test("entering space clears jumping and restores a centered torus camera", () => {
  const world = createSharkWorld(progressAt(95), 325);
  const island = world.foods.find(food => food.edible && food.kind === "island")!;
  world.foods = [island];
  island.x = world.player.x; island.vx = 0; island.vy = 0;
  world.player.y = SHARK_SURFACE_Y - 1;
  world.jump.phase = "air"; world.jump.velocityY = 0; world.jump.splashTimer = .4;
  const result = stepSharkWorld(world, { moving: false }, 1 / 120);
  assert.equal(result.pickups.length, 1);
  assert.equal(world.total, 96);
  assert.equal(sharkIsOcean(world), false);
  assert.equal(world.jump.phase, "idle");
  assert.equal(world.jump.velocityY, 0);
  assert.equal(world.jump.splashTimer, 0);
  assert.equal(requestSharkJump(world), false);
  assert.deepEqual(sharkWorldToScreen(world.player, sharkCamera(world, 900, 600)), { x: 450, y: 300 });
  world.foods = []; world.player.y = 1;
  stepSharkWorld(world, { moving: true, direction: { x: 0, y: -1 } }, 1 / 30);
  assert.ok(world.player.y > SHARK_WORLD_HEIGHT - 20, "cosmic movement still wraps vertically");
});
