// Tracks touch pointers only. The drawing surface supplies pointer events,
// prevents native scrolling, and applies returned deltas to its scroll area.
// No zoom calculation, page changes, network requests, or storage writes.

export class NotebookTouch {
  constructor() {
    this.fingers = new Map();
    this.previous = null;
    this.panning = false;
    this.startedAt = 0;
  }

  start(id, x, y) {
    if (!this.fingers.size) this.startedAt = performance.now();
    this.fingers.set(id, { x, y });
    const beganPan = !this.panning && this.fingers.size >= 2;
    if (beganPan) this.panning = true;
    this.previous = this.center();
    return beganPan;
  }

  move(id, x, y) {
    if (!this.fingers.has(id)) return null;
    this.fingers.set(id, { x, y });
    const center = this.center();
    const delta = this.panning && center && this.previous
      ? {
          x: this.previous.x - center.x,
          y: this.previous.y - center.y,
        }
      : null;
    this.previous = center;
    return delta;
  }

  end(id) {
    this.fingers.delete(id);
    this.previous = this.center();
    // After two-finger scrolling, lifting just one finger must not turn the
    // remaining finger into a pen. Both must lift before drawing can resume.
    if (!this.fingers.size) this.panning = false;
  }

  reset() {
    this.fingers.clear();
    this.previous = null;
    this.panning = false;
  }

  center() {
    if (this.fingers.size < 2) return null;
    const [a, b] = [...this.fingers.values()];
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }
}
