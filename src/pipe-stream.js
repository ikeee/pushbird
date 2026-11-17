// Schedule pipe slots by travelled pixels, not by elapsed wall-clock seconds.
export class PipeStream {
  constructor({ originX, spacing }) {
    if (!Number.isFinite(originX) || !Number.isFinite(spacing) || spacing <= 0) throw new RangeError('Invalid pipe geometry');
    this.originX = originX;
    this.spacing = spacing;
    this.remaining = 0;
  }
  advance(distance) {
    if (!Number.isFinite(distance) || distance < 0) throw new RangeError('Invalid pipe travel');
    this.remaining -= distance;
    const positions = [];
    while (this.remaining <= 0) {
      // Carry frame overshoot so a late frame cannot accumulate spacing errors.
      positions.push(this.originX + this.remaining);
      this.remaining += this.spacing;
    }
    return positions;
  }
}
