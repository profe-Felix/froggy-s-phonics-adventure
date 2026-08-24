// Shared Letter Sort field definitions used by both the standalone Letter Sort
// page and the Letter Sort preset editor (lesson planner). Extracted here so the
// two surfaces stay in sync.

export const FIELDS = {
  letters: { label: 'Letras', type: 'text', ph: 'a, b, ch' },
  syllables: { label: 'Sílabas', type: 'text', ph: 'ma, pa, sa' },
  syllmatch: { label: 'Coincidencia', type: 'select', options: ['initial', 'any'] },
  syllcmp: { label: 'Comparador', type: 'select', options: ['equals', 'contains', 'prefix', 'suffix'] },
  counts: { label: 'Conteos', type: 'text', ph: '1-3 o 1,2,3' },
  phonemes: { label: 'Sonidos', type: 'text', ph: '3-5' },
  stress: { label: 'Posiciones', type: 'text', ph: '1,2,3' },
  pool: { label: 'Pool de letras', type: 'text', ph: 'b, m, s, ch, ll, rr' },
  per: { label: 'Cartas por columna', type: 'number', ph: '4' },
  words: { label: 'Palabras', type: 'textarea', ph: 'lista separada por comas' },
  rows: { label: 'Filas', type: 'textarea', ph: 'row: prompt~opción; ...  ·  rowsyll: palabra:init;palabra:final' },
  rowsyll: { label: 'Columnas (rowsyll)', type: 'text', ph: 'ma,pa | sa,ta' },
  groups: { label: 'Grupos', type: 'text', ph: 'n | ch | br' },
  headers: { label: 'Encabezados', type: 'text', ph: 'perro,gato' },
  answers: { label: 'Respuestas', type: 'text', ph: 'perro:collar,hueso|gato:leche,raton' },
  headertype: { label: 'Tipo de encabezado', type: 'select', options: ['image', 'text'] },
  cardtype: { label: 'Tipo de tarjeta', type: 'select', options: ['word', 'image'] },
  match: { label: 'Coincidencia', type: 'select', options: ['syllable-start', 'contains', 'word-contains'] },
  layout: { label: 'Disposición', type: 'select', options: ['side', 'top', 'vertical', 'horizontal'] },
  direction: { label: 'Dirección', type: 'select', options: ['bottom-up', 'top-down', 'left-right', 'right-left'] },
  bottom: { label: 'Etiqueta abajo', type: 'text', ph: 'menos' },
  top: { label: 'Etiqueta arriba', type: 'text', ph: 'más' },
  left: { label: 'Etiqueta izquierda', type: 'text', ph: 'menos' },
  right: { label: 'Etiqueta derecha', type: 'text', ph: 'más' },
  distractors: { label: 'Distractores', type: 'number', ph: '0' },
  rowtitle: { label: 'Mostrar título', type: 'toggle', param: 'rowtitle' },
  titles: { label: 'Títulos', type: 'text', ph: 'sí,no,maybe' },
  riddle: { label: 'Adivinanza', type: 'text', ph: 'Texto|oculto|...' },
  columns: { label: 'Columnas', type: 'text', ph: 'A,B' },
  rowsGen: { label: 'Filas por columna', type: 'text', ph: '4', param: 'rows' },
  slots: { label: 'Espacios', type: 'number', ph: '1' },
  bg: { label: 'Imagen de fondo', type: 'text', ph: 'scene.jpg' },
};

export const TOGGLES = [
  { key: 'tilesonly', label: 'Solo palabras (sin imágenes)' },
  { key: 'hidewords', label: 'Cubrir palabras (tocar para revelar)' },
  { key: 'splitcards', label: 'Tarjetas divididas (palabra + imagen)' },
  { key: 'hidetitle', label: 'Ocultar títulos de columna' },
  { key: 'emoji', label: 'Etiquetas con emoji' },
];

export function paramOf(fieldKey) { return FIELDS[fieldKey]?.param || fieldKey; }