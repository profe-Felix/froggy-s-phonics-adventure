import { useState, useEffect, useMemo, useRef } from 'react';
import { buildHunt } from '@/lib/activities/hunt';
import HuntSegments from '@/components/activities/HuntSegments';
import { RefreshCw, Volume2, CheckCircle2, ChevronRight } from 'lucide-react';

// Teacher's text-hunt model panel. The teacher taps targets in the passage;
// each tap is broadcast instantly so student iPads mirror the highlights. The
// "Reveal missed" button shows any correct targets the teacher skipped (amber),
// same as the student activity. No recording — pure modeling.
export default function HuntModelPanel({ items, huntType, target, send }) {
  const [pos, setPos] = useState(0);
  const [marks, setMarks] = useState({});
  const [checked, setChecked] = useState(false);
  const marksRef = useRef({});
  const checkedRef = useRef(false);

  const hasItems = items.length > 0;
  const current = hasItems ? items[pos] || items[0] : null;
  const hunt = useMemo(() => buildHunt({ huntType, target }, current?.text || ''), [huntType, target, current]);
  const segments = hunt.segments;
  const correctCount = hunt.correctCount;

  function broadcast(nextMarks, nextChecked) {
    send({
      type: 'hunt',
      itemText: current?.text || '',
      huntType,
      target,
      marks: nextMarks ?? marksRef.current,
      checked: nextChecked ?? checkedRef.current,
      correctCount,
    });
  }

  // Reset marks + broadcast when the text or hunt type changes.
  useEffect(() => {
    setMarks({}); marksRef.current = {};
    setChecked(false); checkedRef.current = false;
    broadcast({}, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, items, huntType, target]);

  function tap(seg) {
    if (!seg || !seg.tap || checkedRef.current) return;
    if (marksRef.current[seg.index]) return;
    const correct = !!seg.correct;
    marksRef.current = { ...marksRef.current, [seg.index]: correct ? 'correct' : 'wrong' };
    setMarks(marksRef.current);
    broadcast();
  }

  function verificar() {
    if (checkedRef.current) return;
    const m = { ...marksRef.current };
    for (const seg of segments) {
      if (seg.tap && seg.correct && !m[seg.index]) m[seg.index] = 'missed';
    }
    marksRef.current = m; setMarks(m);
    setChecked(true); checkedRef.current = true;
    broadcast(m, true);
  }

  function reset() {
    setMarks({}); marksRef.current = {};
    setChecked(false); checkedRef.current = false;
    broadcast({}, false);
  }

  function next() {
    setPos(p => (p + 1) % items.length);
  }

  function speak() {
    try {
      const u = new SpeechSynthesisUtterance(current.text);
      u.lang = 'es-ES'; u.rate = 0.85;
      window.speechSynthesis?.speak(u);
    } catch { /* best-effort */ }
  }

  if (!hasItems) return <div className="p-6 text-slate-500 text-center">No text for this hunt.</div>;

  const found = Object.values(marks).filter((v) => v === 'correct').length;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="text-xs text-slate-400">Text {pos + 1} / {items.length}</span>
        <span className="ml-auto font-semibold text-slate-600">
          Found: <b className="text-green-600">{found}</b> / {correctCount}
        </span>
      </div>

      <div className="rounded-2xl bg-white border-2 border-slate-200 p-4 sm:p-6 shadow-sm">
        <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2">
          {hunt.typeDef.label}{hunt.typeDef.needsTarget ? ` · "${target || ''}"` : ''}
        </div>
        <p className="text-lg sm:text-2xl font-bold text-slate-800 leading-relaxed">
          <HuntSegments
            segments={segments}
            marks={marks}
            onTap={tap}
            interactive={!checked}
            isSpaceHunt={hunt.type === 'space'}
          />
        </p>
        <button onClick={speak} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-bold">
          <Volume2 className="w-4 h-4" /> Say it
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 flex-wrap">
        <button onClick={verificar} disabled={checked} className="px-4 py-2 rounded-lg bg-amber-500 text-white font-bold text-sm flex items-center gap-1.5 disabled:opacity-50">
          <CheckCircle2 className="w-4 h-4" /> Reveal missed
        </button>
        <button onClick={reset} className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm flex items-center gap-1.5">
          <RefreshCw className="w-4 h-4" /> Reset
        </button>
        <button onClick={next} className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold text-sm flex items-center gap-1.5">
          Next text <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500 justify-center">
        <span><span className="inline-block w-3 h-3 rounded bg-green-200 align-middle mr-1" />correct</span>
        <span><span className="inline-block w-3 h-3 rounded bg-red-200 align-middle mr-1" />error</span>
        <span><span className="inline-block w-3 h-3 rounded bg-amber-200 align-middle mr-1" />missed</span>
      </div>
    </div>
  );
}