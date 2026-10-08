import test from "node:test";
import assert from "node:assert/strict";
import { advanceAdventure, createAdventureWorld, getAdventureSpeedBoost, setWorldMission, type AdventureWorld } from "../lib/adventure-engine";
import { saveAdventureGrowth } from "../lib/adventure-progress";
import { createProgress, parseBackup, serializeBackup } from "../lib/progress";

const right = { moving: true, direction: { x: 1, y: 0 } };
const gates = { answerEnabled: true, safe: true };
function card(world: AdventureWorld, randomState: number) {
  world.boostRngState = randomState;
  world.actors = [{ id: `card-${world.nextId++}`, kind: "food", card: true, wordId: "cat", radius: 10, color: "blue", heading: 0, x: world.player.x + 2, y: world.player.y }];
  return advanceAdventure(world, 1 / 120, right, gates);
}

test("both games award fifty growth per card, while snake length and repeated body pictures survive a backup", () => {
  for (const mode of ["fish", "snake"] as const) {
    const world = createAdventureWorld(mode, 19);
    card(world, 1000); card(world, 1000);
    assert.equal(world.player.xp, 100);
    assert.equal(world.player.length, mode === "snake" ? 3 : 1);
    const progress = createProgress();
    progress.adventure = saveAdventureGrowth(progress.adventure, mode, world.player.xp, world.player.collectedWords, 0, 1, world.player.length);
    const saved = parseBackup(serializeBackup(progress)).adventure.modes[mode];
    const restored = createAdventureWorld(mode, saved.seed, saved.xp, saved.bodyWords, saved.runLength);
    assert.equal(restored.player.length, mode === "snake" ? 3 : 1);
    if (mode === "snake") assert.deepEqual(restored.player.collectedWords, ["cat", "cat"]);
  }
});

test("a card can give no boost, double speed, or quadruple speed, never a multiplied stack", () => {
  const world = createAdventureWorld("fish", 19);
  card(world, 1000); assert.equal(getAdventureSpeedBoost(world).multiplier, 1);
  card(world, 0); assert.equal(getAdventureSpeedBoost(world).multiplier, 2);
  card(world, 2000); assert.equal(getAdventureSpeedBoost(world).multiplier, 4);
  card(world, 0); assert.equal(getAdventureSpeedBoost(world).multiplier, 4, "a lower boost refreshes without downgrading or stacking to eight");
  const expiry = world.speedBoost!.expiresAt;
  card(world, 1000); assert.equal(world.speedBoost!.expiresAt, expiry, "an ordinary card does not extend the boost");
  assert.ok(getAdventureSpeedBoost(world).remaining <= 6);
});

test("boost countdown freezes while paused, expires after six seconds of play, and is temporary on reload", () => {
  const world = createAdventureWorld("snake", 22);
  card(world, 2000);
  const snapshot = structuredClone(world);
  advanceAdventure(world, 30, { moving: false }, gates);
  assert.deepEqual(world, snapshot);
  for (let frame = 0; frame < 61; frame++) advanceAdventure(world, .1, right, { ...gates, cardEnabled: false });
  assert.equal(getAdventureSpeedBoost(world).multiplier, 1);
  assert.equal(world.speedBoost, null);
  const restored = createAdventureWorld("snake", 22, world.player.xp, world.player.collectedWords, world.player.length);
  assert.equal(getAdventureSpeedBoost(restored).multiplier, 1);
});

test("quadruple speed is real movement and preserves the same path at 60 and 120 fps", () => {
  for (const mode of ["fish", "snake"] as const) {
    const base = createAdventureWorld(mode, 33), sixty = structuredClone(base), oneTwenty = structuredClone(base);
    sixty.speedBoost = oneTwenty.speedBoost = { multiplier: 4, expiresAt: 6 };
    const start = base.player.x;
    for (let i = 0; i < 30; i++) advanceAdventure(base, 1 / 120, right, { ...gates, cardEnabled: false });
    for (let i = 0; i < 15; i++) advanceAdventure(sixty, 1 / 60, right, { ...gates, cardEnabled: false });
    for (let i = 0; i < 30; i++) advanceAdventure(oneTwenty, 1 / 120, right, { ...gates, cardEnabled: false });
    assert.ok(Math.abs((sixty.player.x - start) / (base.player.x - start) - 4) < 1e-7);
    assert.deepEqual(sixty, oneTwenty);
  }
});

test("fast grazing pickups use the movement segment instead of missing cards between physics positions", () => {
  for (const mode of ["fish", "snake"] as const) {
    const world = createAdventureWorld(mode, 33);
    world.speedBoost = { multiplier: 4, expiresAt: 6 }; world.boostRngState = 1000;
    const start = { x: world.player.x, y: world.player.y }, movement = mode === "fish" ? 10 : 11, reach = world.player.radius + 7;
    world.actors = [{ id: "grazing-card", kind: "food", card: true, wordId: "cat", radius: 10, color: "blue", heading: 0, x: start.x + movement / 2, y: start.y + Math.sqrt(reach * reach - 1) }];
    const actor = world.actors[0];
    assert.ok(Math.hypot(actor.x - start.x, actor.y - start.y) > reach);
    assert.ok(Math.hypot(actor.x - start.x - movement, actor.y - start.y) > reach);
    const events = advanceAdventure(world, 1 / 120, right, gates);
    assert.equal(events.filter(event => event.kind === "eat" && event.pickupId === actor.id).length, 1);
    assert.equal(world.player.xp, 50);
  }
});

test("boosted target following stays reachable; locked or wrong English cards cannot give a boost", () => {
  for (const mode of ["fish", "snake"] as const) {
    const world = createAdventureWorld(mode, 33);
    setWorldMission(world, { id: "cat", options: [{ id: "cat", wordId: "cat" }, { id: "dog", wordId: "dog" }], answer: "cat", requiredCount: 1 });
    const target = world.actors.find(actor => actor.choiceId === "cat")!;
    world.actors = [target]; target.x = world.player.x - 90; target.y = world.player.y - 65;
    world.speedBoost = { multiplier: 4, expiresAt: 6 };
    for (let frame = 0; frame < 360 && !world.missionComplete; frame++) advanceAdventure(world, 1 / 120, { moving: true, followId: target.id }, gates);
    assert.ok(world.missionComplete);
    assert.equal(world.player.xp, mode === "fish" ? 150 : 50);
    const locked = createAdventureWorld(mode, 33); locked.boostRngState = 2000;
    locked.actors = [{ id: "unheard", kind: "food", card: true, wordId: "cat", radius: 10, color: "blue", heading: 0, x: locked.player.x + 2, y: locked.player.y }];
    advanceAdventure(locked, 1 / 120, right, { ...gates, cardEnabled: false });
    assert.equal(locked.player.xp, 0); assert.equal(getAdventureSpeedBoost(locked).multiplier, 1); assert.equal(locked.boostRngState, 2000);
    setWorldMission(locked, { id: "cat", options: [{ id: "cat", wordId: "cat" }, { id: "dog", wordId: "dog" }], answer: "cat", requiredCount: 1 });
    const wrong = locked.actors.find(actor => actor.choiceId === "dog")!;
    locked.actors = [wrong]; wrong.x = locked.player.x + 2; wrong.y = locked.player.y;
    advanceAdventure(locked, 1 / 120, right, gates);
    assert.equal(locked.player.xp, 0); assert.equal(getAdventureSpeedBoost(locked).multiplier, 1); assert.equal(locked.boostRngState, 2000);
  }
});
