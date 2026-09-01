import { useState, useEffect, useMemo, useRef } from 'react';

// FluencyGrid — renders the shared table as rows, each with a play triangle.
// The sweep is driven locally from the shared `sweepStartAt` timestamp so every
// participant's highlight advances in sync without per-cell writes.

function seededShuffle(arr, seed) {
  let x = seed;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    x = (x * 16807) % 2147483647;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function FluencyGrid({ preset, seed, activeRow, sweepStartAt, onPlayRow }) {
  const grid = useMemo(() => {
    const total = preset.rows * preset.cols;
    const pool = [];
    let s = seed;
    while (pool.length < total) pool.push(...seededShuffle(preset.content.filter(Boolean), s++));
    return pool.slice(0, total);
  }, [preset, seed]);

  const rows = useMemo(() => {
    const r = [];
    for (let i = 0; i < grid.length; i += preset.cols) r.push(grid.slice(i, i + preset.cols));
    return r;
  }, [grid, preset.cols]);

  const [sweepIdx, setSweepIdx] = useState(-1);

  // Ref so the sweep reads the latest cols/sweep_ms without re-firing when
  // the preset object reference changes (e.g. when the Supabase presets fetch
  // resolves and replaces the presets array). Previously `preset` was in the
  // effect's dependency array, so a late fetch would cancel an in-progress
  // sweep and restart it from the current elapsed time — halfway down the row.
  const presetRef = useRef(preset);
  presetRef.current = preset;

  useEffect(() => {
    if (!sweepStartAt) { setSweepIdx(-1); return; }
    const start = new Date(sweepStartAt).getTime();
    const { cols, sweep_ms } = presetRef.current;
    const rowStart = activeRow * cols;
    let raf;
    const tick = () => {
      const elapsed = Date.now() - start;
      const cell = rowStart + Math.floor(elapsed / sweep_ms);
      if (cell >= rowStart + cols) { setSweepIdx(-1); return; }
      setSweepIdx(cell);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [sweepStartAt, activeRow]);

  return (
    <div className="flex flex-col gap-2 w-full max-w-5xl mx-auto">
      {rows.map((row, r) => (
        <div key={r} className="flex items-stretch gap-2">
          <button
            onClick={() => onPlayRow(r)}
            className="shrink-0 w-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition flex items-center justify-center"
            aria-label={`Play row ${r + 1}`}
            title={`Read row ${r + 1}`}
          >
            <span
              className="ml-1"
              style={{
                width: 0, height: 0,
                borderTop: '8px solid transparent',
                borderBottom: '8px solid transparent',
                borderLeft: '13px solid white',
              }}
            />
          </button>
          {row.map((text, c) => {
            const idx = r * preset.cols + c;
            const active = idx === sweepIdx;
            return (
              <div
                key={c}
                className="relative rounded-xl border bg-white flex items-center justify-center overflow-hidden select-none flex-1"
                style={{ aspectRatio: '3 / 2', fontSize: 'clamp(1.1rem,2.2vw,1.9rem)', fontWeight: 700 }}
              >
                <span className="relative z-10 text-slate-800">{text}</span>
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(90deg, rgba(16,185,129,.45), rgba(16,185,129,.25))',
                    transform: active ? 'translateX(0%)' : 'translateX(-100%)',
                    transition: active ? `transform ${preset.sweep_ms}ms linear` : 'none',
                  }}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}