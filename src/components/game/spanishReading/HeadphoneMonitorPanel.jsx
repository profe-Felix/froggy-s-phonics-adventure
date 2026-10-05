import { Headphones, Volume2 } from 'lucide-react';

// HeadphoneMonitorPanel — compact control for live mic-through-headphones
// monitoring. Shown only while a mic stream is live. Renders one of:
//   unsupported → "isn't supported in this browser"
//   checking     → "Checking for headphones…"
//   verified     → "Enable headphone monitoring" (bound to a detected device)
//   available    → "Enable headphone monitoring" + "Use headphones" reminder
//                  (can't positively detect — trust OS routing)
//   monitoring   → "Stop monitoring" + volume slider
//
// Never auto-activates. The parent only renders it when a mic stream exists.
export default function HeadphoneMonitorPanel({ monitor }) {
  const { outputStatus, monitoring, monitorVolume, start, stop, setVolume } = monitor;

  if (outputStatus === 'unsupported') {
    return (
      <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200">
        <Headphones className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="text-[11px] font-semibold text-slate-500">
          Headphone monitoring isn't supported in this browser.
        </span>
      </div>
    );
  }

  if (monitoring) {
    return (
      <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200">
        <Headphones className="w-4 h-4 text-indigo-600 shrink-0" />
        <button
          onClick={stop}
          className="px-2.5 py-1 rounded-lg font-bold text-white text-xs shadow active:scale-95"
          style={{ background: '#4f46e5' }}
        >
          Stop monitoring
        </button>
        <Volume2 className="w-3.5 h-3.5 text-indigo-500 shrink-0 ml-1" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={monitorVolume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="flex-1 min-w-[60px] h-1.5 accent-indigo-600"
          aria-label="Headphone monitoring volume"
        />
      </div>
    );
  }

  if (outputStatus === 'verified' || outputStatus === 'available') {
    return (
      <div className="mt-2 flex flex-col gap-1">
        <button
          onClick={start}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 active:scale-95 transition"
        >
          <Headphones className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="text-xs font-bold text-indigo-700">Enable headphone monitoring</span>
        </button>
        {outputStatus === 'available' && (
          <span className="text-[11px] font-semibold text-amber-600 px-1">
            🎧 Use headphones to avoid echo.
          </span>
        )}
      </div>
    );
  }

  // checking, idle
  return (
    <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200">
      <Headphones className="w-3.5 h-3.5 text-slate-400 shrink-0 animate-pulse" />
      <span className="text-[11px] font-semibold text-slate-500">Checking for headphones…</span>
    </div>
  );
}