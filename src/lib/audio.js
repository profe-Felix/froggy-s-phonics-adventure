// Central Supabase audio bucket for all literacy/math games.
//
// Public bucket name: "audio"  (create it in Supabase Storage and set it PUBLIC).
// Folder layout (path = AUDIO_BASE/{lang}/{category}/{file}):
//   {lang}/letters/{letter}.mp3      — letter sounds (raw letter: a.mp3, ñ.mp3, ll.mp3)
//   {lang}/sight-words/{word}.mp3     — sight words easy (raw accented word: papá.mp3)
//   {lang}/numbers/{num}.mp3          — spoken numbers (0.mp3 … 20.mp3)
//   {lang}/words/{name}.mp3           — spelling / sight-words-spelling / phonics
//                                       (accent-escaped name: papá → papa.. , ñ → n.. , ü → u,,)
//   {lang}/sentences/{id}.mp3         — sentences mode (by list item id)
//   {lang}/reading/{id}.mp3           — spanish reading game (by list item id)
//
// {lang} is "es" or "en" and reflects the CONTENT language being pronounced.

export const AUDIO_BASE =
  'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/audio';

// Escape accented characters to ASCII-safe filenames — used by the `words`
// category (spelling, sight-words, phonics): papá → papa.. , ñ → n.. , ü → u,,.
export function toAudioName(word) {
  return word
    .replace(/á/g, 'a..').replace(/é/g, 'e..').replace(/í/g, 'i..')
    .replace(/ó/g, 'o..').replace(/ú/g, 'u..')
    .replace(/Á/g, 'A..').replace(/É/g, 'E..').replace(/Í/g, 'I..')
    .replace(/Ó/g, 'O..').replace(/Ú/g, 'U..')
    .replace(/ü/g, 'u,,').replace(/Ü/g, 'U,,')
    .replace(/ñ/g, 'n..').replace(/Ñ/g, 'N..');
}

// Play a letter sound for the given language. Spanish uses recorded mp3s in
// the audio bucket; English falls back to the browser's speech synthesizer
// (no recorded files yet). Used by the Letter Sounds live model + mirror.
export function playLetterSound(letter, lang = 'es') {
  try {
    if (lang === 'en') {
      window.speechSynthesis?.cancel();
      const u = new SpeechSynthesisUtterance(letter);
      u.lang = 'en-US';
      u.rate = 0.75;
      window.speechSynthesis.speak(u);
      return;
    }
    const a = new Audio(`${AUDIO_BASE}/${lang}/letters/${encodeURIComponent(letter)}.mp3`);
    a.play().catch(() => {});
  } catch {}
}