import assert from 'node:assert/strict';
import test from 'node:test';

test('distance-based stream keeps exact pitch through speed changes and frame overshoot', async () => {
  const { PipeStream } = await import('../src/pipe-stream.js');
  const stream = new PipeStream({ originX: 1300, spacing: 570 });
  const pipes = [];
  for (const travel of [0, 200, 100, 350, 30, 900, 50, 1200]) {
    for (let i = 0; i < pipes.length; i++) pipes[i] -= travel;
    pipes.push(...stream.advance(travel));
    for (let i = 1; i < pipes.length; i++) assert.ok(Math.abs(pipes[i] - pipes[i - 1] - 570) < .000001);
  }
});

test('resetting a round creates a fresh stream and invalid motion is rejected', async () => {
  const { PipeStream } = await import('../src/pipe-stream.js');
  assert.throws(() => new PipeStream({ originX: 500, spacing: 0 }));
  const first = new PipeStream({ originX: 500, spacing: 200 });
  assert.deepEqual(first.advance(0), [500]);
  assert.deepEqual(first.advance(100), []);
  assert.throws(() => first.advance(-1));
  assert.throws(() => first.advance(NaN));
  const next = new PipeStream({ originX: 500, spacing: 200 });
  assert.deepEqual(next.advance(0), [500]);
});
