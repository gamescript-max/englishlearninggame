export type RacingPoint = { x: number; y: number };
export type RacingDestination = "farm" | "school" | "park" | "shop" | "beach" | "home";
export type RacingDirection = "up" | "down" | "left" | "right";
export type RacingCar = RacingPoint & { heading: number; route: RacingPoint[]; direction: RacingDirection | null; moving: boolean; distance: number };

export const racingSize = { width: 1000, height: 660 };
export const racingDestinations: { id: RacingDestination; en: string; zh: string; x: number; y: number; dock: RacingPoint; color: string }[] = [
  { id: "farm", en: "Farm", zh: "农场", x: 125, y: 95, dock: { x: 160, y: 150 }, color: "#ffd883" },
  { id: "school", en: "School", zh: "学校", x: 480, y: 76, dock: { x: 500, y: 150 }, color: "#a8c9ff" },
  { id: "park", en: "Park", zh: "公园", x: 860, y: 89, dock: { x: 840, y: 150 }, color: "#a3e7a6" },
  { id: "shop", en: "Shop", zh: "商店", x: 920, y: 320, dock: { x: 840, y: 340 }, color: "#ffc0ba" },
  { id: "beach", en: "Beach", zh: "海滩", x: 850, y: 592, dock: { x: 840, y: 530 }, color: "#98e5ec" },
  { id: "home", en: "Home", zh: "家", x: 143, y: 586, dock: { x: 160, y: 530 }, color: "#d6bbff" },
];

const xs = [160, 500, 840], ys = [150, 340, 530];
const roadNodes = ys.flatMap(y => xs.map(x => ({ x, y })));
const roadNeighbors = (index: number) => [index % 3 > 0 ? index - 1 : -1, index % 3 < 2 ? index + 1 : -1, index >= 3 ? index - 3 : -1, index < 6 ? index + 3 : -1].filter(value => value >= 0);
const distance = (a: RacingPoint, b: RacingPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function createRacingCar(): RacingCar {
  return { x: 500, y: 530, heading: -Math.PI / 2, route: [], direction: null, moving: false, distance: 0 };
}

function nearestNode(point: RacingPoint) {
  return roadNodes.reduce((best, node, index) => distance(node, point) < distance(roadNodes[best], point) ? index : best, 0);
}

/** A short route over the town's road intersections; clicks never cut across a building. */
export function routeRacingCar(car: RacingCar, target: RacingPoint): RacingCar {
  const start = nearestNode(car), goal = nearestNode(target);
  const queue = [start], previous = new Map<number, number>([[start, -1]]);
  for (let index = 0; index < queue.length && !previous.has(goal); index++) {
    for (const next of roadNeighbors(queue[index])) if (!previous.has(next)) { previous.set(next, queue[index]); queue.push(next); }
  }
  const indexes: number[] = [];
  for (let index = goal; index !== -1; index = previous.get(index) ?? -1) indexes.unshift(index);
  const route = indexes.map(index => ({ ...roadNodes[index] })).filter(point => distance(point, car) > 1);
  return { ...car, route, direction: null, moving: route.length > 0 };
}

export function steerRacingCar(car: RacingCar, direction: RacingDirection | null): RacingCar {
  return { ...car, direction, route: [], moving: direction !== null };
}

export function pauseRacingCar(car: RacingCar): RacingCar {
  return { ...car, direction: null, route: [], moving: false };
}

export function racingDestinationAt(point: RacingPoint): RacingDestination | null {
  return racingDestinations.find(destination => distance(point, destination.dock) <= 27)?.id ?? null;
}

export function racingSpeedAt(point: RacingPoint) {
  const onRoad = xs.some(x => Math.abs(x - point.x) < 30) || ys.some(y => Math.abs(y - point.y) < 30);
  return onRoad ? 245 : 145;
}

/** Motion is measured in seconds. Paused calls neither travel nor accumulate distance. */
export function stepRacingCar(car: RacingCar, deltaSeconds: number, paused = false): RacingCar {
  if (paused || !car.moving || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return car;
  const dt = Math.min(deltaSeconds, .1);
  let next = { ...car, route: [...car.route] };
  const vectors: Record<RacingDirection, RacingPoint> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  if (car.direction) {
    const vector = vectors[car.direction], travel = racingSpeedAt(car) * dt;
    next.x = clamp(car.x + vector.x * travel, 58, 942);
    next.y = clamp(car.y + vector.y * travel, 54, 606);
    next.heading = Math.atan2(vector.y, vector.x);
    next.distance += distance(car, next);
    if (distance(car, next) < .01) next = { ...next, moving: false };
    return next;
  }
  let remaining = 245 * dt;
  while (next.route.length && remaining > 0) {
    const waypoint = next.route[0], segment = distance(next, waypoint);
    if (segment < .001) { next.route.shift(); continue; }
    next.heading = Math.atan2(waypoint.y - next.y, waypoint.x - next.x);
    const amount = Math.min(remaining, segment);
    next.x += (waypoint.x - next.x) / segment * amount;
    next.y += (waypoint.y - next.y) / segment * amount;
    next.distance += amount;
    remaining -= amount;
    if (amount === segment) next.route.shift();
  }
  next.moving = next.route.length > 0;
  return next;
}
