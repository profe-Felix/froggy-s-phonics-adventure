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
  const [
    migratingBookAccess,
    setMigratingBookAccess,
  ] = useState(false);

  const migrateBookSharingToAccessLists =
    async () => {
      const confirmed = window.confirm(
        'Convert the old “books from another class” rules into permanent class access lists?\n\n' +
        'Books will be updated before the old sharing rules are removed.'
      );

      if (!confirmed) return;

      setMigratingBookAccess(true);

      try {
        const [
          allConfigs,
          allAssignments,
        ] = await Promise.all([
          base44.entities.ClassConfig.list(
            '-updated_date',
            100
          ),
          base44.entities.BookAssignment.list(
            '-created_date',
            1000
          ),
        ]);

        const configByClass = new Map(
          allConfigs.map(config => [
            config.class_name,
            config,
          ])
        );

        const updatedCatalogIds = new Set();

        let assignmentsUpdated = 0;
        let accessLinksAdded = 0;
        let oldRulesCleared = 0;

        for (const assignment of allAssignments) {
          const ownerClass =
            assignment.class_name;

          if (!ownerClass) continue;

          const ownerConfig =
            configByClass.get(ownerClass);

          const assignmentLanguage =
            assignment.language ||
            ownerConfig?.language ||
            'es';

          const linkedClasses = allConfigs
            .filter(config =>
              Array.isArray(
                config.shares_books_from
              ) &&
              config.shares_books_from.includes(
                ownerClass
              )
            )
            .map(config => config.class_name)
            .filter(Boolean);

          const currentClasses =
            Array.isArray(
              assignment.available_to_classes
            )
              ? assignment.available_to_classes
              : [];

          const availableToClasses =
            Array.from(
              new Set([
                ownerClass,
                ...currentClasses,
                ...linkedClasses,
              ].filter(Boolean))
            );

          accessLinksAdded +=
            availableToClasses.filter(
              classToAdd =>
                !currentClasses.includes(
                  classToAdd
                )
            ).length;

          await base44.entities.BookAssignment.update(
            assignment.id,
            {
              available_to_classes:
                availableToClasses,
              language: assignmentLanguage,
            }
          );

          assignmentsUpdated += 1;

          if (
            assignment.catalog_book_id &&
            !updatedCatalogIds.has(
              assignment.catalog_book_id
            )
          ) {
            await base44.entities.BookCatalog.update(
              assignment.catalog_book_id,
              {
                language:
                  assignmentLanguage,
              }
            );

            updatedCatalogIds.add(
              assignment.catalog_book_id
            );
          }
        }

        // Clear old sharing only after every book
        // assignment was updated successfully.
        for (const config of allConfigs) {
          if (
            !Array.isArray(
              config.shares_books_from
            ) ||
            config.shares_books_from.length === 0
          ) {
            continue;
          }

          await base44.entities.ClassConfig.update(
            config.id,
            {
              shares_books_from: [],
            }
          );

          oldRulesCleared += 1;
        }

        alert(
          `Book access migration complete.\n\n` +
          `${assignmentsUpdated} assignments updated\n` +
          `${accessLinksAdded} class access links added\n` +
          `${updatedCatalogIds.size} catalog languages updated\n` +
          `${oldRulesCleared} old sharing rules cleared`
        );

        window.location.reload();
      } catch (error) {
        console.error(
          'Book access migration failed',
          error
        );

        alert(
          'The migration stopped before the old sharing rules were cleared. ' +
          'Completed book updates are safe, and you can run it again.'
        );
      } finally {
        setMigratingBookAccess(false);
      }
    };

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
      <p className="text-xs text-slate-500 mb-3">
        Add a teacher's class here and it shows up in every dashboard automatically. Set color, grade, and language per class.
      </p>

      <button
        type="button"
        onClick={migrateBookSharingToAccessLists}
        disabled={migratingBookAccess}
        className="mb-4 px-3 py-2 rounded-lg text-xs font-bold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {migratingBookAccess
          ? 'Converting book access…'
          : 'Convert old book sharing'}
      </button>

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
              <select
                value={cfg?.shares_books_from?.[0] || ''}
                onChange={async (e) => {
                  const src = e.target.value;
                  if (cfg) await base44Update(cfg.id, { shares_books_from: src ? [src] : [] });
                }}
                className="px-2 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600"
                title="Share books from another class — students see that class's books too"
              >
                <option value="">📚 Own books</option>
                {classList.filter(c => c !== cls).map(c => <option key={c} value={c}>📚 from {c}</option>)}
              </select>
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