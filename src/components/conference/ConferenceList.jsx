import { Users, CalendarDays } from 'lucide-react';

export default function ConferenceList({ conferences, onSelect }) {
  if (!conferences.length) {
    return (
      <div className="text-center text-slate-400 py-16">
        <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p>No conferences yet. Create one to get a sign-up QR.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {conferences.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c)}
          className="text-left bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-300 transition active:scale-[0.98]"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-lg text-slate-800">{c.title}</h3>
              <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                <Users className="w-3.5 h-3.5" /> {c.teacher_name}
                {c.class_name ? ` · ${c.class_name}` : ''}
              </p>
            </div>
            {!c.active && <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-full">Inactive</span>}
          </div>
          <p className="text-xs text-indigo-500 font-mono mt-3">Code: {c.code}</p>
        </button>
      ))}
    </div>
  );
}