import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Save, Trash2, Loader2, Layers } from 'lucide-react';

// Saved handwriting worksheets: pick one from the dropdown to load it, or
// type a name and Save Worksheet to store the current words/rows/orientation/color.
export default function WorksheetSaver({ values, onLoad }) {
  const [sheets, setSheets] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.HandwritingWorksheet.filter({}, { sort: 'name', limit: 200 }).then((p) => setSheets(p.items));
  }, []);

  const handleSelect = (id) => {
    setSelectedId(id);
    const s = sheets.find((x) => x.id === id);
    if (!s) return;
    setName(s.name);
    onLoad({ text: s.text || '', rows: s.rows_per_page || 6, orientation: s.orientation || 'portrait', color: s.color || '#2e7d32' });
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    const data = { name: trimmed, text: values.text, rows_per_page: values.rows, orientation: values.orientation, color: values.color };
    const existing = sheets.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    const rec = existing
      ? await base44.entities.HandwritingWorksheet.update(existing.id, data)
      : await base44.entities.HandwritingWorksheet.create(data);
    const saved = { ...(existing || {}), ...data, id: existing ? existing.id : rec.id };
    setSheets((prev) => [...prev.filter((s) => s.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedId(saved.id);
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!selectedId || !window.confirm('Delete this saved worksheet?')) return;
    await base44.entities.HandwritingWorksheet.delete(selectedId);
    setSheets((prev) => prev.filter((s) => s.id !== selectedId));
    setSelectedId('');
    setName('');
  };

  // Duplicate the current layout to a worksheet for every letter (A-Z uppercase
  // + lowercase). The first letter found in the text is the "source" — every
  // occurrence is replaced with the target letter. Re-running this later
  // updates all letter worksheets with the current layout ("apply to all").
  const handleDuplicateToLetters = async () => {
    const srcMatch = (values.text || '').match(/[a-zA-Z]/);
    if (!srcMatch) { alert('No letter found in the text to duplicate.'); return; }
    const src = srcMatch[0];
    if (!window.confirm(`Create/update worksheets for all 26 letters (uppercase + lowercase) using the current layout?`)) return;
    setSaving(true);
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const records = [];
    for (const L of upper) {
      records.push({ name: `Uppercase ${L}`, text: values.text.split(src).join(L), rows_per_page: values.rows, orientation: values.orientation, color: values.color });
    }
    for (const L of upper.map((l) => l.toLowerCase())) {
      records.push({ name: `Lowercase ${L}`, text: values.text.split(src).join(L), rows_per_page: values.rows, orientation: values.orientation, color: values.color });
    }
    await base44.entities.HandwritingWorksheet.upsert(records, { key: 'name' });
    const p = await base44.entities.HandwritingWorksheet.filter({}, { sort: 'name', limit: 200 });
    setSheets(p.items);
    setSaving(false);
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
      <label className="text-sm font-bold text-slate-600">Saved</label>
      <select
        value={selectedId}
        onChange={(e) => handleSelect(e.target.value)}
        className="min-w-[180px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold text-slate-700"
      >
        <option value="">— Choose a worksheet —</option>
        {sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {selectedId && (
        <button onClick={handleDelete} title="Delete" className="rounded-lg border border-slate-200 p-1.5 text-red-500 hover:bg-red-50">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Worksheet name (e.g. Handwriting practice)"
        className="min-w-[220px] flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-700 focus:border-indigo-400 focus:outline-none"
      />
      <button
        onClick={handleSave}
        disabled={saving || !name.trim()}
        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-1.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save Worksheet
      </button>
      <button
        onClick={handleDuplicateToLetters}
        disabled={saving || !values.text}
        title="Create a worksheet for every letter (A-Z, a-z) using the current layout. Re-run to update all letter sheets with the current layout."
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
      >
        <Layers className="h-4 w-4" />
        Duplicate to all letters
      </button>
    </div>
  );
}