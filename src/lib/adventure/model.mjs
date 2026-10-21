export { validateMap, progressFromAttempts, levelState } from '../../../base44/functions/adventureMap/model.js';

// A smooth continuous path, with room for a milestone after every 20 stops.
// SVG and HTML buttons use the same coordinates; no independent positioning.
export function adventureGeometry(count = 200) {
  const width = 640, spacing = 112, gap = 160, top = 120;
  const points = Array.from({ length: count }, (_, i) => ({
    number: i + 1, x: 320 + 155 * Math.sin(i * Math.PI / 4),
    y: top + i * spacing + Math.floor(i / 20) * gap,
  }));
  const path = points.map((p, i) => {
    if (!i) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1], mid = (prev.y + p.y) / 2;
    return `C ${prev.x} ${mid}, ${p.x} ${mid}, ${p.x} ${p.y}`;
  }).join(' ');
  return { width, height: (points.at(-1)?.y || top) + 240, points, path,
    milestones: points.filter(p => p.number % 20 === 0).map(p => ({
      section: p.number / 20, x: 320, y: p.y + 132,
    })) };
}
