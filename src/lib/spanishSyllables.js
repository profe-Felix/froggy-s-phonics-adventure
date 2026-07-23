// Spanish syllabifier — faithful port of the original workstation logic.
// Splits a word into its syllables, respecting diphthongs, hiatuses,
// onset clusters (pl, br, ch, ll, rr ...), and qu/gu+e/i rules.
export function syllabifyEs(wordRaw) {
  const word = (wordRaw || '').toLowerCase();
  const isV = (ch) => /[aeiouáéíóúü]/.test((ch || '')[0] || '');
  const isWeakUnaccented = (ch) => /^(i|u|ü)$/.test((ch || '')[0] || '');
  const isAccWeak = (ch) => /[íú]/.test((ch || '')[0] || '');
  const onsetPairs = ['pl', 'pr', 'bl', 'br', 'tr', 'dr', 'cl', 'cr', 'gl', 'gr', 'fl', 'fr', 'ch', 'll', 'rr'];

  const chars = [];
  for (let i = 0; i < word.length; i++) {
    const two = word.slice(i, i + 2);
    if (['ch', 'll', 'rr'].includes(two)) { chars.push(two); i++; continue; }
    if (word[i] === 'q' && word[i + 1] === 'u' && /[eiéí]/.test(word[i + 2] || '')) { chars.push('qu'); i++; continue; }
    if (word[i] === 'g' && word[i + 1] === 'u' && /[eiéí]/.test(word[i + 2] || '') && word[i + 1] !== 'ü') { chars.push('gu'); i++; continue; }
    chars.push(word[i]);
  }

  const syl = [];
  let i = 0;
  while (i < chars.length) {
    let onset = [];
    while (i < chars.length && !isV(chars[i])) onset.push(chars[i++]);

    if (i >= chars.length) {
      if (syl.length) syl[syl.length - 1] += onset.join('');
      else syl.push(onset.join(''));
      break;
    }

    let nuc = [chars[i++]];
    for (let k = 0; k < 2 && i < chars.length && isV(chars[i]); k++) {
      const prev = nuc[nuc.length - 1], next = chars[i];
      const canJoin =
        ((isWeakUnaccented(prev) && !isAccWeak(prev)) && !isAccWeak(next)) ||
        ((isWeakUnaccented(next) && !isAccWeak(next)) && !isAccWeak(prev)) ||
        (isWeakUnaccented(prev) && isWeakUnaccented(next));
      if (canJoin) { nuc.push(next); i++; } else break;
    }

    let after = [];
    while (i < chars.length && !isV(chars[i])) after.push(chars[i++]);

    let coda = [], nextOnset = after.slice();
    if (nextOnset.length) {
      let m = 0;
      while (nextOnset.length - m >= 2) {
        const a = nextOnset[m], b = nextOnset[m + 1];
        const pair = (a + b).replace(/[^a-zñ]/g, '');
        if (onsetPairs.includes(pair)) break;
        m++;
      }
      coda = nextOnset.slice(0, m);
      nextOnset = nextOnset.slice(m);
      while (nextOnset.length > 2) coda.push(nextOnset.shift());
    }

    syl.push(onset.join('') + nuc.join('') + coda.join(''));
    if (nextOnset.length) i -= nextOnset.length;
  }

  return syl.filter(Boolean).map((s) => s.trim());
}