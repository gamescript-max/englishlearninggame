import assert from "node:assert/strict";
import test from "node:test";
import { adventureTasks, getAdventureTask, getAdventureRound } from "../lib/adventure-content";
import { createAdventureProgress, getCurrentAdventureTask, getAdventureReviewIds, getAdventureStage, leaveAdventure, markAdventureHint, markAdventureListen, recordAdventureChoice, saveAdventureGrowth, startAdventure, validateAdventureProgress } from "../lib/adventure-progress";
import { oceanPoints } from "../lib/ocean-score";

const now = Date.UTC(2026, 9, 5);
test("ocean target points settle once on correct completion without granting XP or snake rewards", () => {
  let progress = createAdventureProgress();
  const fishTask = getCurrentAdventureTask(progress, "fish");
  const wrong = fishTask.options.find(option => option.id !== fishTask.answer)!.id;
  progress = recordAdventureChoice(progress, "fish", fishTask, wrong, now);
  assert.equal(oceanPoints(progress.oceanScore, progress.modes.fish.completedTasks), 0);
  progress = recordAdventureChoice(progress, "fish", fishTask, fishTask.answer, now + 1);
  assert.equal(oceanPoints(progress.oceanScore, progress.modes.fish.completedTasks), 10);
  assert.equal(progress.modes.fish.xp, 0);
  const rewarded = progress;
  progress = recordAdventureChoice(progress, "fish", fishTask, fishTask.answer, now + 2);
  assert.equal(progress, rewarded);
  assert.equal(oceanPoints(progress.oceanScore, progress.modes.fish.completedTasks), 10);
  const snakeTask = getCurrentAdventureTask(progress, "snake");
  progress = recordAdventureChoice(progress, "snake", snakeTask, snakeTask.answer, now + 3);
  assert.equal(oceanPoints(progress.oceanScore, progress.modes.fish.completedTasks), 10);
  assert.deepEqual(validateAdventureProgress(progress), progress);
});
test("authored adventure targets have stable IDs, complete sentences, valid choices and enough count targets", () => {
  assert.equal(new Set(adventureTasks.map(task => task.id)).size, adventureTasks.length);
  for (const task of adventureTasks) {
    assert.match(task.promptEn, /\.$/);
    assert.ok(task.options.some(option => option.id === task.answer));
    assert.equal(new Set(task.options.map(option => option.id)).size, task.options.length);
    assert.ok(task.requiredCount >= 1 && task.requiredCount <= 3);
  }
  const first = getAdventureRound("fish", 0, 12).map(id => adventureTasks.find(task => task.id === id)!);
  assert.deepEqual([...new Set(first.filter(task => task.skill === "color").map(task => task.answer))].sort(), ["blue", "green", "red", "yellow"]);
  assert.deepEqual([...new Set(first.filter(task => task.skill === "count").map(task => task.requiredCount))].sort(), [1, 2, 3]);
  assert.deepEqual([...new Set(first.filter(task => task.skill === "size").map(task => task.answer))].sort(), ["big", "small"]);
  assert.equal(new Set([...getAdventureRound("snake", 0, 12), ...getAdventureRound("snake", 1, 12)]).size, 24);
  assert.deepEqual(getAdventureTask("fish", 5, 2, 123), getAdventureTask("fish", 5, 2, 123));
  assert.notDeepEqual(getAdventureRound("fish", 3, 123), getAdventureRound("fish", 3, 456));
});

test("wrong target choices do not advance, retry is practice, and the next target appears automatically", () => {
  let progress = startAdventure(createAdventureProgress(), "fish", now);
  const task = getCurrentAdventureTask(progress, "fish");
  const wrong = task.options.find(option => option.id !== task.answer)!.id;
  progress = markAdventureListen(progress, "fish", now + 100);
  progress = recordAdventureChoice(progress, "fish", task, wrong, now + 200);
  assert.equal(progress.modes.fish.taskIndex, 0);
  assert.equal(progress.records.length, 0);
  assert.equal(progress.modes.fish.firstChoices, 1);
  progress = recordAdventureChoice(progress, "fish", task, task.answer, now + 300);
  assert.equal(progress.modes.fish.taskIndex, 1);
  assert.equal(progress.records[0].firstCorrect, false);
  assert.equal(progress.records[0].attempts, 2);
  assert.equal(progress.records[0].listenCount, 1);
  assert.equal(progress.modes.fish.firstCorrect, 0);
  assert.equal(progress.modes.fish.xp, 0, "English scoring must not grant game XP");
  assert.equal(recordAdventureChoice(progress, "fish", task, task.answer, now + 400), progress, "stale callbacks are ignored");
  assert.deepEqual(validateAdventureProgress(progress), progress);
});

test("a hint counts once per target and removes independent-choice credit; unknown entities do not count as answers", () => {
  let progress = createAdventureProgress();
  const task = getCurrentAdventureTask(progress, "snake");
  assert.equal(recordAdventureChoice(progress, "snake", task, "ordinary-food", now), progress);
  progress = markAdventureHint(markAdventureHint(progress, "snake", now), "snake", now + 1);
  progress = markAdventureListen(progress, "snake", now + 2);
  progress = recordAdventureChoice(progress, "snake", task, task.answer, now + 3);
  assert.equal(progress.modes.snake.hints, 1);
  assert.equal(progress.modes.snake.firstCorrect, 0);
  assert.equal(progress.records[0].hintUsed, true);
  assert.equal(progress.records[0].attempts, 1);
  assert.equal(progress.records[0].firstCorrect, false);
  assert.deepEqual(validateAdventureProgress(progress), progress);
});

test("12 targets roll straight into a new round and recent mistakes become review targets", () => {
  let progress = createAdventureProgress();
  const failedTask = getCurrentAdventureTask(progress, "fish");
  progress = recordAdventureChoice(progress, "fish", failedTask, failedTask.options.find(option => option.id !== failedTask.answer)!.id, now);
  for (let index = 0; index < 12; index++) {
    const task = getCurrentAdventureTask(progress, "fish");
    progress = recordAdventureChoice(progress, "fish", task, task.answer, now + index + 1);
  }
  assert.equal(progress.modes.fish.round, 1);
  assert.equal(progress.modes.fish.taskIndex, 0);
  assert.equal(progress.modes.fish.completedTasks, 12);
  assert.equal(getCurrentAdventureTask(progress, "fish").id, failedTask.id);
  assert.equal(recordAdventureChoice(progress, "fish", failedTask, failedTask.answer, now + 20), progress, "same curriculum task in a new round has a new runtime identity");
  assert.equal(progress.modes.fish.firstCorrect, 11);
  assert.equal(progress.activeMode, "fish");
  assert.deepEqual(validateAdventureProgress(progress), progress);
  const reviewTask = getCurrentAdventureTask(progress, "fish");
  progress = recordAdventureChoice(progress, "fish", reviewTask, reviewTask.answer, now + 30);
  assert.ok(!getAdventureReviewIds(progress, "fish").includes(failedTask.id), "an independent revisit clears that practice target");
});

test("a counting target is settled once after the engine collects distinct fish", () => {
  let progress = createAdventureProgress();
  while (getCurrentAdventureTask(progress, "fish").requiredCount !== 3) {
    const task = getCurrentAdventureTask(progress, "fish");
    progress = recordAdventureChoice(progress, "fish", task, task.answer, now);
  }
  const task = getCurrentAdventureTask(progress, "fish");
  const completedBefore = progress.modes.fish.completedTasks;
  progress = recordAdventureChoice(progress, "fish", task, task.answer, now + 1);
  assert.equal(progress.modes.fish.completedTasks, completedBefore + 1);
  assert.equal(progress.records.at(-1)!.attempts, 1);
  assert.equal(recordAdventureChoice(progress, "fish", task, task.answer, now + 2), progress);
});

test("game growth is gradual, monotonic and saved separately from learning, with elapsed-time idle limits", () => {
  let progress = saveAdventureGrowth(createAdventureProgress(), "fish", 1, ["fish", "fake-word"], 5, now);
  assert.equal(getAdventureStage("fish", progress.modes.fish.xp), 0);
  assert.deepEqual(progress.modes.fish.collectedWords, ["fish"]);
  progress = saveAdventureGrowth(progress, "fish", 1, ["fish", "cat"], 10000, now + 1);
  assert.equal(progress.modes.fish.xp, 1);
  assert.equal(progress.modes.fish.totalSeconds, 65);
  progress = saveAdventureGrowth(progress, "fish", 50, [], 0, now + 2);
  assert.deepEqual(progress.modes.fish.unlockedStages, [0, 1, 2]);
  assert.equal(progress.modes.fish.completedTasks, 0);
  assert.equal(progress.modes.fish.firstChoices, 0);
  progress = saveAdventureGrowth(progress, "fish", 4, [], -50, now + 3);
  assert.equal(progress.modes.fish.xp, 50);
  progress = saveAdventureGrowth(progress, "fish", 50, ["cat"], 0, now + 4);
  assert.deepEqual(progress.modes.fish.collectedWords, ["cat", "fish"], "the latest picture remains nearest to the head after a refresh");
  assert.deepEqual(progress.modes.fish.bodyWords, ["cat"]);
  assert.equal(getAdventureStage("fish", 249), 4);
  assert.equal(getAdventureStage("fish", 250), 5);
  assert.deepEqual(validateAdventureProgress(progress), progress);
});

test("switching and leaving adventures retain independent target progress for refresh and backups", () => {
  let progress = startAdventure(createAdventureProgress(), "snake", now);
  const task = getCurrentAdventureTask(progress, "snake");
  progress = recordAdventureChoice(progress, "snake", task, task.answer, now + 1);
  progress = startAdventure(progress, "fish", now + 2);
  progress = leaveAdventure(progress);
  assert.equal(progress.activeMode, null);
  assert.equal(progress.modes.snake.taskIndex, 1);
  assert.equal(progress.modes.fish.taskIndex, 0);
  const restored = validateAdventureProgress(JSON.parse(JSON.stringify(progress)));
  assert.deepEqual(restored, progress);
  assert.equal(getCurrentAdventureTask(restored, "snake").id, getCurrentAdventureTask(progress, "snake").id);
  assert.deepEqual(validateAdventureProgress(undefined), createAdventureProgress());
  assert.throws(() => validateAdventureProgress(null));
  assert.throws(() => validateAdventureProgress({ version: 1 }));
});

test("import rejects tampered curriculum, impossible growth, inflated statistics and missing records", () => {
  let valid = createAdventureProgress();
  const task = getCurrentAdventureTask(valid, "fish");
  valid = recordAdventureChoice(valid, "fish", task, task.answer, now);
  const corruptions = [
    (p: typeof valid) => { p.records[0].promptEn = "Fake content."; },
    (p: typeof valid) => { p.records[0].skill = "word"; },
    (p: typeof valid) => { p.records[0].hintUsed = true; },
    (p: typeof valid) => { p.modes.fish.unlockedStages = [0, 5]; },
    (p: typeof valid) => { p.modes.fish.taskIds[0] = "snake-word-cat"; },
    (p: typeof valid) => { p.modes.fish.collectedWords = ["not-a-word"]; },
    (p: typeof valid) => { p.modes.fish.completedTasks = 500; },
    (p: typeof valid) => { p.modes.fish.firstCorrect = 500; },
    (p: typeof valid) => { p.records = []; },
  ];
  for (const corrupt of corruptions) { const changed = structuredClone(valid); corrupt(changed); assert.throws(() => validateAdventureProgress(changed)); }
});

test("long play bounds the detailed record list while preserving cumulative game and learning totals", () => {
  let progress = createAdventureProgress();
  for (let index = 0; index < 2010; index++) {
    const task = getCurrentAdventureTask(progress, "snake");
    progress = recordAdventureChoice(progress, "snake", task, task.answer, now + index);
  }
  assert.equal(progress.records.length, 2000);
  assert.equal(progress.modes.snake.completedTasks, 2010);
  assert.equal(progress.modes.snake.firstCorrect, 2010);
  assert.equal(progress.modes.snake.round, 167);
  assert.deepEqual(validateAdventureProgress(progress), progress);
});
