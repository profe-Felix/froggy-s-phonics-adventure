// Supabase Storage public-bucket helpers for the literacy workstations.
// Images / audio live in public buckets and use the accent-marker filename
// convention (see markers.js). These resolve a word to its image / audio URL
// by probing candidate paths with HEAD requests.
import { markersToPretty, prettyToMarkers, normalizeName } from '@/lib/markers';
import { base44 } from '@/api/base44Client';

export const SB_URL = 'https://dmlsiyyqpcupbizpxwhp.supabase.co';

export function publicUrl(bucket, path) {
  const enc = path.split('/').map(encodeURIComponent).join('/');
  return `${SB_URL}/storage/v1/object/public/${bucket}/${enc}`;
}

// HEAD-check a public object; return its public URL if it exists, else null.
export async function headExists(bucket, path) {
  try {
    const r = await fetch(publicUrl(bucket, path), { method: 'HEAD' });
    return r.ok ? publicUrl(bucket, path) : null;
  } catch { return null; }
}

// Recursively list a bucket via a backend function so the anon key stays
// server-side. (Used when a preset has no explicit word list.)
export async function listAll(bucket, prefix = '') {
  const res = await base44.functions.invoke('supabaseStorageList', { bucket, prefix });
  return res.data?.files || [];
}

function stripImageSuffix(t) { return t.replace(/_(pic|img|image|foto)$/i, ''); }

const IMG_EXTS = ['jpg', 'png'];
function stemOf(name) { return name.replace(/\.(jpg|png)$/i, ''); }
function extOf(name) { const m = name.match(/\.([a-z0-9]+)$/i); return m ? m[1].toLowerCase() : ''; }

// List the image bucket and build the word list from filenames, exactly like
// the reference app: basename → strip extension → strip _pic/_img suffix →
// marker form → pretty lowercase. Deduped and sorted (es locale).
export async function wordsFromImageBucket({ bucket, prefix } = {}) {
  const files = await listAll(bucket, prefix);
  const seen = new Set();
  for (const f of files) {
    const base = f.split('/').pop() || f;
    if (!IMG_EXTS.includes(extOf(base))) continue;
    const stem = stripImageSuffix(stemOf(base));
    const pretty = markersToPretty(stem).toLowerCase();
    if (pretty) seen.add(pretty);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b, 'es'));
}

// Resolve a word to its image URL. Tries the marker form first (e.g. "a..guila"),
// then the pretty form; for each, "<stem>_pic.<ext>" then "<stem>.<ext>".
export async function resolveImageForWord(wordRaw, { bucket, prefix } = {}) {
  const prettyLower = markersToPretty(wordRaw || '').toLowerCase();
  const markerLower = prettyToMarkers(wordRaw || '').toLowerCase();
  const stems = [...new Set([markerLower, prettyLower])];
  const pfx = prefix ? prefix.replace(/\/$/, '') + '/' : '';
  for (const stem of stems) {
    for (const ext of IMG_EXTS) {
      for (const name of [`${stem}_pic.${ext}`, `${stem}.${ext}`]) {
        const url = await headExists(bucket, pfx + name);
        if (url) return url;
      }
    }
  }
  return null;
}

const SYLLABLE_EXTS = ['webm'];
function isSoftRContext(syll, idx) {
  return idx > 0 && /^r/i.test(syll) && !/^rr/i.test(syll);
}

// Resolve the audio for a single syllable. Honors the soft-r convention
// (a syllable starting with a single "r" after another syllable is the soft r
// and is stored with a leading dash, e.g. "-ra").
export async function resolveSyllableAudio(wordPretty, syll, idx, { bucket, prefix } = {}) {
  const wPlain = normalizeName(wordPretty);
  const sPlain = normalizeName(syll);
  const sMarker = prettyToMarkers(syll).toLowerCase();
  const pfx = prefix ? prefix.replace(/\/$/, '') + '/' : '';
  const bases = [];
  if (isSoftRContext(syll, idx)) {
    bases.push(`${pfx}-${sMarker}`, `${pfx}${wPlain}/-${sMarker}`, `${pfx}${wPlain}__-${sPlain}`, `${pfx}-${sPlain}`);
  }
  bases.push(
    `${pfx}${sMarker}`, `${pfx}${wPlain}/${sMarker}`, `${pfx}${wPlain}_${idx + 1}`,
    `${pfx}${wPlain}/${idx + 1}`, `${pfx}${wPlain}__${sPlain}`, `${pfx}${sPlain}`,
  );
  for (const b of bases) for (const ext of SYLLABLE_EXTS) {
    const url = await headExists(bucket, b + '.' + ext);
    if (url) return url;
  }
  return null;
}

const WORD_EXTS = ['mp3'];

// Resolve the audio for a whole word.
export async function resolveWordAudio(wordPretty, { bucket, prefix } = {}) {
  const wPlain = normalizeName(wordPretty);
  const wMarker = prettyToMarkers(wordPretty).toLowerCase();
  const pfx = prefix ? prefix.replace(/\/$/, '') + '/' : '';
  const bases = [`${pfx}${wMarker}`, `${pfx}${wPlain}`, `${pfx}${wPlain}/word`, `${pfx}${wPlain}/${wPlain}`];
  for (const b of bases) for (const ext of WORD_EXTS) {
    const url = await headExists(bucket, b + '.' + ext);
    if (url) return url;
  }
  return null;
}