// Audio playback for Letter Sort. Word audio is generated and cached by the
// generateTts backend (Google Cloud TTS → Supabase audio bucket at
// `{lang}/tts/{voice}/{hash}.mp3`), so we resolve through lib/audio's playTts /
// preloadTts which hit that same backend + cache. Pre-recorded files under
// `es/words/` are not used (that folder is empty), so going straight to TTS
// avoids the 400 existence-checks that fired on every word.
import { markersToPretty } from './phonics';
import { playTts, preloadTts, stopAllAudio } from '@/lib/audio';

const elCache = new Map();  // coreRaw -> Audio (for repeat plays)

let familyPlayback = null;
export function stopFamilyWordAudio() {
  familyPlayback?.abort();
  familyPlayback = null;
  stopAllAudio();
}

// Listening-only cards request audio on tap, not a class-wide batch of TTS
// generations at mount. playTts uses the teacher's preferred voice and cache.
export async function playFamilyWordAudio(coreRaw) {
  stopFamilyWordAudio();
  const controller = new AbortController();
  familyPlayback = controller;
  const word = markersToPretty(coreRaw);
  const ok = await playTts(word, 'es', 0.85, '', undefined, { signal: controller.signal });
  if (controller.signal.aborted) return true;
  if (!ok) throw new Error('Audio no disponible. Toca para reintentar.');
  return true;
}

export async function preloadAudio(cores, _opts) {
  const uniq = Array.from(new Set(cores));
  await Promise.all(uniq.map(async (k) => {
    const word = markersToPretty(k);
    await preloadTts(word, 'es');
  }));
}

export async function playWordAudio(coreRaw, _opts) {
  const word = markersToPretty(coreRaw);
  let a = elCache.get(coreRaw);
  if (!a) {
    // playTts resolves the cached TTS url (generating once if needed) and
    // plays it; we also keep an Audio element keyed by coreRaw for repeats.
    await playTts(word, 'es', 0.85);
    return;
  }
  try { a.currentTime = 0; } catch { /* ignore */ }
  try { await a.play(); } catch { /* ignore */ }
}