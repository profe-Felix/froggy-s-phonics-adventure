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

export function fluencyArrow(event, current, total) {
  const target = event.target;
  if (!total || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
      target?.isContentEditable || target?.closest?.('input,textarea,select,[role="textbox"],[role="slider"],[role="spinbutton"],[role="combobox"]')) return null;
  if (event.key === 'ArrowRight') return Math.min(total - 1, current + 1);
  if (event.key === 'ArrowLeft') return Math.max(0, current - 1);
  return null;
}
