import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findHairCrown } from '../src/hair-anchor.js';

test('hair crown comes from connected hair pixels, not the nose coordinates', () => {
  const mask = new Uint8Array(100 * 100);
  for (let y = 20; y < 40; y++) for (let x = 35; x < 65; x++) mask[y * 100 + x] = 1;
  mask[100 + 1] = 1; // Isolated speck above the real head must not become the crown.
  const point = findHairCrown(mask, 100, 100, { x: .5, y: .55 });
  assert.ok(Math.abs(point.x - .5) < .02);
  assert.ok(point.y >= .2 && point.y < .24);
});

test('no hair or malformed masks return no anchor instead of fabricating a head', () => {
  assert.equal(findHairCrown(new Uint8Array(10000), 100, 100), null);
  assert.equal(findHairCrown(new Uint8Array(5), 100, 100), null);
  assert.equal(findHairCrown(new Uint8Array(), 0, 0), null);
});

test('prefer the hair component near the tracked person rather than a larger distant person', () => {
  const mask = new Uint8Array(10000);
  for (let y = 10; y < 40; y++) for (let x = 5; x < 35; x++) mask[y * 100 + x] = 1;
  for (let y = 25; y < 40; y++) for (let x = 65; x < 85; x++) mask[y * 100 + x] = 1;
  const point = findHairCrown(mask, 100, 100, { x: .75, y: .55 });
  assert.ok(point.x > .65 && point.x < .85);
});
