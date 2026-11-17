// Landmark 151 is on the forehead midline of MediaPipe's canonical face mesh.
export function getForeheadCenter(points) {
  const point = points?.[151];
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
  return { x: point.x, y: point.y };
}

export function scoreCardPosition(forehead, card, viewport) {
  return {
    left: Math.max(8, Math.min(viewport.width - card.width - 8, forehead.x - card.width / 2)),
    top: Math.max(8, Math.min(viewport.height - card.height - 8, forehead.y - 200 - card.height / 2)),
  };
}
