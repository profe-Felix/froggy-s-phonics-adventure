import { useState, useEffect, useMemo, useRef } from 'react';
import { buildFluencyCells, onlyO, fluencyArrow } from '@/lib/literacy/fluencyDisplay.mjs';

// FluencyGrid — renders the shared table as rows, each with a play triangle.
// The sweep is driven locally from the shared `sweepStartAt` timestamp so every
// participant's highlight advances in sync without per-cell writes.

export default function FluencyGrid({ preset, seed, activeRow = 0, sweepStartAt, onPlayRow, activeCell, onSelectCell, interactive = true }) {
  const grid = useMemo(() => buildFluencyCells(preset, seed), [preset, seed]);

  const rows = useMemo(() => {
    const r = [];
    for (let i = 0; i < grid.length; i += preset.cols) r.push(grid.slice(i, i + preset.cols));
    return r;
  }, [grid, preset.cols]);

  const [sweepIdx, setSweepIdx] = useState(-1);
  const [manualIndex, setManualIndex] = useState(0);
  useEffect(() => { setManualIndex(0); }, [preset.id, seed]);
  const selected = activeCell == null ? manualIndex : Math.min(grid.length - 1, Math.max(0, Number(activeCell) || 0));
  const select = index => {
    if (!interactive) return;
    if (onSelectCell) onSelectCell(index);
    else setManualIndex(index);
  };
  useEffect(() => {
    if (!interactive) return;
    const onKey = event => {
      const next = fluencyArrow(event, selected, grid.length);
      if (next == null) return;
      event.preventDefault();
      select(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [interactive, selected, grid.length, onSelectCell]);

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
      <div className="flex items-center justify-center gap-3">
        <button aria-label="Previous item" disabled={!interactive || !grid.length || selected <= 0}
          className="border bg-white rounded-lg px-4 py-2 font-bold disabled:opacity-40"
          onClick={() => select(Math.max(0, selected - 1))}>← Previous</button>
        <span aria-live="polite">{grid.length ? (sweepStartAt ? Math.max(0, sweepIdx) : selected) + 1 : 0} / {grid.length}</span>
        <button aria-label="Next item" disabled={!interactive || !grid.length || selected >= grid.length - 1}
          className="border bg-white rounded-lg px-4 py-2 font-bold disabled:opacity-40"
          onClick={() => select(Math.min(grid.length - 1, selected + 1))}>Next →</button>
      </div>
      {onlyO(preset.content) && <p role="status" className="text-center text-slate-600 p-4">
        No table yet: only “o” has been introduced. Choose a later lesson with more letters.
      </p>}
      {rows.map((row, r) => (
        <div key={r} className="flex items-stretch gap-2">
          <button
            disabled={!interactive || !onPlayRow}
            onClick={() => onPlayRow?.(r)}
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
            const active = idx === (sweepStartAt ? sweepIdx : selected);
            return (
              <button type="button"
                key={c}
                aria-current={active ? 'true' : undefined}
                aria-label={`Box ${idx + 1}: ${text}`}
                aria-disabled={!interactive}
                onClick={() => select(idx)}
                className="relative rounded-xl border bg-white flex items-center justify-center overflow-hidden select-none flex-1"
                style={{ aspectRatio: '3 / 2', fontSize: 'clamp(1.1rem,2.2vw,1.9rem)', fontWeight: 700 }}
              >
                <span className="relative z-10 text-slate-800">{text}</span>
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(90deg, rgba(16,185,129,.45), rgba(16,185,129,.25))',
                    transform: active ? 'translateX(0%)' : 'translateX(-100%)',
                    transition: active && sweepStartAt ? `transform ${preset.sweep_ms}ms linear` : 'none',
                  }}
                />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}