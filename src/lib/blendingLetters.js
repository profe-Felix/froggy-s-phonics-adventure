// Auto-build the 3 standardized parent-led substeps for a "Blending Letters" word.
// The word is split into individual letters, and prompts are auto-generated
// asking the parent to point to each sound (phoneme) in sequence.
//
// Audio uses the phoneme files in Supabase (es/letters/fonemas/{letter}.mp3)
// via playLetterSound() — NOT TTS. The audioLetter field on each prompt
// drives which phoneme file plays.
//
// The model substep is type 'audio_demo' — the teacher records themselves
// saying the sounds and blending the word. The recording URL is stored in
// step.config.demos[word] and passed through as audioUrl.

export function buildBlendingSubsteps(word, demoUrl) {
  const w = (word || '').trim();
  if (!w) return [];

  const letters = w.split('');
  const prompts = letters.map((letter, i) => ({
    question: i === 0 ? '¿Cuál es el primer sonido?' : '¿Cuál es el siguiente sonido?',
    answer: letter,
    audioLetter: letter.toLowerCase(),
  }));

  return [
    {
      type: 'parent_notes',
      title: 'Apunta a cada letra',
      word: w,
      prompts,
      hint: 'Asegúrate de que tu hijo no haga pausas entre los sonidos',
    },
    {
      type: 'audio_demo',
      title: 'Escucha cómo se hace',
      word: w,
      audioUrl: demoUrl || '',
      hint: '',
    },
    {
      type: 'practice',
      title: 'Ahora tú',
      word: w,
      itemId: w.toLowerCase(),
      itemType: 'word',
      hint: '',
    },
  ];
}

// Build substeps for multiple words (one per line from the inline items textarea).
// Each word gets its own set of 3 substeps in sequence.
// An optional shared hint overrides the default hint on every parent_notes substep.
// demos is a map of word → R2 audio URL for the teacher's recorded model.
export function buildBlendingSubstepsForWords(itemsText, sharedHint, demos = {}) {
  if (!itemsText || !itemsText.trim()) return [];
  const words = itemsText.split('\n').map((s) => s.trim()).filter(Boolean);
  const substeps = words.flatMap((word) => buildBlendingSubsteps(word, demos[word]));
  if (sharedHint && sharedHint.trim()) {
    return substeps.map((s) =>
      s.type === 'parent_notes' ? { ...s, hint: sharedHint.trim() } : s
    );
  }
  return substeps;
}