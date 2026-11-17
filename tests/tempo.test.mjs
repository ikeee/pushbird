import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../src/tempo.js');

test('tempo 2-1-2 uses real elapsed time and counts a complete five second guide cycle', async () => {
  const { TempoClock } = await load();
  const clock = new TempoClock([2, 1, 2]);
  clock.start(100);
  assert.equal(clock.tick(1100).phase, 'down');
  assert.equal(clock.tick(2100).phase, 'hold');
  assert.equal(clock.tick(3100).phase, 'up');
  clock.tick(4100);
  const result = clock.tick(5100);
  assert.equal(result.phase, 'down');
  assert.equal(result.completed, 1);
  assert.equal(result.cycleEvent, true);
  assert.equal(clock.tick(5100).cycleEvent, false);
});

test('tempo 3-1-1 has asymmetric phases and skips a zero bottom pause', async () => {
  const { TempoClock } = await load();
  const clock = new TempoClock([3, 1, 1]);
  clock.start(0);
  clock.tick(1000); clock.tick(2000);
  assert.equal(clock.tick(2999).phase, 'down');
  assert.equal(clock.tick(3000).phase, 'hold');
  assert.equal(clock.tick(4000).phase, 'up');
  assert.equal(clock.tick(5000).completed, 1);
  const noPause = new TempoClock([2, 0, 2]);
  noPause.start(0); noPause.tick(1000);
  assert.equal(noPause.tick(2000).phase, 'up');
  noPause.tick(3000);
  assert.equal(noPause.tick(4000).completed, 1);
});

test('low frame rates do not discard time and backwards timestamps cannot regress progress', async () => {
  const { TempoClock } = await load();
  const clock = new TempoClock([2, 1, 2]);
  clock.start(0);
  for (let now = 500; now <= 1500; now += 500) clock.tick(now);
  assert.equal(clock.tick(2000).phase, 'hold');
  assert.equal(clock.tick(2100).remaining, .9);
  assert.equal(clock.tick(2050).remaining, .9);
});

test('pause preserves completed guides and resume restarts only the unfinished cycle', async () => {
  const { TempoClock } = await load();
  const clock = new TempoClock([2, 1, 2]);
  clock.start(0);
  for (let now = 1000; now <= 7000; now += 1000) clock.tick(now);
  clock.pause('休息一下');
  assert.equal(clock.tick(60000).completed, 1);
  assert.equal(clock.tick(60000).status, 'paused');
  clock.start(60000);
  assert.equal(clock.tick(60000).phase, 'down');
  assert.equal(clock.tick(60000).completed, 1);
  clock.start(61000, true);
  assert.equal(clock.tick(61000).completed, 0);
});

test('a stalled clock pauses instead of crediting missed cycles or replaying cues', async () => {
  const { TempoClock } = await load();
  const clock = new TempoClock([2, 1, 2]);
  clock.start(0); clock.tick(500);
  const result = clock.tick(30000);
  assert.equal(result.status, 'paused');
  assert.equal(result.completed, 0);
  assert.equal(result.cycleEvent, false);
});

test('duration validation rejects impossible or unbounded values and copies its input', async () => {
  const { TempoClock, validateTempo } = await load();
  for (const input of [[0, 1, 2], [2, -1, 2], [2, 4, 2], [Infinity, 1, 2], [2, 1], [7, 1, 1]]) {
    assert.throws(() => validateTempo(input), /节奏/);
  }
  const input = [2, 0, 2];
  const clock = new TempoClock(input);
  input[0] = 99;
  assert.deepEqual(clock.durations, [2, 0, 2]);
});

test('changing tempo playback rate preserves progress and displays real remaining seconds', async () => {
  const { TempoClock } = await load();
  const clock = new TempoClock([2, 1, 2]);
  clock.start(0); clock.tick(1000);
  const view = clock.setRate(1000, 2);
  assert.equal(view.progress, .5);
  assert.equal(view.remaining, .5);
  assert.equal(clock.tick(1500).phase, 'hold');
  assert.equal(clock.tick(2000).phase, 'up');
  assert.equal(clock.tick(3000).completed, 1);
  clock.pause(); clock.setRate(30000, .5); clock.start(30000);
  assert.equal(clock.tick(31000).remaining, 3);
  assert.throws(() => clock.setRate(31000, 0), /速度/);
});
