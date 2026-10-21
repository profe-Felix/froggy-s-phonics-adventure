import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import LetterHelpReplay, { useLetterHelpWaypoints, displayLetter, mergeTeacherWaypoints } from '@/components/notebook/LetterHelpReplay';

export const SPANISH_ALPHABET = 'abcdefghijklmnñopqrstuvwxyz'.split('');

// Side-by-side uppercase + lowercase formation, using the existing replay
// (sky/fence/grass/dirt guide, stroke colors, contrasting pencil tip) and the
// cached teacher waypoints (loaded once per session).
export function LetterFormationPair({ letter, waypoints, compact = false }) {
  const [speed, setSpeed] = useState(.5);
  const lower = letter.toLocaleLowerCase('es');
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="letter-formation-pair">
      {[displayLetter(lower, true), lower].map((t, i) => (
        <div key={t + i} className="rounded-3xl bg-white/90 border-2 border-indigo-100 p-3">
          <p className="text-sm font-black text-indigo-800 mb-2">{i === 0 ? 'Mayúscula' : 'Minúscula'} {t}</p>
          <LetterHelpReplay text={t} waypoints={waypoints} speed={speed} onSpeedChange={setSpeed} compact={compact} autoPlay={false} />
        </div>
      ))}
    </div>
  );
}

export default function LetterFormationStep({ letters = [], waypointSnapshot, onComplete, teacherMode = false }) {
  const list = useMemo(() => {
    const src = (Array.isArray(letters) && letters.length ? letters : SPANISH_ALPHABET)
      .map(l => String(l || '').trim().toLocaleLowerCase('es')).filter(Boolean);
    return [...new Set(src)];
  }, [letters]);
  const remote = useLetterHelpWaypoints(!waypointSnapshot);
  const waypoints = useMemo(() => waypointSnapshot ? mergeTeacherWaypoints(waypointSnapshot) : remote.waypoints, [waypointSnapshot, remote.waypoints]);
  const failed = !waypointSnapshot && remote.failed;
  const [idx, setIdx] = useState(0);
  const [seen, setSeen] = useState(() => new Set());
  const current = list[Math.min(idx, list.length - 1)];
  useEffect(() => { if (current) setSeen(s => s.has(current) ? s : new Set(s).add(current)); }, [current]);
  const allSeen = list.every(l => seen.has(l));
  const canComplete = teacherMode || allSeen;

  if (!current) return <div className="p-6 text-indigo-900 font-bold">No hay letras en este paso.</div>;
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 flex flex-col gap-4" data-testid="letter-formation-step">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Elige una letra">
        {list.map((l, i) => (
          <button key={l} type="button" role="tab" aria-selected={i === idx} onClick={() => setIdx(i)} data-testid={`button-letter-${l}`}
            className={`h-12 min-w-12 px-3 rounded-2xl border-2 font-black text-xl ${i === idx ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-indigo-50 border-indigo-100 text-indigo-800 hover:bg-indigo-100'}`}
            style={{ fontFamily: "'Andika', sans-serif" }}>
            {displayLetter(l, true)}{l}
            {seen.has(l) && i !== idx && <Check className="inline w-4 h-4 ml-1 text-green-600" aria-label="vista" />}
          </button>
        ))}
      </div>
      {failed && <p role="status" className="text-xs font-bold text-amber-700">Usando los modelos de letra integrados.</p>}
      <LetterFormationPair letter={current} waypoints={waypoints} />
      {onComplete && (
        <div className="flex justify-end gap-2">
          {idx < list.length - 1 && (
            <button type="button" onClick={() => setIdx(idx + 1)} className="px-6 py-3 rounded-2xl bg-indigo-50 border-2 border-indigo-100 text-indigo-800 font-black" data-testid="button-next-letter">
              Siguiente letra
            </button>
          )}
          <button type="button" disabled={!canComplete} onClick={() => onComplete({ letters: list, viewed: [...seen] })} data-testid="button-letter-formation-complete"
            className="px-6 py-3 rounded-2xl bg-green-500 text-white font-black shadow hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed">
            Terminé
          </button>
        </div>
      )}
    </div>
  );
}
