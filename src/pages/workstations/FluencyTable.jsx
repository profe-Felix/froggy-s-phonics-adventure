import { useState, useMemo, useCallback, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { FLUENCY_PRESETS } from '@/components/workstations/fluencyPresets';
import BackButton from '@/components/ui/BackButton';

// Real curriculum presets live in Supabase Storage (public bucket). Fetched at
// load; the local FLUENCY_PRESETS is the fallback if the fetch fails.
const SUPABASE_PRESETS_URL =
  'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/fluency/presets.json';

// Fluency Table — a grid of words a teacher uses for guided reading.
// A "sweep" highlight wipes left→right across one row at a time so students
// track and read each word in sequence.
// ?role=teacher → preset picker + shuffle + student QR
// ?preset=<id>  → which word set
// ?seed=<n>     → shuffle order (teacher & students share via URL)
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

export default function FluencyTable() {
  const params = new URLSearchParams(window.location.search);
  const isTeacher = params.get('role') === 'teacher';
  const [presets, setPresets] = useState(FLUENCY_PRESETS);
  const [presetId, setPresetId] = useState(params.get('preset') || FLUENCY_PRESETS[0].id);
  const [seed, setSeed] = useState(Number(params.get('seed')) || Date.now());
  const [currentRow, setCurrentRow] = useState(0);
  const [sweepIdx, setSweepIdx] = useState(-1);
  const [sweeping, setSweeping] = useState(false);
  const [showQr, setShowQr] = useState(false);

  // Pull the real curriculum from Supabase Storage; fall back to local presets.
  useEffect(() => {
    fetch(SUPABASE_PRESETS_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((obj) => {
        if (!obj) return;
        const arr = Object.entries(obj).map(([id, p]) => ({ id, ...p }));
        if (arr.length) setPresets(arr);
      })
      .catch(() => {});
  }, []);

  const preset = useMemo(
    () => presets.find((p) => p.id === presetId) || presets[0],
    [presetId, presets]
  );

  const grid = useMemo(() => {
    const total = preset.rows * preset.cols;
    const pool = [];
    let s = seed;
    while (pool.length < total) pool.push(...seededShuffle(preset.content.filter(Boolean), s++));
    return pool.slice(0, total);
  }, [preset, seed]);

  const sweep = useCallback(async () => {
    if (sweeping || currentRow >= preset.rows) return;
    setSweeping(true);
    const start = currentRow * preset.cols;
    for (let i = start; i < start + preset.cols; i++) {
      setSweepIdx(i);
      await new Promise((r) => setTimeout(r, preset.sweep_ms));
    }
    setSweepIdx(-1);
    setCurrentRow((r) => r + 1);
    setSweeping(false);
  }, [sweeping, currentRow, preset]);

  const shuffle = () => { setSeed(Date.now()); setCurrentRow(0); setSweepIdx(-1); };
  const reset = () => { setCurrentRow(0); setSweepIdx(-1); };

  const studentUrl = `${window.location.origin}${window.location.pathname}?role=student&preset=${encodeURIComponent(presetId)}&seed=${seed}`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#fafbff', fontFamily: "'Andika', system-ui, sans-serif" }}>
      <div className="flex items-center gap-3 p-3 bg-white border-b sticky top-0 z-20 flex-wrap">
        <BackButton onClick={() => window.history.back()} />
        <h1 className="font-bold text-lg mr-2">{preset.title}</h1>
        {isTeacher && (
          <select
            value={presetId}
            onChange={(e) => { setPresetId(e.target.value); setCurrentRow(0); setSweepIdx(-1); }}
            className="px-3 py-2 rounded-lg border font-bold"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        )}
        <button
          onClick={sweep}
          disabled={sweeping || currentRow >= preset.rows}
          className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-40"
        >
          {sweeping ? 'Sweeping…' : currentRow >= preset.rows ? 'Done' : '▶ Sweep row'}
        </button>
        <button onClick={reset} className="px-4 py-2 rounded-xl border font-bold">Reset</button>
        {isTeacher && (
          <>
            <button onClick={shuffle} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold">🔀 Shuffle</button>
            <button onClick={() => setShowQr(true)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold">📱 Student QR</button>
          </>
        )}
        <span className="text-sm text-gray-500 ml-auto">Row {Math.min(currentRow + 1, preset.rows)} / {preset.rows}</span>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div
          className="grid gap-2 w-full max-w-5xl"
          style={{ gridTemplateColumns: `repeat(${preset.cols}, 1fr)` }}
        >
          {grid.map((text, i) => {
            const active = i === sweepIdx;
            return (
              <div
                key={i}
                className="relative rounded-xl border bg-white flex items-center justify-center overflow-hidden select-none"
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
      </div>

      {showQr && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowQr(false)}>
          <div className="bg-white p-6 rounded-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold mb-3 text-lg">Student Link</p>
            <QRCodeCanvas value={studentUrl} size={240} />
            <p className="text-xs text-gray-500 mt-3 break-all max-w-xs">{studentUrl}</p>
            <button onClick={() => setShowQr(false)} className="mt-4 px-4 py-2 rounded-lg border font-bold">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}