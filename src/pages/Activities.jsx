import { useState, useMemo, useEffect } from 'react';
import BackButton from '@/components/ui/BackButton';
import ElkoninCountActivity from '@/components/activities/ElkoninCountActivity';
import TeacherReview from '@/components/activities/TeacherReview';
import { ACTIVITY_MODES } from '@/lib/activities/engine';
import { PRESETS } from '@/lib/activities/presets';

// "Contar __ en __" page. Two roles via a top-bar toggle:
//   - Estudiante: recordable Elkonin counting (voice + tile placement)
//   - Profesor: review submitted responses (audio + placement)
// Config (mode / preset / items) is shared; the items list + student name only
// show in student mode. The number-tile counting version (CountingActivity) is
// kept for later.
const DEFAULT_ITEMS = {
  counting_words: 'El gato come\nYo soy grande\nLa luna brilla en la noche',
  counting_phonemes: 'gato\nsol\nflor\npan\nluna',
};

function parseItems(text) {
  return String(text || '')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((t) => ({ text: t }));
}

function readRole() {
  return new URLSearchParams(window.location.search).get('role') === 'teacher'
    ? 'teacher'
    : 'student';
}

export default function Activities() {
  const [role, setRole] = useState(readRole());
  const [modeKey, setModeKey] = useState(ACTIVITY_MODES[0].key);
  const [presetKey, setPresetKey] = useState('');
  const [itemsText, setItemsText] = useState(DEFAULT_ITEMS[ACTIVITY_MODES[0].key]);
  const [studentName, setStudentName] = useState('Estudiante');

  const mode = ACTIVITY_MODES.find((m) => m.key === modeKey);

  const presetKeys = useMemo(
    () => Object.keys(PRESETS).filter((k) => PRESETS[k].mode === modeKey),
    [modeKey]
  );

  const config = useMemo(() => {
    if (presetKey && PRESETS[presetKey]) return PRESETS[presetKey];
    return { mode: modeKey, items: parseItems(itemsText) };
  }, [modeKey, presetKey, itemsText]);

  // keep role in the URL so a refresh preserves the view
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    qs.set('role', role);
    window.history.replaceState(null, '', `${window.location.pathname}?${qs.toString()}`);
  }, [role]);

  function onModeChange(k) {
    setModeKey(k);
    setPresetKey('');
    setItemsText(DEFAULT_ITEMS[k] || '');
  }

  function onPresetChange(k) {
    setPresetKey(k);
    if (!k) return;
    const p = PRESETS[k];
    if (p?.items) {
      setItemsText(
        p.items.map((it) => (typeof it === 'string' ? it : it.text || it.word || '')).join('\n')
      );
    }
  }

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ background: '#f7f8fc' }}>
      <div className="flex items-center gap-3 p-3 bg-white border-b sticky top-0 z-20">
        <BackButton onClick={() => window.history.back()} />
        <h1 className="font-bold text-lg flex-1 min-w-0">Actividades · Contar __ en __</h1>
        <div className="flex rounded-lg border overflow-hidden">
          <button
            onClick={() => setRole('student')}
            className={`px-3 py-1.5 text-sm font-bold ${role === 'student' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}
          >
            Estudiante
          </button>
          <button
            onClick={() => setRole('teacher')}
            className={`px-3 py-1.5 text-sm font-bold ${role === 'teacher' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}
          >
            Profesor
          </button>
        </div>
      </div>

      <div className="p-3 bg-white border-b">
        <div className="max-w-4xl mx-auto flex flex-wrap gap-3 items-end">
          <div className="flex flex-col w-full sm:w-auto">
            <label className="text-xs font-bold text-gray-600">Actividad</label>
            <select
              value={modeKey}
              onChange={(e) => onModeChange(e.target.value)}
              className="px-3 py-2 rounded-lg border font-bold bg-white w-full sm:w-auto sm:min-w-[260px]"
            >
              {ACTIVITY_MODES.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <span className="text-xs text-gray-500 mt-1 max-w-[260px]">{mode?.desc}</span>
          </div>

          <div className="flex flex-col w-full sm:w-auto">
            <label className="text-xs font-bold text-gray-600">Preset</label>
            <select
              value={presetKey}
              onChange={(e) => onPresetChange(e.target.value)}
              className="px-3 py-2 rounded-lg border font-bold bg-white w-full sm:w-auto sm:min-w-[180px]"
            >
              <option value="">— ninguno —</option>
              {presetKeys.map((k) => (
                <option key={k} value={k}>{PRESETS[k].label || k}</option>
              ))}
            </select>
          </div>

          {role === 'student' && (
            <>
              <div className="flex flex-col w-full sm:w-auto">
                <label className="text-xs font-bold text-gray-600">Nombre del estudiante</label>
                <input
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="px-2 py-2 rounded-lg border bg-white w-full sm:w-auto sm:min-w-[160px]"
                />
              </div>
              <div className="flex flex-col flex-1 w-full sm:w-auto sm:min-w-[260px]">
                <label className="text-xs font-bold text-gray-600">Elementos (uno por línea)</label>
                <textarea
                  value={itemsText}
                  onChange={(e) => { setItemsText(e.target.value); setPresetKey(''); }}
                  rows={3}
                  className="px-2 py-2 rounded-lg border bg-white w-full"
                  placeholder={modeKey === 'counting_phonemes' ? 'gato\nsol\nflor' : 'El gato come\nYo soy grande'}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {role === 'student'
        ? <ElkoninCountActivity config={config} studentName={studentName} />
        : <TeacherReview mode={modeKey} />}
    </div>
  );
}