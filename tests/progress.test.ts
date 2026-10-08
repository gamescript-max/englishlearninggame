import test from "node:test";
import assert from "node:assert/strict";
import audioManifest from "../public/audio/manifest.json";
import bundledAudioManifest from "../lib/audio-manifest.json";
import { createRun, getLesson, getSceneExercise, lessons, supportWords, topics, words } from "../lib/course";
import { createProgress, dayKey, getDueWords, getFollowingLesson, getNextLesson, getStats, isLessonUnlocked, isTopicUnlocked, nextDayAt, parseBackup, recordListen, recordSpeaking, serializeBackup, settleRun, startRun, submitAnswer, useHint as markHint, type Progress } from "../lib/progress";

const morning = Date.UTC(2026, 9, 4, 1);

function complete(progress: Progress, lessonId: string, now = morning): Progress {
  let value = startRun(progress, lessonId, now);
  while (value.activeRun && value.activeRun.index < value.activeRun.exercises.length) {
    const question = value.activeRun.exercises[value.activeRun.index];
    value = submitAnswer(value, question.answer, now + (value.activeRun.index + 1) * 1000).progress;
  }
  return settleRun(value, now + 7000);
}

function completeFirstTopic(): Progress {
  let value = createProgress();
  for (let order = 1; order <= 5; order++) value = complete(value, `animals-${order}`, morning + order * 10000);
  return value;
}

function completeAllCore(): Progress {
  let value = createProgress();
  let now = morning;
  for (const topic of topics) {
    for (let order = 1; order <= 5; order++) value = complete(value, `${topic.id}-${order}`, now + order * 10000);
    now = nextDayAt(now) + 10000;
    value = complete(value, `${topic.id}-6`, now);
    now += 10000;
  }
  return value;
}

test("following adventures continue the course and skip tomorrow's locked review", () => {
  const first = complete(createProgress(), "animals-1");
  assert.equal(getFollowingLesson(first, "animals-1", morning + 8000)?.id, "animals-2");
  const topic = completeFirstTopic();
  assert.equal(isLessonUnlocked(topic, "animals-6", morning + 60000), false);
  assert.equal(getFollowingLesson(topic, "animals-5", morning + 60000)?.id, "food-1");
});

test("bonus celebrations prefer the same game in another unlocked theme", () => {
  let progress = completeAllCore();
  const now = morning + 7 * 86400000;
  progress = complete(progress, "animals-14", now);
  assert.equal(getFollowingLesson(progress, "animals-14", now + 8000)?.id, "food-14");
  assert.equal(progress.stars, settleRun(progress, now + 8000).stars);
});

test("a completed review with remaining mistakes does not trap continuation on that review", () => {
  let progress = startRun(completeFirstTopic(), "animals-6", morning + 86400000);
  const exercise = progress.activeRun!.exercises[0];
  progress = submitAnswer(progress, exercise.options.find(id => id !== exercise.answer)!, morning + 86401000).progress;
  while (progress.activeRun && progress.activeRun.index < 6) progress = submitAnswer(progress, progress.activeRun.exercises[progress.activeRun.index].answer, morning + 86402000).progress;
  progress = settleRun(progress, morning + 86403000);
  const now = morning + 2 * 86400000;
  assert.equal(getNextLesson(progress, now)?.id, "animals-6");
  assert.equal(getFollowingLesson(progress, "animals-6", now)?.id, "food-1");
});

test("the finished course offers an unlocked replay while preserving all rewards", () => {
  let progress = completeAllCore();
  const now = morning + 7 * 86400000;
  for (const lesson of lessons.filter(lesson => lesson.isBonus)) progress = complete(progress, lesson.id, now);
  assert.equal(getNextLesson(progress, now + 8000), null);
  const following = getFollowingLesson(progress, "toys-14", now + 8000)!;
  assert.equal(following.id, "animals-14");
  assert.equal(isLessonUnlocked(progress, following.id, now + 8000), true);
  assert.equal(complete(progress, following.id, now + 10000).stars, progress.stars);
});

test("course preserves 18 core lessons and offers twenty-four six-question bonus games", () => {
  assert.equal(words.length, 24);
  assert.deepEqual(words.map((word) => word.spriteIndex), Array.from({ length: 24 }, (_, index) => index));
  assert.equal(new Set(words.map((word) => word.id)).size, 24);
  assert.equal(lessons.length, 42);
  assert.equal(lessons.filter((lesson) => !lesson.isBonus).length, 18);
  assert.equal(lessons.filter((lesson) => lesson.isBonus).length, 24);
  for (const topic of topics) {
    assert.equal(topic.wordIds.length, 8);
    assert.equal(topic.phrases.length, 3);
    assert.deepEqual(lessons.filter((lesson) => lesson.topicId === topic.id && lesson.isBonus).map((lesson) => [lesson.order, lesson.exercises[0].kind, lesson.prerequisiteLessonId]), [
      [7, "memory", `${topic.id}-1`], [8, "spell", `${topic.id}-3`], [9, "scene", `${topic.id}-5`],
      [10, "snake", `${topic.id}-1`],
      [11, "bubble", `${topic.id}-1`], [12, "serve", `${topic.id}-2`], [13, "connect", `${topic.id}-3`], [14, "catch", `${topic.id}-1`],
    ]);
    const seen = new Set(lessons.filter((lesson) => lesson.topicId === topic.id && lesson.order <= 4).flatMap((lesson) => lesson.exercises.map((question) => question.wordId)));
    assert.deepEqual([...seen].sort(), [...topic.wordIds].sort());
  }
  for (const lesson of lessons) {
    const run = createRun(lesson.id, [], () => 0.4);
    assert.equal(run.length, 6);
    assert.equal(new Set(run.map((exercise) => exercise.id)).size, 6);
    for (const exercise of run) {
      assert.ok(exercise.options.includes(exercise.answer));
      assert.equal(new Set(exercise.options).size, exercise.options.length);
      if (exercise.kind === "place") assert.deepEqual([...exercise.options].sort(), ["in", "on", "under"]);
      if (exercise.kind === "scene") {
        assert.equal(exercise.options.length, 3);
        assert.deepEqual([...exercise.options].sort(), exercise.scenes!.map((scene) => scene.id).sort());
      }
    }
  }
});

test("Shanghai day boundaries determine tomorrow and review availability", () => {
  assert.equal(dayKey(Date.UTC(2026, 9, 4, 15, 59, 59)), "2026-10-04");
  assert.equal(dayKey(Date.UTC(2026, 9, 4, 16)), "2026-10-05");
  assert.equal(nextDayAt(morning), Date.UTC(2026, 9, 4, 16));
  const value = completeFirstTopic();
  assert.equal(isLessonUnlocked(value, "animals-6", Date.UTC(2026, 9, 4, 15, 59)), false);
  assert.equal(isLessonUnlocked(value, "animals-6", nextDayAt(morning)), true);
  assert.equal(isTopicUnlocked(value, "food"), true);
  assert.equal(isTopicUnlocked(value, "toys"), false);
  assert.throws(() => startRun(createProgress(), "food-1", morning));
  assert.throws(() => startRun(createProgress(), "animals-2", morning));
});

test("every generated teaching prompt and every phrase has a fixed audio resource", () => {
  assert.deepEqual(bundledAudioManifest, audioManifest, "bundled and downloadable audio indexes must agree");
  const english = audioManifest.speech.en as Record<string, string>;
  const chinese = audioManifest.speech.zh as Record<string, string>;
  for (const word of words) {
    assert.equal(word.audio, english[word.en]);
    assert.ok(word.audio);
    for (const prompt of [`Listen and find the ${word.en}.`, `Find the ${word.en}.`, `Put the ${word.en} in the box.`, `Put the ${word.en} on the table.`, `Put the ${word.en} under the table.`]) assert.ok(english[prompt], prompt);
  }
  for (const topic of topics) for (const phrase of topic.phrases) assert.ok(english[phrase.en], phrase.en);
  for (const word of supportWords) assert.ok(english[word.en], word.en);
  for (const lesson of lessons) for (const exercise of lesson.exercises) assert.ok(chinese[exercise.promptZh], exercise.promptZh);
});

test("wrong answers persist immediately, keep the question, and schedule tomorrow", () => {
  let value = startRun(createProgress(), "animals-1", morning);
  const question = value.activeRun!.exercises[0];
  const wrong = question.options.find((option) => option !== question.answer)!;
  const result = submitAnswer(value, wrong, morning + 1000);
  value = result.progress;
  assert.equal(result.correct, false);
  assert.equal(value.activeRun!.index, 0);
  assert.equal(value.activeRun!.current.attempts, 1);
  assert.equal(value.activeRun!.current.firstCorrect, false);
  assert.equal(value.review[0].wordId, question.wordId);
  assert.deepEqual(getDueWords(value, morning), []);
  assert.deepEqual(getDueWords(value, nextDayAt(morning)), [question.wordId]);
  value = submitAnswer(value, question.answer, morning + 2000).progress;
  assert.equal(value.activeRun!.index, 1);
  assert.equal(value.attempts[0].firstCorrect, false);
  assert.equal(value.attempts[0].attempts, 2);
  assert.equal(value.review.length, 1);
});

test("hinted answers are practice, and listening/speaking remain separate metrics", () => {
  let value = startRun(createProgress(), "animals-1", morning);
  value = recordListen(value, morning + 1000);
  value = recordListen(value, morning + 2000);
  value = markHint(value, morning + 3000);
  const question = value.activeRun!.exercises[0];
  value = submitAnswer(value, question.answer, morning + 4000).progress;
  assert.equal(value.attempts[0].firstCorrect, false);
  assert.equal(value.attempts[0].hintUsed, true);
  assert.equal(value.attempts[0].listenCount, 2);
  const before = getStats(value, morning);
  value = recordSpeaking(value);
  const after = getStats(value, morning);
  assert.equal(after.speakingCount, 1);
  assert.equal(after.accuracy, before.accuracy);
  assert.equal(after.answered, before.answered);
  assert.equal(after.hints, 1);
  assert.equal(after.totalSeconds, 4);
});

test("first completion earns one star and settlement cannot be repeated", () => {
  let value = complete(createProgress(), "animals-1");
  assert.equal(value.stars, 1);
  assert.equal(value.activeRun, null);
  assert.equal(settleRun(value, morning + 8000).stars, 1);
  value = complete(value, "animals-1", morning + 10000);
  assert.equal(value.stars, 1);
  assert.equal(value.completed["animals-1"].completions, 2);
  assert.equal(value.completed["animals-1"].completedAt, morning + 7000);
});

test("a completed stale run cannot receive a second settlement", () => {
  let pending = startRun(createProgress(), "animals-1", morning);
  while (pending.activeRun!.index < 6) pending = submitAnswer(pending, pending.activeRun!.exercises[pending.activeRun!.index].answer, morning + 1000).progress;
  const completed = settleRun(pending, morning + 2000);
  const stale = { ...completed, activeRun: pending.activeRun };
  const settledAgain = settleRun(stale, morning + 3000);
  assert.equal(settledAgain.stars, 1);
  assert.equal(settledAgain.completed["animals-1"].completions, 1);
  assert.equal(settledAgain.activeRun, null);
  assert.throws(() => parseBackup(serializeBackup(stale)));
});

test("review contains due mistakes and clears only independently recalled answers", () => {
  let value = startRun(createProgress(), "animals-1", morning);
  const first = value.activeRun!.exercises[0];
  value = submitAnswer(value, first.options.find((option) => option !== first.answer)!, morning + 1000).progress;
  value = complete(value, "animals-1", morning + 2000);
  for (let order = 2; order <= 5; order++) value = complete(value, `animals-${order}`, morning + order * 10000);
  assert.ok(value.review.some((item) => item.wordId === first.wordId));
  value = startRun(value, "animals-6", nextDayAt(morning) + 10000);
  assert.ok(value.activeRun!.exercises.some((exercise) => exercise.wordId === first.wordId));
  while (value.activeRun!.index < 6) {
    const question = value.activeRun!.exercises[value.activeRun!.index];
    value = submitAnswer(value, question.answer, nextDayAt(morning) + 11000 + value.activeRun!.index * 1000).progress;
  }
  assert.equal(value.review.some((item) => item.wordId === first.wordId), false);
});

test("review pays at most once per Shanghai date across all replay rounds", () => {
  let value = completeFirstTopic();
  assert.equal(value.stars, 5);
  const tomorrow = nextDayAt(morning) + 10000;
  value = complete(value, "animals-6", tomorrow);
  assert.equal(value.stars, 7, "first lesson star plus first daily review star");
  value = complete(value, "animals-6", tomorrow + 10000);
  assert.equal(value.stars, 7);
  value = complete(value, "animals-6", nextDayAt(tomorrow) + 10000);
  assert.equal(value.stars, 8);
  assert.equal(value.reviewRewardDays.length, 2);
  assert.deepEqual(parseBackup(serializeBackup(value)), value);
});

test("backup roundtrip preserves exact question order and in-progress mistakes", () => {
  let value = startRun(createProgress(), "animals-1", morning);
  const firstQuestion = value.activeRun!.exercises[0];
  value = submitAnswer(value, firstQuestion.answer, morning + 1000).progress;
  const secondQuestion = value.activeRun!.exercises[1];
  value = submitAnswer(value, secondQuestion.options.find((option) => option !== secondQuestion.answer)!, morning + 2000).progress;
  value = markHint(value, morning + 3000);
  const restored = parseBackup(serializeBackup(value, morning + 4000));
  assert.deepEqual(restored, value);
  assert.equal(restored.activeRun!.index, 1);
  assert.deepEqual(restored.activeRun!.exercises, value.activeRun!.exercises);
  assert.equal(getNextLesson(restored, morning)?.id, "animals-1");
});

test("bad versions, reward values, invalid answers, and impossible unlocks are rejected", () => {
  const initial = createProgress();
  const envelope = JSON.parse(serializeBackup(initial));
  assert.throws(() => parseBackup("not json"));
  assert.throws(() => parseBackup(JSON.stringify({ ...envelope, version: 999 })));
  assert.throws(() => parseBackup(JSON.stringify({ ...envelope, progress: { ...initial, stars: -1 } })));
  assert.throws(() => parseBackup(JSON.stringify({ ...envelope, progress: { ...initial, stars: 999 } })));
  assert.throws(() => parseBackup(JSON.stringify({ ...envelope, progress: { ...initial, completed: { "animals-1": { completedAt: morning, lastCompletedAt: morning, completions: 1 } }, stars: 1 } })));
  assert.throws(() => parseBackup(JSON.stringify({ ...envelope, progress: { ...initial, settings: { music: true, volume: 2 } } })));
  assert.throws(() => parseBackup(JSON.stringify({ ...envelope, progress: { ...initial, completed: { "toys-1": { completedAt: morning, lastCompletedAt: morning, completions: 1 } }, stars: 1 } })));
  const active = startRun(initial, "animals-1", morning);
  active.activeRun!.exercises[0].answer = "unknown";
  assert.throws(() => parseBackup(serializeBackup(active)));
});

test("an incorrect backup cannot turn recording into curriculum mastery", () => {
  const initial = createProgress();
  const malformed = { ...initial, speakingCount: 100, completed: { "animals-6": { completedAt: morning, lastCompletedAt: morning, completions: 1 } }, stars: 1 };
  assert.throws(() => parseBackup(serializeBackup(malformed)));
  assert.equal(getLesson("animals-6").isReview, true);
});

test("bonus prerequisites are independent of the next-day review and other bonuses", () => {
  let value = createProgress();
  for (const id of ["animals-7", "animals-8", "animals-9"]) assert.equal(isLessonUnlocked(value, id, morning), false);
  value = complete(value, "animals-1");
  assert.equal(isLessonUnlocked(value, "animals-7", morning), true);
  assert.equal(isLessonUnlocked(value, "animals-8", morning), false);
  assert.equal(getNextLesson(value, morning)?.id, "animals-2", "core lesson remains the recommendation");
  value = complete(value, "animals-7", morning + 10000);
  assert.equal(value.stars, 2);
  assert.equal(isTopicUnlocked(value, "food"), false, "bonus cannot substitute for the core mixed task");
  assert.deepEqual(parseBackup(serializeBackup(value)), value);
  value = complete(value, "animals-2", morning + 20000);
  value = complete(value, "animals-3", morning + 30000);
  assert.equal(isLessonUnlocked(value, "animals-8", morning), true);
  assert.equal(isLessonUnlocked(value, "animals-9", morning), false);
  const coreOnly = completeFirstTopic();
  assert.equal(isLessonUnlocked(coreOnly, "animals-8", morning), true, "bonus 7 is optional");
  assert.equal(isLessonUnlocked(coreOnly, "animals-9", morning), true, "bonus 8 and review are optional");
  assert.equal(isLessonUnlocked(coreOnly, "animals-6", morning), false);
  assert.equal(isTopicUnlocked(coreOnly, "food"), true);
  assert.equal(getNextLesson(coreOnly, morning)?.id, "food-1");
  assert.equal(isLessonUnlocked(coreOnly, "food-7", morning), false);
});

test("all four bonus kinds record failed attempts and hints, save mid-round, and pay only once", () => {
  let value = completeFirstTopic();
  for (const [offset, kind] of ["memory", "spell", "scene", "snake"].entries()) {
    const lessonId = `animals-${offset + 7}`;
    const now = morning + (offset + 10) * 10000;
    value = startRun(value, lessonId, now);
    const question = value.activeRun!.exercises[0];
    assert.equal(question.kind, kind);
    const wrong = question.options.find((option) => option !== question.answer)!;
    value = submitAnswer(value, wrong, now + 1000).progress;
    value = recordListen(value, now + 2000);
    value = markHint(value, now + 3000);
    const restored = parseBackup(serializeBackup(value));
    assert.deepEqual(restored, value, `${kind} round survives a version 1 backup`);
    value = submitAnswer(restored, question.answer, now + 4000).progress;
    const answer = value.attempts.at(-1)!;
    assert.equal(answer.firstCorrect, false);
    assert.equal(answer.hintUsed, true);
    assert.equal(answer.attempts, 2);
    assert.equal(answer.listenCount, 1);
    assert.ok(value.review.some((item) => item.wordId === question.wordId));
    value = complete(value, lessonId, now + 5000);
    const stars = value.stars;
    assert.equal(stars, offset + 6);
    assert.equal(value.reviewRewardDays.length, 0, "bonus completion is not a daily review");
    value = complete(value, lessonId, now + 20000);
    assert.equal(value.stars, stars);
    assert.equal(value.completed[lessonId].completions, 2);
    assert.deepEqual(parseBackup(serializeBackup(value)), value);
  }
});

test("a full old 18-lesson version 1 archive restores unchanged and then recommends bonuses", () => {
  const legacy = completeAllCore();
  assert.equal(Object.keys(legacy.completed).length, 18);
  assert.equal(legacy.version, 1);
  assert.ok(Object.keys(legacy.completed).every((id) => !getLesson(id).isBonus));
  assert.deepEqual(parseBackup(serializeBackup(legacy)), legacy);
  const afterAllCore = Math.max(...Object.values(legacy.completed).map((item) => item.lastCompletedAt)) + 1000;
  assert.equal(getNextLesson(legacy, afterAllCore)?.id, "animals-7");
  const midRound = startRun(legacy, "toys-9", afterAllCore);
  assert.deepEqual(parseBackup(serializeBackup(midRound)), midRound);
});

test("a full previous 27-lesson archive keeps its rewards and opens only the new snake levels", () => {
  let previous = completeAllCore();
  const now = morning + 7 * 24 * 60 * 60 * 1000;
  for (const topic of topics) for (const order of [7, 8, 9]) previous = complete(previous, `${topic.id}-${order}`, now);
  const restored = parseBackup(serializeBackup(previous));
  assert.deepEqual(restored, previous);
  assert.equal(Object.keys(restored.completed).length, 27);
  assert.equal(getNextLesson(restored, now)?.id, "animals-10");
  for (const topic of topics) assert.equal(isLessonUnlocked(restored, `${topic.id}-10`, now), true);
  assert.equal(restored.stars, previous.stars);
});

test("a complete previous 30-lesson archive preserves every record and reward while opening nine new games", () => {
  let previous = completeAllCore();
  const now = morning + 7 * 24 * 60 * 60 * 1000;
  for (const topic of topics) for (const order of [7, 8, 9, 10]) previous = complete(previous, `${topic.id}-${order}`, now);
  const restored = parseBackup(serializeBackup(previous));
  assert.deepEqual(restored, previous); assert.equal(Object.keys(restored.completed).length, 30);
  assert.equal(restored.stars, previous.stars); assert.equal(getNextLesson(restored, now)?.id, "animals-11");
  for (const topic of topics) for (const order of [11, 12, 13]) assert.equal(isLessonUnlocked(restored, `${topic.id}-${order}`, now), true);
});

test("a previous complete 39-lesson archive keeps all progress and adds three catch adventures", () => {
  let previous = completeAllCore();
  const now = morning + 7 * 24 * 60 * 60 * 1000;
  for (const topic of topics) for (let order = 7; order <= 13; order++) previous = complete(previous, `${topic.id}-${order}`, now);
  const restored = parseBackup(serializeBackup(previous));
  assert.deepEqual(restored, previous); assert.equal(Object.keys(restored.completed).length, 39);
  assert.equal(getNextLesson(restored, now)?.id, "animals-14");
  const active = startRun(restored, "animals-14", now);
  assert.deepEqual(parseBackup(serializeBackup(active)), active);
  const changed = JSON.parse(serializeBackup(active)); changed.progress.activeRun.exercises[0].promptEn = "Eat everything.";
  assert.throws(() => parseBackup(JSON.stringify(changed)));
});

test("scene meanings, targets, and picture metadata are canonical and resist altered backups", () => {
  const value = startRun(completeFirstTopic(), "animals-9", morning + 100000);
  assert.deepEqual(parseBackup(serializeBackup(value)), value);
  const tamper = (change: (progress: Progress) => void): void => {
    const modified: Progress = structuredClone(value);
    change(modified);
    assert.throws(() => parseBackup(serializeBackup(modified)));
  };
  tamper((progress) => { const question = progress.activeRun!.exercises[0]; question.answer = question.options.find((option) => option !== question.answer)!; });
  tamper((progress) => { const question = progress.activeRun!.exercises.find((exercise) => exercise.promptEn === "I can see two dogs.")!; question.scenes!.find((scene) => scene.count === 2)!.count = 3; });
  tamper((progress) => { const question = progress.activeRun!.exercises.find((exercise) => exercise.promptEn === "The bird is blue.")!; question.scenes!.find((scene) => scene.id === question.answer)!.variant = "review"; });
  tamper((progress) => { const scene = progress.activeRun!.exercises[0].scenes![0]; scene.wordId = scene.wordId === "rabbit" ? "cat" : "rabbit"; });
  tamper((progress) => { progress.activeRun!.exercises[0].promptEn = "It is a dog."; });
  tamper((progress) => { progress.activeRun!.exercises[0].scenes![1] = { ...progress.activeRun!.exercises[0].scenes![0] }; });
  for (const topic of topics) {
    for (let index = 0; index < 6; index++) {
      const question = getSceneExercise(topic.id, index);
      assert.equal(question.id, `${topic.id}-9-q${index + 1}`);
      assert.ok(question.scenes!.some((scene) => scene.id === question.answer && scene.wordId === question.wordId));
      assert.notEqual(question.promptEn, "Here you are.", "a response without a pictured target cannot be a scored listening question");
    }
  }
  assert.throws(() => getSceneExercise("animals", 6));
});

test("scene display order follows shuffled options and survives a mid-round backup", () => {
  for (const topic of topics) {
    const run = createRun(`${topic.id}-9`, [], () => 0);
    for (const question of run) assert.deepEqual(question.scenes!.map((scene) => scene.id), question.options);
    assert.ok(run.some((question) => question.scenes![0].id !== question.answer), "displayed correct choices are not fixed to the first card");
  }
  const value = startRun(completeFirstTopic(), "animals-9", morning + 100000);
  value.activeRun!.exercises = createRun("animals-9", [], () => 0);
  const restored = parseBackup(serializeBackup(value));
  assert.deepEqual(restored, value, "validation accepts shuffled scene arrays and preserves them on refresh");
  assert.ok(createRun("animals-9", [], () => 0.999).some((question) => question.scenes![0].id === question.answer), "random order may naturally put the answer first");
});

test("backup rejects bonus completion or current run without its core prerequisite", () => {
  const completed = complete(complete(createProgress(), "animals-1"), "animals-7", morning + 10000);
  const missingPrerequisite = structuredClone(completed);
  delete missingPrerequisite.completed["animals-1"];
  missingPrerequisite.stars--;
  assert.throws(() => parseBackup(serializeBackup(missingPrerequisite)));
  const current = startRun(completeFirstTopic(), "animals-8", morning + 100000);
  const modified = structuredClone(current);
  delete modified.completed["animals-3"];
  modified.stars--;
  assert.throws(() => parseBackup(serializeBackup(modified)));
  current.activeRun!.exercises[0].promptEn = "dog";
  assert.throws(() => parseBackup(serializeBackup(current)), "spelling audio cannot be changed independently of the target word");
});

