import { useRef, useState } from 'react';
import BookPageThumbnail from './BookPageThumbnail';
import MarkShape from './MarkShape';

const SHAPES = [
  { id: null, label: 'None' },
  { id: 'highlight', label: 'Highlight' },
  { id: 'box', label: 'Box' },
  { id: 'underline', label: 'Underline' },
];

// Page preview where the teacher drags to mark text for a question.
export default function MarkEditor({ books, page, mark, onChange }) {
  const [shape, setShape] = useState(mark?.shape || null);
  const [drag, setDrag] = useState(null);
  const refs = useRef({});

  const point = (bookId, e) => {
    const r = refs.current[bookId].getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const toRect = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

  const pickShape = (s) => {
    setShape(s);
    if (!s) onChange(null);
    else if (mark) onChange({ ...mark, shape: s });
  };

  const dragRef = useRef(null);
  const update = (d) => { dragRef.current = d; setDrag(d); };

  const onDown = (bookId, e) => {
    if (!shape) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = point(bookId, e);
    update({ bookId, start: p, end: p });
  };
  const onMove = (bookId, e) => {
    const d = dragRef.current;
    if (d?.bookId === bookId) update({ ...d, end: point(bookId, e) });
  };
  const onUp = () => {
    const d = dragRef.current;
    if (!d) return;
    const r = toRect(d.start, d.end);
    if (r.w > 0.01 && r.h > 0.005) onChange({ shape, book_id: d.bookId, ...r });
    update(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {SHAPES.map(s => (
          <button key={s.label} onClick={() => pickShape(s.id)}
            className={`rounded-md px-2 py-1 text-xs font-bold ${shape === s.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {s.label}
          </button>
        ))}
      </div>
      {shape && <p className="text-[11px] font-semibold text-slate-400">Drag on the page to mark the text</p>}
      {books.map((b, i) => {
        const shown = drag?.bookId === b.id ? { shape, ...toRect(drag.start, drag.end) } : (mark?.book_id === b.id ? mark : null);
        return (
          <div key={b.id} ref={el => { refs.current[b.id] = el; }}
            onPointerDown={e => onDown(b.id, e)} onPointerMove={e => onMove(b.id, e)} onPointerUp={onUp}
            className={`relative h-72 w-full touch-none select-none overflow-hidden rounded-lg border border-slate-200 ${shape ? 'cursor-crosshair' : ''}`}>
            <BookPageThumbnail book={b} pageNumber={page} width={480} />
            {shown && <MarkShape mark={shown} />}
            {books.length > 1 && (
              <span className={`absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[10px] font-black text-white ${i === 0 ? 'bg-indigo-500' : 'bg-amber-500'}`}>{i === 0 ? 'A' : 'B'}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}