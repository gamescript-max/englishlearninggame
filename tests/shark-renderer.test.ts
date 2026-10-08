import assert from "node:assert/strict";
import test from "node:test";
import { drawSharkPortrait, paintSharkWorld, type SharkHudRect } from "../components/shark-renderer";
import { createSharkWorld, ensureSharkViewport, SHARK_SURFACE_Y, sharkCamera, sharkSurfaceScreenY, sharkWorldToScreen, type SharkFood } from "../lib/shark-engine";
import { createSharkProgress } from "../lib/shark-progress";
import { getSharkToken, sharkStages, type SharkFoodKind } from "../lib/shark-content";
import { naturalOceanArt } from "../lib/natural-ocean-art";
import { drawNaturalSwimmer, SHARK_ART_INDEX, SHARK_PREY_ART, type SharkImages } from "../components/shark-sprites";

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
      if (property === "drawImage") return (source: unknown, ...args: number[]) => { assert.ok(source); assert.ok(args.every(Number.isFinite)); assert.ok(args[2] > 0 && args[3] > 0, "texture crop has positive dimensions"); calls.push(["drawImage", source, ...args]); };
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
function croppedImages(): SharkImages {
  return { sprites: new Map([SHARK_ART_INDEX, ...SHARK_PREY_ART].map(index => {
    const art = naturalOceanArt(index);
    return [index, { image: { width: art.w, height: art.h } as unknown as CanvasImageSource, w: art.w, h: art.h, species: art.id ?? "sardine" }];
  })) };
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

test("every fallback silhouette paints without accumulating transforms and offscreen food is culled", () => {
  const world = createSharkWorld(createSharkProgress(), 102);
  world.total = 96; world.stageIndex = 6; // Mixed fantasy objects use the cosmic, vertically wrapping camera.
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

test("sentence viewport paints three edible targets and one larger target, without edge label leaks", () => {
  const world = createSharkWorld(createSharkProgress(), 108);
  world.total = 46; world.stageIndex = 3; world.player.size = 50;
  world.foods.forEach(item => { item.tokenId = "sentence-like-read"; });
  ensureSharkViewport(world, 390, 844);
  const selected = new Set(world.nearbyFoodIds);
  assert.equal(world.foods.filter(item => selected.has(item.id) && item.edible).length, 3);
  assert.equal(world.foods.filter(item => selected.has(item.id) && !item.edible).length, 1);
  // A parked silhouette can overlap the canvas edge after a camera or size change;
  // its explicit population ID still decides whether it is visible and collectible.
  world.foods.filter(item => !selected.has(item.id)).forEach((item, index) => { item.x = world.player.x + 193; item.y = world.player.y + index * 15; });
  const probe = canvasProbe(); paintSharkWorld(probe.context, world, 390, 844, { reducedMotion: true });
  const english = probe.text.filter(item => item.value !== "YOU · 鲨鲨");
  assert.equal(english.length, 8, "four targets paint two complete English lines each");
  assert.equal(english.filter(item => item.value === "I like").length, 4);
  assert.equal(english.filter(item => item.value === "to read.").length, 4);
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

test("natural animal textures swim and bite through bounded crops while the head stays rigid", () => {
  const images = croppedImages(), sprite = images.sprites.get(SHARK_ART_INDEX)!;
  const first = canvasProbe(), later = canvasProbe(), biting = canvasProbe();
  drawNaturalSwimmer(first.context, sprite, 150, 180, 110, .2, 0, .9, false, 0, true);
  drawNaturalSwimmer(later.context, sprite, 150, 180, 110, .2, .17, .9, false, 0, true);
  drawNaturalSwimmer(biting.context, sprite, 150, 180, 110, .2, .17, .9, false, 1, true);
  assert.notDeepEqual(first.calls.filter(call => call[0] === "transform"), later.calls.filter(call => call[0] === "transform"), "tail and fin texture cells bend with swimming");
  const draws = (probe: ReturnType<typeof canvasProbe>) => probe.calls.filter(call => call[0] === "drawImage");
  assert.deepEqual(draws(first).at(-1), draws(later).at(-1), "swimming keeps the original eye and snout in a rigid head crop");
  assert.ok(biting.calls.filter(call => call[0] === "rotate").length > later.calls.filter(call => call[0] === "rotate").length, "the source lower jaw rotates at its hinge");
  for (const probe of [first, later, biting]) {
    assert.ok(draws(probe).length <= 75, "the player's mesh has a fixed texture budget");
    for (const call of draws(probe)) {
      const [, , x, y, w, h] = call as [string, unknown, number, number, number, number];
      assert.ok(x >= 0 && y >= 0 && x + w <= sprite.w + .001 && y + h <= sprite.h + .001, "no mesh cell reads outside its compact crop");
    }
    assert.equal(probe.stack.length, 0);
  }
  const still = canvasProbe(), frozen = canvasProbe();
  drawNaturalSwimmer(still.context, sprite, 150, 180, 110, .2, 0, .9, true, .18, true);
  drawNaturalSwimmer(frozen.context, sprite, 150, 180, 110, .2, 18, .9, true, .18, true);
  assert.deepEqual(still.calls, frozen.calls, "reduced-motion biting does not reactivate tail or fin animation");
});

test("the natural image path preserves label hits, readability, and simulation state", () => {
  const world = createSharkWorld(createSharkProgress(), 110); ensureSharkViewport(world, 390, 844);
  world.foods = Array.from({ length: 5 }, (_, index) => food("fish", String.fromCharCode(65 + index), world.player.x + (index % 3 - 1) * 110, SHARK_SURFACE_Y + 70 + Math.floor(index / 3) * 110, index));
  world.nearbyFoodIds = world.foods.map(item => item.id);
  const images = croppedImages(), before = JSON.stringify(world), probe = canvasProbe();
  const labels = paintSharkWorld(probe.context, world, 390, 844, { images });
  assert.equal(JSON.stringify(world), before);
  assert.equal(labels.length, 5);
  assert.ok(probe.calls.filter(call => call[0] === "drawImage").length <= 400, "five prey and a shark use compact cached textures");
  for (const label of labels) assert.ok(probe.calls.some(call => call[0] === "roundRect" && call[1] === label.x && call[2] === label.y && call[3] === label.w && call[4] === label.h));
  assert.equal(probe.stack.length, 0);
});

test("all sea stages share a visible surface and the player physically projects into sky during a jump", () => {
  for (const [width, height] of [[390, 844], [1024, 500]]) {
    const world = createSharkWorld(createSharkProgress(), 111); world.foods = []; ensureSharkViewport(world, width, height);
    const horizon = sharkSurfaceScreenY(height), images = croppedImages();
    for (const stage of sharkStages.slice(0, 6)) {
      world.total = stage.at; world.stageIndex = sharkStages.indexOf(stage);
      const probe = canvasProbe(); paintSharkWorld(probe.context, world, width, height, { images, reducedMotion: true });
      assert.ok(probe.calls.some(call => call[0] === "fillRect" && call[1] === 0 && call[2] === 0 && call[3] === width && call[4] === horizon + 5), "each ocean stage paints an actual sky region");
      assert.equal(probe.stack.length, 0);
    }
    world.total = 0; world.stageIndex = 0; world.player.y = SHARK_SURFACE_Y - 80; world.jump.phase = "air";
    const expected = sharkWorldToScreen(world.player, sharkCamera(world, width, height)), airborne = canvasProbe();
    paintSharkWorld(airborne.context, world, width, height, { images, reducedMotion: true });
    assert.ok(expected.y < horizon);
    assert.ok(airborne.calls.some(call => call[0] === "translate" && call[1] === expected.x && call[2] === expected.y), "physical player Y controls the shark, including above-water flight");
    assert.ok(airborne.calls.some(call => call[0] === "ellipse" && call[1] === expected.x && call[2] === horizon + 5), "airborne shadow stays on the water plane");
    world.foods = [food("fish", "A", world.player.x + 100, SHARK_SURFACE_Y - 30)];
    const noSkyFish = canvasProbe(); assert.deepEqual(paintSharkWorld(noSkyFish.context, world, width, height, { images }), [], "prey never appears as a fish in the sky");
    world.jump.phase = "cooldown"; world.jump.splashTimer = .3; world.jump.splashX = world.player.x - 37;
    const splash = canvasProbe(); paintSharkWorld(splash.context, world, width, height, { images });
    assert.ok(splash.calls.some(call => call[0] === "ellipse" && Number(call[2]) < horizon && Number(call[3]) <= 2.5), "landing spray rises from the sea plane");
    assert.equal(splash.stack.length, 0);
  }
});

test("portrait fish badges stay near their bodies in clear water and HUD-covered fish have no label hit area", () => {
  const width = 390, height = 844, world = createSharkWorld(createSharkProgress(), 112);
  ensureSharkViewport(world, width, height); world.player.y = SHARK_SURFACE_Y - 80; world.jump.phase = "air";
  const camera = sharkCamera(world, width, height), horizon = sharkSurfaceScreenY(height);
  const hudRects: SharkHudRect[] = [
    { x: 10, y: 12, w: 56, h: 56 }, { x: 200, y: 12, w: 180, h: 56 },
    { x: 20, y: 82, w: 350, h: 96 }, { x: 20, y: 550, w: 350, h: 93 },
    { x: 16, y: 651, w: 140, h: 64 }, { x: 16, y: 734, w: 150, h: 85 },
    { x: 204, y: 655, w: 174, h: 174 },
  ];
  const placements = [{ x: 100, y: 420 }, { x: 280, y: 485 }, { x: 230, y: 535 }, { x: 100, y: 590 }, { x: 278, y: 760 }];
  world.foods = placements.map((point, index) => food("fish", index === 1 ? "cat" : String.fromCharCode(65 + index), camera.x + point.x, camera.y + point.y, index));
  world.nearbyFoodIds = world.foods.map(item => item.id);
  const probe = canvasProbe(), labels = paintSharkWorld(probe.context, world, width, height, { images: croppedImages(), hudRects, reducedMotion: true });
  assert.equal(labels.length, 3, "three fish in clear water keep their English; the two covered bodies produce no distant badge");
  assert.ok(labels.some(label => label.foodId === "test-0") && labels.some(label => label.foodId === "test-1"));
  assert.ok(!labels.some(label => label.foodId === "test-3" || label.foodId === "test-4"));
  assert.ok(probe.text.some(item => item.value === "cat"), "an unobstructed word keeps its complete readable English");
  assert.ok(!probe.text.some(item => item.value === "D" || item.value === "E"), "covered targets produce neither distant text nor a hit area");
  for (const label of labels) {
    assert.ok(label.y >= horizon + 8, "the entire fish badge remains under the waterline");
    const point = sharkWorldToScreen(world.foods.find(item => item.id === label.foodId)!, camera);
    assert.ok(Math.hypot(label.x + label.w / 2 - point.x, label.y + label.h / 2 - point.y) <= 100, "badges stay locally associated with their fish");
    for (const hud of hudRects) assert.ok(label.x + label.w <= hud.x || hud.x + hud.w <= label.x || label.y + label.h <= hud.y || hud.y + hud.h <= label.y);
  }
  world.foods = [food("fish", "A", camera.x + 100, camera.y + horizon + 12)]; world.nearbyFoodIds = ["test-0"];
  const border = canvasProbe(), borderLabels = paintSharkWorld(border.context, world, width, height, { hudRects, reducedMotion: true });
  assert.equal(borderLabels.length, 1);
  assert.ok(borderLabels[0].y >= horizon + 8, "the direct letter branch also respects the waterline for a fish just below it");
  assert.equal(probe.stack.length, 0);
});

test("surface boats and islands keep complete sentence badges clear of the real short-landscape HUD", () => {
  const width = 844, height = 390, world = createSharkWorld(createSharkProgress(), 113);
  world.total = 56; world.stageIndex = 4; world.player.size = 50; ensureSharkViewport(world, width, height);
  const camera = sharkCamera(world, width, height), horizon = sharkSurfaceScreenY(height);
  const hudRects: SharkHudRect[] = [
    { x: 16, y: 16, w: 56, h: 56 }, { x: 642, y: 16, w: 186, h: 56 },
    { x: 220, y: 10, w: 404, h: 85 }, { x: 316, y: 105, w: 221, h: 58 },
    { x: 12, y: 212, w: 160, h: 59 }, { x: 12, y: 281, w: 140, h: 97 },
    { x: 215, y: 303, w: 414, h: 76 }, { x: 658, y: 206, w: 176, h: 176 },
  ];
  world.foods = [food("boat", "sentence-cold-today", camera.x + 65, SHARK_SURFACE_Y), food("island", "sentence-like-read", camera.x + 160, SHARK_SURFACE_Y, 1), food("ship", "sentence-my-book", camera.x + 570, SHARK_SURFACE_Y, 2)];
  world.nearbyFoodIds = world.foods.map(item => item.id);
  const before = JSON.stringify(world), probe = canvasProbe(), labels = paintSharkWorld(probe.context, world, width, height, { hudRects, reducedMotion: true });
  assert.ok(labels.length > 0, "surface sentences remain available when a local clear slot exists");
  assert.ok(labels.some(label => label.y < horizon), "surface-object English can still appear naturally above the sea plane");
  for (const label of labels) {
    for (const hud of hudRects) assert.ok(label.x + label.w <= hud.x || hud.x + hud.w <= label.x || label.y + label.h <= hud.y || hud.y + hud.h <= label.y, "the whole boat/island badge clears back, captions, growth and direction controls");
    const token = getSharkToken(world.foods.find(item => item.id === label.foodId)!.tokenId)!;
    const text = probe.text.filter(item => item.x >= label.x && item.x <= label.x + label.w && item.y >= label.y && item.y <= label.y + label.h && item.value !== "YOU · 鲨鲨");
    assert.equal(text.map(item => item.value).join(" "), token.en, "a visible badge retains the complete sentence");
  }
  assert.equal(JSON.stringify(world), before);
  const covered = canvasProbe();
  assert.deepEqual(paintSharkWorld(covered.context, world, width, height, { reducedMotion: true, hudRects: [{ x: 0, y: 0, w: width, h: height }] }), [], "surface labels have no hit area when every available placement is obscured");
  assert.deepEqual(covered.text.filter(item => item.value !== "YOU · 鲨鲨"), [], "an obscured surface sentence is suppressed instead of painted behind the HUD");
  assert.equal(probe.stack.length + covered.stack.length, 0);
});
