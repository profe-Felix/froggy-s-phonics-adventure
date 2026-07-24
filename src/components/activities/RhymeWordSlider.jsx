import { useRef, useState, useEffect } from 'react';
import { Hand, Volume2 } from 'lucide-react';
import { syllabifyEs } from '@/lib/lettersort/phonics';

// A "slide and say" slider for the rhyme activity. The word itself is NOT shown
// (students listen via the speaker, then slide and say it in their own voice).
// The track is segmented into the word's syllables (tick marks) so the slider
// "lines up" with the word the way the slide-to-read canvas does, and a hand
// icon sits above the thumb as the slide gesture cue. The thumb tracks the
// finger exactly (pointer events, touch-friendly).
function speak(text) {
  try {
    window.speechSynthesis?.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES'; u.rate = 0.8;
    window.speechSynthesis?.speak(u);
  } catch { /* best-effort */ }
}

export default function RhymeWordSlider({ word, label }) {
  const n = Math.max(1, syllabifyEs(word).length);
  const trackRef = useRef(null);
  const [pos, setPos] = useState(0);
  const draggingRef = useRef(false);

  useEffect(() => { setPos(0); }, [word]);

  function setFromClientX(clientX) {
    const el = trackRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
  }
  function onDown(e) {
    draggingRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* best-effort */ }
    setFromClientX(e.clientX);
  }
  function onMove(e) { if (draggingRef.current) setFromClientX(e.clientX); }
  function onUp() { draggingRef.current = false; }

  return (
    <div className="flex-1 min-w-[160px] rounded-2xl bg-white border-2 border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => speak(word)} className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700 active:bg-indigo-200" aria-label={`Escuchar ${label}`}>
          <Volume2 className="w-5 h-5" />
        </button>
        <span className="font-bold text-slate-500 text-sm">{label}</span>
        <span className="ml-auto text-xs text-slate-400">{n} sílabas</span>
      </div>
      <div className="relative h-10 select-none">
        <div style={{ left: `calc(${pos * 100}% - 13px)` }} className="absolute top-0 text-indigo-600 pointer-events-none">
          <Hand className="w-7 h-7" />
        </div>
        <div
          ref={trackRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="absolute bottom-0 left-0 right-0 h-3 rounded-full bg-slate-200"
          style={{ touchAction: 'none' }}
        >
          <div className="absolute left-0 top-0 bottom-0 rounded-full bg-indigo-500" style={{ width: `${pos * 100}%` }} />
          {Array.from({ length: n - 1 }).map((_, i) => (
            <div key={i} className="absolute top-0 bottom-0 w-px bg-white/80" style={{ left: `${((i + 1) / n) * 100}%` }} />
          ))}
          <div className="absolute top-1/2 w-6 h-6 -ml-3 -mt-3 rounded-full bg-indigo-600 border-2 border-white shadow" style={{ left: `${pos * 100}%` }} />
        </div>
      </div>
      <div className="text-center text-xs text-slate-400 mt-1">Desliza y di la palabra</div>
    </div>
  );
}