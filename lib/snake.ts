import type { Exercise } from "./course";

export const snakeSize = 8;
export type Direction = "up" | "right" | "down" | "left";
export type Cell = { x: number; y: number };
export type SnakeFood = Cell & { wordId: string };
export type SnakePhase = "ready" | "running" | "paused" | "wrong" | "collision" | "done";
export type SnakeBoard = { body: Cell[]; direction: Direction; queued: Direction | null; foods: SnakeFood[]; phase: SnakePhase };
const offsets: Record<Direction, Cell> = { up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
const opposites: Record<Direction, Direction> = { up: "down", down: "up", left: "right", right: "left" };
const key = (cell: Cell) => `${cell.x},${cell.y}`;
const equal = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const inside = (cell: Cell) => cell.x >= 0 && cell.x < snakeSize && cell.y >= 0 && cell.y < snakeSize;
const distance = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function initialSnake(length = 1): Cell[] {
  const trail = [{ x: 3, y: 4 }, { x: 2, y: 4 }, { x: 1, y: 4 }, { x: 0, y: 4 }, { x: 0, y: 3 }, { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }];
  return trail.slice(0, Math.max(1, Math.min(9, length))).map(cell => ({ ...cell }));
}

/** Reserve a route to the correct target before adding distractors. */
export function createSnakeBoard(exercise: Exercise, body = initialSnake(), direction: Direction = "right"): SnakeBoard {
  const occupied = new Set(body.map(key));
  const routes = new Map<string, Cell[]>([[key(body[0]), []]]);
  const queue = [body[0]];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const nextDirection of Object.keys(offsets) as Direction[]) {
      if (index === 0 && body.length > 1 && nextDirection === opposites[direction]) continue;
      const offset = offsets[nextDirection];
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      if (!inside(next) || occupied.has(key(next)) || routes.has(key(next))) continue;
      routes.set(key(next), [...routes.get(key(current))!, next]); queue.push(next);
    }
  }
  let seed = 2166136261;
  for (const char of `${exercise.id}:${exercise.options.join(":")}:${body.map(key).join(";")}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const cells = queue.slice(1);
  for (let index = cells.length - 1; index > 0; index--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const other = seed % (index + 1); [cells[index], cells[other]] = [cells[other], cells[index]];
  }
  const targets = cells.filter(cell => distance(cell, body[0]) >= 3);
  for (const target of targets) {
    const reserved = new Set(routes.get(key(target))!.map(key));
    const foods: SnakeFood[] = [{ ...target, wordId: exercise.answer }];
    for (const wordId of exercise.options.filter(id => id !== exercise.answer)) {
      const next = cells.find(cell => !reserved.has(key(cell)) && distance(cell, body[0]) >= 2 && foods.every(food => distance(cell, food) >= 2));
      if (next) foods.push({ ...next, wordId });
    }
    if (foods.length === exercise.options.length) return { body: body.map(cell => ({ ...cell })), direction, queued: null, foods, phase: "ready" };
  }
  // A long body can trap the head after a hit; reset the geometry, preserving growth.
  const fallback = initialSnake(body.length);
  if (body.length !== fallback.length || !body.every((cell, index) => equal(cell, fallback[index]))) return createSnakeBoard(exercise, fallback);
  throw new Error("没有足够的位置放图卡，请重新进入这一关。");
}

/** One direction change per movement step prevents an instant reversal. */
export function turnSnake(board: SnakeBoard, direction: Direction): SnakeBoard {
  if (board.phase === "done" || board.phase === "collision" || board.phase === "wrong" || board.queued || direction === board.direction || (board.body.length > 1 && direction === opposites[board.direction])) return board;
  return { ...board, queued: direction };
}

export function stepSnake(board: SnakeBoard, answer: string): { board: SnakeBoard; eaten?: string } {
  if (board.phase !== "running") return { board };
  const direction = board.queued ?? board.direction, offset = offsets[direction];
  const next = { x: board.body[0].x + offset.x, y: board.body[0].y + offset.y };
  const food = board.foods.find(food => equal(food, next));
  const grows = food?.wordId === answer;
  const solid = grows ? board.body : board.body.slice(0, -1);
  if (!inside(next) || solid.some(cell => equal(cell, next))) return { board: { ...board, queued: null, phase: "collision" } };
  return {
    board: { ...board, direction, queued: null, body: [next, ...(grows ? board.body : board.body.slice(0, -1))], foods: food ? board.foods.filter(item => item !== food) : board.foods, phase: food ? grows ? "done" : "wrong" : "running" },
    ...(food ? { eaten: food.wordId } : {}),
  };
}
