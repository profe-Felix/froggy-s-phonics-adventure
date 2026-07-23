import { useEffect, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { playWordAudio, preloadAudio } from '@/lib/lettersort/audio';
import { syllabifyEs, markersToPretty, stressedSyllIndex } from '@/lib/lettersort/phonics';

const AUDIO_OPTS = { bucket: 'lettersort-audio', prefix: '' };

// Stress-reveal mode: for each word, tap the syllable you think is stressed.
// Verify highlights the correct (green) and wrong (red) picks.
export default function StressRevealView({ round, config }) {
  const [picks, setPicks] = useState({}); // cardId -> syllable index (0-based from left)
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });

  useEffect(() => {
    setPicks({}); setChecked(false); setScore({ correct: 0, wrong: 0 });
    preloadAudio(round.cards.map((c) => c.coreRaw), AUDIO_OPTS);
  }, [round]);

  function pick(cardId, idx) {
    if (checked) return;
    setPicks((p) => ({ ...p, [cardId]: idx }));
  }

  function verify() {
    let correct = 0, wrong = 0;
    round.cards.forEach((c) => {
      const syls = syllabifyEs(markersToPretty(c.coreRaw));
      const stressPos = stressedSyllIndex(c.coreRaw); // 1=last
      const correctIdx = syls.length - stressPos;
      if (picks[c.id] === correctIdx) correct++; else wrong++;
    });
    setScore({ correct, wrong }); setChecked(true);
    if (wrong === 0) celebrate();
  }

  function newRound() { setPicks({}); setChecked(false); setScore({ correct: 0, wrong: 0 }); }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={verify} disabled={Object.keys(picks).length < round.cards.length} className="px-4 py-2 rounded-lg bg-green-600 text-white font-bold text-sm flex items-center gap-1.5 disabled:opacity-40 shadow-sm"><Check className="w-4 h-4" /> Verificar</button>
        <button onClick={newRound} className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm flex items-center gap-1.5 shadow-sm"><RefreshCw className="w-4 h-4" /> Nuevo</button>
        <span className="text-sm font-semibold text-slate-600 ml-2">✅ {score.correct} · ❌ {score.wrong}</span>
        <span className="text-xs text-slate-500">Toca la sílaba tónica de cada palabra.</span>
      </div>

      {config.bg && (
        <img src={config.bg} alt="" className="w-full max-h-56 object-cover rounded-xl" draggable={false} />
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(round.cards.length, 4)}, minmax(160px, 1fr))` }}>
        {round.cards.map((card) => {
          const syls = syllabifyEs(markersToPretty(card.coreRaw));
          const stressPos = stressedSyllIndex(card.coreRaw);
          const correctIdx = syls.length - stressPos;
          const picked = picks[card.id];
          return (
            <div key={card.id} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-indigo-50/60 border border-indigo-200">
              {card.imgUrl && <img src={card.imgUrl} alt="" className="rounded-lg object-contain max-h-24 bg-white" draggable={false} onClick={() => playWordAudio(card.coreRaw, AUDIO_OPTS)} />}
              <div className="flex flex-wrap justify-center gap-1">
                {syls.map((s, i) => {
                  const isPicked = picked === i;
                  const isCorrect = i === correctIdx;
                  let cls = 'bg-white text-slate-700 border-slate-300';
                  if (checked) {
                    if (isCorrect) cls = 'bg-green-100 text-green-800 border-green-400';
                    else if (isPicked) cls = 'bg-red-100 text-red-800 border-red-400';
                    else cls = 'bg-white text-slate-400 border-slate-200';
                  } else if (isPicked) {
                    cls = 'bg-indigo-600 text-white border-indigo-600';
                  }
                  return (
                    <button key={i} type="button" onClick={() => pick(card.id, i)} className={`px-2 py-1 rounded-md border-2 font-bold text-lg ${cls}`}>{s}</button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function celebrate() {
  const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
  for (let i = 0; i < 120; i++) {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;left:${Math.random() * 100}vw;top:-20px;width:8px;height:12px;background:${colors[i % colors.length]};z-index:9999;pointer-events:none;border-radius:2px;transform:rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(el);
    const dur = 2000 + Math.random() * 1500;
    el.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 200}px,100vh) rotate(${Math.random() * 720}deg)`, opacity: 0 }], { duration: dur, easing: 'cubic-bezier(0.2,0.6,0.4,1)' });
    setTimeout(() => el.remove(), dur);
  }
}