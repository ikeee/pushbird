import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getForeheadCenter, scoreCardPosition } from '../src/forehead.js';

test('forehead uses the central forehead face landmark rather than nose or hair', () => {
  const points = Array.from({ length: 478 }, () => ({ x: .1, y: .9 }));
  points[151] = { x: .52, y: .37, z: -.02 };
  assert.deepEqual(getForeheadCenter(points), { x: .52, y: .37 });
  points[151].y = NaN;
  assert.equal(getForeheadCenter(points), null);
  assert.equal(getForeheadCenter([]), null);
});

test('card CENTER sits exactly 200 CSS pixels above the forehead, not its bottom edge', () => {
  assert.deepEqual(scoreCardPosition({ x: 640, y: 700 }, { width: 264, height: 200 }, { width: 1280, height: 900 }), { left: 508, top: 400 });
});

test('small screens clamp the entire card inside an eight pixel inset', () => {
  assert.deepEqual(scoreCardPosition({ x: 5, y: 150 }, { width: 208, height: 180 }, { width: 390, height: 844 }), { left: 8, top: 8 });
  assert.deepEqual(scoreCardPosition({ x: 385, y: 800 }, { width: 208, height: 180 }, { width: 390, height: 844 }), { left: 174, top: 510 });
});
