import { Eraser, Highlighter, PenLine, Trash2, Undo2, X } from 'lucide-react';
import { INK_COLORS } from '@/components/book/useTeacherInk';

// Floating teacher-only palette. Undo / clear act on every visible page key
// (both pages of a 2-up spread); undo targets the most recently marked one.
export default function TeacherInkToolbar({ ink, pageKeys }) {
  const counts = pageKeys.map((k) => (ink.strokes[k] || []).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const undoKey = [...pageKeys].reverse().find((k) => (ink.strokes[k] || []).length);
  const tools = [
    { id: 'pen', label: 'Draw', Icon: PenLine },
    { id: 'highlight', label: 'Highlight', Icon: Highlighter },
    { id: 'erase', label: 'Erase', Icon: Eraser },
  ];
  const btn = 'flex h-10 w-10 items-center justify-center rounded-xl transition active:scale-95 disabled:opacity-30';

  // Capture must stop the reader's native laser listener from taking the
  // pointer away from toolbar buttons before their click is dispatched.
  return (
    <div
      data-testid="toolbar-teacher-ink"
      onPointerDownCapture={(e) => e.stopPropagation()}
      className="absolute right-2 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1 rounded-2xl p-1.5 shadow-2xl"
      style={{ background: 'rgba(15, 61, 58, 0.94)', border: '1px solid #0d9488', backdropFilter: 'blur(6px)' }}
    >
      {tools.map(({ id, label, Icon }) => (
        <button key={id} type="button" title={label} aria-label={label} aria-pressed={ink.tool === id}
          data-testid={`button-ink-${id}`}
          onClick={() => ink.setTool(ink.tool === id ? null : id)}
          className={`${btn} ${ink.tool === id ? 'bg-amber-400 text-slate-900' : 'text-teal-100 hover:bg-teal-800'}`}>
          <Icon className="h-5 w-5" />
        </button>
      ))}
      {ink.tool && ink.tool !== 'erase' && (
        <div className="flex flex-col gap-1 py-1">
          {INK_COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Color ${c}`} data-testid={`button-ink-color-${c.slice(1)}`}
              onClick={() => ink.setColor(c)}
              className="mx-auto h-6 w-6 rounded-full transition"
              style={{ background: c, boxShadow: ink.color === c ? '0 0 0 2px #0f3d3a, 0 0 0 4px #fbbf24' : 'inset 0 0 0 2px rgba(255,255,255,0.35)' }} />
          ))}
        </div>
      )}
      <div className="my-0.5 h-px w-7 bg-teal-700" />
      <button type="button" title="Undo" aria-label="Undo" data-testid="button-ink-undo" disabled={!undoKey}
        onClick={() => undoKey && ink.undo(undoKey)} className={`${btn} text-teal-100 hover:bg-teal-800`}>
        <Undo2 className="h-5 w-5" />
      </button>
      <button type="button" title="Clear page marks" aria-label="Clear page marks" data-testid="button-ink-clear" disabled={!total}
        onClick={() => pageKeys.forEach((k) => ink.clear(k))} className={`${btn} text-rose-200 hover:bg-rose-900/60`}>
        <Trash2 className="h-5 w-5" />
      </button>
      {ink.tool && (
        <button type="button" title="Stop drawing" aria-label="Stop drawing" data-testid="button-ink-done"
          onClick={() => ink.setTool(null)} className={`${btn} bg-teal-600 text-white`}>
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
