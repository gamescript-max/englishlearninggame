import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import manifest from "../lib/audio-manifest.json";
import { adventureVocabulary, oceanEvolution } from "../lib/adventure-catalog";
import { advanceAdventure, createAdventureWorld } from "../lib/adventure-engine";
import { adventureGuidance, adventureTasks } from "../lib/adventure-content";
import { createAdventureProgress, getCurrentAdventureTask, markAdventureHint, markAdventureListen, recordAdventureChoice, saveAdventureGrowth, startAdventure } from "../lib/adventure-progress";
import { createProgress, getStats, parseBackup, serializeBackup, settleRun, startRun, submitAnswer, validateProgress } from "../lib/progress";

const now = Date.UTC(2026, 9, 5);

test("backup v3 restores both growing adventures, the exact current target and unfinished attempts", () => {
  const progress = createProgress();
  progress.adventure = startAdventure(progress.adventure, "fish", now);
  progress.adventure = saveAdventureGrowth(progress.adventure, "fish", 96, ["fish", "cat"], 30, now + 1);
  for (let index = 0; index < 15; index++) {
    const task = getCurrentAdventureTask(progress.adventure, "fish");
    progress.adventure = recordAdventureChoice(progress.adventure, "fish", task, task.answer, now + 2 + index);
  }
  const fishTask = getCurrentAdventureTask(progress.adventure, "fish");
  progress.adventure = markAdventureHint(progress.adventure, "fish", now + 30);
  progress.adventure = markAdventureListen(progress.adventure, "fish", now + 31);
  progress.adventure = recordAdventureChoice(progress.adventure, "fish", fishTask, fishTask.options.find(option => option.id !== fishTask.answer)!.id, now + 32);
  progress.adventure = saveAdventureGrowth(progress.adventure, "snake", 21, ["ball"], 12, now + 40);
  const snakeTask = getCurrentAdventureTask(progress.adventure, "snake");
  progress.adventure = recordAdventureChoice(progress.adventure, "snake", snakeTask, snakeTask.answer, now + 41);
  progress.adventure = startAdventure(progress.adventure, "fish", now + 42);
  const backup = serializeBackup(progress, now + 50);
  assert.equal(JSON.parse(backup).version, 3);
  const restored = parseBackup(backup);
  assert.deepEqual(restored, progress);
  assert.equal(restored.adventure.activeMode, "fish");
  assert.equal(restored.adventure.modes.fish.round, 1);
  assert.equal(restored.adventure.modes.fish.taskIndex, 3);
  assert.deepEqual(restored.adventure.modes.fish.unlockedStages, [0, 1, 2, 3]);
  assert.equal(restored.adventure.modes.fish.current.attempts, 1);
  assert.equal(restored.adventure.modes.fish.current.hintUsed, true);
  assert.equal(getCurrentAdventureTask(restored.adventure, "fish").instanceKey, fishTask.instanceKey);
  const task = getCurrentAdventureTask(restored.adventure, "fish");
  restored.adventure = recordAdventureChoice(restored.adventure, "fish", task, task.answer, now + 60);
  assert.equal(restored.adventure.records.at(-1)!.firstCorrect, false);
  assert.equal(restored.adventure.modes.fish.taskIndex, 4);
});

test("old v1/v2 backups and local profiles migrate an absent adventure without losing course answers", () => {
  let progress = startRun(createProgress(), "animals-1", now);
  progress = submitAnswer(progress, progress.activeRun!.exercises[0].answer, now + 1000).progress;
  for (const version of [1, 2]) {
    const legacy = JSON.parse(serializeBackup(progress, now + 2000));
    legacy.version = version;
    delete legacy.progress.adventure;
    if (version === 1) delete legacy.progress.learning;
    const restored = parseBackup(JSON.stringify(legacy));
    assert.deepEqual(restored.adventure, createAdventureProgress());
    assert.deepEqual(restored.attempts, progress.attempts);
    assert.deepEqual(restored.activeRun, progress.activeRun);
    assert.equal(restored.stars, progress.stars);
  }
  const localLegacy = JSON.parse(JSON.stringify(progress));
  delete localLegacy.adventure;
  assert.deepEqual(validateProgress(localLegacy).adventure, createAdventureProgress());
});

test("backup v3 rejects absent, malformed, unknown or semantically damaged adventure content", () => {
  const base = JSON.parse(serializeBackup(createProgress(), now));
  const changes = [
    (value: typeof base) => { delete value.progress.adventure; },
    (value: typeof base) => { value.progress.adventure = null; },
    (value: typeof base) => { value.progress.adventure.version = 2; },
    (value: typeof base) => { value.progress.adventure.modes.fish.taskIds[0] = "unrecognized-task"; },
    (value: typeof base) => { value.progress.adventure.modes.fish.unlockedStages = [0, 5]; },
    (value: typeof base) => { value.progress.adventure.modes.fish.taskIndex = 12; },
    (value: typeof base) => { value.progress.adventure.modes.snake.firstCorrect = 10; },
    (value: typeof base) => { value.progress.adventure.modes.fish.xp = -1; },
    (value: typeof base) => { value.progress.adventure.modes.fish.collectedWords = ["wrong-vocabulary"]; },
    (value: typeof base) => { value.progress.adventure.modes.snake.bodyWords = ["unknown-picture"]; },
    (value: typeof base) => { value.progress.adventure.modes.snake.bodyWords = null; },
    (value: typeof base) => { delete value.progress.adventure.modes.fish.bodyWords; },
    (value: typeof base) => { delete value.progress.adventure.modes.snake.bodyWords; },
  ];
  for (const change of changes) { const damaged = structuredClone(base); change(damaged); assert.throws(() => parseBackup(JSON.stringify(damaged))); }
});

test("repeated snake word pictures restore on separate body segments while the collection remains unique", () => {
  const progress = createProgress();
  const body = ["cat", "ball", "cat", "fish", "cat"];
  progress.adventure = saveAdventureGrowth(progress.adventure, "snake", 12, body, 10, now);
  assert.deepEqual(progress.adventure.modes.snake.collectedWords, ["cat", "ball", "fish"]);
  assert.deepEqual(progress.adventure.modes.snake.bodyWords, body);
  const restored = parseBackup(serializeBackup(progress, now + 1));
  assert.deepEqual(restored.adventure.modes.snake.bodyWords, body);
  assert.deepEqual(restored.adventure.modes.snake.collectedWords, ["cat", "ball", "fish"]);
  const draft = JSON.parse(JSON.stringify(progress));
  delete draft.adventure.modes.snake.bodyWords;
  assert.deepEqual(validateProgress(draft).adventure.modes.snake.bodyWords, ["cat", "ball", "fish"]);
  const corrupt = JSON.parse(serializeBackup(progress));
  corrupt.progress.adventure.modes.snake.bodyWords = Array.from({ length: 160 }, () => "cat");
  assert.throws(() => parseBackup(JSON.stringify(corrupt)));
});

test("snake life length survives backup; a collision clears its current body while retaining growth and learned cards", () => {
  const progress = createProgress();
  progress.adventure = saveAdventureGrowth(progress.adventure, "snake", 1500, ["tree", "bus", "book", "tree"], 15, now, 120);
  let restored = parseBackup(serializeBackup(progress, now + 1));
  assert.equal(restored.adventure.modes.snake.runLength, 120);
  assert.deepEqual(restored.adventure.modes.snake.bodyWords, ["tree", "bus", "book", "tree"]);
  restored.adventure = saveAdventureGrowth(restored.adventure, "snake", 1500, [], 0, now + 2, 1);
  restored = parseBackup(serializeBackup(restored, now + 3));
  assert.equal(restored.adventure.modes.snake.xp, 1500);
  assert.equal(restored.adventure.modes.snake.runLength, 1);
  assert.deepEqual(restored.adventure.modes.snake.bodyWords, []);
  assert.deepEqual(restored.adventure.modes.snake.collectedWords, ["tree", "bus", "book"]);
  assert.equal(restored.adventure.modes.snake.completedTasks, 0);
});

test("previous backups migrate valid six-form ocean growth and omitted snake life length without resetting tasks", () => {
  const progress = createProgress();
  progress.adventure = saveAdventureGrowth(progress.adventure, "fish", 9000, ["fish"], 15, now);
  progress.adventure = saveAdventureGrowth(progress.adventure, "snake", 40, ["cat", "dog", "cat"], 10, now + 1);
  const prior = JSON.parse(serializeBackup(progress, now + 2));
  delete prior.progress.adventure.fishGrowthVersion;
  delete prior.progress.adventure.fishRouteVersion;
  prior.progress.adventure.modes.fish.unlockedStages = [0, 1, 2, 3, 4, 5];
  delete prior.progress.adventure.modes.fish.runLength;
  delete prior.progress.adventure.modes.snake.runLength;
  const restored = parseBackup(JSON.stringify(prior));
  assert.equal(restored.adventure.modes.fish.xp, 9000);
  assert.equal(restored.adventure.modes.fish.unlockedStages.length, 19);
  assert.equal(restored.adventure.modes.snake.runLength, 41);
  assert.deepEqual(restored.adventure.modes.snake.bodyWords, ["cat", "dog", "cat"]);
  assert.deepEqual(restored.adventure.modes.snake.taskIds, progress.adventure.modes.snake.taskIds);
  for (const badLength of [0, -2, 1.5, 1000001, "40", null]) {
    const damaged = structuredClone(prior); damaged.progress.adventure.modes.snake.runLength = badLength;
    assert.throws(() => parseBackup(JSON.stringify(damaged)));
  }
  const impossibleBody = structuredClone(prior); impossibleBody.progress.adventure.modes.snake.runLength = 2;
  assert.throws(() => parseBackup(JSON.stringify(impossibleBody)));
  const inflatedLength = structuredClone(prior); inflatedLength.progress.adventure.modes.snake.runLength = 1000;
  assert.throws(() => parseBackup(JSON.stringify(inflatedLength)));
  const fakeUnlock = structuredClone(prior); fakeUnlock.progress.adventure.modes.fish.unlockedStages = [0, 1, 2, 4, 5];
  assert.throws(() => parseBackup(JSON.stringify(fakeUnlock)));
});

test("a real snake collision saves one segment and refresh or legacy growth calls cannot resurrect its old life", () => {
  const progress = createProgress();
  progress.adventure = saveAdventureGrowth(progress.adventure, "snake", 80, ["tree", "cat", "book", "cat"], 10, now, 6);
  const world = createAdventureWorld("snake", 91, 80, progress.adventure.modes.snake.bodyWords, 6);
  world.elapsed = 5;
  const killer = world.actors.find(actor => actor.kind === "bot" && actor.length! > world.player.length)!;
  // Isolate the actual collision so computer foraging cannot affect this persistence assertion.
  world.actors = [killer];
  killer.x = world.player.x + 2; killer.y = world.player.y;
  const events = advanceAdventure(world, 1 / 120, { moving: true, direction: { x: 1, y: 0 } }, { answerEnabled: true, safe: false });
  assert.equal(events.filter(event => event.kind === "death").length, 1);
  assert.equal(world.player.length, 1);
  assert.equal(world.player.xp, 80);
  assert.deepEqual(world.player.collectedWords, []);
  progress.adventure = saveAdventureGrowth(progress.adventure, "snake", world.player.xp, world.player.collectedWords, 0, now + 1, world.player.length);
  const restored = parseBackup(serializeBackup(progress, now + 2));
  const state = restored.adventure.modes.snake;
  const refreshedWorld = createAdventureWorld("snake", state.seed, state.xp, state.bodyWords, state.runLength);
  assert.equal(refreshedWorld.player.length, 1);
  assert.equal(refreshedWorld.player.body.length, 1);
  assert.deepEqual(refreshedWorld.player.collectedWords, []);
  assert.deepEqual(state.collectedWords, ["tree", "cat", "book"]);
  restored.adventure = saveAdventureGrowth(restored.adventure, "snake", 80, [], 0, now + 3);
  assert.equal(restored.adventure.modes.snake.runLength, 1, "an unchanged legacy XP snapshot preserves the new life");
  restored.adventure = saveAdventureGrowth(restored.adventure, "snake", 79, ["tree", "cat", "book", "cat"], 0, now + 3);
  assert.equal(restored.adventure.modes.snake.runLength, 1, "a stale picture snapshot also cannot restore lost length");
  assert.deepEqual(restored.adventure.modes.snake.bodyWords, []);
  restored.adventure = saveAdventureGrowth(restored.adventure, "snake", 81, ["bus"], 0, now + 4);
  assert.equal(restored.adventure.modes.snake.runLength, 2, "legacy callers grow only by the newly earned XP");
  assert.deepEqual(parseBackup(serializeBackup(restored)).adventure.modes.snake.bodyWords, ["bus"]);
});

test("all mixed English cards and a long repeated snake picture history round-trip independently of fish transformations", () => {
  const progress = createProgress();
  const body = Array.from({ length: 159 }, (_, index) => adventureVocabulary[index % adventureVocabulary.length].id);
  progress.adventure = saveAdventureGrowth(progress.adventure, "snake", 500, body, 20, now, 160);
  progress.adventure = saveAdventureGrowth(progress.adventure, "fish", 11500, adventureVocabulary.map(word => word.id), 10, now + 1, 1);
  const restored = parseBackup(serializeBackup(progress, now + 2));
  assert.equal(restored.adventure.modes.snake.collectedWords.length, 80);
  assert.deepEqual(restored.adventure.modes.snake.bodyWords, body);
  assert.equal(restored.adventure.modes.snake.runLength, 160);
  assert.equal(restored.adventure.modes.fish.collectedWords.length, 80);
  assert.deepEqual(restored.adventure.modes.fish.bodyWords, [], "fish vocabulary is a collection, not a snake body");
  const state = restored.adventure.modes.snake;
  const world = createAdventureWorld("snake", state.seed, state.xp, state.bodyWords, state.runLength);
  assert.equal(world.player.body.length, 160);
  assert.deepEqual(world.player.collectedWords, body);
  for (const evolution of oceanEvolution) {
    const next = createProgress();
    next.adventure = saveAdventureGrowth(next.adventure, "fish", evolution.xp, [], 0, now, 1);
    const saved = parseBackup(serializeBackup(next, now + 1)).adventure.modes.fish;
    const fish = createAdventureWorld("fish", saved.seed, saved.xp, saved.bodyWords, saved.runLength);
    assert.equal(fish.player.stage, evolution.index);
    assert.equal(fish.player.speciesId, evolution.speciesId);
    assert.deepEqual(saved.unlockedStages, Array.from({ length: evolution.index + 1 }, (_, index) => index));
  }
});

test("game XP and adventure answers do not inflate existing stars, lessons, accuracy or A1 observation results", () => {
  let progress = startRun(createProgress(), "animals-1", now);
  while (progress.activeRun && progress.activeRun.index < progress.activeRun.exercises.length) {
    progress = submitAnswer(progress, progress.activeRun.exercises[progress.activeRun.index].answer, now + 1000).progress;
  }
  progress = settleRun(progress, now + 2000);
  const before = getStats(progress, now + 3000), learning = structuredClone(progress.learning);
  const completed = structuredClone(progress.completed), stars = progress.stars;
  progress.adventure = saveAdventureGrowth(progress.adventure, "fish", 350, ["fish"], 60, now + 4000);
  for (let index = 0; index < 12; index++) {
    const task = getCurrentAdventureTask(progress.adventure, "fish");
    progress.adventure = recordAdventureChoice(progress.adventure, "fish", task, task.answer, now + 5000 + index);
  }
  assert.deepEqual(getStats(progress, now + 6000), before);
  assert.equal(progress.stars, stars);
  assert.deepEqual(progress.completed, completed);
  assert.deepEqual(progress.learning, learning);
  assert.equal(progress.adventure.modes.fish.firstCorrect, 12);
  assert.equal(progress.adventure.modes.fish.unlockedStages.length, 6);
});

function pcmSamples(file: string): Buffer {
  const buffer = fs.readFileSync(file);
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WAVE");
  let fmt: Buffer | undefined, data: Buffer | undefined;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const name = buffer.toString("ascii", offset, offset + 4), size = buffer.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + size <= buffer.length, "truncated WAV chunk");
    if (name === "fmt ") fmt = buffer.subarray(offset + 8, offset + 8 + size);
    if (name === "data") data = buffer.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  assert.ok(fmt && data);
  assert.equal(fmt.readUInt16LE(0), 1);
  assert.equal(fmt.readUInt16LE(2), 1);
  assert.equal(fmt.readUInt32LE(4), 22050);
  assert.equal(fmt.readUInt16LE(14), 16);
  assert.ok(data.length > 22050 / 5 * 2);
  let audible = 0, clipped = 0;
  for (let offset = 0; offset + 2 <= data.length; offset += 2) {
    const sample = Math.abs(data.readInt16LE(offset));
    if (sample > 10) audible++;
    if (sample >= 32767) clipped++;
  }
  assert.ok(audible > 100);
  assert.equal(clipped, 0);
  return data;
}

test("all new fish instructions and adventure Chinese guides have verified fixed teaching audio", () => {
  const patchFile = path.resolve("artifacts/adventure-audio-entries.json");
  const patch = fs.existsSync(patchFile) ? JSON.parse(fs.readFileSync(patchFile, "utf8")) : { speech: { en: {}, zh: {} } };
  const speech = { en: { ...manifest.speech.en, ...patch.speech.en } as Record<string, string>, zh: { ...manifest.speech.zh, ...patch.speech.zh } as Record<string, string> };
  for (const [language, texts] of Object.entries({ en: adventureTasks.filter(task => task.id.startsWith("fish-")).map(task => task.promptEn), zh: Object.values(adventureGuidance) })) {
    for (const text of texts) {
      const url = speech[language as "en" | "zh"][text];
      assert.ok(url, `missing fixed ${language} audio: ${text}`);
      assert.match(url, /^\/audio\/[^/]+\.wav$/);
      pcmSamples(path.resolve("public", url.slice(1)));
    }
  }
});
