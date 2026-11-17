// A guide timer, never an exercise repetition detector. All times are monotonic ms.
export function validateTempo(input) {
  if (!Array.isArray(input) || input.length !== 3 || input.some((n, i) =>
    !Number.isFinite(n) || n < (i === 1 ? 0 : .5) || n > (i === 1 ? 3 : 6) || n * 2 !== Math.round(n * 2))) {
    throw new RangeError('节奏需为0.5秒步长：下降/推起0.5–6秒，停顿0–3秒');
  }
  return Object.freeze([...input]);
}

export class TempoClock {
  constructor(durations) {
    this.durations = validateTempo(durations);
    this.total = this.durations.reduce((a, b) => a + b, 0) * 1000;
    this.completed = 0;
    this.status = 'idle';
    this.elapsed = 0;
    this.reason = '';
    this.rate = 1;
  }
  start(now, reset = false) {
    if (!Number.isFinite(now)) throw new TypeError('Invalid monotonic timestamp');
    if (reset) this.completed = 0;
    this.origin = this.last = now;
    this.elapsed = 0;
    this.status = 'running';
    this.reason = '';
    return this.snapshot();
  }
  pause(reason = '休息一下') {
    this.status = 'paused';
    this.reason = reason;
    return this.snapshot();
  }
  setRate(now, rate) {
    if (!Number.isFinite(rate) || rate < .5 || rate > 2) throw new RangeError('速度需在50%–200%之间');
    const result = this.tick(now);
    this.rate = rate;
    this.origin = this.last - this.elapsed / rate;
    return { ...this.snapshot(), cycleEvent: result.cycleEvent };
  }
  tick(now) {
    if (this.status !== 'running' || !Number.isFinite(now)) return this.snapshot();
    now = Math.max(now, this.last);
    if (now - this.last > 2000 || (now - this.origin) * this.rate >= this.total * 2) {
      return this.pause('画面暂停较久，准备好再继续');
    }
    this.last = now;
    let cycleEvent = false;
    if ((now - this.origin) * this.rate >= this.total) {
      this.completed++;
      this.origin += this.total / this.rate;
      cycleEvent = true;
    }
    this.elapsed = (now - this.origin) * this.rate;
    return { ...this.snapshot(), cycleEvent };
  }
  snapshot() {
    let offset = 0;
    let index = 0;
    for (; index < 2; index++) {
      const end = offset + this.durations[index] * 1000;
      if (this.elapsed < end) break;
      offset = end;
    }
    const phaseElapsed = this.elapsed - offset;
    const duration = this.durations[index];
    return {
      status: this.status, reason: this.reason, phase: ['down', 'hold', 'up'][index], index,
      duration, progress: Math.max(0, Math.min(1, phaseElapsed / (duration * 1000))),
      remaining: Math.round(Math.max(0, (duration - phaseElapsed / 1000) / this.rate) * 1000) / 1000,
      elapsed: this.elapsed, completed: this.completed, cycleEvent: false,
    };
  }
}
