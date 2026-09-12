import { TTS_VOICES, getSavedVoice, saveVoice } from '@/lib/activities/ttsVoices';

// Small dropdown that lets the teacher/student pick a Google Cloud TTS voice
// for the "Escuchar" button. The choice is persisted in localStorage and
// surfaced via the onChange callback so the activity can pass it to playTts.
export default function TtsVoiceSelect({ value, onChange, className = '' }) {
  const current = value || getSavedVoice() || TTS_VOICES[0].id;

  const handleChange = (e) => {
    const v = e.target.value;
    saveVoice(v);
    onChange?.(v);
  };

  return (
    <select
      value={current}
      onChange={handleChange}
      aria-label="Voz de TTS"
      className={`text-xs sm:text-sm font-bold rounded-lg border border-slate-300 bg-white text-slate-700 px-2 py-1.5 max-w-[12rem] cursor-pointer hover:bg-slate-50 ${className}`}
    >
      {TTS_VOICES.map((v) => (
        <option key={v.id} value={v.id}>{v.label}</option>
      ))}
    </select>
  );
}