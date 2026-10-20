// Curriculum section switcher shared by the teacher and student bookshelves.
// Matches the existing teal pill styling of the module filter.
export default function ShelfSectionTabs({ sections, active, onSelect }) {
  if (!sections || sections.length < 2) return null;
  const current = sections.find((s) => s.id === active);
  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Curriculum">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active === s.id}
            data-testid={`tab-shelf-${s.id}`}
            onClick={() => onSelect(s.id)}
            className={`flex items-baseline gap-2 rounded-xl px-4 py-2 text-sm font-black transition ${
              active === s.id
                ? 'bg-amber-400 text-slate-900 shadow-lg'
                : 'border border-teal-700 text-teal-200 hover:bg-teal-900'
            }`}
          >
            <span>{s.short}</span>
            <span className={`text-xs font-bold ${active === s.id ? 'text-slate-800' : 'text-teal-400'}`}>{s.label}</span>
            <span className={`rounded-full px-1.5 text-[11px] ${active === s.id ? 'bg-slate-900/15' : 'bg-teal-900'}`}>{s.books.length}</span>
          </button>
        ))}
      </div>
      {current && <p className="mt-1.5 text-xs font-bold text-teal-400" data-testid="text-shelf-hint">{current.hint}</p>}
    </div>
  );
}
