// Shared Google Cloud TTS voice options for activity "Escuchar" buttons.
// The teacher picks the default from the TTS Voices preview page; it is
// stored in the TtsVoiceSetting entity so it applies to all student devices.
//
// Voice ids map 1:1 to Google Cloud TTS voice names. The `lang` field is
// derived from the first two segments of the id (e.g. "es-US-Wavenet-A" →
// "es-US") and is sent to generateTts as the languageCode.

import { base44 } from '@/api/base44Client';

// es-US-Wavenet-A is the default — warm female voice, natural for phonics.
export const DEFAULT_VOICE_ID = 'es-US-Wavenet-A';

export const TTS_VOICES = [
  // Latin American / US Spanish — most natural for the student population
  { id: 'es-US-Wavenet-A', label: 'Mujer · Español US (Wavenet)' },
  { id: 'es-US-Wavenet-B', label: 'Hombre · Español US (Wavenet)' },
  { id: 'es-US-Wavenet-C', label: 'Hombre 2 · Español US (Wavenet)' },
  { id: 'es-US-Neural2-A', label: 'Mujer · Español US (Neural)' },
  { id: 'es-US-Neural2-B', label: 'Hombre · Español US (Neural)' },
  { id: 'es-US-Neural2-C', label: 'Hombre 2 · Español US (Neural)' },
  { id: 'es-US-Standard-A', label: 'Mujer · Español US (Estándar)' },
  { id: 'es-US-Standard-B', label: 'Hombre · Español US (Estándar)' },
  // Spain Spanish — alternate accent
  { id: 'es-ES-Wavenet-D', label: 'Mujer · Español España (Wavenet)' },
  { id: 'es-ES-Wavenet-B', label: 'Hombre · Español España (Wavenet)' },
  { id: 'es-ES-Standard-A', label: 'Mujer · Español España (Estándar)' },
  { id: 'es-ES-Standard-B', label: 'Hombre · Español España (Estándar)' },
];

export function langFromVoice(voiceId) {
  if (!voiceId) return null;
  const parts = voiceId.split('-');
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return null;
}

// ---- Teacher-selected default voice (DB-backed) ----------------------------
// Cached in-memory after the first fetch so repeat activity mounts are instant.
let _defaultVoiceCache = null;
let _defaultVoicePromise = null;

export async function getDefaultVoice() {
  if (_defaultVoiceCache !== null) return _defaultVoiceCache;
  if (_defaultVoicePromise) return _defaultVoicePromise;
  _defaultVoicePromise = (async () => {
    try {
      const list = await base44.entities.TtsVoiceSetting.list();
      const id = list && list.length > 0 ? list[0].voice_id : '';
      _defaultVoiceCache = id || DEFAULT_VOICE_ID;
    } catch {
      _defaultVoiceCache = DEFAULT_VOICE_ID;
    }
    _defaultVoicePromise = null;
    return _defaultVoiceCache;
  })();
  return _defaultVoicePromise;
}

export async function setDefaultVoice(voiceId) {
  const list = await base44.entities.TtsVoiceSetting.list();
  if (list && list.length > 0) {
    await base44.entities.TtsVoiceSetting.update(list[0].id, { voice_id: voiceId });
  } else {
    await base44.entities.TtsVoiceSetting.create({ voice_id: voiceId });
  }
  _defaultVoiceCache = voiceId;
}