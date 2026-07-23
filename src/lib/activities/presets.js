// Activities — preset reference.
//
// This file is the reference for the preset JSON the Activities page consumes.
// A preset is a plain object:
//
//   {
//     "mode": "counting_words" | "counting_phonemes",
//     "label": "string",            // optional display name in the Preset dropdown
//     "choices": number,            // optional, max number tile shown (default 8,
//                                   //   or the largest auto-count, whichever is bigger)
//     "items": [                    // REQUIRED — the prompts to count
//       { "text": "...", "answer": n },   // answer is OPTIONAL: auto-computed if omitted
//       "El gato come"                     // a bare string is allowed (answer auto-computed)
//     ]
//   }
//
// - counting_words:    items[].text is a SENTENCE; answer = number of words.
// - counting_phonemes: items[].text is a single WORD; answer = number of phonemes.
//
// Override `answer` only when the auto-count is not what you want (e.g. you want
// to accept a diphthong as two sounds). Everything else is derived automatically.

export const PRESETS = {
  counting_words_basic: {
    label: 'Ejemplo · frases cortas (palabras)',
    mode: 'counting_words',
    items: [
      'El gato come',
      'Yo soy grande',
      'La luna brilla en la noche',
      'Mi mamá me lee un cuento',
    ],
  },
  counting_words_longer: {
    label: 'Ejemplo · frases más largas (palabras)',
    mode: 'counting_words',
    items: [
      'El perro corre rápido por el parque',
      'Los niños juegan felices en el patio de la escuela',
      'Hoy hace mucho calor y quiero comer helado',
    ],
  },
  counting_phonemes_basic: {
    label: 'Ejemplo · palabras cortas (fonemas)',
    mode: 'counting_phonemes',
    items: ['gato', 'sol', 'flor', 'pan', 'luna'],
  },
  counting_phonemes_digraphs: {
    label: 'Ejemplo · dígrafos ch / ll / rr (fonemas)',
    mode: 'counting_phonemes',
    items: ['chico', 'llave', 'perro', 'guitarra', 'lápiz'],
  },
  phoneme_manipulation_basic: {
    label: 'Ejemplo · manipular fonemas (colores)',
    mode: 'phoneme_manipulation',
    items: ['gato', 'sol', 'flor', 'pan', 'luna'],
  },
  text_hunt_punct: {
    label: 'Ejemplo · caza puntuación',
    mode: 'text_hunt',
    huntType: 'punctuation',
    items: ['El gato come pescado.', '¡Hola! ¿Cómo estás?'],
  },
  text_hunt_syllable: {
    label: 'Ejemplo · caza sílaba tónica',
    mode: 'text_hunt',
    huntType: 'syllable',
    items: ['gato', 'pelota', 'campana'],
  },
};