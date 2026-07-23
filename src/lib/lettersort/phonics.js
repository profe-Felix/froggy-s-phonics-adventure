// Faithful port of the legacy Letter Sort phonics engine (syllabification,
// phoneme counting, Spanish stress detection, diacritic/marker handling).
// Source: public/lettersort/index.html — ported verbatim, ESM exports added,
// and a couple of module-globals (SYLL_CMP, LANG) turned into parameters so
// the functions are pure.

export function markersToPretty(s) {
  return (s || '')
    .replace(/a\.\./g, 'á').replace(/e\.\./g, 'é').replace(/i\.\./g, 'í').replace(/o\.\./g, 'ó').replace(/u\.\./g, 'ú')
    .replace(/n\.\./g, 'ñ').replace(/u,,/g, 'ü');
}

export function stripDiacritics(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeMarkers(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/a\.\./g, 'á')
    .replace(/e\.\./g, 'é')
    .replace(/i\.\./g, 'í')
    .replace(/o\.\./g, 'ó')
    .replace(/u\.\./g, 'ú')
    .replace(/u,,/g, 'ü')
    .replace(/n\.\./g, 'ñ');
}

export function displayToMarker(word) {
  if (!word) return '';
  return word
    .toLowerCase()
    .replace(/ñ/g, 'n..')
    .replace(/á/g, 'a..')
    .replace(/é/g, 'e..')
    .replace(/í/g, 'i..')
    .replace(/ó/g, 'o..')
    .replace(/ú/g, 'u..')
    .replace(/ü/g, 'u,,');
}

export function initialFromStem(stemRaw) {
  const raw = (stemRaw || '').toLowerCase();
  if (raw.startsWith('n..')) return 'ñ';
  const s = normalizeMarkers(raw);
  if (s.startsWith('ch')) return 'ch';
  if (s.startsWith('ll')) return 'll';
  if (s.startsWith('rr')) return 'rr';
  return s[0] || '';
}

// =====================================================
// SMART PHONEME COUNTER (Spanish-focused)
// ha/he/hi/ho/hu -> 1; ll/rr/ch -> 1; gue/gui & que/qui u silent;
// h silent unless in ch; b/v same phoneme.
// =====================================================
export function phonemeCount(coreWordRaw) {
  let w = markersToPretty((coreWordRaw || '').toLowerCase());
  w = normalizeMarkers(w);
  // remove silent H (except in CH)
  w = w.replace(/(^|[^c])h/g, '$1');
  // QU + GU rules
  w = w.replace(/qu([ei])/g, 'q$1');   // que,qui -> qe,qi
  w = w.replace(/gu([ei])/g, 'g$1');   // gue,gui -> ge,gi
  // collapse digraph phonemes
  w = w.replace(/ch/g, 'Ç').replace(/ll/g, 'Ŀ').replace(/rr/g, 'Ŕ');
  // b and v same phoneme
  w = w.replace(/v/g, 'b');
  // keep only letters we care about
  w = w.replace(/[^a-zñüÇĿŔ]/g, '');
  return w.length || 0;
}

const ONSET_PAIRS = ['pl', 'pr', 'bl', 'br', 'tr', 'dr', 'cl', 'cr', 'gl', 'gr', 'fl', 'fr', 'ch', 'll', 'rr'];

export function syllabifyEs(wordRaw) {
  const word = (wordRaw || '').toLowerCase();
  const isV = (ch) => /[aeiouáéíóúü]/.test((ch || '')[0] || '');
  const isWeakUnaccented = (ch) => /^(i|u|ü)$/.test((ch || '')[0] || '');
  const isAccWeak = (ch) => /[íú]/.test((ch || '')[0] || '');

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
        if (ONSET_PAIRS.includes(pair)) break;
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

export function syllabifyEn(wordRaw) {
  let w = (wordRaw || '').toLowerCase().trim();
  w = w.replace(/[^a-z']/g, '');
  if (!w) return [];

  const isVowel = (ch) => /[aeiouy]/.test(ch || '');

  const endsWithConsonantLe = w.endsWith('le') && w.length >= 3 && !isVowel(w[w.length - 3]);

  let leTail = '';
  if (endsWithConsonantLe) {
    leTail = w.slice(-3);
    w = w.slice(0, -3);
    if (!w) return [leTail];
  }

  const groups = [];
  let i = 0;
  while (i < w.length) {
    const ch = w[i];
    if (isVowel(ch)) {
      let j = i + 1;
      while (j < w.length && isVowel(w[j])) j++;
      groups.push([i, j]);
      i = j;
    } else {
      i++;
    }
  }

  let count = groups.length;
  if (w.endsWith('e') && count > 1) count -= 1;
  if (w.endsWith('ed') && w.length >= 3) {
    const prev = w[w.length - 3];
    if (prev === 't' || prev === 'd') count += 1;
  }
  if (count <= 0) count = 1;

  const cutPoints = groups.slice(1).map((g) => g[0]);
  const syl = [];
  let start = 0;
  for (const cp of cutPoints) {
    if (cp <= start) continue;
    syl.push(w.slice(start, cp));
    start = cp;
  }
  syl.push(w.slice(start));

  if (syl.length > 1 && syl[syl.length - 1] === 'e') {
    syl[syl.length - 2] += 'e';
    syl.pop();
  }
  while (syl.length > count && syl.length > 1) {
    syl[syl.length - 2] += syl[syl.length - 1];
    syl.pop();
  }
  if (leTail) syl.push(leTail);
  return syl.filter(Boolean);
}

export function syllabifyByLang(wordPrettyOrRaw, lang = 'es') {
  return lang === 'en' ? syllabifyEn(wordPrettyOrRaw) : syllabifyEs(wordPrettyOrRaw);
}

export function syllablesNormalized(coreWord, lang = 'es') {
  const pretty = markersToPretty(coreWord);
  return syllabifyByLang(pretty, lang).map(normalizeMarkers);
}

export function syllableCount(coreWord, lang = 'es') {
  return syllablesNormalized(coreWord, lang).length;
}

// Spanish stress — returns 1 (aguda/last), 2 (grave/penúltima), 3 (esdrújula)...
export function stressedSyllIndex(coreWordRaw) {
  const pretty = markersToPretty((coreWordRaw || '').toLowerCase());
  const syls = syllabifyEs(pretty);
  if (!syls.length) return 1;

  let stressed = -1;
  for (let i = 0; i < syls.length; i++) {
    if (/[áéíóú]/.test(syls[i])) { stressed = i; break; }
  }
  if (stressed === -1) {
    const plain = stripDiacritics(pretty);
    const lastChar = plain[plain.length - 1] || '';
    const endsVowel = /[aeiou]/.test(lastChar);
    const endsNOrS = /[ns]/.test(lastChar);
    if (endsVowel || endsNOrS) stressed = Math.max(0, syls.length - 2);
    else stressed = syls.length - 1;
  }
  if (stressed < 0 || stressed >= syls.length) stressed = syls.length - 1;
  return syls.length - stressed;
}

export function cmpSyll(a, b, mode = 'equals') {
  if (!a || !b) return false;
  switch (mode) {
    case 'contains': return a.includes(b);
    case 'prefix': return a.startsWith(b);
    case 'suffix': return a.endsWith(b);
    default: return a === b;
  }
}

export function imagePriority(f) {
  const name = (f.name || '').toLowerCase();
  const ext = name.slice(name.lastIndexOf('.') + 1);
  const isPic = /_pic\./.test(name);
  if (isPic && ext === 'jpg') return 1;
  if (isPic && ext === 'png') return 2;
  if (!isPic && ext === 'jpg') return 3;
  if (!isPic && ext === 'png') return 4;
  return 99;
}