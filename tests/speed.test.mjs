import test from 'node:test';
import assert from 'node:assert/strict';

test('left drag increases speed, right drag decreases it, and jitter does not change it', async () => {
  const { dragSpeed } = await import('../src/speed.js');
  assert.equal(dragSpeed(1, -32), 1.1);
  assert.equal(dragSpeed(1, 64), .8);
  assert.equal(dragSpeed(1, -8), 1);
  assert.equal(dragSpeed(1.1, -32), 1.2);
});

test('speed changes stay between fifty and two hundred percent', async () => {
  const { dragSpeed, clampSpeed } = await import('../src/speed.js');
  assert.equal(dragSpeed(1, -9999), 2);
  assert.equal(dragSpeed(1, 9999), .5);
  assert.equal(clampSpeed(1.200000000002), 1.2);
  assert.equal(clampSpeed(NaN), 1);
});
