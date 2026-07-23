// Shared counter palette for the phoneme-manipulation activity. The first color
// is the "default" a placed counter falls back to. Dragging a source chip clones
// it (the source stays), so a student can drop a DIFFERENT color onto a box to
// represent a sound substitution.
export const PALETTE = [
  { key: 'blue', fill: '#4DA6FF' },
  { key: 'red', fill: '#F87171' },
  { key: 'green', fill: '#34D399' },
  { key: 'amber', fill: '#FBBF24' },
];

export const paletteFill = (key) => (PALETTE.find((p) => p.key === key) || PALETTE[0]).fill;