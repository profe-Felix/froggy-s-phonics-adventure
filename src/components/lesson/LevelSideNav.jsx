import React from 'react';
import { BookOpen, Gamepad2, PlayCircle, ListChecks, Compass, LogOut } from 'lucide-react';

// Vertical side menu (right edge) — switches the student between the level
// path (Lessons) and the free-play sections (Books / Games / Videos).
const ITEMS = [
  { key: 'lessons', label: 'Lessons', Icon: ListChecks },
  { key: 'sidequests', label: 'Quests', Icon: Compass },
  { key: 'books', label: 'Books', Icon: BookOpen },
  { key: 'games', label: 'Games', Icon: Gamepad2 },
  { key: 'videos', label: 'Videos', Icon: PlayCircle },
];

export default function LevelSideNav({ active, onSelect, onLogout }) {
  return (
    <div className="absolute right-2 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3 rounded-3xl bg-[#1a1a2e] px-2 py-3 shadow-xl">
      {ITEMS.map(({ key, label, Icon }) => {
        const on = active === key;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className="flex flex-col items-center gap-1 w-14"
          >
            <span
              className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
                on ? 'bg-white text-[#1a1a2e]' : 'bg-white/10 text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
            </span>
            <span className={`text-[10px] font-bold ${on ? 'text-white' : 'text-white/60'}`}>
              {label}
            </span>
          </button>
        );
      })}
      <button
        onClick={onLogout}
        className="flex flex-col items-center gap-1 w-14 mt-1 pt-2 border-t border-white/10"
      >
        <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
          <LogOut className="w-5 h-5" />
        </span>
        <span className="text-[10px] font-bold text-white/60">Exit</span>
      </button>
    </div>
  );
}