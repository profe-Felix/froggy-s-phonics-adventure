import { buildConfig } from './rounds';

// Shared Letter Sort mode metadata + preset-to-config logic. Used by both the
// standalone Letter Sort page and the embedded lesson step so they stay in sync.

// mode.mode === null  -> classic columns (no ?mode= param), uses field params
// `desc` is the short helper shown under the selector (and lives in the guide).
export const MODES = [
  { key: 'letters', label: 'Por letra inicial (¿con qué empieza?)', mode: null, fields: ['letters', 'per'], desc: 'Ordena tarjetas por la letra inicial. Útil para correspondencia letra-sonido.' },
  { key: 'randinit', label: 'Por letra inicial al azar', mode: 'randinit', fields: ['pool', 'per'], desc: 'Como "letras iniciales", pero el maestro define un pool de sonidos y la app elige al azar.' },
  { key: 'syllables', label: 'Por sílaba (al inicio o en cualquier posición)', mode: null, fields: ['syllables', 'syllmatch', 'syllcmp', 'per'], desc: 'Ordena por una sílaba objetivo (al inicio o en cualquier posición).' },
  { key: 'syllcount', label: 'Por número de sílabas', mode: null, fields: ['counts', 'per'], desc: 'Ordena palabras según cuántas sílabas tienen.' },
  { key: 'phonemes', label: 'Por número de sonidos (fonemas)', mode: null, fields: ['phonemes', 'per'], desc: 'Ordena palabras según cuántos sonidos (fonemas) tienen.' },
  { key: 'stress', label: 'Por sílaba tónica (aguda/grave/esdrújula)', mode: null, fields: ['stress', 'per'], desc: 'Ordena por la sílaba tónica: aguda (1), grave (2), esdrújula (3).' },
  { key: 'stressreveal', label: 'Tocar la sílaba tónica', mode: 'stressreveal', fields: ['stress', 'words', 'bg'], desc: 'Muestra una escena; el alumno toca la sílaba tónica de cada palabra.' },
  { key: 'sort', label: 'Ordenar en un continuo (de menos a más)', mode: 'sort', fields: ['words', 'layout', 'direction', 'bottom', 'top', 'left', 'right'], desc: 'Ordena una lista en un continuo (ej. menos → más) con etiquetas de dirección.' },
  { key: 'manualsort', label: 'Clasificación libre (tú defines categorías)', mode: 'manualsort', fields: ['headers', 'answers', 'headertype', 'cardtype', 'layout'], desc: 'Clasificación totalmente personalizada: defines encabezados y respuestas.' },
  { key: 'row', label: 'Filas: arrastra la que empieza igual', mode: 'row', fields: ['rows', 'rowtitle'], desc: 'Cada fila muestra una palabra-prompt; el alumno arrastra la opción que empieza con el mismo sonido inicial (una tarjeta por fila).' },
  { key: 'rowalli', label: 'Filas: agrupar por aliteración (mismo sonido)', mode: 'rowalli', fields: ['rows', 'rowtitle'], desc: 'Cada fila agrupa palabras que empiezan con el mismo sonido.' },
  { key: 'allisyll', label: 'Filas: agrupar por sílaba inicial', mode: 'allisyll', fields: ['rows', 'rowtitle'], desc: 'Cada fila agrupa palabras con la misma sílaba inicial.' },
  { key: 'rowsyll', label: 'Filas: sílaba al inicio o al final', mode: 'rowsyll', fields: ['rows', 'words', 'rowtitle'], desc: 'Filas que ordenan por una sílaba al inicio o al final de la palabra.' },
  { key: 'rowsyllcols', label: 'Cuadrícula: filas × columnas de sílabas', mode: 'rowsyllcols', fields: ['rowsyll', 'words', 'headertype', 'cardtype', 'match', 'layout', 'distractors'], desc: 'Cuadrícula filas×columnas de sílabas, con distractores.' },
  { key: 'syllgroups', label: 'Grupos: familias de sílabas', mode: 'syllgroups', fields: ['groups', 'words', 'titles'], desc: 'Agrupa palabras por familias de sílabas con títulos personalizados.' },
  { key: 'generate', label: 'Completar adivinanza (arrastrar respuestas)', mode: 'generate', fields: ['riddle', 'columns', 'rowsGen', 'slots'], desc: 'Genera palabras a partir de adivinanzas/definiciones en espacios por columna.' },
];

// Map a preset object to one of the MODES keys so the dropdown can be filtered
// by the currently selected sort type. Mirrors readInitialState inference.
export function presetModeKey(obj) {
  if (!obj) return null;
  const m = (obj.mode || '').toString().toLowerCase();
  if (m) {
    const found = MODES.find((x) => x.mode === m);
    if (found) return found.key;
  }
  if (obj.letters) return 'letters';
  if (obj.syllables) return 'syllables';
  if (obj.syllcount || obj.counts) return 'syllcount';
  if (obj.phonemes || obj.phoneme) return 'phonemes';
  if (obj.stress || obj.stresspos) return 'stress';
  return null;
}

// Build the normalized activity config for a preset object (used by the lesson step).
export function configForPreset(preset) {
  if (!preset) return null;
  const modeKey = presetModeKey(preset);
  if (!modeKey) return null;
  const internalMode = MODES.find((m) => m.key === modeKey)?.mode || null;
  return buildConfig(modeKey, internalMode, preset);
}