import React from 'react';
import { BookOpen, Gamepad2, PlayCircle, ListChecks, Compass, LogOut, Eye, EyeOff } from 'lucide-react';
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

export default function LevelSideNav({ active, onSelect, onLogout, studentData, selectedStudent, isTracingOnly, barcodeLogin, parentView, onToggleParentView }) {
  const { colorFor } = useClassColors();
  const className = selectedStudent?.class_name || '';
  const classColor = colorFor(className);
  const studentPhoto = studentData?.photo_url;
  const studentNumber = selectedStudent?.number;

  // Tracing-only classes (e.g. Schwarz) skip the level path and quests entirely —
  // their lessons aren't built yet. Only Books / Games / Videos remain.
  const items = isTracingOnly
    ? ITEMS.filter(i => i.key !== 'lessons' && i.key !== 'sidequests')
    : ITEMS;

  return (
    <div className="sidebar-nav absolute right-3 lg:right-5 z-30 flex flex-col gap-1.5 rounded-3xl bg-[#1a1a2e] px-2 py-2 shadow-xl" style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}>
      {/* Pinned profile — photo + name + class so students see who's logged in */}
      <div className="flex flex-col items-center gap-0.5 w-14 pb-1.5 border-b border-white/10">
        <span
          className="rounded-full p-0.5 shadow-lg"
          style={{ background: `linear-gradient(135deg, ${classColor.from}, ${classColor.to})` }}
        >
          {studentPhoto ? (
            <img
              src={studentPhoto}
              alt="me"
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
        {studentData?.name && (
          <span className="text-[9px] font-bold text-white text-center leading-tight max-w-[3rem] truncate">
            {studentData.name.split(' ')[0]}
          </span>
        )}
        <span className="text-[8px] font-bold text-white/60">{className}</span>
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
              className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
                on ? 'bg-white text-[#1a1a2e]' : 'bg-white/10 text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
            </span>
            <span className={`text-[9px] font-bold ${on ? 'text-white' : 'text-white/60'}`}>
              {label}
            </span>
          </button>
        );
      })}
      {/* Parent view toggle — reveals lesson previews + carousel for grown-ups */}
      <button
        onClick={onToggleParentView}
        className="flex flex-col items-center gap-1 w-14 mt-1 pt-1.5 border-t border-white/10"
        title={parentView ? 'Parent view ON — tap a lesson to preview it' : 'Student view — tap a lesson to play'}
      >
        <span
          className={`w-9 h-9 rounded-full flex items-center justify-center transition ${parentView ? 'bg-amber-400 text-[#1a1a2e]' : 'bg-white/10 text-white'}`}
        >
          {parentView ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </span>
        <span className={`text-[9px] font-bold ${parentView ? 'text-white' : 'text-white/60'}`}>
          {parentView ? 'Parent' : 'Student'}
        </span>
      </button>

      {!barcodeLogin && (
        <button
          onClick={onLogout}
          className="flex flex-col items-center gap-1 w-14 mt-1 pt-1.5 border-t border-white/10"
        >
          <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white">
            <LogOut className="w-4 h-4" />
          </span>
          <span className="text-[9px] font-bold text-white/60">Exit</span>
        </button>
      )}
    </div>
  );
}