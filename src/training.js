// Game pacing defaults, not a prescribed exercise tempo or a repetition detector.
export const pipeSpeed = width => Math.max(35, Math.min(110, width * .09)) * 1.5;

export function trainingStep({ index, width, height, groundHeight, birdX, anchorY, successes, streak, speedFactor = 1 }) {
  const warmup = index < 3;
  const progress = Math.min(1, Math.max(0, Math.min(successes - 4, streak - 3)) / 16);
  const interval = (3 - .6 * progress) / 1.3;
  const speed = pipeSpeed(width) * speedFactor;
  const gap = Math.min(height * (warmup ? .36 : .32 - .04 * progress), height - groundHeight - 48);
  const minCenter = 24 + gap / 2;
  const maxCenter = height - groundHeight - 24 - gap / 2;
  const amplitude = Math.min(height * .22, Math.max(0, maxCenter - minCenter));
  const upper = Math.max(minCenter, Math.min(maxCenter - amplitude, anchorY * height));
  const centerY = upper + (index % 2 ? amplitude : 0);
  return {
    warmup, interval, speed, gap, centerY,
    top: centerY - gap / 2,
    x: Math.max(width + Math.max(52, Math.min(76, width * .065)), birdX + speed * 4),
    direction: index === 0 ? 'hold' : index % 2 ? 'down' : 'up',
  };
}

export function pipeOutcome({ warmup, hit, score, streak }) {
  return {
    score: score + (hit ? 0 : 1),
    streak: hit ? 0 : streak + 1,
    ended: hit && !warmup,
  };
}
