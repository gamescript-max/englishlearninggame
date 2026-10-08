import test from "node:test";
import assert from "node:assert/strict";
import { collectOceanPoints, createOceanScore, oceanPoints, validateOceanScore } from "../lib/ocean-score";
import { createProgress, parseBackup, serializeBackup } from "../lib/progress";
import { getCurrentAdventureTask, recordAdventureChoice, saveAdventureGrowth } from "../lib/adventure-progress";
import { collectOceanCard } from "../lib/ocean-treasure";

const now = Date.UTC(2026, 9, 5);

test("different English cards of the same word earn five points each and a repeated entity earns once", () => {
  let score = collectOceanPoints(createOceanScore(), "cat", "session-a:food-1");
  assert.equal(oceanPoints(score, 0), 5);
  assert.equal(collectOceanPoints(score, "cat", "session-a:food-1"), score);
  assert.equal(collectOceanPoints(score, "dog", "session-a:food-1"), score, "an entity receipt cannot be reused with a different word");
  score = collectOceanPoints(score, "cat", "session-a:food-2");
  assert.equal(score.cardCount, 2);
  assert.equal(oceanPoints(score, 0), 10);
  assert.deepEqual(validateOceanScore(score, 0), score);
  for (const [word, receipt] of [["not-a-word", "fresh"], ["cat", ""], ["cat", "x".repeat(129)]]) {
    assert.equal(collectOceanPoints(score, word, receipt), score);
  }
});

test("card receipts stay bounded while lifetime points and task rewards survive backup", () => {
  const progress = createProgress();
  for (let index = 0; index < 150; index++) progress.adventure.oceanScore = collectOceanPoints(progress.adventure.oceanScore, "cat", `card-${index}`);
  const task = getCurrentAdventureTask(progress.adventure, "fish");
  progress.adventure = recordAdventureChoice(progress.adventure, "fish", task, task.answer, now);
  progress.adventure = saveAdventureGrowth(progress.adventure, "fish", 4, ["cat"], 0, now + 1, 1);
  const restored = parseBackup(serializeBackup(progress, now + 2));
  assert.equal(restored.adventure.oceanScore.recentPickups.length, 128);
  assert.equal(restored.adventure.oceanScore.cardCount, 150);
  assert.equal(oceanPoints(restored.adventure.oceanScore, restored.adventure.modes.fish.completedTasks), 760);
  assert.deepEqual(restored.adventure.oceanScore, progress.adventure.oceanScore);
  assert.equal(restored.adventure.modes.fish.xp, 4, "points do not change growth XP");
  assert.equal(restored.stars, 0, "ocean points do not change lesson stars");
});

test("old backups start counting at their saved task total without retroactive card or task points", () => {
  const progress = createProgress();
  for (let index = 0; index < 3; index++) {
    const task = getCurrentAdventureTask(progress.adventure, "fish");
    progress.adventure = recordAdventureChoice(progress.adventure, "fish", task, task.answer, now + index);
    progress.adventure.oceanTreasure = collectOceanCard(progress.adventure.oceanTreasure, ["cat", "dog", "tree"][index], `old-card-${index}`);
  }
  progress.adventure = saveAdventureGrowth(progress.adventure, "fish", 96, ["cat", "dog", "cat"], 0, now + 4, 1);
  const old = JSON.parse(serializeBackup(progress, now + 5));
  delete old.progress.adventure.oceanScore;
  for (const version of [1, 2, 3]) {
    old.version = version;
    const migrated = parseBackup(JSON.stringify(old));
    assert.deepEqual(migrated.adventure.oceanScore, createOceanScore(3));
    assert.equal(oceanPoints(migrated.adventure.oceanScore, migrated.adventure.modes.fish.completedTasks), 0);
    assert.equal(migrated.adventure.oceanTreasure.creditedCards, 3);
    const nextTask = getCurrentAdventureTask(migrated.adventure, "fish");
    migrated.adventure = recordAdventureChoice(migrated.adventure, "fish", nextTask, nextTask.answer, now + 6);
    migrated.adventure.oceanScore = collectOceanPoints(migrated.adventure.oceanScore, "cat", "new-card");
    const restored = parseBackup(serializeBackup(migrated, now + 7));
    assert.equal(oceanPoints(restored.adventure.oceanScore, restored.adventure.modes.fish.completedTasks), 15);
    assert.equal(restored.adventure.modes.fish.xp, 96);
    assert.equal(restored.adventure.oceanScore.taskBaseline, 3);
  }
});

test("invalid score counters, duplicate receipts, future baselines and damaged backup fields are rejected", () => {
  const valid = collectOceanPoints(createOceanScore(), "cat", "first");
  const mutations = [
    { cardCount: -1 }, { cardCount: .5 }, { cardCount: Infinity }, { cardCount: 1_000_000_001 },
    { cardCount: 0 }, { taskBaseline: -1 }, { taskBaseline: 1 }, { taskBaseline: .5 },
    { recentPickups: ["first", "first"] }, { recentPickups: [""] }, { recentPickups: ["x".repeat(129)] },
    { recentPickups: Array.from({ length: 129 }, (_, index) => `receipt-${index}`) }, { extraField: true },
  ];
  for (const mutation of mutations) assert.throws(() => validateOceanScore({ ...valid, ...mutation }, 0));
  assert.throws(() => validateOceanScore(null, 0));
  assert.throws(() => validateOceanScore({}, 0));
  assert.deepEqual(validateOceanScore(undefined, 9), createOceanScore(9));
  const backup = JSON.parse(serializeBackup(createProgress(), now));
  for (const broken of [null, {}, { ...valid, taskBaseline: 1 }, { ...valid, recentPickups: ["first", "first"] }]) {
    backup.progress.adventure.oceanScore = broken;
    assert.throws(() => parseBackup(JSON.stringify(backup)));
  }
});
