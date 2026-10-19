import { markersToPretty, syllablesNormalized } from './phonics.js';
import { expandConsonantFamily } from './familyAny.mjs';

export const LISTENING_MODES = ['soundmatch', 'syllableposition', 'alliteration'];
export const wordKey = raw => markersToPretty(String(raw || '').toLowerCase()).normalize('NFC')
  .replace(/[áéíóúü]/g, c => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' }[c])).trim();
export function initialSound(raw) {
  const word = wordKey(raw).replace(/^h+/, '');
  if (word.startsWith('ch')) return 'ch';
  if (/^(ll|y)/.test(word)) return 'y';
  if (/^(qu|k|c(?![ei]))/.test(word)) return 'k';
  if (/^(j|g[ei])/.test(word)) return 'j';
  if (/^(s|z|c[ei])/.test(word)) return 's';
  if (/^[bv]/.test(word)) return 'b';
  return /^[aeioudfglmnñprt]/.test(word) ? word[0] : '';
}
export function targetSound(raw) {
  const target = wordKey(raw).replace(/^\/|\/$/g, '');
  if (!/^(?:[aeioubvcdfgjklmnñpqrstyz]|ch|ll|rr|qu)$/.test(target)) return '';
  return ({ c: 'k', q: 'k', qu: 'k', v: 'b', z: 's', ll: 'y', rr: 'r' })[target] || target;
}
export function startsWithSound(word, sound) {
  return !!targetSound(sound) && initialSound(word) === targetSound(sound);
}
export function familyAtPosition(word, consonant, position) {
  const syllables = syllablesNormalized(word).map(wordKey);
  const syllable = position === 'end' ? syllables.at(-1) : syllables[0];
  return !!syllable && expandConsonantFamily(consonant).some(s => syllable.startsWith(wordKey(s)));
}
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
const list = value => Array.isArray(value) ? value : String(value || '').split(',').map(s => s.trim()).filter(Boolean);
export function buildListeningRound(config, imageFiles = []) {
  const empty = error => ({ view: 'listening', kind: config.mode, rows: [], cards: [], error });
  const byWord = new Map();
  for (const file of imageFiles) if (file.url && file.rawCore && !byWord.has(wordKey(file.rawCore))) byWord.set(wordKey(file.rawCore), file);
  const source = [...byWord.values()];
  const requested = [...new Set(list(config.words).map(wordKey))];
  const missing = requested.filter(word => !byWord.has(word));
  if (missing.length) return { ...empty('Faltan imágenes para algunas palabras indicadas. Revisa tu lista.'), missingWords: missing };
  const bank = requested.length ? requested.map(word => byWord.get(word)) : source;
  const card = (file, id, rowId) => ({
    id, coreRaw: file.rawCore, pretty: markersToPretty(file.rawCore), url: file.url,
    imgUrl: file.url, word: '', rowId,
  });
  if (config.mode === 'alliteration') {
    const targets = list(config.sounds).length ? list(config.sounds) : ['t', 'g', 'r'];
    if (targets.some(sound => !targetSound(sound))) return empty('Revisa los sonidos: usa t, g, r, ch u otro sonido inicial válido.');
    const index = Math.max(0, Math.min(targets.length - 1, Number(config.roundIndex) || 0));
    const target = targets[index];
    const yes = shuffle(bank.filter(file => startsWithSound(file.rawCore, target)));
    const no = shuffle(bank.filter(file => !startsWithSound(file.rawCore, target)));
    if (yes.length < 3 || !no.length) return empty(`Se necesitan tres imágenes diferentes con /${target}/ y una sin ese sonido. Amplía la lista de palabras.`);
    const cards = shuffle([...yes.slice(0, 3), no[0]]).map((file, i) => card(file, `alli-${index}-${i}`));
    return {
      view: 'listening', kind: config.mode, target, problemIndex: index, totalProblems: targets.length,
      cards, rows: [{ id: 'box', prompt: '', promptImg: '', maxPerSlot: 3,
        accepts: cards.filter(c => startsWithSound(c.coreRaw, target)).map(c => c.id) }],
    };
  }
  if (config.mode === 'soundmatch') {
    const definitions = String(config.rows || '').split(';').filter(s => s.trim()).map(line => {
      const [prompt, choices] = line.split('~');
      return { prompt: prompt.trim(), choices: list(choices) };
    });
    const rows = [], cards = [], used = new Set();
    const addRow = (prompt, choices) => {
      const id = `row-${rows.length}`;
      const rowCards = shuffle(choices).map((file, i) => card(file, `${id}-${i}`, id));
      const accepts = rowCards.filter(c => initialSound(c.coreRaw) === initialSound(prompt.rawCore)).map(c => c.id);
      if (accepts.length !== 1 || choices.length !== 2) return false;
      rows.push({ id, prompt: prompt.rawCore, promptImg: prompt.url, accepts, maxPerSlot: 1 });
      cards.push(...rowCards);
      return true;
    };
    if (definitions.length) {
      for (const definition of definitions) {
        const prompt = byWord.get(wordKey(definition.prompt));
        const choices = definition.choices.map(w => byWord.get(wordKey(w)));
        if (!prompt || choices.some(f => !f)) return empty('Falta una imagen de las filas indicadas.');
        if (new Set([wordKey(prompt.rawCore), ...choices.map(f => wordKey(f.rawCore))]).size !== 3 ||
            !addRow(prompt, choices)) return empty('Cada fila necesita una imagen modelo y dos opciones diferentes: solo una con el mismo sonido inicial.');
      }
    } else {
      const sounds = list(config.sounds).length ? list(config.sounds) : ['t', 'g', 'r'];
      if (sounds.some(sound => !targetSound(sound))) return empty('Revisa la lista de sonidos iniciales.');
      for (const sound of sounds) {
        const yes = shuffle(bank.filter(f => startsWithSound(f.rawCore, sound) && !used.has(wordKey(f.rawCore))));
        const no = shuffle(bank.filter(f => !startsWithSound(f.rawCore, sound) && !used.has(wordKey(f.rawCore))));
        if (yes.length < 2 || !no.length) return empty(`Faltan imágenes distintas para la fila /${sound}/. Amplía el banco o cambia los sonidos.`);
        addRow(yes[0], [yes[1], no[0]]);
        [yes[0], yes[1], no[0]].forEach(f => used.add(wordKey(f.rawCore)));
      }
    }
    return { view: 'listening', kind: config.mode, rows, cards };
  }
  if (config.mode === 'syllableposition') {
    const consonant = config.consonant || 't';
    if (!expandConsonantFamily(consonant).length) return empty('Elige una consonante válida para la familia silábica.');
    const headers = list(config.headers).length ? list(config.headers) : ['tigre', 'zapato'];
    if (headers.length !== 2) return empty('Indica dos palabras modelo: una para el inicio y otra para el final.');
    const images = Array.isArray(config.headerimages) ? config.headerimages : String(config.headerimages || '').split('|');
    const rows = ['beginning', 'end'].map((position, i) => ({
      id: position, position, prompt: headers[i], promptImg: images[i] || byWord.get(wordKey(headers[i]))?.url,
      accepts: [], maxPerSlot: 0,
    }));
    if (rows.some(row => !row.promptImg)) return empty('Busca o sube las dos imágenes de los encabezados.');
    if (rows.some(row => !familyAtPosition(row.prompt, consonant, row.position))) return empty('La palabra modelo debe tener la familia al inicio en la primera fila y al final en la segunda.');
    const eligible = bank.filter(f => rows.some(row => familyAtPosition(f.rawCore, consonant, row.position)) &&
      !headers.some(header => wordKey(header) === wordKey(f.rawCore)));
    if (requested.length && eligible.length !== bank.length) return empty('Hay palabras sin la familia al inicio ni al final. Revisa la lista para este tipo de clasificación.');
    const picked = new Map();
    if (!requested.length) for (const row of rows) {
      for (const file of shuffle(eligible.filter(f => familyAtPosition(f.rawCore, consonant, row.position))).slice(0, config.per || 4)) {
        picked.set(wordKey(file.rawCore), file);
      }
    }
    const chosen = requested.length ? eligible : shuffle([...picked.values()]);
    const cards = chosen.map((file, i) => card(file, `position-${i}`));
    for (const row of rows) {
      row.accepts = cards.filter(c => familyAtPosition(c.coreRaw, consonant, row.position)).map(c => c.id);
      row.maxPerSlot = cards.length;
    }
    if (!cards.length || rows.some(row => !row.accepts.length)) return empty('Se necesitan imágenes para las dos posiciones: inicio y final.');
    return { view: 'listening', kind: config.mode, rows, cards, target: consonant };
  }
  return empty('Modo de escucha no válido.');
}
