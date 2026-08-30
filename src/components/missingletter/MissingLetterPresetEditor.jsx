import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import ImagePicker from '@/components/lesson/ImagePicker';
import BucketWordSuggestions from './BucketWordSuggestions';

// Teacher editor for a Missing Letter preset. Each item is a word with a
// missing initial or final letter, a picture (uploaded image, emoji, or a
// random image pulled from the Letter Sort image bucket), and an optional
// per-word letter bank (falls back to the preset's default bank).
export default function MissingLetterPresetEditor({ presetKey, onClose, onSaved }) {
  const [label, setLabel] = useState('');
  const [defaultBank, setDefaultBank] = useState('a,e,i,o,u');
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(!!presetKey);

  useEffect(() => {
    if (!presetKey) return;
    let cancelled = false;
    base44.entities.MissingLetterPreset.filter({ key: presetKey })
      .then((recs) => {
        if (cancelled || !recs.length) return;
        const r = recs[0];
        setLabel(r.label || r.key);
        try { setDefaultBank((JSON.parse(r.default_bank || '[]') || []).join(',') || ''); } catch {}
        try { setItems(JSON.parse(r.items_data || '[]') || []); } catch {}
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [presetKey]);

  const updateItem = (i, patch) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, { word: '', position: 'initial', image_source: 'emoji', emoji: '', image_url: '', bank: [] }]);
  const removeItem = (i) => setItems((prev) => prev.filter((_, j) => j !== i));
  // Add a bucket-suggested word: image auto-resolves from the Letter Sort
  // bucket (image_source='random'), so no upload is needed.
  const addSuggested = (word, position) => setItems((prev) => [...prev, { word, position, image_source: 'random', emoji: '', image_url: '', bank: [] }]);
  const existingWords = new Set(items.map((it) => (it.word || '').trim().toLowerCase()));

  const save = async () => {
    setErr('');
    const clean = items
      .map((it) => ({
        word: (it.word || '').trim().toLowerCase(),
        position: it.position === 'final' ? 'final' : 'initial',
        image_source: it.image_source || 'emoji',
        emoji: it.emoji || '',
        image_url: it.image_url || '',
        bank: Array.isArray(it.bank) ? it.bank : [],
      }))
      .filter((it) => it.word.length >= 2);
    if (!clean.length) { setErr('Add at least one word (2+ letters).'); return; }
    setSaving(true);
    try {
      const bankArr = defaultBank.split(',').map((l) => l.trim().toLowerCase()).filter((l) => l.length === 1);
      const key = presetKey || `ml.${Date.now().toString(36)}`;
      const payload = {
        key,
        label: label.trim() || key,
        items_data: JSON.stringify(clean),
        default_bank: JSON.stringify(bankArr),
      };
      const existing = await base44.entities.MissingLetterPreset.filter({ key });
      if (existing.length) await base44.entities.MissingLetterPreset.update(existing[0].id, payload);
      else await base44.entities.MissingLetterPreset.create(payload);
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
        <h3 className="font-bold text-gray-800 flex-1">{presetKey ? 'Edit Missing Letter preset' : 'New Missing Letter preset'}</h3>
        <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-4 h-4 text-gray-500" /></button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-bold text-gray-600">Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Vowels — initial sound"
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
        </label>
        <label className="text-xs font-bold text-gray-600">Default letter bank (comma-separated)
          <input value={defaultBank} onChange={(e) => setDefaultBank(e.target.value)} placeholder="a,e,i,o,u"
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5" />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-600">Words ({items.length})</span>
        <button onClick={addItem} className="text-xs font-bold text-indigo-600 hover:underline inline-flex items-center gap-0.5">
          <Plus className="w-3 h-3" /> Add word
        </button>
      </div>

      <BucketWordSuggestions
        bucket="lettersort-images"
        existingWords={existingWords}
        onAdd={addSuggested}
      />

      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
        {items.map((it, i) => (
          <div key={i} className="rounded-lg border border-gray-200 p-2 bg-white/70 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <input
                value={it.word}
                onChange={(e) => updateItem(i, { word: e.target.value })}
                placeholder="word e.g. anillo"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1"
              />
              <select
                value={it.position}
                onChange={(e) => updateItem(i, { position: e.target.value })}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white"
              >
                <option value="initial">Initial (first letter)</option>
                <option value="final">Final (last letter)</option>
              </select>
              <select
                value={it.image_source}
                onChange={(e) => updateItem(i, { image_source: e.target.value })}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white"
              >
                <option value="emoji">Emoji</option>
                <option value="upload">Upload image</option>
                <option value="random">Auto from word (Letter Sort bucket)</option>
              </select>
              <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="flex items-center gap-2">
              {it.image_source === 'emoji' && (
                <input value={it.emoji} onChange={(e) => updateItem(i, { emoji: e.target.value })} placeholder="🛏️"
                  className="w-16 text-lg text-center border border-gray-200 rounded-lg px-2 py-1" />
              )}
              {it.image_source === 'upload' && (
                <ImagePicker value={it.image_url} onChange={(url) => updateItem(i, { image_url: url })} />
              )}
              {it.image_source === 'random' && (
                <span className="text-[10px] text-gray-400">Image looked up by the word's filename in the Letter Sort bucket (e.g. anillo → anillo_pic.jpg). Add the word above; no image upload needed.</span>
              )}
              <label className="text-[10px] font-bold text-gray-500 ml-auto">Bank (override)
                <input
                  value={(it.bank || []).join(',')}
                  onChange={(e) => updateItem(i, { bank: e.target.value.split(',').map((l) => l.trim().toLowerCase()).filter((l) => l.length === 1) })}
                  placeholder="blank = default"
                  className="w-28 text-xs border border-gray-200 rounded-lg px-2 py-1 mt-0.5"
                />
              </label>
            </div>
          </div>
        ))}
        {!items.length && <p className="text-xs text-gray-400">No words yet. Add one above.</p>}
      </div>

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