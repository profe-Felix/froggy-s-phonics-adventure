import React, { useEffect, useState } from 'react';
import { TTS_VOICES, getDefaultVoice, setDefaultVoice, langFromVoice } from '@/lib/activities/ttsVoices';
import { playTts } from '@/lib/audio';
import { Volume2, Check, Loader2 } from 'lucide-react';

// Teacher-only page: preview every Google Cloud TTS voice, pick the default
// that all student-facing "Escuchar" buttons will use. The choice is stored
// in the TtsVoiceSetting entity so it applies across every student device.
const SAMPLE = 'Cenamos una rica sopa de pollo con verduras.';

export default function TtsVoices() {
  const [defaultId, setDefaultId] = useState('');
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    getDefaultVoice().then((id) => { setDefaultId(id); setLoading(false); });
  }, []);

  async function preview(voiceId) {
    setPlayingId(voiceId);
    const lang = langFromVoice(voiceId) === 'en-US' ? 'en' : 'es';
    await playTts(SAMPLE, lang, 0.85, voiceId);
    // Audio plays async; clear the spinner after a short beat.
    setTimeout(() => setPlayingId(null), 2500);
  }

  async function makeDefault(voiceId) {
    setSavingId(voiceId);
    try {
      await setDefaultVoice(voiceId);
      setDefaultId(voiceId);
    } catch (e) {
      console.error('Could not save default voice:', e);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-800">Voces de TTS</h1>
        <p className="text-slate-500 text-sm mt-1">
          Escucha cada voz, elige la que suene más natural para tus estudiantes y esa será la voz por defecto en todos los botones de "Escuchar".
        </p>
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold">
          <Check className="w-4 h-4" />
          Voz actual: <b>{TTS_VOICES.find((v) => v.id === defaultId)?.label || defaultId || '—'}</b>
        </div>
      </div>

      <div className="space-y-2">
        {TTS_VOICES.map((v) => {
          const isDefault = v.id === defaultId;
          return (
            <div
              key={v.id}
              className={`flex items-center gap-3 p-3 rounded-xl border bg-white transition ${
                isDefault ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-slate-200'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-700 text-sm">{v.label}</p>
                <p className="text-xs text-slate-400 font-mono">{v.id}</p>
              </div>

              <button
                onClick={() => preview(v.id)}
                disabled={playingId === v.id}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 disabled:opacity-50"
              >
                {playingId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                Escuchar
              </button>

              <button
                onClick={() => makeDefault(v.id)}
                disabled={isDefault || savingId === v.id}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition ${
                  isDefault
                    ? 'bg-indigo-600 text-white cursor-default'
                    : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
                } disabled:opacity-50`}
              >
                {savingId === v.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isDefault ? (
                  <Check className="w-4 h-4" />
                ) : null}
                {isDefault ? 'Por defecto' : 'Elegir'}
              </button>
            </div>
          );
        })}
      </div>

      {loading && (
        <div className="text-center text-slate-400 text-sm mt-4">Cargando voz actual…</div>
      )}
    </div>
  );
}