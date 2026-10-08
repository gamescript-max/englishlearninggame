import test from "node:test";
import assert from "node:assert/strict";
import { advanceAdventure, adventureStageThresholds, cameraForWorld, createAdventureWorld, setWorldMission, stageForXP, type AdventureActor, type AdventureEvent, type AdventureWorld, type MissionSpec } from "../lib/adventure-engine";
import { adventureVocabulary, getOceanSpecies, oceanEvolution, oceanSizeLevel, snakeBreeds } from "../lib/adventure-catalog";

const safeGates = { answerEnabled: true, safe: true };
const moveRight = { direction: { x: 1, y: 0 }, moving: true };
const blueMission: MissionSpec = { id: "blue-fish", options: [{ id: "blue", color: "blue" }, { id: "red", color: "red" }, { id: "yellow", color: "yellow" }], answer: "blue", requiredCount: 1 };
function touchesHead(world: AdventureWorld, actor: AdventureActor) { actor.x = world.player.x + 2; actor.y = world.player.y; }
function eatNormal(world: AdventureWorld, wordId?: string) {
  const food = world.actors.find(actor => actor.kind === "food" && !actor.wordId)!;
  touchesHead(world, food);
  if (wordId) food.wordId = wordId;
  return advanceAdventure(world, 1 / 60, moveRight, safeGates);
}

test("only successful fish bites start a feeding animation, including each partial counting target",()=>{
  const world=createAdventureWorld("fish",71);world.actors=[{id:"snack",kind:"food",color:"blue",x:world.player.x+2,y:world.player.y,radius:5,heading:0}];
  const events=advanceAdventure(world,1/60,moveRight,safeGates);
  assert.ok(events.some(e=>e.kind==="eat"));assert.ok(world.player.ateAt!>0&&world.elapsed-world.player.ateAt!<1/60);
  setWorldMission(world,{...blueMission,requiredCount:2});
  const right=world.actors.find(a=>a.choiceId==="blue")!;touchesHead(world,right);
  const previousBite=world.player.ateAt!;
  advanceAdventure(world,1/60,moveRight,safeGates);assert.ok(world.player.ateAt!>previousBite&&world.elapsed-world.player.ateAt!<1/60);
  const lastBite=world.player.ateAt;
  const wrong=world.actors.find(a=>a.choiceId==="red")!;touchesHead(world,wrong);
  advanceAdventure(world,1/60,moveRight,safeGates);assert.equal(world.player.ateAt,lastBite);
  const snake=createAdventureWorld("snake",71);eatNormal(snake);assert.equal(snake.player.ateAt,undefined);
});

test("a fresh snake has one segment, fourteen computer snakes, and grows once per snack", () => {
  const world = createAdventureWorld("snake", 71);
  assert.equal(world.player.body.length, 1);
  assert.equal(world.player.length, 1);
  assert.equal(world.actors.filter(actor => actor.kind === "bot").length, 14);
  assert.ok(world.actors.filter(actor => actor.kind === "bot").every(actor => (actor.body?.length ?? 0) >= 3));
  const events = eatNormal(world, "cat");
  assert.equal(events.filter(event => event.kind === "eat").length, 1);
  assert.equal(events.filter(event => event.kind === "mission").length, 0, "ordinary snacks never answer an English question");
  assert.equal(world.player.xp, 50);
  assert.equal(world.player.body.length, 2);
  eatNormal(world, "dog");
  assert.equal(world.player.body.length, 3);
  assert.deepEqual(world.player.collectedWords, ["dog", "cat"], "recent word pictures stay nearest the head");
});

test("fixed physics gives the same path at 60 and 120 fps, while turns remain continuous", () => {
  const sixty = createAdventureWorld("snake", 16), oneTwenty = createAdventureWorld("snake", 16);
  const input = { direction: { x: 0, y: 1 }, moving: true };
  advanceAdventure(sixty, 1 / 60, input, safeGates);
  assert.ok(sixty.player.heading > 0 && sixty.player.heading < Math.PI / 2, "no instant right-angle grid turn");
  for (let index = 1; index < 120; index++) advanceAdventure(sixty, 1 / 60, input, safeGates);
  for (let index = 0; index < 240; index++) advanceAdventure(oneTwenty, 1 / 120, input, safeGates);
  assert.ok(Math.abs(sixty.player.x - oneTwenty.player.x) < 1e-7);
  assert.ok(Math.abs(sixty.player.y - oneTwenty.player.y) < 1e-7);
  assert.deepEqual(sixty.actors, oneTwenty.actors, "bot movement and food refresh are independent of render rate");
});

test("large fish forms require many snacks and saved growth resumes without dominating the view", () => {
  assert.equal(stageForXP(19), 0); assert.equal(stageForXP(20), 1);
  assert.equal(stageForXP(49), 1); assert.equal(stageForXP(50), 2);
  assert.equal(stageForXP(94), 2); assert.equal(stageForXP(95), 3);
  assert.equal(stageForXP(159), 3); assert.equal(stageForXP(160), 4);
  assert.equal(stageForXP(249), 4); assert.equal(stageForXP(250), 5);
  const world = createAdventureWorld("fish", 38, 19);
  const initialRadius = world.player.radius;
  eatNormal(world);
  assert.equal(world.player.stage, 1);
  assert.ok(world.player.radius > initialRadius);
  const grown = createAdventureWorld("fish", 38, 20000, ["fish", "blue"]);
  assert.equal(grown.player.stage, 21);
  assert.ok(grown.player.radius < 130);
  assert.deepEqual(grown.player.collectedWords, ["fish", "blue"]);
  assert.equal(stageForXP(Number.NaN), 0);
});

test("speech permits continuous motion but does not consume task fish or count answers", () => {
  const world = createAdventureWorld("fish", 4);
  setWorldMission(world, blueMission);
  const target = world.actors.find(actor => actor.choiceId === "blue")!;
  touchesHead(world, target);
  const initialX = world.player.x;
  const spoken = advanceAdventure(world, 1 / 60, moveRight, { answerEnabled: false, safe: true });
  assert.ok(world.player.x > initialX);
  assert.equal(spoken.filter(event => event.kind === "mission").length, 0);
  assert.equal(world.missionProgress, 0);
  assert.ok(world.actors.some(actor => actor.id === target.id));
  const answered = advanceAdventure(world, 1 / 60, moveRight, safeGates);
  assert.deepEqual(answered.filter(event => event.kind === "mission"), [{ kind: "mission", taskId: "blue-fish", choiceId: "blue", complete: true }]);
  assert.equal(advanceAdventure(world, 1 / 60, moveRight, safeGates).filter(event => event.kind === "mission").length, 0);
});

test("counting needs distinct correct fish, emits once per entity, and resets cleanly for retry", () => {
  const world = createAdventureWorld("fish", 42);
  setWorldMission(world, { ...blueMission, requiredCount: 2 });
  const targets = world.actors.filter(actor => actor.choiceId === "blue");
  assert.equal(targets.length, 6, "three dispersed copies of each counting target");
  assert.notEqual(targets[0].id, targets[1].id);
  touchesHead(world, targets[0]);
  const first = advanceAdventure(world, 1 / 60, moveRight, safeGates).filter(event => event.kind === "mission");
  assert.equal(first.length, 1); assert.equal(first[0].complete, false);
  assert.equal(world.missionProgress, 1);
  assert.equal(advanceAdventure(world, 1 / 60, moveRight, safeGates).filter(event => event.kind === "mission").length, 0);
  touchesHead(world, targets[1]);
  const second = advanceAdventure(world, 1 / 60, moveRight, safeGates).filter(event => event.kind === "mission");
  assert.equal(second.length, 1); assert.equal(second[0].complete, true);
  assert.equal(world.missionProgress, 2);
  assert.equal(world.actors.filter(actor => actor.kind === "mission").length, 0);
  setWorldMission(world, { ...blueMission, requiredCount: 2 });
  assert.equal(world.missionProgress, 0);
  assert.deepEqual(world.missionCollectedIds, []);
  const wrong = world.actors.find(actor => actor.choiceId === "yellow")!;
  touchesHead(world, wrong);
  const mistake = advanceAdventure(world, 1 / 60, moveRight, safeGates).filter(event => event.kind === "mission");
  assert.deepEqual(mistake, [{ kind: "mission", taskId: "blue-fish", choiceId: "yellow", complete: false }]);
  assert.equal(world.missionProgress, 0);
  assert.equal(world.player.xp, 100, "wrong task choices do not award growth");
});

test("word-card targets add a visible body picture without duplicating an ordinary eat event", () => {
  const world = createAdventureWorld("snake", 82);
  setWorldMission(world, { id: "cat-card", options: [{ id: "cat", wordId: "cat" }, { id: "dog", wordId: "dog" }, { id: "bird", wordId: "bird" }], answer: "cat", requiredCount: 1 });
  const target=world.actors.find(actor => actor.choiceId === "cat")!;
  touchesHead(world, target);
  const events = advanceAdventure(world, 1 / 60, moveRight, safeGates);
  assert.deepEqual(events, [{ kind: "mission", taskId: "cat-card", choiceId: "cat", complete: true, wordId: "cat", pickupId:target.id }]);
  assert.equal(world.player.body.length, 2);
  assert.deepEqual(world.player.collectedWords, ["cat"]);
});

test("missions stay nearby and reachable at map edges; bots consume snacks but never task fish", () => {
  for (const mode of ["fish", "snake"] as const) {
    const world = createAdventureWorld(mode, 36);
    world.player.x = 35; world.player.y = 35;
    setWorldMission(world, { ...blueMission, options: blueMission.options.map(option => ({ ...option, size: "big" })) });
    const missions = world.actors.filter(actor => actor.kind === "mission");
    assert.ok(missions.every(actor => actor.x >= actor.radius && actor.x <= world.width - actor.radius && actor.y >= actor.radius && actor.y <= world.height - actor.radius));
    assert.equal(missions.length, 9);
    for (const option of blueMission.options) assert.ok(missions.some(actor => actor.choiceId === option.id && Math.hypot(actor.x - world.player.x, actor.y - world.player.y) < 350), "each option has a reachable nearby copy");
    assert.ok(missions.some(actor => Math.hypot(actor.x - world.player.x, actor.y - world.player.y) > 900), "the world also has dispersed copies");
    const target = missions.find(actor => actor.choiceId === "blue")!;
    const bot = world.actors.find(actor => actor.kind === "bot")!;
    bot.x = target.x; bot.y = target.y;
    advanceAdventure(world, 1 / 60, moveRight, { answerEnabled: false, safe: true });
    assert.ok(world.actors.some(actor => actor.id === target.id), "the bot cannot eat an English target");
    const events: AdventureEvent[] = [];
    for (let index = 0; index < 800 && !world.missionComplete; index++) events.push(...advanceAdventure(world, 1 / 60, { followId: target.id, moving: true }, safeGates));
    assert.ok(events.some(event => event.kind === "mission" && event.choiceId === "blue" && event.complete), "a small player can reach and collect the marked big target");
    assert.equal(world.actors.filter(actor => actor.kind === "bot").length + world.pendingRespawns.length, mode === "snake" ? 14 : 28);
  }
  const world = createAdventureWorld("snake", 27);
  const bot = world.actors.find(actor => actor.kind === "bot")!;
  const snack = world.actors.find(actor => actor.kind === "food")!;
  snack.x = bot.x; snack.y = bot.y;
  advanceAdventure(world, 1 / 60, moveRight, safeGates);
  assert.ok(!world.actors.some(actor => actor.id === snack.id), "computer snakes forage naturally");
});

test("large-fish bumps are forgiving and speech protects all saved growth", () => {
  const world = createAdventureWorld("fish", 18, 50);
  world.elapsed = 4;
  world.sessionXP = 7;
  const hazard = world.actors.find(actor => actor.kind === "hazard")!;
  hazard.radius = 90;
  world.actors = [hazard];
  touchesHead(world, hazard);
  assert.equal(advanceAdventure(world, 1 / 60, moveRight, { answerEnabled: false, safe: true }).filter(event => event.kind === "bump").length, 0);
  assert.equal(world.sessionXP, 7);
  touchesHead(world, hazard);
  const bump = advanceAdventure(world, 1 / 60, moveRight, { answerEnabled: true, safe: false });
  assert.equal(bump.filter(event => event.kind === "bump").length, 1);
  assert.equal(world.sessionXP, 5);
  assert.equal(world.player.xp, 50);
  assert.equal(world.player.stage, 2);
  assert.ok(world.protectionUntil > world.elapsed + 2.9);
  touchesHead(world, hazard);
  assert.equal(advanceAdventure(world, 1 / 60, moveRight, { answerEnabled: true, safe: false }).filter(event => event.kind === "bump").length, 0, "a collision has a grace period");
});

test("pause, long background frames, wall turns, and the camera preserve a bounded playable world", () => {
  const world = createAdventureWorld("snake", 91, 10);
  const frozen = JSON.stringify(world);
  advanceAdventure(world, 2, { moving: false }, safeGates);
  assert.equal(JSON.stringify(world), frozen);
  const shortFrame = structuredClone(world);
  advanceAdventure(shortFrame, .1, moveRight, safeGates);
  advanceAdventure(world, 60, moveRight, safeGates);
  assert.deepEqual(world, shortFrame, "returning from background simulates only a short frame, without jumping across the map");
  world.player.x = world.width - world.player.radius - 5; world.player.y = 900;
  for (let index = 0; index < 90; index++) advanceAdventure(world, 1 / 60, { moving: true }, safeGates);
  assert.ok(world.player.x < world.width - 100, "the child bounces smoothly away from an edge instead of losing");
  assert.ok(world.player.body.every(point => point.x >= 0 && point.y >= 0 && point.x <= world.width && point.y <= world.height));
  assert.ok(world.actors.every(actor => actor.x >= actor.radius && actor.y >= actor.radius && actor.x <= world.width - actor.radius && actor.y <= world.height - actor.radius));
  for (const [width, height] of [[320, 900], [390, 700], [1024, 768], [1600, 1000]]) {
    const camera = cameraForWorld(world, width, height);
    assert.ok(camera.x >= 0 && camera.y >= 0 && camera.zoom > 0);
    assert.ok(camera.x + width / camera.zoom <= world.width + 1);
    assert.ok(camera.y + height / camera.zoom <= world.height + 1);
    const headX = (world.player.x - camera.x) * camera.zoom, headY = (world.player.y - camera.y) * camera.zoom;
    assert.ok(headX >= 0 && headX <= width && headY >= 0 && headY <= height);
  }
});

test("growth at a shoreline does not leave the newly larger fish outside the map", () => {
  const world = createAdventureWorld("fish", 112, 19);
  world.player.x = world.width - world.player.radius - 4;
  const food = world.actors.find(actor => actor.kind === "food" && !actor.wordId)!;
  touchesHead(world, food);
  advanceAdventure(world, 1 / 120, { moving: true, direction: { x: 0, y: 1 } }, safeGates);
  assert.equal(world.player.stage, 1);
  assert.ok(world.player.x + world.player.radius <= world.width);
  assert.ok(world.player.y + world.player.radius <= world.height);
});

test("a big snake can swallow a shorter computer snake; one starting segment cannot", () => {
  const small = createAdventureWorld("snake", 54);
  small.elapsed = 4;
  const largeBot = small.actors.find(actor => actor.kind === "bot")!;
  touchesHead(small, largeBot);
  const tooLarge = advanceAdventure(small, 1 / 60, moveRight, { answerEnabled: true, safe: false });
  assert.equal(tooLarge.filter(event => event.kind === "death").length, 1);
  assert.ok(small.actors.some(actor => actor.id === largeBot.id));
  assert.equal(small.player.length, 1);
  const large = createAdventureWorld("snake", 54, 4);
  const shortBot = large.actors.find(actor => actor.kind === "bot" && actor.body?.length === 3)!;
  touchesHead(large, shortBot);
  const swallowed = advanceAdventure(large, 1 / 60, moveRight, safeGates);
  assert.equal(swallowed.filter(event => event.kind === "eat").length, 1);
  assert.equal(swallowed.filter(event => event.kind === "mission").length, 0);
  assert.ok(!large.actors.some(actor => actor.id === shortBot.id));
  assert.equal(large.player.length, 8, "swallowing a shorter head absorbs its three segments");
  assert.equal(large.actors.filter(actor => actor.kind === "bot").length + large.pendingRespawns.length, 14);
  assert.ok(large.pendingRespawns.some(entry => entry.slot === shortBot.spawnIndex), "replacement waits briefly before swimming in off screen");
});

test("every ocean growth form has many edible species and visibly larger neighbours", () => {
  assert.equal(adventureStageThresholds.length, 28);
  for (const seed of [1, 31, 20261005]) for (const xp of adventureStageThresholds) {
    const world = createAdventureWorld("fish", seed, xp), camera = cameraForWorld(world, 1180, 600);
    assert.equal(world.width, 4200); assert.equal(world.height, 2800);
    assert.equal(world.player.speciesId, oceanEvolution[world.player.stage].speciesId);
    assert.ok(getOceanSpecies(world.player.speciesId!)?.en);
    const visible = world.actors.filter(actor => actor.x >= camera.x && actor.x <= camera.x + 1180 / camera.zoom && actor.y >= camera.y && actor.y <= camera.y + 600 / camera.zoom);
    assert.ok(visible.filter(actor => actor.radius < world.player.radius / 1.12).length >= 10, `small prey remain available at XP ${xp}`);
    assert.ok(visible.filter(actor => actor.radius > world.player.radius * 1.12).length >= 2, `larger neighbours remain visible at XP ${xp}`);
    assert.ok(world.actors.filter(actor => actor.kind !== "mission").every(actor => actor.speciesId && getOceanSpecies(actor.speciesId)), "all ocean life is a named species");
    assert.ok(world.actors.every(actor => Math.hypot(actor.x - world.player.x, actor.y - world.player.y) >= world.player.radius + actor.radius), "safe spawn keeps heads separate");
    assert.ok(world.actors.filter(actor => !actor.wordId).every(actor => Math.abs(oceanSizeLevel(actor.speciesId!) - world.player.stage) <= 2), "only the current growth band and two adjacent bands appear");
  }
  assert.equal(stageForXP(11500, "fish"), 19);
  assert.equal(stageForXP(11500, "snake"), 5, "snake visual stage stays in its six-level artwork range");
});

test("ocean growth removes old species beyond two bands and replenishes nearby levels", () => {
  for (const threshold of adventureStageThresholds.slice(1)) {
    const world = createAdventureWorld("fish", 72, threshold - 1);
    eatNormal(world);
    assert.equal(world.player.stage, stageForXP(threshold));
    assert.ok(world.actors.filter(actor => !actor.consumed && actor.speciesId && !actor.wordId).every(actor => Math.abs(oceanSizeLevel(actor.speciesId!) - world.player.stage) <= 2));
  }
  const start = createAdventureWorld("fish", 4);
  assert.ok(start.actors.every(actor => getOceanSpecies(actor.speciesId!)!.tier <= 2), "large species are absent at the start");
});

test("both worlds have diverse English cards in several regions, without counting task answers", () => {
  for (const mode of ["fish", "snake"] as const) {
    const world = createAdventureWorld(mode, 12345), cards = world.actors.filter(actor => actor.kind === "food" && actor.wordId);
    assert.ok(cards.length >= 8 && cards.length <= (mode === "fish" ? 10 : 14), "sparse cards keep the swimming area open");
    const categories = new Set(cards.map(card => adventureVocabulary.find(word => word.id === card.wordId)?.category));
    assert.ok(categories.size >= 6, "ordinary vocabulary includes plants, toys, colours and other categories");
    assert.ok(cards.some(card => Math.hypot(card.x - world.player.x, card.y - world.player.y) < 550));
    assert.ok(cards.some(card => Math.hypot(card.x - world.player.x, card.y - world.player.y) > 1200));
    for(const card of cards) for(const other of cards) if(card.id!==other.id)assert.ok(Math.hypot(card.x-other.x,card.y-other.y)>=150,"cards have room around them");
    setWorldMission(world, blueMission);
    const card = cards[0]; touchesHead(world, card);
    const events = advanceAdventure(world, 1 / 120, moveRight, safeGates);
    assert.equal(events.filter(event => event.kind === "mission").length, 0);
    assert.equal(world.missionProgress, 0);
    assert.ok(events.some(event => event.kind === "eat" && event.wordId === card.wordId));
  }
  const snakes = createAdventureWorld("snake", 9).actors.filter(actor => actor.kind === "bot");
  assert.equal(new Set(snakes.map(snake => snake.breedId)).size, snakeBreeds.length);
});

test("computer snakes grow when they forage and keep collected word pictures", () => {
  const world = createAdventureWorld("snake", 44), bot = world.actors.find(actor => actor.kind === "bot")!, snack = world.actors.find(actor => actor.kind === "food")!;
  world.actors = [bot, snack];
  const before = bot.length!;
  snack.x = bot.x; snack.y = bot.y; snack.wordId = "tree";
  const events = advanceAdventure(world, 1 / 120, moveRight, safeGates);
  assert.equal(bot.length, before + 1); assert.equal(bot.body?.length, before + 1);
  assert.equal(bot.collectedWords?.[0], "tree");
  assert.equal(events.filter(event => event.kind === "mission").length, 0);
  assert.equal(world.player.xp, 0, "a computer's snack does not award the child XP");
});

test("sparse card replenishment cycles through all eighty words without exceeding its ordinary-card quota",()=>{
  for(const mode of ["fish","snake"] as const){const w=createAdventureWorld(mode,31),seen=new Set<string>();w.cardCursor=0;
    for(let round=0;round<16;round++){for(const a of w.actors)if(a.kind==="food")a.consumed=true;advanceAdventure(w,1/120,moveRight,safeGates);const cards=w.actors.filter(a=>a.kind==="food"&&a.wordId&&!a.remnant);assert.ok(cards.length<=(mode==="fish"?10:14));for(const a of cards)seen.add(a.wordId!);}
    assert.equal(seen.size,80,"fewer simultaneous cards cannot shrink the learning vocabulary");
  }
});

function crossingBot(world: AdventureWorld, length: number, slot = 0): AdventureActor {
  return { id: `crossing-${slot}`, kind: "bot", color: "red", breedId: snakeBreeds[slot % 8].id, x: world.player.x + 100, y: world.player.y, heading: 0, radius: 18, length, spawnIndex: slot, body: [], trail: [{ x: world.player.x + 100, y: world.player.y }, { x: world.player.x - 350, y: world.player.y }] };
}

test("a player's smaller head hitting a larger snake body dies, drops food and resumes protected", () => {
  const world = createAdventureWorld("snake", 74, 300, ["cat", "tree"], 3), large = crossingBot(world, 14);
  world.actors = [large]; world.elapsed = 4;
  world.speedBoost = { multiplier: 4, expiresAt: 10 };
  setWorldMission(world, blueMission);
  const xp = world.player.xp, stage = world.player.stage;
  const events = advanceAdventure(world, 1 / 120, moveRight, { answerEnabled: true, safe: false });
  assert.deepEqual(events.filter(event => event.kind === "death"), [{ kind: "death", source: "player" }]);
  assert.equal(world.player.length, 1); assert.equal(world.player.body.length, 1); assert.deepEqual(world.player.collectedWords, []);
  assert.equal(world.player.xp, xp); assert.equal(world.player.stage, stage);
  assert.equal(world.speedBoost, null, "a collision at four times speed clears the temporary boost for the new life");
  assert.ok(world.protectionUntil > world.elapsed + 3.9);
  const remains = world.actors.filter(actor => actor.remnant);
  assert.equal(remains.length, 3); assert.deepEqual(remains.filter(actor => actor.wordId).map(actor => actor.wordId), ["cat", "tree"]);
  assert.equal(world.missionProgress, 0);
  assert.ok(world.actors.some(actor => actor.kind === "mission"), "a death does not silently finish or discard the English task");
  const restored = createAdventureWorld("snake", 74, xp, [], world.player.length);
  assert.equal(restored.player.length, 1, "saved run length prevents lifetime XP from restoring the lost body");
  touchesHead(world, large);
  assert.equal(advanceAdventure(world, 1 / 120, moveRight, { answerEnabled: true, safe: false }).filter(event => event.kind === "death").length, 0, "respawn grants a real grace period");
});

test("voice playback protects a smaller player from lethal head/body collisions", () => {
  const world = createAdventureWorld("snake", 37, 50, ["cat"], 2);
  world.actors = [crossingBot(world, 15)]; world.elapsed = 10;
  const events = advanceAdventure(world, 1 / 120, moveRight, { answerEnabled: false, safe: true });
  assert.equal(events.filter(event => event.kind === "death").length, 0);
  assert.equal(world.player.length, 2); assert.equal(world.player.xp, 50);
});

test("smaller computer snakes die on large bodies and their remains are edible exactly once", () => {
  const world = createAdventureWorld("snake", 87), large = crossingBot(world, 18, 1), small: AdventureActor = { ...crossingBot(world, 3, 0), id: "small-victim", x: world.player.x - 20, y: world.player.y, trail: [{ x: world.player.x - 20, y: world.player.y }], collectedWords: ["tree", "cat"] };
  world.player.x -= 300; world.player.y += 250; world.actors = [large, small];
  const events = advanceAdventure(world, 1 / 120, moveRight, safeGates);
  assert.equal(events.filter(event => event.kind === "mission").length, 0);
  assert.ok(!world.actors.some(actor => actor.id === small.id));
  assert.ok(world.pendingRespawns.some(entry => entry.slot === 0 && entry.at > world.elapsed + 2));
  const remains = world.actors.filter(actor => actor.remnant); assert.equal(remains.length, 3);
  const snack = remains.find(actor => actor.wordId === "tree")!; touchesHead(world, snack);
  const first = advanceAdventure(world, 1 / 120, moveRight, safeGates);
  assert.equal(first.filter(event => event.kind === "eat" && event.wordId === "tree").length, 1);
  assert.equal(world.player.length, 2); assert.equal(world.player.collectedWords[0], "tree");
  assert.ok(!world.actors.some(actor => actor.id === snack.id));
  assert.equal(advanceAdventure(world, 1 / 120, moveRight, safeGates).filter(event => event.kind === "eat" && event.wordId === "tree").length, 0);
  for (let index = 0; index < 180; index++) advanceAdventure(world, 1 / 60, moveRight, safeGates);
  assert.ok(world.actors.some(actor => actor.kind === "bot" && actor.spawnIndex === 0 && actor.id !== small.id), "a replacement swims in after the delay");
  assert.ok(world.actors.length <= 180);
});

test("logical snake growth continues after the bounded 160-segment drawing limit", () => {
  const world = createAdventureWorld("snake", 94, 1000, ["cat"], 200);
  assert.equal(world.player.length, 200); assert.equal(world.player.body.length, 160);
  eatNormal(world, "tree");
  assert.equal(world.player.length, 201); assert.equal(world.player.body.length, 160);
  assert.equal(world.player.collectedWords[0], "tree");
});

test("a moving camera meets changing larger neighbours without fixed followers or visible respawn teleporting", () => {
  for (const xp of [0, 11500]) {
    const world = createAdventureWorld("fish", 57, xp);
    const encountered = new Set<string>();
    let largeFrames = 0;
    for (let frame = 0; frame < 2400; frame++) {
      const camera = cameraForWorld(world, 1180, 600), before = new Set(world.actors.map(actor => actor.id));
      advanceAdventure(world, 1 / 60, { moving: true, direction: { x: Math.cos(frame / 700), y: Math.sin(frame / 700) } }, safeGates);
      const visible = world.actors.filter(actor => actor.x >= camera.x && actor.x <= camera.x + 1180 / camera.zoom && actor.y >= camera.y && actor.y <= camera.y + 600 / camera.zoom);
      assert.ok(visible.filter(actor => actor.radius < world.player.radius / 1.12).length >= 6, "prey remains present while swimming across the larger map");
      const large = visible.filter(actor => actor.radius > world.player.radius * 1.12);
      for (const actor of large) encountered.add(actor.id);
      if (large.length) largeFrames++;
      assert.ok(visible.every(actor => before.has(actor.id)), "new creatures enter from outside the current view");
      assert.ok(world.actors.length <= 180);
    }
    assert.ok(largeFrames > 1200, "larger neighbours are often seen, but may swim out of sight");
    assert.ok(encountered.size >= 8, "the larger neighbours change as the child explores");
  }
});

test("all ambient fish follow their own route regardless of the player's position", () => {
  const first = createAdventureWorld("fish", 57), second = structuredClone(first);
  first.nextEcologyAt = second.nextEcologyAt = 999;
  second.player.x -= 700; second.player.y += 500;
  const before = new Map(first.actors.map(actor => [actor.id, {x:actor.x,y:actor.y}]));
  advanceAdventure(first, 1 / 120, moveRight, safeGates);
  advanceAdventure(second, 1 / 120, moveRight, safeGates);
  for (const actor of first.actors.filter(actor => actor.kind !== "mission")) {
    const other = second.actors.find(other => other.id === actor.id);
    if (!other) continue;
    assert.deepEqual([actor.x, actor.y, actor.heading], [other.x, other.y, other.heading], `${actor.id} does not steer toward a player-relative waypoint`);
  }
  const velocities = first.actors.filter(actor => actor.kind === "bot").map(actor => Math.hypot(actor.x - before.get(actor.id)!.x, actor.y - before.get(actor.id)!.y));
  assert.ok(Math.max(...velocities) - Math.min(...velocities) > .1, "fish cruise at different individual speeds");
});

test("replacement large fish enter near the viewport from outside, even with a high entity index", () => {
  const world = createAdventureWorld("fish", 61);
  world.nextEcologyAt = 0;
  cameraForWorld(world, 1180, 600);
  const oldIds = new Set(world.actors.map(actor => actor.id));
  for (const actor of world.actors.filter(actor => actor.kind === "bot" || actor.kind === "hazard")) { actor.x = 80; actor.y = 80; }
  world.nextId = 9999;
  advanceAdventure(world, 1 / 120, moveRight, safeGates);
  const fresh = world.actors.filter(actor => actor.kind === "hazard" && !oldIds.has(actor.id));
  assert.ok(fresh.length >= 4);
  const view = world.viewBounds!;
  for (const actor of fresh) {
    assert.ok(actor.x < view.left || actor.x > view.right || actor.y < view.top || actor.y > view.bottom);
    assert.ok(Math.hypot(actor.x - world.player.x, actor.y - world.player.y) < 1150);
  }
});

test("safe computer snakes are visible immediately and replacements enter outside the viewport", () => {
  for (const seed of [1, 22, 91, 20261005]) {
    const world = createAdventureWorld("snake", seed);
    const width = 1180, height = 540, camera = cameraForWorld(world, width, height);
    const nearby = world.actors.filter(actor => actor.kind === "bot" && (actor.spawnIndex ?? 5) < 2);
    assert.equal(nearby.length, 2);
    for (const actor of nearby) {
      const range = Math.hypot(actor.x - world.player.x, actor.y - world.player.y);
      assert.ok(range >= 270 && range <= 400, "a neighbour is nearby without a startup collision");
      const x = (actor.x - camera.x) * camera.zoom, y = (actor.y - camera.y) * camera.zoom;
      assert.ok(x > actor.radius && x < width - actor.radius && y > actor.radius && y < height - actor.radius, "typical landscape canvas shows both neighbours");
    }
    const originalIds = nearby.map(actor => actor.id);
    for (const actor of nearby) actor.consumed = true;
    world.player.x = world.width - world.player.radius - 5;
    const edgeCamera = cameraForWorld(world, width, height);
    advanceAdventure(world, 1 / 60, { moving: true }, safeGates);
    const replacements = world.actors.filter(actor => actor.kind === "bot" && (actor.spawnIndex ?? 5) < 2);
    assert.equal(replacements.length, 2);
    assert.ok(replacements.every(actor => !originalIds.includes(actor.id)));
    assert.ok(replacements.every(actor => actor.x < edgeCamera.x || actor.x > edgeCamera.x + width / edgeCamera.zoom || actor.y < edgeCamera.y || actor.y > edgeCamera.y + height / edgeCamera.zoom), "replacements do not appear inside the current view");
    assert.equal(new Set([...world.actors.filter(actor => actor.kind === "bot").map(actor=>actor.spawnIndex),...world.pendingRespawns.map(entry=>entry.slot)]).size,14,"all fourteen neighbours are alive or awaiting their normal respawn after a collision");
  }
});
