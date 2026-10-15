import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Radio, LayoutGrid, Table, PanelLeftOpen, X } from 'lucide-react';

// Vertical tool dock (left edge) for the teacher view — collapsible so it stays
// out of the way. Collapsed = a single small toggle button; hover or tap to
// expand the full set of tool buttons.
const TOOLS = [
  { key: 'doccam', label: 'Doc Cam', Icon: Camera, path: '/DocumentCamera', passClass: false, external: true },
  { key: 'live', label: 'Live', Icon: Radio, path: '/LiveLesson', passClass: false },
  { key: 'carpet', label: 'Carpet', Icon: LayoutGrid, path: '/Carpet', passClass: true },
  { key: 'desk', label: 'Desks', Icon: Table, path: '/Desk', passClass: true },
];

export default function TeacherToolDock({ activeClass }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const go = (tool) => {
    const qs = tool.passClass && activeClass ? `?class=${encodeURIComponent(activeClass)}` : '';
    const url = `${tool.path}${qs}`;
    if (tool.external) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    navigate(url);
  };

  return (
    <div
      className="absolute left-3 lg:left-5 z-40"
      style={{ top: 'max(4.5rem, calc(env(safe-area-inset-top) + 4rem))' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {open ? (
        <div className="flex flex-col gap-1.5 rounded-3xl bg-[#1a1a2e] px-2 py-2 shadow-xl">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex flex-col items-center gap-1 w-14"
            title="Collapse"
          >
            <span className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 text-white transition hover:bg-white/20 active:scale-95">
              <X className="w-4 h-4" />
            </span>
            <span className="text-[9px] font-bold text-white/70">Close</span>
          </button>
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
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-[#1a1a2e] text-white/80 shadow-xl transition hover:bg-[#2a2a4e] hover:text-white active:scale-95"
          title="Classroom tools"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}