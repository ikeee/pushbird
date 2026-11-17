import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trainingStep, pipeOutcome } from '../src/training.js';

const initial = { index: 0, width: 1280, height: 800, groundHeight: 60, birdX: 307, anchorY: .45, successes: 0, streak: 0 };

test('opening pipe provides at least four seconds of preview on desktop and phone', () => {
  for (const viewport of [{ width: 1280, height: 800, birdX: 307 }, { width: 390, height: 844, birdX: 350 }]) {
    const step = trainingStep({ ...initial, ...viewport });
    assert.ok((step.x - viewport.birdX) / step.speed >= 3.99);
    assert.ok(step.gap >= viewport.height * .34);
    assert.equal(step.warmup, true);
  }
});

test('targets alternate down and up rather than jumping randomly', () => {
  const steps = Array.from({ length: 6 }, (_, index) => trainingStep({ ...initial, index }));
  assert.equal(steps[0].direction, 'hold');
  assert.equal(steps[1].direction, 'down');
  assert.equal(steps[2].direction, 'up');
  assert.ok(steps[1].centerY > steps[0].centerY);
  assert.ok(Math.abs(steps[2].centerY - steps[0].centerY) < 1);
  assert.equal(steps[1].centerY, steps[3].centerY);
  assert.ok(steps[0].interval >= 3);
});

test('difficulty grows only after sustained success and remains bounded', () => {
  const early = trainingStep(initial);
  const failed = trainingStep({ ...initial, index: 100, successes: 0, streak: 0 });
  const advanced = trainingStep({ ...initial, index: 100, successes: 100, streak: 100 });
  assert.equal(failed.interval, early.interval);
  assert.ok(advanced.interval >= 2.4);
  assert.ok(advanced.gap >= 800 * .28);
  assert.ok(advanced.gap < early.gap);
});

test('every gate stays within the visible playable region', () => {
  for (const height of [320, 800, 844]) for (const anchorY of [.05, .45, .9]) for (let index = 0; index < 10; index++) {
    const step = trainingStep({ ...initial, height, groundHeight: 48, anchorY, index });
    assert.ok(step.top >= 24);
    assert.ok(step.top + step.gap <= height - 48 - 20 + .001);
    assert.ok(Number.isFinite(step.speed) && step.speed > 0);
  }
});

test('only the first three gates are protected and misses do not earn points', () => {
  for (let index = 0; index < 5; index++) assert.equal(trainingStep({ ...initial, index }).warmup, index < 3);
  const result = pipeOutcome({ warmup: true, hit: true, score: 0, streak: 0 });
  assert.equal(result.score, 0);
  assert.equal(result.ended, false);
  assert.equal(result.streak, 0);
});

test('a single collision from gate four ends the game while clean passes still score', () => {
  const success = pipeOutcome({ warmup: false, hit: false, score: 2, streak: 2 });
  assert.equal(success.score, 3);
  assert.equal(success.streak, 3);
  const result = pipeOutcome({ score: 3, streak: 3, warmup: false, hit: true });
  assert.equal(result.score, 3);
  assert.equal(result.streak, 0);
  assert.equal(result.ended, true);
});

test('pipe travel speed is precisely fifty percent faster than the previous desktop and phone baseline', () => {
  assert.equal(trainingStep(initial).speed, 165);
  assert.ok(Math.abs(trainingStep({ ...initial, width: 390 }).speed - 52.65) < .00001);
  assert.equal(trainingStep({ ...initial, width: 320 }).speed, 52.5);
});
