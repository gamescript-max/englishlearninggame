import test from "node:test";
import assert from "node:assert/strict";
import { createRacingCar, pauseRacingCar, racingDestinationAt, racingDestinations, routeRacingCar, steerRacingCar, stepRacingCar } from "../lib/racing-engine";

test("the delivery car follows town roads and stops at all six destinations", () => {
  for (const destination of racingDestinations) {
    let car = routeRacingCar(createRacingCar(), destination.dock);
    for (let frame = 0; frame < 1200 && car.moving; frame++) {
      car = stepRacingCar(car, 1 / 60);
      assert.ok([160, 500, 840].some(x => Math.abs(car.x - x) < .001) || [150, 340, 530].some(y => Math.abs(car.y - y) < .001), "the car stays on a road even when crossing an intersection between frames");
    }
    assert.equal(car.moving, false);
    assert.equal(racingDestinationAt(car), destination.id);
    assert.ok(Math.hypot(car.x - destination.dock.x, car.y - destination.dock.y) < .01);
  }
});

test("road route timing remains equal at 30 and 120 frames per second", () => {
  let slower = routeRacingCar(createRacingCar(), racingDestinations[0].dock);
  let faster = routeRacingCar(createRacingCar(), racingDestinations[0].dock);
  for (let index = 0; index < 90; index++) slower = stepRacingCar(slower, 1 / 30);
  for (let index = 0; index < 360; index++) faster = stepRacingCar(faster, 1 / 120);
  assert.ok(Math.hypot(slower.x - faster.x, slower.y - faster.y) < 1e-7);
  assert.ok(Math.abs(slower.distance - faster.distance) < 1e-7);
});

test("paused and invalid updates never move the car or accumulate distance", () => {
  const running = routeRacingCar(createRacingCar(), racingDestinations[0].dock);
  assert.equal(stepRacingCar(running, 10, true), running);
  assert.equal(stepRacingCar(running, Number.NaN), running);
  const paused = pauseRacingCar(running);
  assert.equal(stepRacingCar(paused, 60), paused);
  assert.equal(paused.direction, null);
  assert.deepEqual(paused.route, []);
});

test("manual directions face the car forward and safely stop at the edge", () => {
  const start = createRacingCar();
  const up = stepRacingCar(steerRacingCar(start, "up"), .1);
  assert.ok(up.y < start.y); assert.equal(up.x, start.x); assert.equal(up.heading, -Math.PI / 2);
  let edge = steerRacingCar(start, "right");
  for (let index = 0; index < 1000; index++) edge = stepRacingCar(edge, 1 / 60);
  assert.ok(edge.x <= 942); assert.equal(edge.moving, false); assert.equal(edge.heading, 0);
  const turn = stepRacingCar(steerRacingCar(edge, "left"), .1);
  assert.ok(turn.x < edge.x); assert.equal(turn.heading, Math.PI);
});
