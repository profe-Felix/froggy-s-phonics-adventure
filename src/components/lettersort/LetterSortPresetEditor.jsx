import React, { useState } from 'react';
import { MODES, presetModeKey } from '@/lib/lettersort/presetConfig';
import { FIELDS, TOGGLES, paramOf } from '@/lib/lettersort/fields';
import { base44 } from '@/api/base44Client';
import { useLetterSortPresets } from '@/hooks/useLetterSortPresets';

// Load a preset config into editor field values, scoped to the given mode's
// fields so config keys like `rows` don't collide between row and generate modes.
function valsFromConfig(config, modeKey) {
  const v = {};
  if (!config) return v;
  const mode = MODES.find((m) => m.key === modeKey);
  for (const f of (mode?.fields || [])) {
    const ck = paramOf(f);
    let val = config[ck];
    if (val === undefined && f === 'counts') val = config.syllcount; // syllcount alias
    if (val === undefined) val = config[f];
    if (val !== undefined) v[f] = Array.isArray(val) ? val.join(',') : String(val);
  }
  for (const t of TOGGLES) {
    if (config[t.key]) v[t.key] = true;
  }
  return v;
}

// Build the preset config object from editor vals, using param names as keys
// (so e.g. rowsGen -> rows matches the preset format buildConfig expects).
// Preserves non-editable keys (e.g. headerimages, groups) from the original.
function configFromVals(modeKey, vals, originalConfig) {
  const mode = MODES.find((m) => m.key === modeKey);
  const cfg = { ...(originalConfig || {}) };
  for (const f of (mode?.fields || [])) {
    const ck = paramOf(f);
    delete cfg[ck];
    delete cfg[f];
  }
  if (mode?.mode) cfg.mode = mode.mode;
  for (const f of (mode?.fields || [])) {
    const v = vals[f];
    if (v === undefined || v === '' || v === false) continue;
    const ck = paramOf(f);
    const cfgField = FIELDS[f];
    if (cfgField?.type === 'number') {
      const n = Number(v);
      if (!Number.isNaN(n)) cfg[ck] = n;
    } else {
      cfg[ck] = v;
    }
  }
  for (const t of TOGGLES) {
    if (vals[t.key]) cfg[t.key] = true;
    else delete cfg[t.key];
  }
  return cfg;
}

export default function LetterSortPresetEditor({ presetKey, onClose, onSaved }) {
  const { presets, refresh } = useLetterSortPresets();
  const existing = presetKey ? presets[presetKey] : null;
  const isDbRecord = !!existing?._dbId;

  const initialMode = existing?.mode_key || presetModeKey(existing) || 'letters';
  const [modeKey, setModeKey] = useState(initialMode);
  const [vals, setVals] = useState(() => valsFromConfig(existing || {}, initialMode));
  const [label, setLabel] = useState(existing?.label || presetKey || '');
  const [key, setKey] = useState(presetKey || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const mode = MODES.find((m) => m.key === modeKey);
  const setField = (k, v) => setVals((p) => ({ ...p, [k]: v }));

  // Safety net: if a preset key was requested but isn't in the cache yet (DB
  // still loading), wait briefly rather than showing empty fields.
  if (presetKey && !existing) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-white rounded-2xl px-6 py-4 text-sm text-gray-500" onClick={(e) => e.stopPropagation()}>Loading preset…</div>
      </div>
    );
  }

  const handleSave = async () => {
    setErr('');
    const finalKey = key.trim();
    if (!finalKey) { setErr('Please enter a preset key.'); return; }
    if (!isDbRecord && presets[finalKey]?._dbId) {
      setErr('A preset with that key already exists in the database. Choose another key.');
      return;
    }
    const originalConfig = existing ? { ...existing } : {};
    delete originalConfig._dbId;
    delete originalConfig.label;
    delete originalConfig.mode_key;
    const cfg = configFromVals(modeKey, vals, originalConfig);
    const payload = {
      key: finalKey,
      label: label.trim() || finalKey,
      mode_key: modeKey,
      config_data: JSON.stringify(cfg),
    };
    setSaving(true);
    try {
      if (isDbRecord && existing._dbId) {
        await base44.entities.LetterSortPreset.update(existing._dbId, payload);
      } else {
        await base44.entities.LetterSortPreset.create(payload);
      }
      await refresh();
      onSaved?.(finalKey);
      onClose?.();
    } catch (e) {
      setErr(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-gray-800 text-lg">{isDbRecord ? 'Edit Letter Sort preset' : 'New Letter Sort preset'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-600 font-bold">Label
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Display name"
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
            </label>
            <label className="text-xs text-gray-600 font-bold">Key {isDbRecord ? '(locked)' : ''}
              <input value={key} onChange={(e) => setKey(e.target.value)} disabled={isDbRecord}
                placeholder="e.g. M4.L16.CF.A1"
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 disabled:bg-gray-100" />
            </label>
          </div>

          <label className="text-xs text-gray-600 font-bold">Sort type
            <select value={modeKey} onChange={(e) => setModeKey(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white">
              {MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <span className="text-xs text-gray-500 mt-1 block">{mode?.desc}</span>
          </label>

          <div className="flex flex-wrap gap-2">
            {mode?.fields.map((f) => {
              const cfg = FIELDS[f];
              if (!cfg) return null;
              return (
                <div key={f} className="flex flex-col">
                  <label className="text-xs font-bold text-gray-600">{cfg.label}</label>
                  {cfg.type === 'select' ? (
                    <select value={vals[f] || cfg.options[0]} onChange={(e) => setField(f, e.target.value)} className="px-2 py-2 rounded-lg border bg-white">
                      {cfg.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : cfg.type === 'toggle' ? (
                    <label className="px-2 py-2 rounded-lg border bg-white flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!vals[f]} onChange={(e) => setField(f, e.target.checked)} />
                      <span className="text-sm">{cfg.label}</span>
                    </label>
                  ) : cfg.type === 'textarea' ? (
                    <textarea value={vals[f] || ''} onChange={(e) => setField(f, e.target.value)} placeholder={cfg.ph} rows={2} className="px-2 py-2 rounded-lg border bg-white min-w-[220px]" />
                  ) : (
                    <input type={cfg.type} value={vals[f] ?? ''} onChange={(e) => setField(f, e.target.value)} placeholder={cfg.ph} className="px-2 py-2 rounded-lg border bg-white min-w-[140px]" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            {TOGGLES.map((t) => (
              <label key={t.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!!vals[t.key]} onChange={(e) => setField(t.key, e.target.checked)} />
                {t.label}
              </label>
            ))}
          </div>

          {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border font-bold text-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold text-sm disabled:opacity-50">
              {saving ? 'Saving…' : 'Save preset'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}