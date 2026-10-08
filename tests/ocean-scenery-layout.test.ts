import assert from "node:assert/strict";
import test from "node:test";
import {
  ADVENTURE_SCENERY_BOUNDS,
  getOceanSceneryPatches,
  getVisibleOceanScenery,
  MAX_VISIBLE_OCEAN_PATCHES,
  SHARK_SCENERY_FLOOR_Y,
  type OceanSceneryView,
} from "../lib/ocean-scenery-layout";
import { SHARK_SURFACE_Y, SHARK_WORLD_WIDTH } from "../lib/shark-engine";
import { cameraForWorld, createAdventureWorld } from "../lib/adventure-engine";

const camera: OceanSceneryView = { scene: "adventure", width: 1000, height: 800, cameraX: 1500, cameraY: 900, zoom: .75 };
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);

test("both camera axes subtract their full distance from a stationary reef root", () => {
  for (const scene of ["adventure", "shark"] as const) {
    const view = { ...camera, scene, cameraY: scene === "shark" ? 100 : camera.cameraY };
    const first = getVisibleOceanScenery(view);
    const moved = getVisibleOceanScenery({ ...view, cameraX: view.cameraX + 100, cameraY: view.cameraY! + 100 });
    const shared = first.filter(a => moved.some(b => b.id === a.id && b.repeatedWorldX === a.repeatedWorldX));
    assert.ok(shared.length > 0, `${scene} needs actual shared visible patches`);
    for (const a of shared) {
      const b = moved.find(b => b.id === a.id && b.repeatedWorldX === a.repeatedWorldX)!;
      close(b.x - a.x, -100 * view.zoom!);
      close(b.y - a.y, -100 * view.zoom!);
      assert.deepEqual([b.worldX, b.worldY, b.worldWidth, b.worldHeight], [a.worldX, a.worldY, a.worldWidth, a.worldHeight]);
    }
  }
});

test("passing a finite map reef removes it; returning restores the same root and pose", () => {
  const first = getVisibleOceanScenery(camera);
  assert.ok(first.length > 0);
  const passed = getVisibleOceanScenery({ ...camera, cameraX: ADVENTURE_SCENERY_BOUNDS.width + 500 });
  assert.equal(passed.length, 0, "finite scenery cannot respawn at the new screen edge");
  assert.deepEqual(getVisibleOceanScenery(camera), first);
  const withTime = { ...camera, elapsed: 1234 };
  assert.deepEqual(getVisibleOceanScenery(withTime), first, "simulation time never translates roots");
});

test("canvas dimensions affect culling only; orientation cannot resize or relocate roots", () => {
  for (const scene of ["adventure", "shark"] as const) {
    const view = { ...camera, scene, cameraY: scene === "shark" ? 100 : camera.cameraY };
    const first = getVisibleOceanScenery(view);
    let comparisons = 0;
    for (const [width, height] of [[390, 844], [844, 390], [1200, 1000]]) {
      const resized = getVisibleOceanScenery({ ...view, width, height });
      for (const a of first) {
        const b = resized.find(patch => patch.id === a.id && patch.repeatedWorldX === a.repeatedWorldX);
        if (!b) continue;
        comparisons++;
        assert.deepEqual([b.x, b.y, b.width, b.height], [a.x, a.y, a.width, a.height]);
      }
    }
    assert.ok(comparisons > 0, `${scene} resizes must compare real shared patches`);
    assert.deepEqual(getOceanSceneryPatches(scene), getOceanSceneryPatches(scene));
  }
});

test("the starting ocean has visible fixed plants on both phone and tablet", () => {
  const world = createAdventureWorld("fish");
  for (const [width, height] of [[390, 844], [1024, 768], [1366, 1024]]) {
    const camera = cameraForWorld(world, width, height);
    const visible = getVisibleOceanScenery({ scene: "adventure", width, height, cameraX: camera.x, cameraY: camera.y, zoom: camera.zoom });
    assert.ok(visible.filter(patch => patch.top >= 0 && patch.top < height && patch.x > 0 && patch.x < width).length >= 2);
    assert.ok(visible.every(patch => patch.variant >= 0 && patch.variant < 4));
  }
  assert.ok(getOceanSceneryPatches("shark").filter(patch => patch.worldY <= SHARK_SURFACE_Y + 430).length >= 8,
    "raised shoals remain visible in shallower phone water without moving the floor");
});

test("zoom scales the actual world projection and preserves the same world root", () => {
  const first = getVisibleOceanScenery({ ...camera, zoom: 1 });
  const zoomed = getVisibleOceanScenery({ ...camera, zoom: .5 });
  const shared = first.filter(a => zoomed.some(b => b.id === a.id));
  assert.ok(shared.length > 0);
  for (const a of shared) {
    const b = zoomed.find(patch => patch.id === a.id)!;
    assert.deepEqual([b.worldX, b.worldY, b.worldWidth, b.worldHeight], [a.worldX, a.worldY, a.worldWidth, a.worldHeight]);
    close(b.x, a.x * .5); close(b.y, a.y * .5);
    close(b.width, a.width * .5); close(b.height, a.height * .5);
  }
});

test("Shark wraps at its fixed world seam, preserving its underwater shoals", () => {
  const view: OceanSceneryView = { scene: "shark", width: 900, height: 600, cameraX: SHARK_WORLD_WIDTH - 400, cameraY: 160, surfaceY: 240 };
  const first = getVisibleOceanScenery(view);
  const lap = getVisibleOceanScenery({ ...view, cameraX: view.cameraX + SHARK_WORLD_WIDTH });
  assert.ok(first.length > 0);
  assert.deepEqual(lap.map(p => [p.id, p.x, p.y, p.width, p.height]), first.map(p => [p.id, p.x, p.y, p.width, p.height]));
  for (const patch of getOceanSceneryPatches("shark")) {
    assert.ok(patch.worldX >= 0 && patch.worldX < SHARK_WORLD_WIDTH);
    assert.ok(patch.worldY >= SHARK_SURFACE_Y + 200 && patch.worldY <= SHARK_SCENERY_FLOOR_Y);
    assert.ok(patch.worldY - patch.worldHeight > SHARK_SURFACE_Y, "the entire fixed plant remains underwater");
  }
  const waterOnly = getVisibleOceanScenery({ ...view, surfaceY: 550 });
  assert.ok(waterOnly.every(patch => patch.bottom > 550), "surface clipping cannot retain wholly hidden patches");
});

test("sprite bounds cull invisible patches and every viewport keeps the tablet draw cap", () => {
  let largest = 0;
  for (const scene of ["adventure", "shark"] as const) {
    for (const [width, height, zoom] of [[390, 844, 1], [1366, 1024, .75], [25600, 16000, .01]]) {
      const view = { ...camera, scene, width, height, zoom, cameraX: 0, cameraY: 0, surfaceY: scene === "shark" ? 100 : 0 };
      const patches = getVisibleOceanScenery(view);
      largest = Math.max(largest, patches.length);
      assert.ok(patches.length <= MAX_VISIBLE_OCEAN_PATCHES);
      assert.ok(patches.every(patch => patch.right > 0 && patch.left < width && patch.bottom > view.surfaceY && patch.top < height));
      assert.ok(patches.every(patch => Object.values(patch).filter(value => typeof value === "number").every(Number.isFinite)));
    }
  }
  assert.equal(largest, MAX_VISIBLE_OCEAN_PATCHES, "the budget test exercises an actually crowded view");
  for (const invalid of [{ width: 0 }, { height: NaN }, { zoom: 0 }, { cameraX: Infinity }, { surfaceY: camera.height }]) {
    assert.deepEqual(getVisibleOceanScenery({ ...camera, ...invalid }), []);
  }
});
