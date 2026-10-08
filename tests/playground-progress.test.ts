import test from "node:test";
import assert from "node:assert/strict";
import { getPlaygroundTask, playgroundModes, playgroundTasks, type PlaygroundMode, type PlaygroundTask } from "../lib/playground-content";
import { createPlaygroundProgress, markPlaygroundHint, markPlaygroundListen, playgroundCursor, recordPlaygroundTime, submitPlaygroundAnswer, validatePlaygroundProgress, type PlaygroundProgress } from "../lib/playground-progress";
import { createProgress, parseBackup, serializeBackup, startRun, submitAnswer, validateProgress } from "../lib/progress";

const now = Date.UTC(2026, 9, 8, 4);
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function completeTask(progress: PlaygroundProgress, mode: PlaygroundMode, at = now): PlaygroundProgress {
  const cursor = playgroundCursor(progress, mode);
  const task = getPlaygroundTask(mode, cursor.round, cursor.index);
  const result = submitPlaygroundAnswer(progress, mode, cursor, task.target, at);
  assert.equal(result.applied, true);
  assert.equal(result.correct, true);
  return result.progress;
}

test("the three playgrounds contain 45 playable tasks with a reachable target and complete English prompts", () => {
  assert.deepEqual(playgroundModes.map(mode => playgroundTasks[mode].length), [18, 15, 12]);
  const tasks = playgroundModes.flatMap<PlaygroundTask>(mode => playgroundTasks[mode]);
  assert.equal(tasks.length, 45);
  assert.equal(new Set(tasks.map(task => task.id)).size, tasks.length);
  for (const mode of playgroundModes) for (let index = 0; index < playgroundTasks[mode].length; index++) {
    const first = getPlaygroundTask(mode, 0, index);
    for (const round of [0, 1, 7]) {
      const task = getPlaygroundTask(mode, round, index);
      assert.equal(task.id, first.id, "replaying preserves the learning objective");
      assert.ok(task.options.some(option => option.id === task.target), task.id);
      assert.equal(new Set(task.options.map(option => option.id)).size, task.options.length, task.id);
      assert.match(task.promptEn, /^[A-Z].+\.$/, task.id);
      assert.ok(task.promptZh.length > 1, task.id);
    }
  }
  for (const task of playgroundTasks.racing) {
    if (task.destination === "home") assert.equal(task.promptEn, `Take the ${task.cargo} home.`);
    else assert.equal(task.promptEn, `Take the ${task.cargo} to the ${task.destination}.`);
  }
});

test("each new round changes toolbox positions without removing any option", () => {
  for (const mode of playgroundModes) for (let index = 0; index < playgroundTasks[mode].length; index++) {
    const first = getPlaygroundTask(mode, 0, index);
    const replay = getPlaygroundTask(mode, 1, index);
    assert.deepEqual(first.options.map(option => option.id).sort(), replay.options.map(option => option.id).sort());
    assert.notEqual(first.options.findIndex(option => option.id === first.target), replay.options.findIndex(option => option.id === replay.target), first.id);
  }
});

for (const mode of playgroundModes) {
  test(`${mode}: wrong first answers persist, retries earn one reward, and listening does not grant mastery`, () => {
    let progress = createPlaygroundProgress();
    const cursor = playgroundCursor(progress, mode), task = getPlaygroundTask(mode, cursor.round, cursor.index);
    const wrong = task.options.find(option => option.id !== task.target)!.id;
    progress = markPlaygroundListen(progress, mode, cursor);
    progress = markPlaygroundListen(progress, mode, cursor);
    const failed = submitPlaygroundAnswer(progress, mode, cursor, wrong, now);
    assert.equal(failed.correct, false);
    assert.equal(failed.applied, true);
    assert.equal(failed.progress.modes[mode].index, 0);
    assert.equal(failed.progress.modes[mode].current.firstCorrect, false);
    assert.equal(failed.progress.modes[mode].current.attempts, 1);
    assert.equal(failed.progress.modes[mode].coins, 0);
    assert.equal(failed.progress.records.length, 0);
    progress = validatePlaygroundProgress(clone(failed.progress));
    progress = submitPlaygroundAnswer(progress, mode, cursor, task.target, now + 1000).progress;
    assert.equal(progress.modes[mode].completed, 1);
    assert.equal(progress.modes[mode].coins, 10);
    assert.equal(progress.modes[mode].firstCorrect, 0);
    assert.deepEqual(progress.records[0], { id: `${mode}:0:0`, mode, taskId: task.id, firstCorrect: false, hintUsed: false, attempts: 2, listenCount: 2, at: now + 1000 });
    assert.deepEqual(progress.modes[mode].current, { attempts: 0, hintUsed: false, listenCount: 0, firstCorrect: null });
    assert.deepEqual(validatePlaygroundProgress(clone(progress)), progress);
  });

  test(`${mode}: an answer revealed by a hint records practice while an unaided first answer records learning`, () => {
    let progress = createPlaygroundProgress();
    const first = playgroundCursor(progress, mode);
    progress = markPlaygroundHint(progress, mode, first);
    progress = markPlaygroundHint(progress, mode, first);
    progress = markPlaygroundListen(progress, mode, first);
    assert.equal(progress.modes[mode].current.firstCorrect, false);
    assert.equal(progress.modes[mode].completed, 0);
    assert.equal(progress.modes[mode].coins, 0);
    progress = completeTask(progress, mode);
    assert.equal(progress.modes[mode].hints, 1, "repeated hint presses count one hinted task");
    assert.equal(progress.modes[mode].firstCorrect, 0);
    assert.equal(progress.records[0].firstCorrect, false);
    assert.equal(progress.records[0].hintUsed, true);
    assert.equal(progress.records[0].attempts, 1);
    assert.equal(progress.records[0].listenCount, 1);
    progress = completeTask(progress, mode, now + 1000);
    assert.equal(progress.modes[mode].firstCorrect, 1);
    assert.equal(progress.records[1].firstCorrect, true);
    assert.equal(progress.records[1].hintUsed, false);
    assert.deepEqual(validatePlaygroundProgress(clone(progress)), progress);
  });

  test(`${mode}: continuous play crosses rounds and expired cursors cannot claim extra rewards`, () => {
    let progress = createPlaygroundProgress();
    const expired = playgroundCursor(progress, mode), target = getPlaygroundTask(mode, 0, 0).target;
    const count = playgroundTasks[mode].length;
    for (let index = 0; index < count * 2; index++) progress = completeTask(progress, mode, now + index * 1000);
    assert.equal(progress.modes[mode].round, 2);
    assert.equal(progress.modes[mode].index, 0);
    assert.equal(progress.modes[mode].completed, count * 2);
    assert.equal(progress.modes[mode].coins, count * 20);
    assert.equal(progress.records.length, count * 2);
    assert.equal(new Set(progress.records.map(record => record.id)).size, progress.records.length);
    const duplicate = submitPlaygroundAnswer(progress, mode, expired, target, now + 100000);
    assert.equal(duplicate.applied, false);
    assert.strictEqual(duplicate.progress, progress);
    assert.strictEqual(markPlaygroundHint(progress, mode, expired), progress);
    assert.strictEqual(markPlaygroundListen(progress, mode, expired), progress);
    assert.equal(playgroundCursor(progress, mode).taskId, expired.taskId, "same task identity is protected by the round cursor");
    progress = completeTask(progress, mode, now + 101000);
    assert.equal(progress.modes[mode].index, 1, "the next round remains immediately playable");
    assert.equal(progress.modes[mode].coins, (count * 2 + 1) * 10);
    assert.deepEqual(validatePlaygroundProgress(clone(progress)), progress);
  });
}

test("playground backup and browser-storage roundtrips resume the exact current task and preserve other learning", () => {
  let progress = startRun(createProgress(), "animals-1", now);
  const lessonTask = progress.activeRun!.exercises[0];
  progress = submitAnswer(progress, lessonTask.options.find(id => id !== lessonTask.answer)!, now + 1000).progress;
  const untouchedRun = clone(progress.activeRun);
  let games = progress.playground;
  for (const mode of playgroundModes) for (let index = 0; index < 2; index++) games = completeTask(games, mode, now + index * 1000);
  const cursor = playgroundCursor(games, "garden"), task = getPlaygroundTask("garden", cursor.round, cursor.index);
  games = submitPlaygroundAnswer(games, "garden", cursor, task.options.find(option => option.id !== task.target)!.id, now + 3000).progress;
  games = markPlaygroundHint(games, "garden", cursor);
  games = markPlaygroundListen(games, "garden", cursor);
  games = recordPlaygroundTime(games, "garden", 12);
  progress = { ...progress, playground: games };
  for (const restored of [validateProgress(JSON.parse(JSON.stringify(progress))), parseBackup(serializeBackup(progress, now + 5000))]) {
    assert.deepEqual(restored, progress);
    assert.deepEqual(restored.activeRun, untouchedRun);
    assert.equal(restored.stars, 0, "game coins cannot create course completion stars");
    assert.deepEqual(playgroundCursor(restored.playground, "garden"), cursor);
    assert.deepEqual(getPlaygroundTask("garden", restored.playground.modes.garden.round, restored.playground.modes.garden.index), task);
    assert.equal(restored.playground.modes.garden.current.attempts, 1);
    assert.equal(restored.playground.modes.garden.current.hintUsed, true);
    assert.equal(restored.playground.modes.garden.totalSeconds, 12);
    assert.equal(completeTask(restored.playground, "garden").modes.garden.completed, 3);
  }
});

test("older saved profiles and backup versions initialize the new playground without changing existing learning", () => {
  let progress = startRun(createProgress(), "animals-1", now);
  const task = progress.activeRun!.exercises[0];
  progress = submitAnswer(progress, task.options.find(id => id !== task.answer)!, now + 1000).progress;
  const envelope = JSON.parse(serializeBackup(progress, now + 2000));
  delete envelope.progress.playground;
  assert.deepEqual(validateProgress(clone(envelope.progress)), progress);
  for (const version of [1, 2, 3]) {
    const restored = parseBackup(JSON.stringify({ ...envelope, version }));
    assert.deepEqual(restored, progress);
    assert.deepEqual(restored.playground, createPlaygroundProgress());
  }
});

test("corrupted rewards, impossible positions, and duplicated or forged records are rejected on backup import", () => {
  const initial = createProgress();
  initial.playground = completeTask(initial.playground, "garden");
  const corruptions: Array<(progress: typeof initial) => void> = [
    progress => { progress.playground.modes.garden.coins = 999; },
    progress => { progress.playground.modes.garden.index = playgroundTasks.garden.length; },
    progress => { progress.playground.modes.garden.index = -1; },
    progress => { progress.playground.modes.garden.completed = 50; },
    progress => { progress.playground.modes.garden.round = 1; },
    progress => { progress.playground.modes.garden.firstCorrect = 2; },
    progress => { progress.playground.modes.garden.current = { attempts: 1, hintUsed: false, listenCount: 0, firstCorrect: true }; },
    progress => { progress.playground.records.push(clone(progress.playground.records[0])); },
    progress => { progress.playground.records[0].taskId = "garden-plant-invented"; },
    progress => { progress.playground.records[0].mode = "pets"; },
    progress => { progress.playground.records[0].id = "garden:0:1"; },
    progress => { progress.playground.records[0].hintUsed = true; },
    progress => { progress.playground.records[0].attempts = 2; },
  ];
  for (const corrupt of corruptions) {
    const invalid = clone(initial);
    corrupt(invalid);
    assert.throws(() => validateProgress(invalid));
    assert.throws(() => parseBackup(serializeBackup(invalid, now)));
  }
  assert.throws(() => validatePlaygroundProgress(null), "missing old data may migrate; explicitly corrupt data must not");
});

test("unknown answers never mutate progress and measured play time ignores invalid intervals", () => {
  let progress = createPlaygroundProgress();
  for (const mode of playgroundModes) {
    const result = submitPlaygroundAnswer(progress, mode, playgroundCursor(progress, mode), "not-a-tool", now);
    assert.equal(result.applied, false);
    assert.strictEqual(result.progress, progress);
    for (const invalid of [Number.NaN, Infinity, -4]) assert.strictEqual(recordPlaygroundTime(progress, mode, invalid), progress);
    progress = recordPlaygroundTime(progress, mode, 1000);
    assert.equal(progress.modes[mode].totalSeconds, 15, "a background tab cannot turn a single timer tick into hours of learning");
    progress = recordPlaygroundTime(progress, mode, 2.9);
    assert.equal(progress.modes[mode].totalSeconds, 17);
  }
  assert.deepEqual(validatePlaygroundProgress(clone(progress)), progress);
});
