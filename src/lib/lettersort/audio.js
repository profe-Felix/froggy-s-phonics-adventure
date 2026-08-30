// Audio cache + playback for Letter Sort. Resolves <rawCore>.mp3 from the
// Supabase audio bucket and reuses a single Audio element per core. Falls
// back to cloud TTS (generateTts) when no pre-recorded audio exists — the TTS
// audio is generated once and cached permanently in the bucket, so subsequent
// plays are instant.
import { resolveAudioForRawCore } from './storage';
import { markersToPretty } from './phonics';
import { playTts } from '@/lib/audio';

const urlCache = new Map(); // coreRaw -> url | null
const elCache = new Map();  // coreRaw -> Audio

export async function ensureAudioUrl(coreRaw, opts) {
  if (urlCache.has(coreRaw)) return urlCache.get(coreRaw);
  const url = await resolveAudioForRawCore(coreRaw, opts);
  urlCache.set(coreRaw, url);
  return url;
}

export async function preloadAudio(cores, opts) {
  const uniq = Array.from(new Set(cores));
  await Promise.all(uniq.map(async (k) => {
    const url = await ensureAudioUrl(k, opts);
    if (url && !elCache.has(k)) {
      const a = new Audio();
      a.preload = 'auto';
      a.src = url;
      try { a.load(); } catch { /* ignore */ }
      elCache.set(k, a);
    }
  }));
}

export async function playWordAudio(coreRaw, opts) {
  let a = elCache.get(coreRaw);
  if (!a) {
    const url = await ensureAudioUrl(coreRaw, opts);
    if (url) {
      a = new Audio(url);
      elCache.set(coreRaw, a);
    } else {
      // No pre-recorded audio — fall back to cloud TTS. The generateTts
      // backend checks the bucket first, so if the teacher pre-generated
      // audio from the preset editor it plays instantly; otherwise it
      // generates on-the-fly and caches permanently for future plays.
      const lang = opts?.prefix?.startsWith('en') ? 'en' : 'es';
      const word = markersToPretty(coreRaw);
      playTts(word, lang, 0.85);
      return;
    }
  }
  try { a.currentTime = 0; } catch { /* ignore */ }
  try { await a.play(); } catch { /* ignore */ }
}