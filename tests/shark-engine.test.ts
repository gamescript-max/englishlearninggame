import assert from "node:assert/strict";
import test from "node:test";
import { sharkContentForTier, sharkTierForTotal } from "../lib/shark-content";
import { createSharkProgress, recordSharkPickup, sharkTotal, type SharkProgress } from "../lib/shark-progress";
import { createSharkWorld, ensureSharkViewport, sharkCamera, sharkDistance, sharkPlayerSize, sharkScreenToWorld, sharkWorldToScreen, SHARK_FOOD_COUNT, SHARK_MOVE_SPEED, SHARK_WORLD_WIDTH, stepSharkWorld, type SharkWorld } from "../lib/shark-engine";

function progressAt(count: number): SharkProgress {
  let progress = createSharkProgress();
  for (let index = 0; index < count; index++) {
    const pool = sharkContentForTier(sharkTierForTotal(index));
    progress = recordSharkPickup(progress, { pickupId: `fixture:${index}`, tokenId: pool[index % pool.length].id }, index);
  }
  return progress;
}
function placeEdibleAtPlayer(world: SharkWorld): void {
  const food = world.foods.find(food => food.edible)!;
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
  assert.ok(Math.abs(sharkDistance(worlds[0].player, { x: 1600, y: 1000 }) - SHARK_MOVE_SPEED * 2) < 1e-8);
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
test("larger objects bounce harmlessly and torus camera follows across world edges", () => {
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
  assert.deepEqual(sharkWorldToScreen(world.player, camera), { x: 400, y: 250 });
  const screen = sharkWorldToScreen({ x: SHARK_WORLD_WIDTH - 8, y: world.player.y }, camera);
  assert.ok(screen.x > 350 && screen.x < 400);
  assert.ok(sharkDistance(sharkScreenToWorld(screen, camera), { x: SHARK_WORLD_WIDTH - 8, y: world.player.y }) < 1e-8);
  const elapsed = world.elapsed;
  stepSharkWorld(world, { moving: true, direction: { x: 1, y: 0 } }, NaN);
  assert.equal(world.elapsed, elapsed);
});
test("portrait view keeps at least four smaller foods visible while exploring the endless map", () => {
  for (const count of [0, 26, 46, 158, 244, 1000]) {
    const world = ensureSharkViewport(createSharkWorld(progressAt(count), count), 360, 620);
    for (let frame = 0; frame < 240; frame++) {
      stepSharkWorld(world, { moving: true, direction: { x: 1, y: .4 } }, 1 / 60);
      const camera = sharkCamera(world, 360, 620);
      const visible = world.foods.filter(food => {
        const point = sharkWorldToScreen(food, camera);
        return food.edible && point.x > food.size && point.x < 360 - food.size && point.y > food.size && point.y < 620 - food.size;
      });
      assert.ok(visible.length >= 4, `stage ${count}, frame ${frame} retains nearby edible food`);
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
test("sentence scenes keep four portrait or six desktop labelled prey and a small preview population", () => {
  for (const width of [360, 768, 1440]) for (const count of [46, 158, 244]) {
    const height = 820;
    const world = ensureSharkViewport(createSharkWorld(progressAt(count), count), width, height);
    for (let frame = 0; frame < 120; frame++) {
      stepSharkWorld(world, { moving: true, direction: { x: 1, y: .3 }, canCollect: false }, 1 / 60);
      const camera = sharkCamera(world, width, height);
      const visible = world.foods.filter(food => {
        const point = sharkWorldToScreen(food, camera), radius = Math.max(24, food.size);
        return point.x >= -radius && point.x <= width + radius && point.y >= -radius && point.y <= height + radius;
      });
      assert.equal(visible.filter(food => food.edible).length, width < 900 ? 4 : 6);
      assert.ok(visible.filter(food => !food.edible).length <= (width < 900 ? 1 : 2));
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
    const food = world.foods.find(food => food.edible && world.nearbyFoodIds!.includes(food.id))!;
    food.x = world.player.x; food.y = world.player.y; food.vx = 0; food.vy = 0;
    const result = stepSharkWorld(world, { moving: false }, 1 / 120);
    assert.equal(result.pickups.length, 1);
    tokens.push(result.pickups[0].tokenId);
  }
  assert.equal(new Set(tokens.slice(0, 26)).size, 26);
  assert.equal(new Set(tokens.slice(26)).size, 20);
  assert.equal(world.total, 46);
  assert.equal(world.foods.filter(food => food.edible && world.nearbyFoodIds!.includes(food.id)).length, 4);
});
