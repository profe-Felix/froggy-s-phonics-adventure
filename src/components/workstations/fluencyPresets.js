// Built-in fluency-table presets for the Fluency Table workstation.
// These mirror the real curriculum stored in Supabase Storage at
// <project>/storage/v1/object/public/app-presets/fluency/presets.json and act
// as a fallback if that fetch fails. Each preset: { id, title, rows, cols, sweep_ms, content[] }
// `content` is the word pool; it is seeded-shuffled and tiled to fill rows×cols.

export const FLUENCY_PRESETS = [
  {
    id: 'Group1LSReview',
    title: 'Fluidez — Repaso',
    rows: 5, cols: 8, sweep_ms: 600,
    content: ['a','e','i','o','u','m','p','s','l','A','E','I','O','U','M','P','S','L'],
  },
  {
    id: 'Group1LSLearn',
    title: 'Fluidez — Aprendiendo',
    rows: 5, cols: 8, sweep_ms: 600,
    content: ['n','d','t','f','N','D','T','F'],
  },
  {
    id: 'Group2LSReview',
    title: 'Fluidez — Aprendiendo',
    rows: 5, cols: 8, sweep_ms: 600,
    content: ['a','e','i','o','u','m','p','s','l','A','E','I','O','U','M','P','S','L','n','d','t','f','N','D','T','F'],
  },
  {
    id: 'Group3LSReview',
    title: 'Fluidez — Aprendiendo',
    rows: 5, cols: 8, sweep_ms: 600,
    content: ['a','e','i','o','u','m','p','s','l','A','E','I','O','U','M','P','S','L','n','d','t','f','N','D','T','F','B','b','R','r','C','q'],
  },
  {
    id: 'PepeSyllables',
    title: 'Fluidez — Sílabas Pepe',
    rows: 5, cols: 8, sweep_ms: 600,
    content: ['pa','pe','pi','po','pu','ma','me','mi','mo','mu','na','ni','no','pla','pí','pío'],
  },
  {
    id: 'Group1Syllables',
    title: 'Fluidez de Sílabas',
    rows: 5, cols: 6, sweep_ms: 800,
    content: ['ma','me','mi','mo','mu','sa','se','si','so','su','pa','pe','pi','po','pu','la','le','li','lo','lu'],
  },
  {
    id: 'Group2Syllables',
    title: 'Fluidez de sílabas',
    rows: 5, cols: 6, sweep_ms: 800,
    content: ['ma','me','mi','mo','mu','sa','se','si','so','su','pa','pe','pi','po','pu','la','le','li','lo','lu'],
  },
  {
    id: 'MPSLNDTFSyllables',
    title: 'Fluidez — Sílabas CV',
    rows: 5, cols: 6, sweep_ms: 800,
    content: ['ma','me','mi','mo','mu','sa','se','si','so','su','pa','pe','pi','po','pu','la','le','li','lo','lu',
      'na','ne','ni','no','nu','da','de','di','do','du','ta','te','ti','to','tu','fa','fe','fi','fo','fu'],
  },
  {
    id: 'BRCQVGYZSyllables',
    title: 'Fluidez — Sílabas CV',
    rows: 5, cols: 8, sweep_ms: 800,
    content: ['ba','be','bi','bo','bu','ra','re','ri','ro','ru','ca','co','cu','ce','ci','que','qui',
      'va','ve','vi','vo','vu','ga','go','gu','gue','gui','güe','güi','ya','ye','yi','yo','yu','za','ze','zi','zo','zu'],
  },
];