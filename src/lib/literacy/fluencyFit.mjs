// Fit the existing logical rows without changing the shuffled reading order,
// row recordings, or teacher/student cell indices.
export function fluencyFitLayout({ width, height, rows, cols }) {
  const gap = 4;
  const playWidth = width < 480 ? 24 : 32;
  const rowHeight = Math.max(0, (height - 32 - gap * rows) / Math.max(1, rows));
  const cellWidth = Math.max(0, (width - playWidth - gap * cols) / Math.max(1, cols));
  return { gap, playWidth, rowHeight, cellWidth };
}

export function fluencyFitFont(layout, text, measuredEm) {
  const em = measuredEm > 0 ? measuredEm : Math.max(1, Array.from(String(text)).length) * 0.8;
  return Math.max(1, Math.min(32, (layout.rowHeight - 6) * 0.65, (layout.cellWidth - 8) / em));
}

export function fluencyContextLabel(title = '') {
  return title.match(/M\d+\.L\d+(?:\s*[–-]\s*L?\d+)?/i)?.[0] || title;
}
