// Case is derived from the box position, never from local randomness, so the
// teacher and every student render identical mixed-case tables from one seed.
export function mixedFluencyCase(value, index) {
  const lower = String(value).toLocaleLowerCase('es');
  if (index % 2 === 0) return lower;
  return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
}

export function onlyO(content = []) {
  const values = content.map(value => String(value).trim().toLocaleLowerCase('es')).filter(Boolean);
  return values.length > 0 && values.every(value => value === 'o');
}

export function buildFluencyCells(preset, seed) {
  const content = (preset?.content || []).filter(Boolean);
  if (!content.length || onlyO(content)) return [];
  const total = (preset.rows || 5) * (preset.cols || 8);
  let state = Math.abs(Math.trunc(Number(seed) || 1)) % 2147483647 || 1;
  const cells = [];
  while (cells.length < total) {
    const batch = [...content];
    for (let i = batch.length - 1; i > 0; i--) {
      state = state * 16807 % 2147483647;
      const j = state % (i + 1);
      [batch[i], batch[j]] = [batch[j], batch[i]];
    }
    cells.push(...batch);
  }
  return cells.slice(0, total).map(mixedFluencyCase);
}

export function fluencyArrow(event, current, total) {
  const target = event.target;
  if (!total || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
      target?.isContentEditable || target?.closest?.('input,textarea,select,[role="textbox"],[role="slider"],[role="spinbutton"],[role="combobox"]')) return null;
  if (event.key === 'ArrowRight') return Math.min(total - 1, current + 1);
  if (event.key === 'ArrowLeft') return Math.max(0, current - 1);
  return null;
}
