import { useState } from 'react';
import { Link } from 'react-router-dom';
import Dashboard from './Dashboard';
import MathDashboard from './MathDashboard';
import SpanishReadingDashboard from './SpanishReadingDashboard';
import SpellingWritingDashboard from './SpellingWritingDashboard';
import WordBuilderDashboard from './WordBuilderDashboard';
import PrizeDashboard from './PrizeDashboard';
import Lessons from './Lessons';

const TABS = [
  { id: 'progress', label: 'Progress', icon: '📊', Comp: Dashboard },
  { id: 'math', label: 'Math', icon: '🧮', Comp: MathDashboard },
  { id: 'reading', label: 'Spanish Reading', icon: '📖', Comp: SpanishReadingDashboard },
  { id: 'writing', label: 'Writing', icon: '✍️', Comp: SpellingWritingDashboard },
  { id: 'wordbuilder', label: 'Word Builder', icon: '🧩', Comp: WordBuilderDashboard },
  { id: 'prizes', label: 'Prizes', icon: '🎡', Comp: PrizeDashboard },
  { id: 'lessons', label: 'Lessons', icon: '📚', Comp: Lessons },
];

export default function TeacherHub() {
  const [active, setActive] = useState('progress');
  const ActiveComp = TABS.find((t) => t.id === active)?.Comp || Dashboard;

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-slate-100">
      <header className="shrink-0 bg-white border-b border-slate-200 shadow-sm z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-4">
          <div className="flex items-center gap-2 py-2.5">
            <h1 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2 shrink-0">
              <span>👩‍🏫</span> Teacher Hub
            </h1>
            <div className="flex-1" />
            <Link
              to="/Workstations"
              className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-800 font-bold shrink-0 px-2 py-1 rounded-lg hover:bg-indigo-50"
            >
              🧪 Workstations
            </Link>
            <Link
              to="/"
              className="text-xs sm:text-sm text-slate-500 hover:text-slate-800 font-bold shrink-0 px-2 py-1 rounded-lg hover:bg-slate-100"
            >
              Exit
            </Link>
          </div>
          <nav className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-sm whitespace-nowrap transition-all shrink-0 ${
                  active === t.id
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Inner scroll container: each dashboard's own sticky header sticks below the tab bar. */}
      <main className="flex-1 overflow-y-auto">
        <ActiveComp />
      </main>
    </div>
  );
}