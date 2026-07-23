import { useEffect, useState } from 'react';
import { RefreshCw, Eye, EyeOff } from 'lucide-react';
import { markersToPretty } from '@/lib/lettersort/phonics';

// Generate mode = free response. The teacher types the words students say
// aloud into a grid of empty text fields. Two forms:
//  - Riddle: a prompt with covered answer segments the teacher reveals, one
//    segment at a time, after students guess.
//  - Columns: labeled columns (e.g. "tazón", "sano" or onsets "fle/flo/...")
//    where the teacher types the words students generate for each column.
// No image bucket, no drag-and-drop, no verification — it's open-ended.
export default function GenerateView({ round }) {
  const { hasRiddle, parts, columns } = round;

  const [inputs, setInputs] = useState({});
  const [revealed, setRevealed] = useState(() => new Set());

  useEffect(() => {
    setInputs({});
    setRevealed(new Set());
  }, [round]);

  const hiddenIdx = parts
    ? parts.map((p, i) => (p.type === 'hidden' ? i : -1)).filter((i) => i >= 0)
    : [];
  const allRevealed = hiddenIdx.length > 0 && hiddenIdx.every((i) => revealed.has(i));

  function toggleReveal(i) {
    setRevealed((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  }
  function revealAll() {
    setRevealed(allRevealed ? new Set() : new Set(hiddenIdx));
  }
  function clearAll() {
    setInputs({});
    setRevealed(new Set());
  }
  function setCell(key, val) {
    setInputs((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={clearAll}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold text-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition"
        >
          <RefreshCw className="w-4 h-4" /> Nueva ronda
        </button>
        {hasRiddle && (
          <button
            onClick={revealAll}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition"
          >
            {allRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {allRevealed ? 'Ocultar' : 'Revelar'}
          </button>
        )}
      </div>

      {hasRiddle && parts && (
        <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 leading-relaxed text-xl flex flex-wrap items-center gap-y-2">
          {parts.map((part, i) => {
            if (part.type === 'text') {
              return <span key={i} className="text-slate-800">{part.text}</span>;
            }
            const isRevealed = revealed.has(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleReveal(i)}
                title="Tocar para revelar"
                className={`mx-0.5 px-2 py-0.5 rounded-md font-bold border-2 border-dashed transition cursor-pointer ${
                  isRevealed
                    ? 'bg-amber-200 text-slate-900 border-amber-400'
                    : 'bg-amber-400 text-transparent border-amber-500'
                }`}
              >
                {markersToPretty(part.text)}
              </button>
            );
          })}
        </div>
      )}

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))` }}
      >
        {columns.map((col) => (
          <div key={col.key} className="flex flex-col gap-2">
            {!hasRiddle && (
              <div className="text-center font-bold text-indigo-900 text-lg">{col.label || '\u00A0'}</div>
            )}
            <div
              className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-2 grid gap-2"
              style={{ gridTemplateRows: `repeat(${col.rows}, auto)` }}
            >
              {Array.from({ length: col.rows }).map((_, ri) => (
                <div
                  key={ri}
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${col.slots}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: col.slots }).map((_, si) => {
                    const key = `${col.key}-${ri}-${si}`;
                    return (
                      <input
                        key={key}
                        type="text"
                        value={inputs[key] || ''}
                        onChange={(e) => setCell(key, e.target.value)}
                        className="w-full px-2 py-2 rounded-lg border border-slate-300 bg-white text-center text-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}