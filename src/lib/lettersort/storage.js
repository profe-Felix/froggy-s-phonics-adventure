// Faithful port of the legacy Letter Sort Supabase image/audio resolution.
// Source: public/lettersort/index.html — ported to ESM, reusing the app's
// existing supabase storage list helper for bucket enumeration.
//
// Image filename convention (markers): accents -> a../e../.., ñ -> n.., ü -> u,,
// Candidates tried per word: <base>_pic.jpg, <base>_pic.png, <base>.jpg, <base>.png
// across [markerForm, prettyForm, plainForm] bases.

import { listAll, publicUrl } from '@/lib/supabaseStorage';
import {
  markersToPretty, stripDiacritics, normalizeMarkers, displayToMarker,
  initialFromStem, imagePriority,
} from './phonics';

const IMG_EXTS = ['jpg', 'png'];

function stemOf(name) { const i = name.lastIndexOf('.'); return i >= 0 ? name.slice(0, i) : name; }
function stripImageSuffix(t) { return t.replace(/_(pic|img|image|foto)$/i, ''); }

// Faithful existence check: range GET (HEAD can be unreliable on some CDNs).
export async function publicUrlIfExists(bucket, path) {
  const url = publicUrl(bucket, path);
  try {
    const r = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
    if (r.ok) return url;
  } catch { /* ignore */ }
  return null;
}

export function imageCandidatesForWord(word, prefix = '') {
  const wMarker = (word || '').toLowerCase();
  const wPretty = markersToPretty(word || '').toLowerCase();
  const wPlain = stripDiacritics(wPretty);
  const pfx = prefix ? `${prefix.replace(/\/$/, '')}/` : '';
  const bases = [wMarker, wPretty, wPlain];
  const out = [];
  for (const b of bases) {
    out.push(`${pfx}${b}_pic.jpg`, `${pfx}${b}_pic.png`, `${pfx}${b}.jpg`, `${pfx}${b}.png`);
  }
  return out;
}

export async function resolveImageForWord(word, { bucket, prefix } = {}) {
  const storageWord = displayToMarker(word);
  for (const p of imageCandidatesForWord(storageWord, prefix)) {
    const url = await publicUrlIfExists(bucket, p);
    if (url) {
      const name = p.split('/').pop();
      const stem = stemOf(name);
      const rawCore = stripImageSuffix(stem);
      return {
        name, path: p, url, stem, rawCore,
        core: normalizeMarkers(rawCore),
        initial: initialFromStem(stem),
      };
    }
  }
  return null;
}

// Enumerate the whole image bucket and normalize each file to a card-source.
export async function listAllImagesJpg({ bucket, prefix } = {}) {
  const files = await listAll(bucket, prefix || '');
  const out = [];
  for (const f of files) {
    const base = f.split('/').pop() || f;
    const ext = base.slice(base.lastIndexOf('.') + 1).toLowerCase();
    if (ext !== 'jpg' && ext !== 'png') continue;
    const url = publicUrl(bucket, f);
    const stem = stemOf(base);
    const rawCore = stripImageSuffix(stem);
    out.push({
      name: base, path: f, url, stem, rawCore,
      core: normalizeMarkers(rawCore),
      initial: initialFromStem(stem),
    });
  }
  return out;
}

// Audio: <prefix>/<rawCore>.mp3
export async function resolveAudioForRawCore(rawCore, { bucket, prefix } = {}) {
  const pfx = prefix ? `${prefix.replace(/\/$/, '')}/` : '';
  return publicUrlIfExists(bucket, `${pfx}${rawCore}.mp3`);
}