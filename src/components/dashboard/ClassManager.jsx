import { useState } from 'react';
import { useClassColors, CLASS_COLOR_PALETTE } from '@/hooks/useClassColors';
import { useClassNames } from '@/hooks/useClassNames';
import { Trash2, Plus, Check } from 'lucide-react';

const GRADES = [
  { key: 'kinder', label: 'Kinder' },
  { key: 'first', label: '1st Grade' },
];
const LANGS = [
  { key: 'es', label: 'Spanish' },
  { key: 'en', label: 'English' },
];

// Teacher UI to add/remove/edit classes (teacher last names) and their color,
// grade, and language — so new teachers appear in every dashboard without a
// code change. Replaces the old hardcoded CLASS_NAMES arrays.
export default function ClassManager() {
  const { colorFor, languageFor, gradeFor, tracingOnlyFor, setColor, configs } = useClassColors();
  const { classList, addClass, removeClass } = useClassNames();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await addClass(name, { color: 'emerald', grade: 'kinder', language: 'es' });
      setNewName('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Classes</h2>
        <span className="text-xs text-slate-400 font-bold">{classList.length} classes</span>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Add a teacher's class here and it shows up in every dashboard automatically. Set color, grade, and language per class.
      </p>

      <div className="flex flex-col divide-y divide-slate-100">
        {classList.map((cls) => {
          const color = colorFor(cls);
          const lang = languageFor(cls);
          const grade = gradeFor(cls);
          const cfg = configs.find((c) => c.class_name === cls);
          return (
            <div key={cls} className="py-2.5 flex items-center gap-2 flex-wrap">
              <span
                className="w-5 h-5 rounded-full ring-2 ring-white shadow-sm shrink-0"
                style={{ backgroundImage: `linear-gradient(to bottom right, ${color.from}, ${color.to})` }}
              />
              <span className="font-bold text-slate-800 text-sm w-24 shrink-0">{cls}</span>
              <select
                value={cfg?.color || 'emerald'}
                onChange={(e) => setColor(cls, e.target.value)}
                className="px-2 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600"
              >
                {Object.entries(CLASS_COLOR_PALETTE).map(([k, p]) => (
                  <option key={k} value={k}>{p.name}</option>
                ))}
              </select>
              <select
                value={grade}
                onChange={async (e) => {
                  const g = e.target.value;
                  if (cfg) await base44Update(cfg.id, { grade: g });
                }}
                className="px-2 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600"
              >
                {GRADES.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
              <select
                value={lang}
                onChange={async (e) => {
                  const l = e.target.value;
                  if (cfg) await base44Update(cfg.id, { language: l });
                }}
                className="px-2 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600"
              >
                {LANGS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
              </select>
              <label className="flex items-center gap-1 text-xs font-bold text-slate-500" title="Tracing-only: skip the level path, land on Games with only Letter Tracing (no sound)">
                <input
                  type="checkbox"
                  checked={tracingOnlyFor(cls)}
                  onChange={async (e) => { if (cfg) await base44Update(cfg.id, { tracing_only: e.target.checked }); }}
                  className="w-4 h-4 rounded"
                />
                Tracing only
              </label>
              <button
                onClick={() => { if (window.confirm(`Remove class "${cls}"? Students are NOT deleted — only the class config.`)) removeClass(cls); }}
                className="ml-auto p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                title="Remove class"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="New class name…"
          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newName.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {adding ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          Add
        </button>
      </div>
    </div>
  );
}

// Helper to update a ClassConfig record (avoids importing base44 at top of this
// presentational file repeatedly).
import { base44 } from '@/api/base44Client';
async function base44Update(id, data) {
  await base44.entities.ClassConfig.update(id, data);
}