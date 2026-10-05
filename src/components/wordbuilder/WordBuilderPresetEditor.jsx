import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useWordBuilderPresets } from '@/hooks/useWordBuilderPresets';

// Modal editor for Word Builder presets. Creates/updates a DB record that
// overrides (or adds to) the built-in presets. Teachers can duplicate a
// built-in preset by editing it — a new DB record with the same key is
// created, or they can use a new key for a brand-new preset.
const TOGGLES = [
  { key: 'caps', label: 'Capital letters' },
  { key: 'accent', label: 'Accents' },
  { key: 'punc', label: 'Punctuation' },
  { key: 'space', label: 'Space bar' },
  { key: 'images', label: 'Images' },
  { key: 'write', label: 'Write mode (sentences)' },
];

function parseList(str) {
  return String(str || '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

export default function WordBuilderPresetEditor({ presetKey, onClose, onSaved }) {
  const { presets, refresh } = useWordBuilderPresets();
  const existing = presetKey ? presets[presetKey] : null;
  const isDbRecord = !!existing?._dbId;

  const content = existing?.content || {};
  const [label, setLabel] = useState(existing?.label || presetKey || '');
  const [key, setKey] = useState(presetKey || '');
  const [syllables, setSyllables] = useState((content.syllables || []).join(', '));
  const [words, setWords] = useState((content.words || []).join(', '));
  const [answers, setAnswers] = useState((content.answers || []).join('\n'));
  const [letters, setLetters] = useState((content.letters || []).join(', '));
  const [rows, setRows] = useState(content.rows ?? 6);
  const [perRow, setPerRow] = useState(content.perRow ?? 3);
  const [toggles, setToggles] = useState({
    caps: content.toggles?.caps !== false,
    accent: content.toggles?.accent !== false,
    punc: content.toggles?.punc !== false,
    space: content.toggles?.space !== false,
    images: content.toggles?.images === true,
    write: content.toggles?.write === true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

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
    const contentObj = {
      boxes: content.boxes ?? 1,
      rows: parseInt(rows) || 6,
      perRow: parseInt(perRow) || 3,
      letters: parseList(letters),
      syllables: parseList(syllables),
      words: parseList(words),
      answers: answers.split('\n').map((s) => s.trim()).filter(Boolean),
      toggles,
    };
    const payload = {
      key: finalKey,
      label: label.trim() || finalKey,
      content_data: JSON.stringify(contentObj),
    };
    setSaving(true);
    try {
      if (isDbRecord && existing._dbId) {
        await base44.entities.WordBuilderPreset.update(existing._dbId, payload);
      } else {
        await base44.entities.WordBuilderPreset.create(payload);
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
          <h3 className="font-black text-gray-800 text-lg">{isDbRecord ? 'Edit Word Builder preset' : presetKey ? 'Duplicate Word Builder preset' : 'New Word Builder preset'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {!isDbRecord && presetKey && (
          <p className="text-xs text-indigo-600 font-bold mb-3">
            You're creating a database copy of a built-in preset. Use a new key to make a variation, or keep the same key to override the original.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-600 font-bold">Label
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Display name"
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
            </label>
            <label className="text-xs text-gray-600 font-bold">Key {isDbRecord ? '(locked)' : ''}
              <input value={key} onChange={(e) => setKey(e.target.value)} disabled={isDbRecord}
                placeholder="e.g. Syllables2"
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 disabled:bg-gray-100" />
            </label>
          </div>

          <label className="text-xs text-gray-600 font-bold">Syllables (comma-separated — the tiles students drag)
            <input value={syllables} onChange={(e) => setSyllables(e.target.value)}
              placeholder="la, ma, mo, na, no, sa, u"
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
          </label>

          <label className="text-xs text-gray-600 font-bold">Target words / answers (one per line — what students build)
            <textarea value={answers} onChange={(e) => setAnswers(e.target.value)} rows={5}
              placeholder={'mano\nmono\nuno\nsano\nsana\nsala'}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 font-mono" />
          </label>

          <details className="text-xs text-gray-600">
            <summary className="font-bold cursor-pointer hover:text-gray-800">Advanced (letters, word tiles, layout)</summary>
            <div className="flex flex-col gap-2 mt-2 p-2 rounded-lg bg-gray-50">
              <label className="font-bold">Letters (comma-separated — for letter-based building, leave empty for syllable mode)
                <input value={letters} onChange={(e) => setLetters(e.target.value)}
                  placeholder="a, e, i, o, u, m, p, s"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
              </label>
              <label className="font-bold">Word tiles (comma-separated — for sentence building)
                <input value={words} onChange={(e) => setWords(e.target.value)}
                  placeholder="el, la, gato, come"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="font-bold">Rows (problems)
                  <input type="number" min={1} value={rows} onChange={(e) => setRows(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
                </label>
                <label className="font-bold">Tiles per row
                  <input type="number" min={1} value={perRow} onChange={(e) => setPerRow(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
                </label>
              </div>
            </div>
          </details>

          <div className="flex flex-wrap gap-3 items-center">
            {TOGGLES.map((t) => (
              <label key={t.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!!toggles[t.key]} onChange={(e) => setToggles((p) => ({ ...p, [t.key]: e.target.checked }))} />
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