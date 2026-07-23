import { useState, useMemo } from 'react';
import BackButton from '@/components/ui/BackButton';
import CountingActivity from '@/components/activities/CountingActivity';
import { ACTIVITY_MODES } from '@/lib/activities/engine';
import { PRESETS } from '@/lib/activities/presets';

// "Contar __ en __" page. Hosts counting activities; starts with two modes:
//   - counting_words    (count words in a sentence)
//   - counting_phonemes (count phonemes in a word)
// Driven by a mode selector, an optional preset, and an editable items list.
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

export default function Activities() {
  const [modeKey, setModeKey] = useState(ACTIVITY_MODES[0].key);
  const [presetKey, setPresetKey] = useState('');
  const [itemsText, setItemsText] = useState(DEFAULT_ITEMS[ACTIVITY_MODES[0].key]);

  const mode = ACTIVITY_MODES.find((m) => m.key === modeKey);

  const presetKeys = useMemo(
    () => Object.keys(PRESETS).filter((k) => PRESETS[k].mode === modeKey),
    [modeKey]
  );

  const config = useMemo(() => {
    if (presetKey && PRESETS[presetKey]) return PRESETS[presetKey];
    return { mode: modeKey, items: parseItems(itemsText) };
  }, [modeKey, presetKey, itemsText]);

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
    <div className="min-h-screen flex flex-col" style={{ background: '#f7f8fc' }}>
      <div className="flex items-center gap-3 p-3 bg-white border-b sticky top-0 z-20">
        <BackButton onClick={() => window.history.back()} />
        <h1 className="font-bold text-lg flex-1">Actividades · Contar __ en __</h1>
      </div>

      <div className="p-3 bg-white border-b">
        <div className="max-w-4xl mx-auto flex flex-wrap gap-3 items-end">
          <div className="flex flex-col">
            <label className="text-xs font-bold text-gray-600">Actividad</label>
            <select
              value={modeKey}
              onChange={(e) => onModeChange(e.target.value)}
              className="px-3 py-2 rounded-lg border font-bold bg-white min-w-[260px]"
            >
              {ACTIVITY_MODES.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
            <span className="text-xs text-gray-500 mt-1 max-w-[260px]">{mode?.desc}</span>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-bold text-gray-600">Preset</label>
            <select
              value={presetKey}
              onChange={(e) => onPresetChange(e.target.value)}
              className="px-3 py-2 rounded-lg border font-bold bg-white min-w-[180px]"
            >
              <option value="">— ninguno —</option>
              {presetKeys.map((k) => (
                <option key={k} value={k}>{PRESETS[k].label || k}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col flex-1 min-w-[260px]">
            <label className="text-xs font-bold text-gray-600">Elementos (uno por línea)</label>
            <textarea
              value={itemsText}
              onChange={(e) => { setItemsText(e.target.value); setPresetKey(''); }}
              rows={3}
              className="px-2 py-2 rounded-lg border bg-white"
              placeholder={modeKey === 'counting_phonemes' ? 'gato\nsol\nflor' : 'El gato come\nYo soy grande'}
            />
          </div>
        </div>
      </div>

      <CountingActivity config={config} />
    </div>
  );
}