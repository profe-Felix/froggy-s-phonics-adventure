// Built-in bilingual (Spanish ↔ English) flashcard sets for the Powerful Word
// workstation. In the original app these lived in Supabase storage; here they're
// shipped as static data so the activity works standalone / offline.

export const POWERFUL_WORD_PRESETS = [
  {
    id: 'sight',
    title: 'Palabras frecuentes',
    pairs: [
      { es: 'casa', en: 'house' }, { es: 'perro', en: 'dog' }, { es: 'gato', en: 'cat' },
      { es: 'sol', en: 'sun' }, { es: 'luna', en: 'moon' }, { es: 'agua', en: 'water' },
      { es: 'libro', en: 'book' }, { es: 'mesa', en: 'table' }, { es: 'silla', en: 'chair' },
      { es: 'pan', en: 'bread' }, { es: 'leche', en: 'milk' }, { es: 'flor', en: 'flower' },
      { es: 'árbol', en: 'tree' }, { es: 'rojo', en: 'red' }, { es: 'azul', en: 'blue' },
    ],
  },
  {
    id: 'animals',
    title: 'Animales',
    pairs: [
      { es: 'gato', en: 'cat' }, { es: 'perro', en: 'dog' }, { es: 'pájaro', en: 'bird' },
      { es: 'pez', en: 'fish' }, { es: 'caballo', en: 'horse' }, { es: 'vaca', en: 'cow' },
      { es: 'cerdo', en: 'pig' }, { es: 'oveja', en: 'sheep' }, { es: 'conejo', en: 'rabbit' },
      { es: 'ratón', en: 'mouse' }, { es: 'oso', en: 'bear' }, { es: 'león', en: 'lion' },
    ],
  },
  {
    id: 'numbers',
    title: 'Números 1–10',
    pairs: [
      { es: 'uno', en: 'one' }, { es: 'dos', en: 'two' }, { es: 'tres', en: 'three' },
      { es: 'cuatro', en: 'four' }, { es: 'cinco', en: 'five' }, { es: 'seis', en: 'six' },
      { es: 'siete', en: 'seven' }, { es: 'ocho', en: 'eight' }, { es: 'nueve', en: 'nine' },
      { es: 'diez', en: 'ten' },
    ],
  },
];