import assert from "node:assert/strict";
import test from "node:test";
import { drawSharkPortrait, paintSharkWorld, type SharkHudRect } from "../components/shark-renderer";
import { createSharkWorld, ensureSharkViewport, type SharkFood } from "../lib/shark-engine";
import { createSharkProgress } from "../lib/shark-progress";
import { getSharkToken, sharkStages, type SharkFoodKind } from "../lib/shark-content";

function canvasProbe() {
  const calls: unknown[][] = [], text: { value: string; x: number; y: number; font: string }[] = [];
  const stack: { font: string; globalAlpha: number }[] = [];
  const state = { font: "10px sans-serif", globalAlpha: 1 };
  const gradient = { addColorStop() {} };
  const context = new Proxy(state as Record<string, unknown>, {
    get(target, property) {
      if (property in target) return target[String(property)];
      if (property === "save") return () => { stack.push({ font: String(target.font), globalAlpha: Number(target.globalAlpha) }); calls.push(["save"]); };
      if (property === "restore") return () => { const saved = stack.pop(); assert.ok(saved, "every restore belongs to a save"); Object.assign(target, saved); calls.push(["restore"]); };
      if (property === "createLinearGradient" || property === "createRadialGradient") return (...args: number[]) => { assert.ok(args.every(Number.isFinite)); return gradient; };
      if (property === "measureText") return (value: string) => ({ width: value.length * (Number(String(target.font).match(/(\d+(?:\.\d+)?)px/)?.[1]) || 10) * .56 });
      if (property === "drawImage") return () => assert.fail("the shark world is original Canvas art, without image assets");
      if (property === "fillText") return (value: string, x: number, y: number) => { assert.ok(Number.isFinite(x) && Number.isFinite(y)); text.push({ value, x, y, font: String(target.font) }); calls.push(["fillText", value, x, y]); };
      return (...args: unknown[]) => { for (const arg of args) if (typeof arg === "number") assert.ok(Number.isFinite(arg), `${String(property)} receives finite geometry`); calls.push([String(property), ...args]); };
    },
    set(target, property, value) { target[String(property)] = value; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { context, calls, text, stack };
}
function food(kind: SharkFoodKind, tokenId: string, x: number, y: number, index = 0): SharkFood {
  return { id: `test-${index}`, tokenId, kind, x, y, vx: 30, vy: 0, size: 22, angle: .2, phase: index, edible: index % 4 !== 3 };
}

test("the full English stays visible on both desktop and portrait mobile at readable sizes", () => {
  for (const [width, height, minimum] of [[1024, 700, 19], [390, 844, 17]]) {
    const world = createSharkWorld(createSharkProgress(), 101);
    world.foods = [food("fish", "A", world.player.x + 120, world.player.y + 95), food("ship", "sentence-see-rainbow", world.player.x - 120, world.player.y + 80, 1)];
    const probe = canvasProbe(); paintSharkWorld(probe.context, world, width, height);
    const english = probe.text.filter(item => item.value !== "YOU · 鲨鲨");
    assert.ok(english.some(item => item.value === "A"));
    assert.equal(english.filter(item => item.value !== "A").map(item => item.value).join(" "), getSharkToken("sentence-see-rainbow")?.en);
    assert.equal(english.length, 3, "a short sentence is painted fully over two lines");
    for (const item of english) {
      assert.ok(Number(item.font.match(/(\d+(?:\.\d+)?)px/)?.[1]) >= minimum);
      assert.ok(item.x >= 10 && item.x <= width - 10 && item.y >= 10 && item.y <= height - 10);
    }
    assert.equal(probe.stack.length, 0);
  }
});

test("real mobile HUD rectangles keep the whole two-line badge clear of captions and growth controls", () => {
  const hudRects: SharkHudRect[] = [
    { x: 15, y: 82, w: 360, h: 108 }, // Wrapped caption in a 390×844 portrait viewport.
    { x: 20, y: 553, w: 350, h: 90 },
    { x: 204, y: 655, w: 174, h: 174 },
    { x: 16, y: 735, w: 145, h: 84 },
    { x: 10, y: 12, w: 56, h: 56 }, { x: 212, y: 12, w: 168, h: 56 },
    { x: 40, y: 205, w: 310, h: 112 },
  ];
  for (const screenY of [90, 557]) {
    const world = createSharkWorld(createSharkProgress(), 107); world.player.size = 55;
    world.foods = [food("ship", "sentence-like-read", world.player.x, world.player.y + screenY - 422)];
    const probe = canvasProbe(); paintSharkWorld(probe.context, world, 390, 844, { reducedMotion: true, hudRects });
    const english = probe.text.filter(item => item.value !== "YOU · 鲨鲨");
    assert.equal(english.map(item => item.value).join(" "), getSharkToken("sentence-like-read")?.en);
    assert.equal(english.length, 2);
    const badgeWidth = Math.max(...english.map(item => item.value.length * 17 * .56)) + 24;
    const badge = { x: english[0].x - badgeWidth / 2, y: english[0].y - 18, w: badgeWidth, h: 58 };
    for (const hud of hudRects) assert.ok(badge.x + badge.w <= hud.x || hud.x + hud.w <= badge.x || badge.y + badge.h <= hud.y || hud.y + hud.h <= badge.y, `the full badge for food at y=${screenY} clears every DOM overlay`);
    assert.equal(probe.stack.length, 0);
  }
});

test("painted food labels return their exact screen hit areas, including displaced sentence badges", () => {
  const world = createSharkWorld(createSharkProgress(), 109); world.player.size = 55;
  world.foods = [
    food("fish", "A", world.player.x + 110, world.player.y + 120),
    food("ship", "sentence-like-read", world.player.x, world.player.y - 282, 1),
    food("boat", "cat", world.player.x - 110, world.player.y + 120, 2),
    food("fish", "Z", 10, 10, 3),
    food("boat", "dog", world.player.x + 50, world.player.y + 50, 4),
  ];
  world.nearbyFoodIds = world.foods.slice(0, 4).map(item => item.id);
  const hudRects = [{ x: 15, y: 82, w: 360, h: 108 }];
  const before = JSON.stringify(world), probe = canvasProbe();
  const labels = paintSharkWorld(probe.context, world, 390, 844, { reducedMotion: true, hudRects });
  assert.deepEqual(new Set(labels.map(label => label.foodId)), new Set(world.foods.slice(0, 3).map(item => item.id)), "only painted food has a label hit area");
  for (const label of labels) {
    assert.ok(probe.calls.some(call => call[0] === "roundRect" && call[1] === label.x && call[2] === label.y && call[3] === label.w && call[4] === label.h), "hit geometry matches the badge actually drawn");
    const item = world.foods.find(item => item.id === label.foodId)!;
    const english = getSharkToken(item.tokenId)!.en;
    const text = probe.text.filter(painted => english.includes(painted.value) && painted.value !== "YOU · 鲨鲨");
    assert.ok(text.length > 0);
    assert.ok(text.every(painted => painted.x >= label.x && painted.x <= label.x + label.w && painted.y >= label.y && painted.y <= label.y + label.h));
  }
  const sentence = labels.find(label => label.foodId === "test-1")!;
  assert.ok(Math.hypot(sentence.x + sentence.w / 2 - 195, sentence.y + sentence.h / 2 - 140) > world.foods[1].size + 30, "the HUD-displaced sentence is outside the prey body hit radius");
  assert.equal(JSON.stringify(world), before, "hit areas are returned without changing the simulation");
  assert.deepEqual(paintSharkWorld(probe.context, world, 0, 844), []);
});

test("every food silhouette paints without assets or accumulating transforms and offscreen food is culled", () => {
  const world = createSharkWorld(createSharkProgress(), 102);
  const kinds: SharkFoodKind[] = ["fish", "boat", "ship", "island", "earth", "planet", "star", "galaxy", "universe"];
  world.foods = kinds.map((kind, index) => food(kind, "sentence-like-read", world.player.x + (index % 3 - 1) * 220, world.player.y + (Math.floor(index / 3) - 1) * 170, index));
  world.foods.push(food("fish", "Z", 10, 10, 20));
  const before = JSON.stringify(world), probe = canvasProbe();
  paintSharkWorld(probe.context, world, 1000, 700);
  assert.equal(probe.text.filter(item => item.value !== "YOU · 鲨鲨").length, 18);
  assert.ok(!probe.text.some(item => item.value === "Z"));
  assert.equal(JSON.stringify(world), before, "painting does not alter simulation or pickup state");
  assert.equal(probe.stack.length, 0);
  assert.ok(probe.calls.length < 10000, "bounded geometry is suitable for the tablet animation loop");
});

test("sentence viewport paints exactly four edible targets and one larger target, without edge label leaks", () => {
  const world = createSharkWorld(createSharkProgress(), 108);
  world.total = 46; world.stageIndex = 3; world.player.size = 50;
  world.foods.forEach(item => { item.tokenId = "sentence-like-read"; });
  ensureSharkViewport(world, 390, 844);
  const selected = new Set(world.nearbyFoodIds);
  assert.equal(world.foods.filter(item => selected.has(item.id) && item.edible).length, 4);
  assert.equal(world.foods.filter(item => selected.has(item.id) && !item.edible).length, 1);
  // A parked silhouette can overlap the canvas edge after a camera or size change;
  // its explicit population ID still decides whether it is visible and collectible.
  world.foods.filter(item => !selected.has(item.id)).forEach((item, index) => { item.x = world.player.x + 193; item.y = world.player.y + index * 15; });
  const probe = canvasProbe(); paintSharkWorld(probe.context, world, 390, 844, { reducedMotion: true });
  const english = probe.text.filter(item => item.value !== "YOU · 鲨鲨");
  assert.equal(english.length, 10, "five targets paint two complete English lines each");
  assert.equal(english.filter(item => item.value === "I like").length, 5);
  assert.equal(english.filter(item => item.value === "to read.").length, 5);
  assert.equal(probe.stack.length, 0);
});

test("the shark tail and lower jaw have real joint motion while reduced motion freezes decorative movement", () => {
  const first = canvasProbe(), second = canvasProbe();
  drawSharkPortrait(first.context, 200, 150, 35, 0); drawSharkPortrait(second.context, 200, 150, 35, .17);
  assert.notDeepEqual(first.calls, second.calls, "the tail, fin and body paths change during swimming");
  const world = createSharkWorld(createSharkProgress(), 103); world.foods = []; world.elapsed = .1;
  const idle = canvasProbe(); paintSharkWorld(idle.context, world, 800, 600);
  world.bite = .1;
  const biting = canvasProbe(); paintSharkWorld(biting.context, world, 800, 600);
  assert.notDeepEqual(idle.calls.filter(call => call[0] === "rotate"), biting.calls.filter(call => call[0] === "rotate"), "a bite rotates the separate lower jaw");
  world.bite = 0;
  const still = canvasProbe(); paintSharkWorld(still.context, world, 800, 600, { reducedMotion: true });
  world.elapsed = 18;
  const later = canvasProbe(); paintSharkWorld(later.context, world, 800, 600, { reducedMotion: true });
  assert.deepEqual(still.calls, later.calls);
  assert.equal(first.stack.length + second.stack.length + idle.stack.length + biting.stack.length + still.stack.length + later.stack.length, 0);
});

test("one pickup produces one capped particle burst even if the paused frame is painted repeatedly", () => {
  const world = createSharkWorld(createSharkProgress(), 104); world.foods = []; world.elapsed = 1;
  world.pickups = [{ pickupId: "once", tokenId: "A", kind: "fish" }];
  const first = canvasProbe(); paintSharkWorld(first.context, world, 800, 600);
  const again = canvasProbe(); paintSharkWorld(again.context, world, 800, 600);
  assert.deepEqual(first.calls, again.calls, "a repaint does not replay the same pickup event");
});

test("all ocean and endless cosmic stages have finite, balanced geometry", () => {
  for (const stage of sharkStages) {
    const world = createSharkWorld(createSharkProgress(), 105); world.foods = []; world.total = stage.at; world.stageIndex = sharkStages.indexOf(stage); world.elapsed = 2;
    const probe = canvasProbe(); paintSharkWorld(probe.context, world, 768, 900);
    assert.equal(probe.stack.length, 0); assert.ok(probe.calls.length < 10000);
  }
  const world = createSharkWorld(createSharkProgress(), 106); world.total = 244 + 56 * 30;
  const probe = canvasProbe(); paintSharkWorld(probe.context, world, 1024, 500, { reducedMotion: true });
  assert.equal(probe.stack.length, 0);
});
