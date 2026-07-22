// Letter sounds for the Letter Sounds mode
// Audio files should be placed in: public/letter-sounds/{letter}.mp3
// Ordered by pedagogical progression for Spanish phonics
export const LETTER_SOUNDS = [
  'o', 'i', 'a', 'u', 'e',
  'm', 'p', 's', 'l', 'n', 'd', 't', 'f', 'b',
  'r', 'c', 'q', 'v', 'll',
  'g', 'j', 'y', 'z', 'ñ',
  'ch', 'k', 'x'
];

// English letter sounds — phonics progression (a–z, no Spanish digraphs).
// Audio for English uses the browser SpeechSynthesis API (no recorded files yet).
export const LETTER_SOUNDS_EN = [
  's', 'a', 't', 'i', 'p', 'n',
  'c', 'k', 'e', 'h', 'r', 'm', 'd',
  'g', 'o', 'u', 'l', 'f', 'b',
  'j', 'q', 'v', 'w', 'x', 'y', 'z'
];