import test from "node:test";
import assert from "node:assert/strict";
import * as course from "../lib/course";
import { createDemoProgress } from "../lib/demo-progress";
import { destinationLessons, destinations } from "../lib/destinations";
import { isLessonUnlocked, parseBackup, serializeBackup, settleRun, startRun, submitAnswer } from "../lib/progress";
import { componentHost } from "./helpers/component-host";
import type { ExplorationGameProps } from "../components/exploration-games";

function mount(name: "BubbleGame" | "DeliveryGame" | "ConnectionGame", exercise: course.Exercise) {
  const answers: string[] = [];
  let props: ExplorationGameProps & { completedWordIds: string[] } = { exercise, disabled: false, busy: false, suspended: false, hinted: false, completedWordIds: [], onAnswer: answer => answers.push(answer) };
  const host = componentHost(new URL("../components/exploration-games.tsx", import.meta.url), name, props, () => ({
    "@/lib/course": course, "@/components/word-art": { WordArt: "WordArt" },
  }));
  return { ...host, answers, update(next: Partial<typeof props>) { props = { ...props, ...next }; host.update(props); } };
}
test("bubble needs both distinct target tokens and rejects repeated or premature clicks", () => {
  const exercise = course.getLesson("animals-11").exercises[0], host = mount("BubbleGame", exercise);
  const targets = host.nodes().filter(node => node.type === "button" && String(node.props["data-token"]).startsWith(exercise.answer));
  host.click(targets[0]); host.click(targets[0]); assert.deepEqual(host.answers, []);
  host.update({ busy: true }); assert.equal(host.click(host.button(`${course.getWord(exercise.answer).zh}泡泡，另一张`)), false);
  host.update({ busy: false }); host.click(host.button(`${course.getWord(exercise.answer).zh}泡泡，另一张`));
  (targets[1].props.onClick as () => void)(); assert.deepEqual(host.answers, [exercise.answer]); host.unmount();
});
test("bubble wrong click records once, keeps partial collection, and reopens after retry", () => {
  const exercise = course.getLesson("food-11").exercises[0], host = mount("BubbleGame", exercise);
  host.click(host.button(`${course.getWord(exercise.answer).zh}泡泡，第一张`));
  const wrongId = exercise.options.find(id => id !== exercise.answer)!, wrong = host.button(`${course.getWord(wrongId).zh}泡泡，第一张`);
  host.click(wrong); (wrong.props.onClick as () => void)(); assert.deepEqual(host.answers, [wrongId]);
  host.update({ busy: true }); host.update({ busy: false });
  host.click(host.button(`${course.getWord(exercise.answer).zh}泡泡，另一张`)); assert.deepEqual(host.answers, [wrongId, exercise.answer]); host.unmount();
});
test("delivery requires a full tray, supports separate repeated tokens and removal without answering", () => {
  const exercise = course.getLesson("food-12").exercises[2], host = mount("DeliveryGame", exercise); assert.equal(exercise.requiredCount, 3);
  host.click(host.button(`装入一份${course.getWord(exercise.answer).zh}`));
  assert.equal(host.click(host.button("送给乐乐，检查整张订单")), false); assert.deepEqual(host.answers, []);
  host.click(host.button(`装入一份${course.getWord(exercise.answer).zh}`)); host.click(host.button(`装入一份${course.getWord(exercise.answer).zh}`));
  host.click(host.button(`拿回第2份${course.getWord(exercise.answer).zh}`)); assert.deepEqual(host.answers, []);
  host.click(host.button(`装入一份${course.getWord(exercise.answer).zh}`)); const send = host.button("送给乐乐，检查整张订单");
  host.click(send); (send.props.onClick as () => void)(); assert.deepEqual(host.answers, [exercise.answer]); host.unmount();
});
test("wrong delivery can be corrected after voice without submitting the same plate twice", () => {
  const exercise = course.getLesson("toys-12").exercises[0], host = mount("DeliveryGame", exercise), wrongId = exercise.options.find(id => id !== exercise.answer)!;
  host.click(host.button(`装入一份${course.getWord(wrongId).zh}`)); const send = host.button("送给乐乐，检查整张订单");
  host.click(send); (send.props.onClick as () => void)(); assert.deepEqual(host.answers, [wrongId]);
  host.update({ busy: true }); host.update({ busy: false }); host.click(host.button(`拿回第1份${course.getWord(wrongId).zh}`));
  host.click(host.button(`装入一份${course.getWord(exercise.answer).zh}`)); host.click(host.button("送给乐乐，检查整张订单")); assert.deepEqual(host.answers, [wrongId, exercise.answer]); host.unmount();
});
test("connections preserve successful lines across prompts and reconstruct from recorded words", () => {
  const lesson = course.getLesson("animals-13"), first = lesson.exercises[0], next = lesson.exercises[1], host = mount("ConnectionGame", first);
  host.click(host.button(`英文词 ${course.getWord(first.answer).en}`)); host.click(host.button(`${course.getWord(first.answer).zh}图片`));
  assert.deepEqual(host.answers, [first.answer]); host.update({ exercise: next, completedWordIds: [first.answer] });
  assert.equal(host.nodes().filter(node => node.type === "path").length, 1);
  assert.equal(host.button(`英文词 ${course.getWord(first.answer).en}，已经连好`).props.disabled, true);
  host.click(host.button(`英文词 ${course.getWord(next.answer).en}`)); host.click(host.button(`${course.getWord(next.answer).zh}图片`)); assert.deepEqual(host.answers, [first.answer, next.answer]);
  const restored = mount("ConnectionGame", next); restored.update({ completedWordIds: [first.answer] }); assert.equal(restored.nodes().filter(node => node.type === "path").length, 1); host.unmount(); restored.unmount();
});
test("wrong connection never draws a completed line; current-word selection and audio gates are enforced", () => {
  const exercise = course.getLesson("animals-13").exercises[0], host = mount("ConnectionGame", exercise), wrongId = exercise.options.find(id => id !== exercise.answer)!;
  host.click(host.button(`英文词 ${course.getWord(wrongId).en}`)); host.click(host.button(`${course.getWord(exercise.answer).zh}图片`)); assert.deepEqual(host.answers, []);
  host.click(host.button(`英文词 ${course.getWord(exercise.answer).en}`)); host.click(host.button(`${course.getWord(wrongId).zh}图片`)); assert.deepEqual(host.answers, [wrongId]);
  assert.equal(host.nodes().filter(node => node.type === "path").length, 0); host.update({ busy: true }); assert.equal(host.click(host.button(`${course.getWord(exercise.answer).zh}图片`)), false);
  host.update({ busy: false }); host.click(host.button(`${course.getWord(exercise.answer).zh}图片`)); assert.deepEqual(host.answers, [wrongId, exercise.answer]); host.unmount();
});
test("all seven destinations have real lessons, and new games roundtrip mid-run without duplicate rewards", () => {
  assert.equal(destinations.length, 7); assert.equal(new Set(destinations.map(item => item.id)).size, 7);
  assert.ok(destinations.every(destination => destinationLessons(destination.id).length > 0));
  const original = createDemoProgress(); assert.equal(original.stars, 19);
  for (const topic of course.topics) for (const order of [11, 12, 13, 14]) {
    let p = startRun(original, `${topic.id}-${order}`);
    assert.equal(isLessonUnlocked(p, `${topic.id}-${order}`), true);
    p = submitAnswer(p, p.activeRun!.exercises[0].answer).progress;
    p = parseBackup(serializeBackup(p)); assert.equal(p.activeRun!.index, 1);
    while (p.activeRun!.index < 6) p = submitAnswer(p, p.activeRun!.exercises[p.activeRun!.index].answer).progress;
    const complete = settleRun(p); assert.equal(complete.stars, 20); assert.equal(settleRun(p).stars, 20); assert.equal(parseBackup(serializeBackup(complete)).stars, 20);
  }
});
test("connection groups remain contiguous under shuffling; altered group order or order counts are rejected", () => {
  for (let sample = 0; sample < 20; sample++) {
    const run = course.createRun("animals-13");
    for (const offset of [0, 3]) {
      const group = run.slice(offset, offset + 3);
      assert.equal(new Set(group.map(item => [...item.options].sort().join(":"))).size, 1);
      assert.equal(new Set(group.map(item => item.options.join(":"))).size, 1, "column order must survive changing prompts and refresh");
    }
  }
  const serve = startRun(createDemoProgress(), "food-12"); const edited = JSON.parse(serializeBackup(serve)); edited.progress.activeRun.exercises[0].requiredCount = 9;
  assert.throws(() => parseBackup(JSON.stringify(edited)));
  const connections = startRun(createDemoProgress(), "toys-13"), changed = JSON.parse(serializeBackup(connections));
  [changed.progress.activeRun.exercises[1], changed.progress.activeRun.exercises[4]] = [changed.progress.activeRun.exercises[4], changed.progress.activeRun.exercises[1]];
  assert.throws(() => parseBackup(JSON.stringify(changed)));
});
