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