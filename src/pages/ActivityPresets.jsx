import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useActivityPresets, serializeItems, parseItems } from '@/hooks/useActivityPresets';
import { ACTIVITY_MODES } from '@/lib/activities/engine';
import { HUNT_TYPES } from '@/lib/activities/hunt';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus, Pencil, Trash2, Lock } from 'lucide-react';

const EMPTY_FORM = { label: '', mode: 'counting_words', itemsText: '', huntType: 'phoneme', huntTarget: '', palette: '#4DA6FF,#F87171' };

export default function ActivityPresets() {
  const { presets, dbRecords, isLoading, invalidate } = useActivityPresets();
  const [editing, setEditing] = useState(null); // null | { id?, ...form }
  const [saving, setSaving] = useState(false);

  const dbIds = new Set(dbRecords.map(r => r.id));

  function startNew(mode) {
    setEditing({ ...EMPTY_FORM, mode: mode || 'counting_words' });
  }

  function startEdit(r) {
    const p = presets[r.id];
    setEditing({
      id: r.id,
      label: r.label,
      mode: r.mode,
      itemsText: serializeItems(r.mode, p.items || []),
      huntType: p.huntType || 'phoneme',
      huntTarget: p.target || '',
      palette: Array.isArray(p.palette) ? p.palette.join(',') : '#4DA6FF,#F87171',
    });
  }

  async function save() {
    if (!editing.label.trim()) return;
    setSaving(true);
    const items = parseItems(editing.mode, editing.itemsText);
    const payload = {
      label: editing.label.trim(),
      mode: editing.mode,
      items_data: JSON.stringify(items),
      hunt_type: editing.mode === 'text_hunt' ? editing.huntType : '',
      hunt_target: editing.mode === 'text_hunt' ? editing.huntTarget : '',
      palette_data: editing.mode === 'phoneme_manipulation' ? JSON.stringify(editing.palette.split(',').map(s => s.trim()).filter(Boolean)) : '',
    };
    try {
      if (editing.id) {
        await base44.entities.ActivityPreset.update(editing.id, payload);
      } else {
        await base44.entities.ActivityPreset.create(payload);
      }
      await invalidate();
      setEditing(null);
    } catch (e) {
      alert('Error saving preset: ' + e.message);
    }
    setSaving(false);
  }

  async function remove(id) {
    if (!confirm('Delete this preset? Lessons using it will fall back to their inline examples.')) return;
    try {
      await base44.entities.ActivityPreset.delete(id);
      await invalidate();
    } catch (e) {
      alert('Error deleting: ' + e.message);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-20 bg-white border-b px-4 py-3 flex items-center gap-3">
        <Link to="/LessonEditor"><ArrowLeft className="w-5 h-5 text-slate-500" /></Link>
        <h1 className="font-bold text-lg flex-1">Activity Presets</h1>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-6">
        {editing ? (
          <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-4">
            <h2 className="font-bold text-slate-800">{editing.id ? 'Edit preset' : 'New preset'}</h2>

            <label className="block text-sm">
              <span className="text-xs font-bold text-slate-500">Label</span>
              <input value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })}
                className="w-full mt-1 border rounded-lg px-3 py-2" placeholder="e.g. My counting words set" />
            </label>

            <label className="block text-sm">
              <span className="text-xs font-bold text-slate-500">Activity type</span>
              <select value={editing.mode} disabled={!!editing.id}
                onChange={e => setEditing({ ...editing, mode: e.target.value, itemsText: '' })}
                className="w-full mt-1 border rounded-lg px-3 py-2 bg-white">
                {ACTIVITY_MODES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>

            {editing.mode === 'text_hunt' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-xs font-bold text-slate-500">Hunt type</span>
                  <select value={editing.huntType} onChange={e => setEditing({ ...editing, huntType: e.target.value })}
                    className="w-full mt-1 border rounded-lg px-3 py-2 bg-white">
                    {HUNT_TYPES.map(h => <option key={h.key} value={h.key}>{h.label}</option>)}
                  </select>
                </label>
                {HUNT_TYPES.find(h => h.key === editing.huntType)?.needsTarget && (
                  <label className="block text-sm">
                    <span className="text-xs font-bold text-slate-500">Target</span>
                    <input value={editing.huntTarget} onChange={e => setEditing({ ...editing, huntTarget: e.target.value })}
                      className="w-full mt-1 border rounded-lg px-3 py-2" />
                  </label>
                )}
              </div>
            )}

            {editing.mode === 'phoneme_manipulation' && (
              <label className="block text-sm">
                <span className="text-xs font-bold text-slate-500">Palette (comma-separated hex colors)</span>
                <input value={editing.palette} onChange={e => setEditing({ ...editing, palette: e.target.value })}
                  className="w-full mt-1 border rounded-lg px-3 py-2 font-mono text-sm" />
              </label>
            )}

            <label className="block text-sm">
              <span className="text-xs font-bold text-slate-500">
                Items {editing.mode === 'rhyme_identification' ? '(word1, word2, sí/no — one per line)' : '(one per line)'}
              </span>
              <textarea value={editing.itemsText} onChange={e => setEditing({ ...editing, itemsText: e.target.value })}
                rows={6}
                placeholder={editing.mode === 'counting_words' ? 'El gato come\nYo soy grande' : editing.mode === 'rhyme_identification' ? 'gracioso, hermoso, sí\nnota, noche, no' : 'gato\nsol\nflor'}
                className="w-full mt-1 border rounded-lg px-3 py-2 font-mono text-sm" />
            </label>

            <div className="flex gap-2">
              <Button onClick={save} disabled={saving || !editing.label.trim()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {saving ? 'Saving…' : 'Save preset'}
              </Button>
              <Button onClick={() => setEditing(null)} variant="outline">Cancel</Button>
            </div>
          </div>
        ) : (
          <>
            <Button onClick={() => startNew()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="w-4 h-4 mr-1" /> New preset
            </Button>

            {ACTIVITY_MODES.map(modeDef => {
              const keys = Object.keys(presets).filter(k => presets[k].mode === modeDef.key);
              if (keys.length === 0) return null;
              return (
                <div key={modeDef.key} className="space-y-2">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wide">{modeDef.label}</h3>
                  <div className="space-y-1.5">
                    {keys.map(k => {
                      const p = presets[k];
                      const isDb = dbIds.has(k);
                      return (
                        <div key={k} className="bg-white rounded-xl border px-4 py-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-800 text-sm truncate">{p.label || k}</div>
                            <div className="text-xs text-slate-400">{(p.items || []).length} items</div>
                          </div>
                          {isDb ? (
                            <div className="flex gap-1">
                              <button onClick={() => startEdit(dbRecords.find(r => r.id === k))} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil className="w-4 h-4" /></button>
                              <button onClick={() => remove(k)} className="p-2 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-slate-400 font-bold"><Lock className="w-3 h-3" /> built-in</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}