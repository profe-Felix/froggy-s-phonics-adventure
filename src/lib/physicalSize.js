// Device-aware physical size estimation for consistent handwriting sizing.
//
// The browser doesn't expose true physical DPI — CSS `in` units are just
// 96px by definition, so `1.5in` and `144px` render identically. The
// physical size of a CSS pixel varies by device: iPhones pack ~138 CSS
// pixels per physical inch, iPads ~100, desktops ~96.
//
// We estimate CSS-px-per-physical-inch from the screen's shorter dimension
// so letter tracing and handwriting lines render at approximately the same
// physical size on phones and tablets. Desktop uses standard 96 DPI
// (larger for student visibility when modeling on a projector/whiteboard).

export function cssPixelsPerInch() {
  if (typeof window === 'undefined' || !window.screen) return 96;
  const minDim = Math.min(window.screen.width, window.screen.height);
  if (minDim < 600) return 138;  // phone
  if (minDim < 1200) return 100; // tablet
  return 96;                      // desktop
}

export function inchesToCssPx(inches) {
  return Math.round(inches * cssPixelsPerInch());
}