import assert from "node:assert/strict";
import test from "node:test";
import { sharkContentForTier, sharkTierForTotal } from "../lib/shark-content";
import { createSharkProgress, MAX_SHARK_PICKUPS, recordSharkListen, recordSharkPickup, recordSharkTime, sharkTotal, validateSharkProgress, type SharkProgress } from "../lib/shark-progress";
import { saveAdventureGrowth } from "../lib/adventure-progress";
import { recordPlaygroundTime } from "../lib/playground-progress";
import { createProgress, parseBackup, serializeBackup, startRun, submitAnswer, validateProgress } from "../lib/progress";

const now = Date.UTC(2026, 9, 8);
function grow(count: number): SharkProgress {
  let progress = createSharkProgress();
  for (let index = 0; index < count; index++) {
    const tokens = sharkContentForTier(sharkTierForTotal(sharkTotal(progress)));
    progress = recordSharkPickup(progress, { pickupId: `test:${index}`, tokenId: tokens[index % tokens.length].id }, now + index);
  }
  return progress;
}
test("collection automatically changes from letters to words to sentences without answer scoring", () => {
  let progress = grow(25);
  assert.equal(progress.letters, 25);
  assert.equal(recordSharkPickup(progress, { pickupId: "premature-word", tokenId: "cat" }, now), progress);
  progress = recordSharkPickup(progress, { pickupId: "last-letter", tokenId: "Z" }, now);
  assert.equal(sharkTotal(progress), 26);
  assert.equal(recordSharkPickup(progress, { pickupId: "late-letter", tokenId: "A" }, now), progress);
  progress = recordSharkPickup(progress, { pickupId: "first-word", tokenId: "dog" }, now);
  assert.equal(progress.words, 1);
  assert.equal(progress.lastAt, now + 24, "late callbacks cannot move the clock back");
  progress = grow(46);
  assert.equal(progress.words, 20);
  assert.equal(progress.sentences, 0);
  progress = recordSharkPickup(progress, { pickupId: "sentence", tokenId: "sentence-can-run" }, now + 500);
  assert.equal(progress.sentences, 1);
  assert.deepEqual(validateSharkProgress(progress), progress);
});
test("one physical pickup settles once and repeating a heard token still counts as exposure", () => {
  let progress = createSharkProgress();
  const event = { pickupId: "swimming-fish:1", tokenId: "A" };
  progress = recordSharkPickup(progress, event, now);
  assert.equal(recordSharkPickup(progress, event, now + 1), progress);
  progress = recordSharkPickup(progress, { pickupId: "swimming-fish:2", tokenId: "A" }, now + 2);
  assert.equal(progress.letters, 2);
  assert.deepEqual(progress.learned, ["A"]);
  assert.equal(recordSharkPickup(progress, { pickupId: "fake", tokenId: "invented" }), progress);
  assert.equal(recordSharkPickup(progress, { pickupId: " ", tokenId: "A" }), progress);
  assert.deepEqual(validateSharkProgress(progress), progress);
});
test("absent old fields migrate, while damaged present backups and impossible tier histories fail", () => {
  assert.deepEqual(validateSharkProgress(undefined), createSharkProgress());
  for (const value of [null, {}, { version: 1 }, { ...createSharkProgress(), extra: true }]) assert.throws(() => validateSharkProgress(value));
  const valid = grow(60);
  assert.deepEqual(validateSharkProgress(JSON.parse(JSON.stringify(valid))), valid);
  const corruptions = [
    (progress: SharkProgress) => { progress.letters = 27; },
    (progress: SharkProgress) => { progress.words = 21; },
    (progress: SharkProgress) => { progress.letters = 25; },
    (progress: SharkProgress) => { progress.words = 19; },
    (progress: SharkProgress) => { progress.learned.push("fake-token"); },
    (progress: SharkProgress) => { progress.learned.push(progress.learned[0]); },
    (progress: SharkProgress) => { progress.recentPickups[1] = progress.recentPickups[0]; },
    (progress: SharkProgress) => { progress.recentPickups.pop(); },
    (progress: SharkProgress) => { progress.totalSeconds = -1; },
    (progress: SharkProgress) => { progress.lastAt = Infinity; },
  ];
  for (const corrupt of corruptions) { const changed = structuredClone(valid); corrupt(changed); assert.throws(() => validateSharkProgress(changed)); }
});
test("long free play bounds unique histories and active time increments", () => {
  let progress = grow(800);
  assert.equal(sharkTotal(progress), 800);
  assert.equal(progress.recentPickups.length, MAX_SHARK_PICKUPS);
  assert.ok(progress.learned.length <= 74);
  assert.equal(new Set(progress.learned).size, progress.learned.length);
  progress = recordSharkTime(progress, 1000, now + 1000);
  assert.equal(progress.totalSeconds, 15);
  progress = recordSharkTime(progress, 2.9, now + 1001);
  assert.equal(progress.totalSeconds, 17);
  assert.equal(recordSharkTime(progress, -2), progress);
  assert.equal(recordSharkTime(progress, NaN), progress);
  assert.deepEqual(validateSharkProgress(progress), progress);
});
test("only completed playback records a listen, independent of collecting or replaying", () => {
  let progress = createSharkProgress();
  assert.equal(progress.listenCount, 0);
  progress = recordSharkPickup(progress, { pickupId: "silent-encounter", tokenId: "A" }, now);
  assert.equal(progress.listenCount, 0);
  progress = recordSharkListen(progress, "A", now + 1);
  progress = recordSharkListen(progress, "A", now + 2);
  assert.equal(progress.listenCount, 2);
  assert.equal(sharkTotal(progress), 1);
  assert.equal(recordSharkListen(progress, "sentence-can-run", now + 3), progress);
  assert.equal(recordSharkListen(progress, "unknown", now + 3), progress);
  assert.deepEqual(validateSharkProgress(progress), progress);
});
test("native pickup ordinals reject stale callbacks even after bounded history is pruned", () => {
  const event = { pickupId: "shark:123:0:0:0", tokenId: "A" };
  let progress = recordSharkPickup(createSharkProgress(), event, now);
  for (let index = 1; index < 400; index++) {
    const pool = sharkContentForTier(sharkTierForTotal(index));
    progress = recordSharkPickup(progress, { pickupId: `shark:123:0:0:${index}`, tokenId: pool[index % pool.length].id }, now + index);
  }
  assert.ok(!progress.recentPickups.includes(event.pickupId));
  assert.equal(recordSharkPickup(progress, event, now + 1000), progress);
  assert.equal(recordSharkPickup(progress, { pickupId: "shark:123:0:0:1000", tokenId: "sentence-can-run" }, now + 1000), progress);
  assert.deepEqual(validateSharkProgress(progress), progress);
});
test("full backups preserve every shark tier, bounded pickup history, completed listens and active play time", () => {
  for (const count of [12, 37, 320]) {
    const progress = createProgress();
    progress.shark = grow(count);
    progress.shark = recordSharkListen(progress.shark, progress.shark.learned[0], now + 1000);
    progress.shark = recordSharkListen(progress.shark, progress.shark.learned.at(-1)!, now + 1001);
    progress.shark = recordSharkTime(progress.shark, 15, now + 1002);
    progress.shark = recordSharkTime(progress.shark, 7, now + 1003);
    const restored = parseBackup(serializeBackup(progress, now + 1100));
    assert.deepEqual(restored, progress);
    assert.deepEqual(restored.shark.learned, progress.shark.learned);
    assert.deepEqual(restored.shark.recentPickups, progress.shark.recentPickups);
    assert.equal(restored.shark.recentPickups.length, Math.min(count, MAX_SHARK_PICKUPS));
    assert.equal(restored.shark.listenCount, 2);
    assert.equal(restored.shark.totalSeconds, 22);
    assert.equal(restored.shark.lastAt, now + 1003);
    assert.equal(sharkTotal(restored.shark), count);
    assert.equal(recordSharkPickup(restored.shark, { pickupId: restored.shark.recentPickups.at(-1)!, tokenId: restored.shark.learned.at(-1)! }), restored.shark);
  }
});
test("older full backups without shark migrate an empty game while preserving existing learning and other games", () => {
  let progress = startRun(createProgress(), "animals-1", now);
  progress = submitAnswer(progress, progress.activeRun!.exercises[0].answer, now + 1000).progress;
  progress.adventure = saveAdventureGrowth(progress.adventure, "fish", 72, ["fish", "cat"], 9, now + 1100);
  progress.playground = recordPlaygroundTime(progress.playground, "garden", 12);
  progress.settings = { music: false, volume: .4 };
  for (const version of [1, 2, 3]) {
    const legacy = JSON.parse(serializeBackup(progress, now + 2000));
    legacy.version = version;
    delete legacy.progress.shark;
    const restored = parseBackup(JSON.stringify(legacy));
    assert.deepEqual(restored.shark, createSharkProgress());
    assert.deepEqual(restored, progress, `backup v${version} preserves existing course answers, learning cards, adventure, playground and settings`);
  }
  const localLegacy = JSON.parse(JSON.stringify(progress));
  delete localLegacy.shark;
  assert.deepEqual(validateProgress(localLegacy), progress);
});
test("full backup import rejects a present damaged shark state instead of silently starting over", () => {
  const progress = createProgress();
  progress.shark = grow(60);
  const backup = JSON.parse(serializeBackup(progress, now + 1000));
  const changes = [
    (value: typeof backup) => { value.progress.shark = null; },
    (value: typeof backup) => { value.progress.shark.version = 2; },
    (value: typeof backup) => { value.progress.shark.words = 21; },
    (value: typeof backup) => { value.progress.shark.letters = 25; },
    (value: typeof backup) => { value.progress.shark.learned[0] = "invented-English"; },
    (value: typeof backup) => { value.progress.shark.recentPickups[1] = value.progress.shark.recentPickups[0]; },
    (value: typeof backup) => { value.progress.shark.recentPickups.pop(); },
    (value: typeof backup) => { delete value.progress.shark.listenCount; },
    (value: typeof backup) => { value.progress.shark.listenCount = -1; },
    (value: typeof backup) => { value.progress.shark.totalSeconds = "15"; },
    (value: typeof backup) => { value.progress.shark.quizAccuracy = 1; },
  ];
  for (const change of changes) { const damaged = structuredClone(backup); change(damaged); assert.throws(() => parseBackup(JSON.stringify(damaged))); }
});
