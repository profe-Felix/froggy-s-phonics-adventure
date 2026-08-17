import { base44 } from '@/api/base44Client';

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
    const a = new Audio(`${AUDIO_BASE}/${lang}/letters/${toAudioName(letter)}.mp3`);
    a.play().catch(() => {});
  } catch {}
}

// Silence trimming: detect and cache the start of actual audio (skipping
// leading silence) so phoneme playback is instant with no awkward gap. The
// first call fetches + decodes via Web Audio API; subsequent calls return
// the cached offset instantly.
const silenceCache = {};

export function getSilenceStartSync(url) {
  return silenceCache[url] ?? 0;
}

export async function preloadSilenceStart(url) {
  if (silenceCache[url] !== undefined) return;
  silenceCache[url] = 0; // mark pending so concurrent calls don't re-fetch
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const threshold = 0.01;
    const sampleRate = audioBuffer.sampleRate;
    const chunkSize = Math.floor(sampleRate * 0.005); // 5ms chunks
    let startSample = 0;
    for (let i = 0; i < channelData.length; i += chunkSize) {
      let maxAmp = 0;
      for (let j = i; j < Math.min(i + chunkSize, channelData.length); j++) {
        const amp = Math.abs(channelData[j]);
        if (amp > maxAmp) maxAmp = amp;
      }
      if (maxAmp > threshold) { startSample = i; break; }
    }
    silenceCache[url] = startSample / sampleRate;
    ctx.close();
  } catch {
    silenceCache[url] = 0;
  }
}

// Cloud TTS with persistent caching. Generates spoken audio via the
// generateTts backend function (Google Cloud TTS → Supabase audio bucket) and
// caches the result URL in memory so repeat plays are instant. The backend
// function itself checks the bucket first — so once a sentence is generated,
// it's reused forever across all students/devices. Falls back to the
// browser's speech synthesizer if the backend is unreachable.
const ttsCache = new Map();

export async function playTts(text, lang = 'es') {
  if (!text) return;
  const key = `${lang}:${text}`;
  let url = ttsCache.get(key);
  if (!url) {
    try {
      const res = await base44.functions.invoke('generateTts', { text, lang });
      url = res.data?.url;
      if (url) ttsCache.set(key, url);
    } catch { /* fall through to speechSynthesis */ }
  }
  if (url) {
    try {
      const a = new Audio(url);
      a.play().catch(() => {});
      return;
    } catch { /* fall through */ }
  }
  // Fallback: browser speech synthesizer (less natural but always available)
  try {
    window.speechSynthesis?.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'en' ? 'en-US' : 'es-ES';
    u.rate = 0.85;
    window.speechSynthesis?.speak(u);
  } catch { /* best-effort */ }
}