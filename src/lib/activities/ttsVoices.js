// Shared Google Cloud TTS voice options for activity "Escuchar" buttons.
// The selected voice is persisted in localStorage so a teacher's choice
// carries across activities and sessions.
//
// Voice ids map 1:1 to Google Cloud TTS voice names. The `lang` field is
// derived from the first two segments of the id (e.g. "es-US-Wavenet-B" →
// "es-US") and is sent to generateTts as the languageCode.

export const TTS_VOICES = [
  // Latin American / US Spanish — most natural for the student population
  { id: 'es-US-Neural2-A', label: 'Mujer · Español US (Neural)' },
  { id: 'es-US-Neural2-B', label: 'Hombre · Español US (Neural)' },
  { id: 'es-US-Neural2-C', label: 'Hombre 2 · Español US (Neural)' },
  { id: 'es-US-Wavenet-A', label: 'Mujer · Español US (Wavenet)' },
  { id: 'es-US-Wavenet-B', label: 'Hombre · Español US (Wavenet)' },
  { id: 'es-US-Wavenet-C', label: 'Hombre 2 · Español US (Wavenet)' },
  { id: 'es-US-Standard-A', label: 'Mujer · Español US (Estándar)' },
  { id: 'es-US-Standard-B', label: 'Hombre · Español US (Estándar)' },
  // Spain Spanish — alternate accent
  { id: 'es-ES-Wavenet-D', label: 'Mujer · Español España (Wavenet)' },
  { id: 'es-ES-Wavenet-B', label: 'Hombre · Español España (Wavenet)' },
  { id: 'es-ES-Standard-A', label: 'Mujer · Español España (Estándar)' },
  { id: 'es-ES-Standard-B', label: 'Hombre · Español España (Estándar)' },
];

const STORAGE_KEY = 'tts_voice_id';

export function langFromVoice(voiceId) {
  if (!voiceId) return null;
  const parts = voiceId.split('-');
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return null;
}

export function getSavedVoice() {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
}

export function saveVoice(voiceId) {
  try { localStorage.setItem(STORAGE_KEY, voiceId || ''); } catch { /* best-effort */ }
}