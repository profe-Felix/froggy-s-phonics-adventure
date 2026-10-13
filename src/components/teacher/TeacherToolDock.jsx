import { useNavigate } from 'react-router-dom';
import { Camera, Radio, LayoutGrid, Table } from 'lucide-react';

// Vertical tool dock (left edge) for the teacher view — mirrors the student's
// right-edge LevelSideNav: dark rounded bar with icon buttons that jump to the
// classroom tools. Links pass the active class so Carpet/Desk land on it.
const TOOLS = [
  { key: 'doccam', label: 'Doc Cam', Icon: Camera, path: '/DocumentCamera', passClass: false },
  { key: 'live', label: 'Live', Icon: Radio, path: '/LiveLesson', passClass: false },
  { key: 'carpet', label: 'Carpet', Icon: LayoutGrid, path: '/Carpet', passClass: true },
  { key: 'desk', label: 'Desks', Icon: Table, path: '/Desk', passClass: true },
];

export default function TeacherToolDock({ activeClass }) {
  const navigate = useNavigate();

  const go = (tool) => {
    const qs = tool.passClass && activeClass ? `?class=${encodeURIComponent(activeClass)}` : '';
    navigate(`${tool.path}${qs}`);
  };

  return (
    <div
      className="absolute left-3 lg:left-5 z-40 flex flex-col gap-1.5 rounded-3xl bg-[#1a1a2e] px-2 py-2 shadow-xl"
      style={{ top: 'max(4.5rem, calc(env(safe-area-inset-top) + 4rem))' }}
    >
      {TOOLS.map((tool) => {
        const { key, label, Icon } = tool;
        return (
          <button
            key={key}
            type="button"
            onClick={() => go(tool)}
            className="flex flex-col items-center gap-1 w-14"
            title={label}
          >
            <span className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 text-white transition hover:bg-white/20 active:scale-95">
              <Icon className="w-4 h-4" />
            </span>
            <span className="text-[9px] font-bold text-white/70">{label}</span>
          </button>
        );
      })}
    </div>
  );
}