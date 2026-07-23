// Built-in fluency-table presets for the Fluency Table workstation.
// Each preset: { id, title, rows, cols, sweep_ms, content[] }
// `content` is the word pool; it is seeded-shuffled and tiled to fill rows×cols.

export const FLUENCY_PRESETS = [
  {
    id: 'm1', title: 'M1 Fluidez', rows: 4, cols: 5, sweep_ms: 600,
    content: ['yo', 'tú', 'él', 'ella', 'vamos', 'hacer', 'tener', 'decir', 'este', 'pero',
      'como', 'más', 'muy', 'sino', 'también', 'año', 'día', 'vez', 'cosa', 'otro'],
  },
  {
    id: 'm2', title: 'M2 Fluidez', rows: 4, cols: 6, sweep_ms: 550,
    content: ['porque', 'entonces', 'también', 'cuando', 'donde', 'cómo', 'aquí', 'allí',
      'después', 'antes', 'siempre', 'nunca', 'tiempo', 'gente', 'padre', 'madre', 'amigo',
      'escuela', 'trabajo', 'casa', 'bueno', 'grande', 'pequeño', 'nuevo'],
  },
  {
    id: 'letters', title: 'Letras', rows: 3, cols: 7, sweep_ms: 700,
    content: ['a', 'e', 'i', 'o', 'u', 'm', 's', 't', 'p', 'l', 'n', 'd', 'c', 'r', 'b',
      'f', 'g', 'h', 'j', 'v', 'z'],
  },
];