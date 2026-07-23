// Activities engine — "Contar __ en __".
//
// Two counting modes share one interaction (show an item, pick the count):
//   - counting_words    : count the WORDS in a sentence
//   - counting_phonemes : count the SOUNDS (phonemes) in a word
//
// Counts are auto-computed from the item text, so a preset can be a bare list
// of strings. A teacher may override `answer` per item when the auto-count is
// not what they want.

import { phonemeCount, stripDiacritics } from '@/lib/lettersort/phonics';

// Words in a sentence = whitespace-separated tokens. Trims and ignores blanks.
export function wordCountInSentence(sentence) {
  return String(sentence || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

// Phonemes in a word. We strip diacritics first so accented vowels (á, é, í…)
// still count as one phoneme — the shared phoneme counter drops accents.
export function phonemeCountInWord(word) {
  return phonemeCount(stripDiacritics(word));
}

export const ACTIVITY_MODES = [
  {
    key: 'counting_words',
    label: 'Contar palabras en una frase',
    what: 'palabras',
    in: 'frase',
    count: wordCountInSentence,
    desc: 'El alumno cuenta cuántas palabras tiene cada frase.',
  },
  {
    key: 'counting_phonemes',
    label: 'Contar sonidos (fonemas) en una palabra',
    what: 'sonidos',
    in: 'palabra',
    count: phonemeCountInWord,
    desc: 'El alumno cuenta cuántos sonidos (fonemas) tiene cada palabra.',
  },
  {
    key: 'phoneme_manipulation',
    label: 'Manipular sonidos (fonemas) — contar y cambiar',
    what: 'sonidos',
    in: 'palabra',
    count: phonemeCountInWord,
    desc: 'El alumno coloca una ficha por cada sonido y puede cambiar un sonido por otro color (sustitución). Las fichas se clonan al arrastrar.',
  },
  {
    key: 'text_hunt',
    label: 'Caza en el texto',
    what: 'objetivos',
    in: 'texto',
    count: () => 0,
    desc: 'El alumno caza letras, dígrafos, palabras, puntuación, espacios o la sílaba tónica en un texto. Feedback inmediato y muestra los perdidos.',
  },
];

// Normalize a preset/config object into a ready-to-render activity:
// { mode, modeDef, items: [{id,text,answer}], choices }.
export function buildActivity(config) {
  const mode = config?.mode || ACTIVITY_MODES[0].key;
  const modeDef = ACTIVITY_MODES.find((m) => m.key === mode) || ACTIVITY_MODES[0];
  const rawItems = Array.isArray(config?.items) ? config.items : [];
  const items = rawItems
    .map((it, i) => {
      const text = typeof it === 'string' ? it : (it?.text || it?.word || '');
      const answer =
        (typeof it === 'object' && it != null && it.answer != null)
          ? Number(it.answer)
          : modeDef.count(text);
      return { id: i, text: String(text).trim(), answer };
    })
    .filter((it) => it.text);
  const maxAnswer = items.reduce((m, it) => Math.max(m, it.answer), 0) || 1;
  const choices = config?.choices ? Number(config.choices) : Math.max(8, maxAnswer);
  return { mode, modeDef, items, choices };
}