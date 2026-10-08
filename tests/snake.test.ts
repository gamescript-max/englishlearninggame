import test from "node:test";
import assert from "node:assert/strict";
import { getLesson, type Exercise } from "../lib/course";
import { createSnakeBoard, initialSnake, snakeSize, stepSnake, turnSnake, type Cell, type SnakeBoard } from "../lib/snake";

const key = (cell: Cell) => `${cell.x},${cell.y}`;
const exercise: Exercise = getLesson("animals-10").exercises[0];
function running(body: Cell[] = [{ x: 6, y: 4 }, { x: 5, y: 4 }, { x: 4, y: 4 }]): SnakeBoard {
  return { body, direction: "right", queued: null, foods: [], phase: "running" };
}
function canReach(board: SnakeBoard, answer: string) {
  const target = board.foods.find(food => food.wordId === answer)!;
  const blocked = new Set([...board.body.slice(1), ...board.foods.filter(food => food.wordId !== answer)].map(key));
  const visited = new Set([key(board.body[0])]), queue = [board.body[0]];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (key(current) === key(target)) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (next.x < 0 || next.x >= snakeSize || next.y < 0 || next.y >= snakeSize || blocked.has(key(next)) || visited.has(key(next))) continue;
      visited.add(key(next)); queue.push(next);
    }
  }
  return false;
}

test("snake courses place four unique cards with an accessible target for every growth stage", () => {
  for (const topic of ["animals", "food", "toys"]) {
    for (const exercise of getLesson(`${topic}-10`).exercises) {
      for (let length = 1; length <= 9; length++) {
        const board = createSnakeBoard(exercise, initialSnake(length));
        assert.equal(board.phase, "ready"); assert.equal(board.body.length, length);
        assert.equal(board.foods.length, 4); assert.equal(new Set(board.foods.map(key)).size, 4);
        assert.deepEqual(board.foods.map(food => food.wordId).sort(), [...exercise.options].sort());
        assert.ok(board.foods.every(food => !board.body.some(cell => key(cell) === key(food))));
        assert.ok(canReach(board, exercise.answer), `${exercise.id} at length ${length}`);
        assert.deepEqual(createSnakeBoard(exercise, initialSnake(length)), board, "same question and geometry have stable placement");
      }
    }
  }
});
test("turning accepts one turn per step, rejecting immediate reversal and rapid double turns", () => {
  const board = running();
  assert.equal(turnSnake(board, "left"), board);
  assert.equal(turnSnake(board, "right"), board, "holding the current direction must not swallow a real turn");
  const up = turnSnake(board, "up");
  assert.equal(turnSnake(up, "left"), up);
  const moved = stepSnake(up, exercise.answer).board;
  assert.equal(moved.direction, "up"); assert.equal(moved.queued, null);
  assert.deepEqual(moved.body[0], { x: 6, y: 3 });
  assert.equal(turnSnake(moved, "left").queued, "left");
});
test("correct collection grows once and freezes; wrong collection records one word without growth", () => {
  const board = running(); board.foods = [{ x: 7, y: 4, wordId: exercise.answer }];
  const collected = stepSnake(board, exercise.answer);
  assert.equal(collected.eaten, exercise.answer); assert.equal(collected.board.body.length, 4);
  assert.equal(collected.board.phase, "done"); assert.equal(collected.board.foods.length, 0);
  assert.equal(stepSnake(collected.board, exercise.answer).eaten, undefined);
  const wrong = exercise.options.find(id => id !== exercise.answer)!;
  board.foods = [{ x: 7, y: 4, wordId: wrong }];
  const failed = stepSnake(board, exercise.answer);
  assert.equal(failed.eaten, wrong); assert.equal(failed.board.body.length, 3);
  assert.equal(failed.board.phase, "wrong"); assert.equal(failed.board.foods.length, 0);
  assert.equal(stepSnake(failed.board, exercise.answer).eaten, undefined);
});
test("walls and self-collisions produce no English answer; a vacating tail is a legal move", () => {
  const wall = running([{ x: 7, y: 4 }, { x: 6, y: 4 }, { x: 5, y: 4 }]);
  const collision = stepSnake(wall, exercise.answer);
  assert.equal(collision.board.phase, "collision"); assert.equal(collision.eaten, undefined);
  assert.deepEqual(collision.board.body, wall.body);
  const loop = running([{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 1 }]);
  loop.direction = "up"; loop.queued = "left";
  const tail = stepSnake(loop, exercise.answer);
  assert.equal(tail.board.phase, "running"); assert.deepEqual(tail.board.body[0], { x: 0, y: 1 });
  loop.body.push({ x: 0, y: 0 });
  const self = stepSnake(loop, exercise.answer);
  assert.equal(self.board.phase, "collision"); assert.equal(self.eaten, undefined);
});
test("pauses do not move and trapped geometry resets while retaining growth", () => {
  const paused = { ...running(), phase: "paused" as const };
  assert.equal(stepSnake(paused, exercise.answer).board, paused);
  const trapped = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const recovered = createSnakeBoard(exercise, trapped);
  assert.equal(recovered.body.length, trapped.length); assert.ok(canReach(recovered, exercise.answer));
  assert.deepEqual(recovered.body, initialSnake(trapped.length));
});
