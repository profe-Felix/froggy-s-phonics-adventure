import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Plus, Save, Loader2 } from 'lucide-react';

const SECTIONS = [
  { key: 'Sílabas', label: 'Sílabas (syllables)', type: 'word' },
  { key: 'Palabras 💙', label: 'Palabras HF (high-frequency words)', type: 'word' },
  { key: 'Palabras', label: 'Palabras (words)', type: 'word' },
  { key: 'Oraciones', label: 'Oraciones (sentences)', type: 'sentence' },
];

// Teacher editor for a Slide-Reading preset. Items are one per line — plain
// strings for syllables/words, or "text|id" for items with a custom audio id.
export default function SpanishReadingPresetEditor({ presetKey, onClose, onSaved }) {
  const [label, setLabel] = useState('');
  const [section, setSection] = useState('Sílabas');
  const [itemsText, setItemsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(!!presetKey);

  useEffect(() => {
    if (!presetKey) return;
    let cancelled = false;
    base44.entities.SpanishReadingPreset.filter({ key: presetKey })
      .then((recs) => {
        if (cancelled || !recs.length) return;
        const r = recs[0];
        setLabel(r.label || r.key);
        setSection(r.section || 'Sílabas');
        try {
          const items = JSON.parse(r.items_data || '[]');
          setItemsText(items.map((it) => (typeof it === 'string' ? it : `${it.text || ''}${it.id ? `|${it.id}` : ''}`)).join('\n'));
        } catch {}
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [presetKey]);

  const save = async () => {
    setErr('');
    const items = itemsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((line) => {
        const [text, id] = line.split('|').map((p) => p && p.trim());
        return id ? { text, id } : text;
      });
    if (!items.length) { setErr('Add at least one item.'); return; }
    setSaving(true);
    try {
      const key = presetKey || `sr.${Date.now().toString(36)}`;
      const payload = {
        key,
        label: label.trim() || key,
        section,
        items_data: JSON.stringify(items),
      };
      const existing = await base44.entities.SpanishReadingPreset.filter({ key });
      if (existing.length) await base44.entities.SpanishReadingPreset.update(existing[0].id, payload);
      else await base44.entities.SpanishReadingPreset.create(payload);
      onSaved?.(key);
      onClose?.();
    } catch (e) {
      setErr(e?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-indigo-200 bg-white p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-white p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="font-bold text-gray-800 flex-1">{presetKey ? 'Edit Slide-Reading preset' : 'New Slide-Reading preset'}</h3>
        <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-4 h-4 text-gray-500" /></button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-gray-600">Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Sílabas con M"
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
        </label>
        <label className="text-xs font-bold text-gray-600">Section
          <select value={section} onChange={(e) => setSection(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white">
            {SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <label className="text-xs font-bold text-gray-600">Items (one per line{section === 'Oraciones' ? ' · use "text|audioId" for custom audio' : ''})
        <textarea value={itemsText} onChange={(e) => setItemsText(e.target.value)} rows={8}
          placeholder={section === 'Sílabas' ? 'ma\nme\nmi\nmo\nmu' : section === 'Oraciones' ? 'La mama ama a mi.\nMi mamá me mima.' : 'mamá\nmono\nmanzana'}
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 font-mono" />
      </label>

      {err && <p className="text-xs text-red-500">{err}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="text-sm font-bold px-3 py-1.5 rounded-lg bg-white text-gray-600 border border-gray-200 hover:bg-gray-50">Cancel</button>
        <button onClick={save} disabled={saving} className="text-sm font-bold px-4 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 inline-flex items-center gap-1 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
      </div>
    </div>
  );
}