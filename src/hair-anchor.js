// Model labels.txt: 0=background, 1=hair. Pick a real connected hair region.
export function findHairCrown(mask, width, height, nose = null) {
  const length = width * height;
  if (!width || !height || !mask || mask.length !== length) return null;
  const seen = new Uint8Array(length);
  const queue = new Int32Array(length);
  const minimum = Math.max(12, Math.floor(length * .001));
  let best = null;
  for (let seed = 0; seed < length; seed++) {
    if (seen[seed] || mask[seed] !== 1) continue;
    let read = 0, count = 1;
    let left = width, right = 0, top = height, bottom = 0;
    queue[0] = seed; seen[seed] = 1;
    while (read < count) {
      const index = queue[read++];
      const x = index % width, y = Math.floor(index / width);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (const next of [x ? index - 1 : -1, x + 1 < width ? index + 1 : -1, index - width, index + width]) {
        if (next < 0 || next >= length || seen[next] || mask[next] !== 1) continue;
        seen[next] = 1; queue[count++] = next;
      }
    }
    if (count < minimum) continue;
    const centerX = (left + right + 1) / (2 * width);
    if (nose && top / height > nose.y + .08) continue;
    const distance = nose ? 100 * (centerX - nose.x) ** 2 + 20 * (bottom / height - nose.y) ** 2 : 0;
    const score = count / (1 + distance);
    if (!best || score > best.score) best = { score, left, right, top, bottom, pixels: queue.slice(0, count) };
  }
  if (!best) return null;
  const bandBottom = best.top + Math.max(2, Math.round((best.bottom - best.top) * .12));
  let totalX = 0, count = 0;
  for (const index of best.pixels) if (Math.floor(index / width) <= bandBottom) { totalX += index % width; count++; }
  return { x: (totalX / count + .5) / width, y: (best.top + .5) / height };
}
