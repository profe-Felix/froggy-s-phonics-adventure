import React from 'react';
import { BookOpen, Gamepad2, PlayCircle, ListChecks, Compass, LogOut } from 'lucide-react';
import { useClassColors } from '@/hooks/useClassColors';

// Vertical side menu (right edge) — switches the student between the level
// path (Lessons) and the free-play sections (Books / Games / Videos).
// A larger profile picture is pinned at the very top (above Lessons) so
// students can always see who is logged in.
const ITEMS = [
  { key: 'lessons', label: 'Lessons', Icon: ListChecks },
  { key: 'sidequests', label: 'Quests', Icon: Compass },
  { key: 'books', label: 'Books', Icon: BookOpen },
  { key: 'games', label: 'Games', Icon: Gamepad2 },
  { key: 'videos', label: 'Videos', Icon: PlayCircle },
];

export default function LevelSideNav({ active, onSelect, onLogout, studentData, selectedStudent, isTracingOnly }) {
  const { colorFor } = useClassColors();
  const className = selectedStudent?.class_name || '';
  const classColor = colorFor(className);
  const studentPhoto = studentData?.photo_url;
  const studentNumber = selectedStudent?.number;
  const displayName = studentData?.name || `Student ${studentNumber}`;

  // Tracing-only classes (e.g. Schwarz) skip the level path and quests entirely —
  // their lessons aren't built yet. Only Books / Games / Videos remain.
  const items = isTracingOnly
    ? ITEMS.filter(i => i.key !== 'lessons' && i.key !== 'sidequests')
    : ITEMS;

  return (
    <div className="absolute right-2 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3 rounded-3xl bg-[#1a1a2e] px-2 py-3 shadow-xl">
      {/* Pinned profile — always at the top, above Lessons */}
      <div className="flex flex-col items-center gap-1 w-14 pb-2 border-b border-white/10">
        <span
          className="rounded-full p-0.5 shadow-lg"
          style={{ background: `linear-gradient(135deg, ${classColor.from}, ${classColor.to})` }}
        >
          {studentPhoto ? (
            <img
              src={studentPhoto}
              alt={displayName}
              className="w-12 h-12 rounded-full object-cover border-2 border-white/90"
            />
          ) : (
            <span
              className="w-12 h-12 rounded-full flex items-center justify-center text-white text-base font-black border-2 border-white/90"
              style={{ background: `linear-gradient(135deg, ${classColor.from}, ${classColor.to})` }}
            >
              {studentNumber || '?'}
            </span>
          )}
        </span>
        <span className="text-[9px] font-bold text-white text-center leading-tight max-w-[3.5rem] truncate">
          {displayName}
        </span>
        {className && (
          <span className="text-[8px] font-bold text-white/60 truncate max-w-[3.5rem]">
            {className}
          </span>
        )}
      </div>

      {items.map(({ key, label, Icon }) => {
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