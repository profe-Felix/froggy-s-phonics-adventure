// Auto-populate "Caza en el texto" items from the WordBank and Spanish Reading
// sentence presets when the teacher hasn't entered custom examples.
// Returns a mix of single words (from WordBank) and sentences (from Spanish
// Reading "Oraciones" presets) that contain the target letter/phoneme.
//
// Sentences are NEVER auto-generated from templates or word-bank nouns —
// they only come from sentences the teacher already saved in Spanish Reading
// presets, or from examples typed inline in the lesson step.

import { base44 } from '@/api/base44Client';
import { stripDiacritics } from '@/lib/lettersort/phonics';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function norm(s) { return stripDiacritics(s || '').toLowerCase(); }

function containsTarget(text, target) {
  if (!target) return true;
  return norm(text).includes(norm(target));
}

function startsWithTarget(text, target) {
  if (!target) return true;
  return norm(text).startsWith(norm(target));
}

// Build hunt items from WordBank words + Spanish Reading sentence presets.
// config: { huntType, huntTarget/target }
export async function buildHuntItemsFromBank(config) {
  const huntType = config?.huntType || 'phoneme';
  const target = (config?.huntTarget || config?.target || '').trim();

  // Fetch WordBank words (used for single-word items only)
  let bankWords = [];
  try {
    const records = await base44.entities.WordBank.list('-updated_date', 500);
    bankWords = records.filter((w) => w.active !== false).map((w) => w.word).filter(Boolean);
  } catch { /* best-effort */ }

  // Fetch sentences from Spanish Reading presets (section "Oraciones")
  let presetSentences = [];
  try {
    const presets = await base44.entities.SpanishReadingPreset.list('-updated_date', 500);
    for (const p of presets) {
      if (p.section !== 'Oraciones') continue;
      let items = [];
      try { items = JSON.parse(p.items_data || '[]'); } catch { items = []; }
      if (!Array.isArray(items)) items = [];
      for (const it of items) {
        const text = typeof it === 'string' ? it : it?.text;
        if (text && text.trim()) presetSentences.push(text.trim());
      }
    }
  } catch { /* best-effort */ }

  // Filter words by hunt type
  const matchingWords = bankWords.filter((w) =>
    huntType === 'word' ? startsWithTarget(w, target) : containsTarget(w, target)
  );

  // Filter preset sentences by target (only sentences containing the target)
  const matchingSentences = presetSentences.filter((s) => containsTarget(s, target));

  // If we have no matching words or sentences, return empty
  if (matchingWords.length === 0 && matchingSentences.length === 0) return [];

  // Mix: up to 4 words + up to 2 sentences
  const wordItems = shuffle(matchingWords).slice(0, 4).map((w) => ({ text: w }));
  const sentenceItems = shuffle(matchingSentences).slice(0, 2).map((s) => ({ text: s }));

  return shuffle([...wordItems, ...sentenceItems]);
}