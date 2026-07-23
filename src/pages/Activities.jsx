import { useState, useMemo, useEffect } from 'react';
import BackButton from '@/components/ui/BackButton';
import ElkoninCountActivity from '@/components/activities/ElkoninCountActivity';
import TeacherReview from '@/components/activities/TeacherReview';
import PhonemeManipulationActivity from '@/components/activities/PhonemeManipulationActivity';
import PaletteEditor from '@/components/activities/PaletteEditor';
import HuntActivity from '@/components/activities/HuntActivity';
import RhymeActivity from '@/components/activities/RhymeActivity';
import { HUNT_TYPES } from '@/lib/activities/hunt';
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
  phoneme_manipulation: 'gato\nsol\nflor\npan\nluna',
  text_hunt: 'El gato come pescado.\n¡Hola! ¿Cómo estás?',
  rhyme_identification: 'gracioso, hermoso, sí\nentrenamiento, descubrimiento, sí\nportón, cartón, sí\nnota, noche, no\npalabra, palo, no\npincel, prenda, no\nfelicidad, ciudad, sí\ncamisa, repisa, sí',
};

function parseItems(text) {
  return String(text || '')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((t) => ({ text: t }));
}

function parseRhymeItems(text) {
  return String(text || '')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(',').map((x) => x.trim());
      if (parts.length < 2) return null;
      return { word1: parts[0], word2: parts[1], answer: /sí|si|true/i.test(parts[2] || '') };
    })
    .filter(Boolean);
}

function serializeItems(mode, items) {
  if (mode === 'rhyme_identification') {
    return (items || []).map((it) => `${it.word1}, ${it.word2}, ${it.answer ? 'sí' : 'no'}`).join('\n');
  }
  return (items || []).map((it) => (typeof it === 'string' ? it : it.text || it.word || '')).join('\n');
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
  const [palette, setPalette] = useState(['#4DA6FF', '#F87171']);
  const [huntType, setHuntType] = useState('phoneme');
  const [huntTarget, setHuntTarget] = useState('');

  const mode = ACTIVITY_MODES.find((m) => m.key === modeKey);

  const presetKeys = useMemo(
    () => Object.keys(PRESETS).filter((k) => PRESETS[k].mode === modeKey),
    [modeKey]
  );

  const config = useMemo(() => {
    const base = (presetKey && PRESETS[presetKey]) ? PRESETS[presetKey] : { mode: modeKey, items: modeKey === 'rhyme_identification' ? parseRhymeItems(itemsText) : parseItems(itemsText) };
    let out = modeKey === 'phoneme_manipulation' ? { ...base, palette } : base;
    if (modeKey === 'text_hunt') out = { ...out, huntType, target: huntTarget };
    return out;
  }, [modeKey, presetKey, itemsText, palette, huntType, huntTarget]);

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
    if (k === 'phoneme_manipulation') setPalette(['#4DA6FF', '#F87171']);
    if (k === 'text_hunt') { setHuntType('phoneme'); setHuntTarget(''); }
  }

  function onPresetChange(k) {
    setPresetKey(k);
    if (!k) return;
    const p = PRESETS[k];
    if (p?.items) {
      setItemsText(serializeItems(p.mode, p.items));
    }
    if (Array.isArray(p?.palette)) setPalette(p.palette);
    if (p?.huntType) setHuntType(p.huntType);
    if (p?.target != null) setHuntTarget(p.target);
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

          {modeKey === 'phoneme_manipulation' && (
            <PaletteEditor palette={palette} onChange={setPalette} />
          )}

          {modeKey === 'text_hunt' && (
            <>
              <div className="flex flex-col w-full sm:w-auto">
                <label className="text-xs font-bold text-gray-600">Tipo de caza</label>
                <select
                  value={huntType}
                  onChange={(e) => setHuntType(e.target.value)}
                  className="px-3 py-2 rounded-lg border font-bold bg-white w-full sm:w-auto sm:min-w-[200px]"
                >
                  {HUNT_TYPES.map((h) => (
                    <option key={h.key} value={h.key}>{h.label}</option>
                  ))}
                </select>
              </div>
              {HUNT_TYPES.find((h) => h.key === huntType)?.needsTarget && (
                <div className="flex flex-col w-full sm:w-auto">
                  <label className="text-xs font-bold text-gray-600">Objetivo</label>
                  <input
                    value={huntTarget}
                    onChange={(e) => setHuntTarget(e.target.value)}
                    className="px-2 py-2 rounded-lg border bg-white w-full sm:w-auto sm:min-w-[120px]"
                    placeholder={HUNT_TYPES.find((h) => h.key === huntType)?.targetPh || ''}
                  />
                </div>
              )}
            </>
          )}

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
        ? (modeKey === 'phoneme_manipulation'
            ? <PhonemeManipulationActivity config={config} studentName={studentName} />
            : modeKey === 'text_hunt'
            ? <HuntActivity config={config} studentName={studentName} />
            : modeKey === 'rhyme_identification'
            ? <RhymeActivity config={config} studentName={studentName} />
            : <ElkoninCountActivity config={config} studentName={studentName} />)
        : <TeacherReview mode={modeKey} />}
    </div>
  );
}