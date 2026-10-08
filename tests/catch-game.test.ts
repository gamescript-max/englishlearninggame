import test from "node:test";
import assert from "node:assert/strict";
import * as course from "../lib/course";
import type { ExplorationGameProps } from "../components/exploration-games";
import { componentHost } from "./helpers/component-host";

function mount(initial: Partial<ExplorationGameProps> = {}) {
  const answers: string[] = [];
  let props: ExplorationGameProps = { exercise: course.getLesson("animals-14").exercises[0], disabled: false, busy: false, suspended: false, hinted: false, onAnswer: answer => answers.push(answer), ...initial };
  const host = componentHost(new URL("../components/catch-game.tsx", import.meta.url), "CatchGame", props, () => ({ "@/lib/course": course, "@/components/word-art": { WordArt: "WordArt" } }));
  return { ...host, answers, update(next: Partial<ExplorationGameProps>) { props = { ...props, ...next }; host.update(props); },
    laneFor(id: string) { return Number(host.byClass("catch-star").find(node => node.props["data-word"] === id)!.props["data-lane"]); },
    choose(lane: number) { host.click(host.button(`移到${["左边", "中间", "右边"][lane]}轨道`)); },
  };
}
test("basket tap prepares during voice, catches exactly once and releases timers on leave", () => {
  const host = mount({ busy: true, disabled: true });
  host.choose(host.laneFor(course.getLesson("animals-14").exercises[0].answer));
  host.advance(7000); assert.equal(host.answers.length, 0); assert.equal(host.state(1), 0);
  host.update({ busy: false, disabled: false }); host.advance(4950); assert.equal(host.answers.length, 1);
  assert.equal(host.answers[0], course.getLesson("animals-14").exercises[0].answer);
  host.advance(7000); assert.equal(host.answers.length, 1); host.unmount(); assert.equal(host.timerCount(), 0); assert.equal(host.listenerCount(), 0);
});
test("wrong catch waits for replay and keyboard stays usable for the retry", () => {
  const host = mount(), target = { matches: () => false, closest: () => null };
  const correct = course.getLesson("animals-14").exercises[0].answer;
  host.choose((host.laneFor(correct) + 1) % 3); host.advance(4950); assert.notEqual(host.answers[0], correct);
  host.update({ busy: true }); host.advance(6000); assert.equal(host.answers.length, 1);
  host.update({ busy: false }); host.choose(2);
  host.event("window", "keydown", { key: "ArrowLeft", target, preventDefault() {} }); assert.equal(host.state(0), 1);
  host.choose(host.laneFor(correct)); host.advance(4950); assert.equal(host.answers[1], correct); host.unmount();
});
test("modal and background cancel intent; audio failure freezes a prepared basket", () => {
  for (const mode of ["modal", "visibility", "pagehide", "failure"]) {
    const host = mount(); host.choose(1); host.advance(1100); const fall = host.state(1);
    if (mode === "modal") host.update({ suspended: true });
    if (mode === "visibility") host.visibility(true);
    if (mode === "pagehide") host.event("window", "pagehide");
    if (mode === "failure") host.update({ disabled: true, busy: false });
    host.advance(8000); assert.equal(host.state(1), fall); assert.equal(host.answers.length, 0);
    host.visibility(false); host.update({ suspended: false, disabled: false });
    if (mode !== "failure") { host.advance(8000); assert.equal(host.state(1), fall); }
    host.unmount();
  }
});

test("next target preserves running intent while its new voice freezes falling cards", () => {
  const host = mount(), first = course.getLesson("animals-14").exercises[0];
  host.choose(host.laneFor(first.answer)); host.advance(4950); assert.equal(host.answers.length, 1);
  const next = course.getLesson("animals-14").exercises[1];
  host.update({ exercise: next, busy: true, disabled: true }); host.advance(7000); assert.equal(host.state(1), 0);
  host.update({ busy: false, disabled: false }); host.advance(55); assert.equal(host.state(1), 1, "no second start needed");
  host.unmount();
});
