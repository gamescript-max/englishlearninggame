import assert from "node:assert/strict";
import test from "node:test";
import { paintOceanScenery, type OceanSceneryOptions } from "../components/ocean-scenery";
import type { OceanSceneryImages } from "../components/ocean-scenery-sprites";
import { getVisibleOceanScenery, MAX_VISIBLE_OCEAN_PATCHES } from "../lib/ocean-scenery-layout";

type Matrix = [number, number, number, number, number, number];
type Draw = { args: unknown[]; matrix: Matrix };
const identity = (): Matrix => [1, 0, 0, 1, 0, 0];
const images: OceanSceneryImages = { sprites: [480, 960, 260, 480].map((w, index) => ({ image: { id: `reef-${index}` } as unknown as CanvasImageSource, w, h: 400 })) };

function sceneryProbe() {
  const calls: { method: string; args: unknown[] }[] = [], draws: Draw[] = [];
  const stack: { alpha: number; matrix: Matrix }[] = [];
  let matrix = identity();
  const context = { globalAlpha: .6 } as CanvasRenderingContext2D;
  const multiply = (next: Matrix) => {
    const [a, b, c, d, e, f] = matrix, [g, h, i, j, k, l] = next;
    matrix = [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
  };
  for (const method of ["beginPath", "closePath", "fill", "stroke", "fillRect", "moveTo", "lineTo", "ellipse", "bezierCurveTo", "quadraticCurveTo", "rect", "clip"] as const) {
    Object.assign(context, { [method]: (...args: unknown[]) => calls.push({ method, args }) });
  }
  context.save = () => { stack.push({ alpha: context.globalAlpha, matrix: [...matrix] }); };
  context.restore = () => { const state = stack.pop()!; context.globalAlpha = state.alpha; matrix = state.matrix; };
  context.translate = (x, y) => { calls.push({ method: "translate", args: [x, y] }); multiply([1, 0, 0, 1, x, y]); };
  context.scale = (x, y) => { calls.push({ method: "scale", args: [x, y] }); multiply([x, 0, 0, y, 0, 0]); };
  context.transform = (a, b, c, d, e, f) => { calls.push({ method: "transform", args: [a, b, c, d, e, f] }); multiply([a, b, c, d, e, f]); };
  context.drawImage = (...args: unknown[]) => { calls.push({ method: "drawImage", args }); draws.push({ args, matrix: [...matrix] }); };
  context.createLinearGradient = (...args: number[]) => {
    calls.push({ method: "gradient", args });
    return { addColorStop: (...stops: unknown[]) => calls.push({ method: "stop", args: stops }) } as CanvasGradient;
  };
  return { context, calls, draws, stack, matrix: () => matrix };
}

const scene: OceanSceneryOptions = { width: 800, height: 600, cameraX: 1700, cameraY: 1100, elapsed: 0, islands: true, scene: "adventure", images };
const close = (actual: number, expected: number, message: string) => assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} versus ${expected}`);
const point = (matrix: Matrix, x: number, y: number) => ({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] });
function bases(draws: Draw[]) {
  return draws.filter(draw => {
    const sprite = images.sprites.find(sprite => sprite.image === draw.args[0]);
    return sprite && Math.abs(Number(draw.args[2]) + Number(draw.args[4]) - sprite.h) < 1e-8;
  });
}

test("the actual canvas roots use the complete world camera projection without parallax or viewport wrapping", () => {
  for (const view of [scene, { ...scene, cameraX: scene.cameraX + 60, cameraY: scene.cameraY! + 37 }, { ...scene, zoom: .64 }, { ...scene, width: 390, height: 844, zoom: .5 }]) {
    const probe = sceneryProbe();
    paintOceanScenery(probe.context, view);
    const patches = getVisibleOceanScenery({ ...view, scene: "adventure" }), roots = bases(probe.draws);
    assert.ok(patches.length > 0, "each test camera sees fixed reef roots");
    assert.equal(roots.length, patches.length, "every visible patch has one rigid base");
    for (const [index, patch] of patches.entries()) {
      const draw = roots[index], root = point(draw.matrix, Number(draw.args[5]) + Number(draw.args[7]) / 2, Number(draw.args[6]) + Number(draw.args[8]));
      close(root.x, (patch.worldX - view.cameraX) * (view.zoom ?? 1), `${patch.id} root x uses the fish camera`);
      close(root.y, (patch.worldY - view.cameraY!) * (view.zoom ?? 1), `${patch.id} root y uses the fish camera`);
      assert.equal(draw.args[0], images.sprites[patch.variant].image);
    }
    assert.deepEqual(probe.matrix(), identity(), "scenery restores the caller's transform");
    assert.equal(probe.context.globalAlpha, .6, "scenery restores the caller's alpha");
    assert.equal(probe.stack.length, 0);
  }
});

test("only the upper image strips sway while the seabed crop remains fixed, and pause or reduced motion freezes poses", () => {
  const options = Object.freeze({ ...scene }), first = sceneryProbe(), paused = sceneryProbe(), later = sceneryProbe();
  paintOceanScenery(first.context, options); paintOceanScenery(paused.context, options);
  paintOceanScenery(later.context, { ...options, elapsed: 1.7 });
  assert.deepEqual(first.calls, paused.calls, "identical simulation time freezes the actual canvas calls");
  assert.deepEqual(first.draws, paused.draws);
  assert.deepEqual(bases(first.draws), bases(later.draws), "the complete bottom crop stays in exactly the same position");
  const upper = (draws: Draw[]) => { const rigid = bases(draws); return draws.filter(draw => !rigid.includes(draw)); };
  assert.ok(upper(first.draws).length > bases(first.draws).length, "plant leaves use several image strips");
  assert.notDeepEqual(upper(first.draws), upper(later.draws), "the upper leaf transforms visibly respond to the current");
  const reduced = sceneryProbe(), reducedLater = sceneryProbe();
  paintOceanScenery(reduced.context, { ...options, reducedMotion: true });
  paintOceanScenery(reducedLater.context, { ...options, elapsed: 999, reducedMotion: true });
  assert.deepEqual(reducedLater.calls, reduced.calls);
  assert.equal(reduced.draws.length, getVisibleOceanScenery({ ...options, scene: "adventure" }).length, "reduced motion draws one original image per fixed patch");
});

test("moving leaf strips join each other and the rigid base without texture steps", () => {
  const probe = sceneryProbe();
  paintOceanScenery(probe.context, { ...scene, elapsed: 2.1 });
  const rigid = bases(probe.draws);
  assert.ok(rigid.length > 0);
  let start = 0;
  for (const base of rigid) {
    const end = probe.draws.indexOf(base), plant = probe.draws.slice(start, end + 1);
    for (const [index, draw] of plant.entries()) {
      const sprite = images.sprites.find(sprite => sprite.image === draw.args[0])!;
      assert.ok(Number(draw.args[1]) >= 0 && Number(draw.args[2]) >= 0);
      assert.ok(Number(draw.args[3]) > 0 && Number(draw.args[4]) > 0);
      assert.ok(Number(draw.args[1]) + Number(draw.args[3]) <= sprite.w + 1e-8);
      assert.ok(Number(draw.args[2]) + Number(draw.args[4]) <= sprite.h + 1e-8);
      close(Number(draw.args[7]) / Number(draw.args[3]), Number(draw.args[8]) / Number(draw.args[4]), "wide and narrow source textures keep their natural aspect in every moving strip");
      const next = plant[index + 1];
      if (!next) continue;
      close(Number(draw.args[2]) + Number(draw.args[4]), Number(next.args[2]), "neighbouring strips share their original image edge");
      for (const side of [0, 1]) {
        const bottom = point(draw.matrix, Number(draw.args[5]) + side * Number(draw.args[7]), Number(draw.args[6]) + Number(draw.args[8]));
        const top = point(next.matrix, Number(next.args[5]) + side * Number(next.args[7]), Number(next.args[6]));
        close(bottom.x, top.x, "adjacent texture strips share the same rendered horizontal edge");
        close(bottom.y, top.y, "adjacent texture strips share the same rendered vertical edge");
      }
    }
    start = end + 1;
  }
});

test("scenery clips textures to the water and has a fixed draw budget across large viewports", () => {
  for (const width of [800, 2560, 25600]) {
    const probe = sceneryProbe();
    paintOceanScenery(probe.context, { ...scene, width });
    assert.ok(probe.draws.length <= MAX_VISIBLE_OCEAN_PATCHES * 11, "fourteen patches with ten moving strips and one base cap texture work");
    assert.ok(probe.calls.length < 1500, "the texture pass leaves a bounded draw budget for animated fish");
    for (const call of probe.calls) for (const value of call.args) if (typeof value === "number") assert.ok(Number.isFinite(value));
  }
  const phone = sceneryProbe(), horizon = 337;
  paintOceanScenery(phone.context, { ...scene, scene: "shark", width: 390, height: 844, cameraX: 1400, cameraY: 400 - horizon, surfaceY: horizon, islands: false });
  assert.ok(phone.draws.length > 0, "the phone keeps actual reef textures visible");
  assert.ok(phone.calls.some(call => call.method === "rect" && call.args[0] === 0 && call.args[1] === horizon && call.args[2] === 390 && call.args[3] === 844 - horizon), "a water clip prevents plants from crossing the sky boundary");
  assert.ok(phone.calls.some(call => call.method === "clip"));
  const empty = sceneryProbe();
  paintOceanScenery(empty.context, { ...scene, width: 0 });
  paintOceanScenery(empty.context, { ...scene, surfaceY: scene.height });
  assert.equal(empty.calls.length, 0, "no water or zero viewport needs no scenery work");
});

test("missing optional scenery textures preserve compatibility without substitute cartoon plants", () => {
  const probe = sceneryProbe();
  paintOceanScenery(probe.context, { ...scene, images: undefined });
  assert.equal(probe.draws.length, 0);
  assert.ok(probe.calls.some(call => call.method === "gradient"), "ambient water still paints while assets are unavailable");
  assert.equal(probe.calls.filter(call => call.method === "bezierCurveTo" || call.method === "quadraticCurveTo").length, 0, "missing assets do not restore artificial ribbon plants");
});
