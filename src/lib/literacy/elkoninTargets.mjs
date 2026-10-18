export function elkoninTargets(value) {
  const parts = (Array.isArray(value) ? value : [value])
    .filter(item => typeof item === 'string')
    .flatMap(item => item.split(/[,;\n\r]+/)).map(item => item.trim()).filter(Boolean);
  const seen = new Set();
  return parts.filter(word => {
    const key = word.normalize('NFKC').toLocaleLowerCase('es');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
