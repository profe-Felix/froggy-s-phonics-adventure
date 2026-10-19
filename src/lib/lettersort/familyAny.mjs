import { markersToPretty, normalizeMarkers } from './phonics.js';

export function expandConsonantFamily(value) {
  const consonant = String(value || '').toLowerCase().trim().replace(/^\/|\/$/g, '');
  if (!/^(?:[bcdfghjklmnñpqrstvwxyz]|ch|ll|rr)$/.test(consonant)) return [];
  return ['a', 'e', 'i', 'o', 'u'].map(vowel => consonant + vowel);
}

function listeningWord(raw) {
  // Fold vowel accents/umlaut, but never turn ñ into n.
  return markersToPretty(String(raw || '').toLowerCase()).normalize('NFC')
    .replace(/[áéíóúü]/g, vowel => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' }[vowel]));
}

export function containsConsonantFamily(word, consonant) {
  const normalized = listeningWord(word);
  return expandConsonantFamily(consonant).some(syllable => normalized.includes(syllable));
}

let nextCard = 0;
function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function buildFamilyAnyRound(config, imageFiles) {
  const targets = expandConsonantFamily(config.consonant);
  const empty = error => ({ view: 'columns', columns: [], cards: [], error });
  if (!targets.length) return empty('Elige una sola consonante, por ejemplo t, m, p o ch.');
  const matches = word => containsConsonantFamily(word, config.consonant);
  const columns = [true, false].map(positive => ({
    key: positive ? 'family:yes' : 'family:no',
    label: positive ? 'Sí' : 'No', headerKind: 'family', positive,
    targetConsonant: config.consonant, targetSyllables: targets,
    match: word => matches(word) === positive,
  }));
  const files = imageFiles.filter(file => file.url && file.rawCore);
  let selected;
  if (config.words?.length) {
    const byWord = new Map(files.map(file => [normalizeMarkers(file.rawCore), file]));
    const requested = [...new Set(config.words.map(normalizeMarkers))];
    const missingWords = requested.filter(word => !byWord.has(word));
    if (missingWords.length) return {
      ...empty('Faltan imágenes para algunas palabras de la lista.'),
      missingWords,
    };
    selected = requested.map(word => byWord.get(word));
  } else {
    const yes = shuffled(files.filter(file => matches(file.rawCore)));
    const no = shuffled(files.filter(file => !matches(file.rawCore)));
    if (!yes.length || !no.length) return empty('No hay suficientes imágenes para los dos grupos. Elige otra consonante o una lista de palabras.');
    const count = Math.min(config.per || 4, yes.length, no.length);
    selected = [...yes.slice(0, count), ...no.slice(0, count)];
  }
  return { view: 'columns', columns, cards: shuffled(selected).map(file => ({
    id: `family-${++nextCard}`, imgUrl: file.url, coreRaw: file.rawCore, word: '',
  })) };
}
