import test from "node:test";
import assert from "node:assert/strict";
import * as course from "../lib/course";
import * as engine from "../lib/snake";
import type { SnakeGameProps } from "../components/snake-game";
import { componentHost } from "./helpers/component-host";

test("each direction prepares the singleton during the first voice, and moves only after it ends", () => {
  for (const direction of ["up", "down", "left", "right"]) {
    const host = mount({ busy: true, disabled: true });
    assert.equal(host.board().body.length, 1);
    const head = host.board().body[0];
    assert.equal(host.click(host.byClass(`direction-${direction}`)[0]), true);
    host.advance(5000); assert.deepEqual(host.board().body[0], head);
    host.update({ busy: false, disabled: false });
    assert.equal(host.board().phase, "running");
    host.advance(850); assert.notDeepEqual(host.board().body[0], head); host.unmount();
  }
});

test("keyboard and swipe can start without the Start button; failed voice cannot", () => {
  const keyHost = mount(), target = { matches: () => false, closest: () => null, tagName: "DIV" };
  keyHost.event("window", "keydown", { key: "ArrowLeft", target, preventDefault() {} });
  assert.equal(keyHost.board().phase, "running"); keyHost.advance(850); assert.equal(keyHost.board().direction, "left"); keyHost.unmount();
  const swipeHost = mount(), board = swipeHost.byClass("snake-board")[0];
  (board.props.onPointerDown as (event: unknown) => void)({ clientX: 50, clientY: 80, pointerId: 1, currentTarget: { setPointerCapture() {} } });
  (board.props.onPointerUp as (event: unknown) => void)({ clientX: 50, clientY: 20 });
  assert.equal(swipeHost.board().phase, "running"); swipeHost.unmount();
  const failed = mount({ disabled: true, busy: false });
  assert.equal(failed.click(failed.byClass("direction-up")[0]), false); failed.advance(5000); assert.equal(failed.board().phase, "ready"); failed.unmount();
});

function mount(initial: Partial<SnakeGameProps> = {}) {
  const answers: { answer: string; id: string }[] = [];
  let props: SnakeGameProps = { exercise: course.getLesson("animals-10").exercises[0], disabled: false, busy: false, suspended: false, hinted: false, found: 0, onAnswer: (answer, id) => answers.push({ answer, id }), ...initial };
  const host = componentHost(new URL("../components/snake-game.tsx", import.meta.url), "SnakeGame", props, () => ({
    "@/lib/course": course, "@/lib/snake": engine, "@/components/word-art": { WordArt: "WordArt" },
  }));
  return { ...host, answers, board: () => host.state(0) as engine.SnakeBoard,
    update(next: Partial<SnakeGameProps>) { props = { ...props, ...next }; host.update(props); },
    collect(wordId = props.exercise.answer) {
      const board = host.state(0) as engine.SnakeBoard;
      const target = board.foods.find(food => food.wordId === wordId)!;
      const key = (cell: engine.Cell) => `${cell.x},${cell.y}`;
      const blocked = new Set([...board.body.slice(1), ...board.foods.filter(food => food !== target)].map(key));
      const routes = new Map<string, engine.Direction[]>([[key(board.body[0]), []]]), queue = [board.body[0]];
      const offsets: [engine.Direction, number, number][] = [["up", 0, -1], ["right", 1, 0], ["down", 0, 1], ["left", -1, 0]];
      const opposite = { up: "down", down: "up", left: "right", right: "left" };
      for (let i = 0; i < queue.length; i++) {
        for (const [direction, dx, dy] of offsets) {
          if (i === 0 && board.body.length > 1 && direction === opposite[board.direction]) continue;
          const next = { x: queue[i].x + dx, y: queue[i].y + dy };
          if (next.x < 0 || next.x > 7 || next.y < 0 || next.y > 7 || blocked.has(key(next)) || routes.has(key(next))) continue;
          routes.set(key(next), [...routes.get(key(queue[i]))!, direction]); queue.push(next);
        }
      }
      const route = routes.get(key(target)); assert.ok(route, "Target must have a safe route");
      for (const direction of route) { const button = host.byClass(`direction-${direction}`)[0]; assert.equal(host.click(button), true); host.advance(850); }
    },
  };
}

test("one start continues across targets, preserving growth and waiting for each voice", () => {
  const host = mount(); host.click(host.button("开始游戏")); host.collect();
  assert.equal(host.board().phase, "done"); assert.equal(host.board().body.length, 2); assert.equal(host.answers.length, 1);
  const body = host.board().body;
  host.advance(4000); assert.equal(host.answers.length, 1);
  host.update({ exercise: course.getLesson("animals-10").exercises[1], busy: true, disabled: true, found: 1 });
  assert.deepEqual(host.board().body, body); host.advance(4000); assert.deepEqual(host.board().body, body);
  host.update({ busy: false, disabled: false }); assert.equal(host.board().phase, "running", "No second start click");
  host.collect(); assert.equal(host.answers.length, 2); assert.equal(host.board().body.length, 3);
  assert.equal(host.answers[1].id, course.getLesson("animals-10").exercises[1].id); host.unmount();
});
test("wrong snake is submitted once and automatically resumes the same question after replay", () => {
  const host = mount(); host.click(host.button("开始游戏"));
  const answer = host.board().foods.find(food => food.wordId !== course.getLesson("animals-10").exercises[0].answer)!.wordId;
  host.collect(answer); assert.equal(host.board().phase, "wrong"); assert.equal(host.board().body.length, 1);
  host.update({ busy: true }); host.advance(3000); assert.equal(host.answers.length, 1);
  host.update({ busy: false }); assert.equal(host.board().phase, "running"); host.unmount();
});
test("replay waits without moving then resumes, but manual pause during voice remains paused", () => {
  const host = mount(); host.click(host.button("开始游戏")); const body = host.board().body;
  host.update({ busy: true }); host.advance(5000); assert.deepEqual(host.board().body, body);
  host.update({ busy: false }); assert.equal(host.board().phase, "running");
  host.update({ busy: true }); assert.equal(host.click(host.button("暂停小蛇")), true);
  host.update({ busy: false }); host.advance(5000); assert.equal(host.board().phase, "paused"); assert.deepEqual(host.board().body, body);
  host.click(host.button("继续游戏")); assert.equal(host.board().phase, "running"); host.unmount();
});
test("modal and background pause intention even between two targets", () => {
  for (const mode of ["modal", "visibility", "pagehide"]) {
    const host = mount(); host.click(host.button("开始游戏")); host.collect();
    if (mode === "modal") host.update({ suspended: true });
    else if (mode === "visibility") host.visibility(true);
    else host.event("window", "pagehide");
    host.update({ exercise: course.getLesson("animals-10").exercises[1], found: 1, busy: true });
    host.visibility(false); host.update({ suspended: false, busy: false });
    assert.notEqual(host.board().phase, "running", mode); host.advance(5000); assert.equal(host.answers.length, 1);
    host.click(host.button(host.board().phase === "ready" ? "开始游戏" : "继续游戏")); assert.equal(host.board().phase, "running"); host.unmount();
  }
});
test("failed audio readiness blocks even a previously heard question until successful retry", () => {
  const host = mount(); host.click(host.button("开始游戏")); host.update({ busy: true });
  host.update({ busy: false, disabled: true }); const body = host.board().body; host.advance(10000);
  assert.deepEqual(host.board().body, body); assert.equal(host.board().phase, "paused");
  host.update({ disabled: false }); assert.equal(host.board().phase, "running"); host.unmount();
});
test("keyboard and pointer swipe turn once; cancelling a swipe or typing never turns", () => {
  const host = mount(); host.click(host.button("开始游戏"));
  const target = { matches: () => false, closest: () => null, tagName: "DIV" };
  host.event("window", "keydown", { key: "ArrowUp", target, preventDefault() {} }); assert.equal(host.board().queued, "up");
  host.advance(850); assert.equal(host.board().direction, "up");
  const board = host.byClass("snake-board")[0]; let captured = 0;
  (board.props.onPointerDown as (event: unknown) => void)({ clientX: 10, clientY: 10, pointerId: 2, currentTarget: { setPointerCapture: () => captured++ } });
  (board.props.onPointerUp as (event: unknown) => void)({ clientX: 60, clientY: 12 }); assert.equal(captured, 1);
  host.advance(850); assert.equal(host.board().direction, "right");
  host.event("window", "keydown", { key: "ArrowDown", target: { ...target, matches: () => true }, preventDefault() { throw new Error("Typing must not be intercepted"); } });
  assert.equal(host.board().queued, null);
  (board.props.onPointerDown as (event: unknown) => void)({ clientX: 10, clientY: 10, pointerId: 2, currentTarget: { setPointerCapture() {} } });
  (board.props.onPointerCancel as () => void)(); (board.props.onPointerUp as (event: unknown) => void)({ clientX: 10, clientY: 80 });
  assert.equal(host.board().queued, null); host.unmount();
});
test("unmount releases movement timers and document/window listeners", () => {
  const host = mount(); host.click(host.button("开始游戏")); assert.equal(host.timerCount(), 1); assert.equal(host.listenerCount(), 3);
  host.unmount(); assert.equal(host.timerCount(), 0); assert.equal(host.listenerCount(), 0); host.advance(10000); assert.equal(host.answers.length, 0);
});
test("eaten pictures stay in body order through movement, restart and restoration, including duplicate words", () => {
  const collected = ["cat", "dog", "cat"], host = mount({ found: 3, collectedWordIds: collected });
  function bodyWords() {
    const cells = host.byClass("snake-cell");
    return host.board().body.slice(1, 4).map(cell => cells[cell.y * 8 + cell.x].props["data-body-word"]);
  }
  assert.deepEqual(bodyWords(), [...collected].reverse()); assert.equal(host.byClass("collected-segment").length, 3);
  host.click(host.button("开始游戏")); host.click(host.byClass("direction-up")[0]); host.advance(850);
  assert.deepEqual(bodyWords(), [...collected].reverse());
  host.click(host.button("暂停小蛇")); host.click(host.button("重置位置并出发，保留长度与已完成进度"));
  assert.deepEqual(bodyWords(), [...collected].reverse()); assert.equal(host.board().body.length, 4);
  host.update({ exercise: course.getLesson("animals-10").exercises[1], busy: true });
  assert.deepEqual(bodyWords(), [...collected].reverse()); host.unmount();
  const restored = mount({ found: 3, collectedWordIds: collected }); assert.equal(restored.byClass("collected-segment").length, 3); restored.unmount();
});
