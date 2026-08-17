import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Volume2 } from 'lucide-react';
import { buildActivity } from '@/lib/activities/engine';
import { playTts } from '@/lib/audio';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// "Contar __ en __" — show an item (sentence or word), the student taps the
// number of units (words or phonemes) it contains. Correct → celebrate + next;
// wrong → shake, try again.
export default function CountingActivity({ config }) {
  const activity = useMemo(() => buildActivity(config), [config]);
  const [order, setOrder] = useState([]);
  const [pos, setPos] = useState(0);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [speed, setSpeed] = useState(0.85);

  useEffect(() => {
    if (!activity.items.length) return;
    setOrder(shuffle(activity.items.map((_, i) => i)));
    setPos(0);
    setSelected(null);
    setFeedback(null);
    setScore({ correct: 0, wrong: 0 });
  }, [activity]);

  if (!activity.items.length) {
    return <div className="p-6 text-slate-500 text-center">Añade elementos para empezar.</div>;
  }

  const current = activity.items[order[pos]] || activity.items[0];
  const { modeDef, choices } = activity;

  function pick(n) {
    if (feedback === 'correct') return;
    setSelected(n);
    if (n === current.answer) {
      setFeedback('correct');
      setScore((s) => ({ ...s, correct: s.correct + 1 }));
      celebrate();
    } else {
      setFeedback('wrong');
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
    }
  }

  function next() {
    setSelected(null);
    setFeedback(null);
    setPos((p) => (p + 1) % activity.items.length);
  }

  function restart() {
    setOrder(shuffle(activity.items.map((_, i) => i)));
    setPos(0);
    setSelected(null);
    setFeedback(null);
    setScore({ correct: 0, wrong: 0 });
  }

  function speak() {
    playTts(current.text, 'es', speed);
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      {/* score + progress */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-slate-600">✅ {score.correct} · ❌ {score.wrong}</span>
        <span className="text-xs text-slate-400 ml-auto">{pos + 1} / {activity.items.length}</span>
      </div>

      {/* prompt card */}
      <div className="rounded-2xl bg-white border-2 border-slate-200 p-6 text-center shadow-sm">
        <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2">
          {modeDef.in}
        </div>
        {feedback || activity.mode !== 'counting_words' ? (
          <div className="text-3xl font-bold text-slate-800 leading-snug">{current.text}</div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="text-6xl animate-pulse">🔊</div>
            <div className="text-sm text-slate-400 font-semibold">Toca Escuchar y cuenta las palabras</div>
          </div>
        )}
        <div className="mt-3 flex flex-col items-center gap-2">
          <button
            onClick={speak}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-500 text-white text-base font-bold hover:bg-indigo-600"
          >
            <Volume2 className="w-5 h-5" /> Escuchar
          </button>
          <div className="flex items-center gap-2">
            <span className="text-base">🐢</span>
            <input
              type="range"
              min="0.5"
              max="1.0"
              step="0.05"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-32 accent-indigo-500"
            />
            <span className="text-base">🐰</span>
            <span className="text-xs font-bold text-slate-500 ml-1 w-9">{Math.round(speed * 100)}%</span>
          </div>
        </div>
      </div>

      {/* number tiles */}
      <div>
        <div className="text-center text-sm font-bold text-slate-500 mb-2">
          ¿Cuántos {modeDef.what} hay?
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          {Array.from({ length: choices }, (_, i) => i + 1).map((n) => {
            const isSel = selected === n;
            const isAns = current.answer === n;
            let cls = 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50';
            if (feedback === 'correct' && isAns) cls = 'bg-green-500 text-white border-green-500';
            else if (feedback === 'wrong' && isSel && !isAns) cls = 'bg-red-500 text-white border-red-500';
            return (
              <button
                key={n}
                onClick={() => pick(n)}
                className={`w-14 h-14 rounded-xl border-2 text-2xl font-bold flex items-center justify-center transition ${cls}`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      {/* feedback + next */}
      <div className="flex items-center justify-center gap-3 min-h-[44px]">
        {feedback === 'correct' && <span className="text-green-600 font-bold text-lg">¡Correcto! 🎉</span>}
        {feedback === 'wrong' && <span className="text-red-600 font-bold text-lg">Inténtalo de nuevo</span>}
        {feedback === 'correct' && (
          <button
            onClick={next}
            className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-bold"
          >
            Siguiente
          </button>
        )}
      </div>

      <div className="flex justify-center">
        <button
          onClick={restart}
          className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm flex items-center gap-1.5"
        >
          <RefreshCw className="w-4 h-4" /> Mezclar
        </button>
      </div>
    </div>
  );
}

function celebrate() {
  const N = 100;
  const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
  for (let i = 0; i < N; i++) {
    const el = document.createElement('div');
    el.style.position = 'fixed';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.top = '-20px';
    el.style.width = '8px';
    el.style.height = '12px';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.zIndex = '9999';
    el.style.pointerEvents = 'none';
    el.style.borderRadius = '2px';
    document.body.appendChild(el);
    const dur = 2000 + Math.random() * 1500;
    const drift = (Math.random() - 0.5) * 200;
    el.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${drift}px, 100vh) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: dur, easing: 'cubic-bezier(0.2,0.6,0.4,1)' }
    );
    setTimeout(() => el.remove(), dur);
  }
}