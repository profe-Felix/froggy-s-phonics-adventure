import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { useLetterHelpWaypoints, buildGlyph, displayLetter } from '@/components/notebook/LetterHelpReplay';
import { LetterFormationPair, SPANISH_ALPHABET } from '@/components/lesson/modes/LetterFormationStep';

const CH = 375;
function GlyphThumb({ text, waypoints }) {
  const g = waypoints ? buildGlyph(text, waypoints) : null;
  if (!g || g.missing) return <span className="text-4xl font-black text-indigo-900" style={{ fontFamily: "'Andika', sans-serif" }}>{text}</span>;
  return (
    <svg viewBox={`-20 0 ${g.width + 40} ${CH}`} className="h-16 w-auto" aria-hidden="true">
      <line x1={-20} x2={g.width + 20} y1={.633 * CH} y2={.633 * CH} stroke="#16a34a" strokeWidth={4} opacity={.5} />
      {g.strokes.map((s, i) => s.d
        ? <path key={i} d={s.d} fill="none" stroke="hsl(234 60% 30%)" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
        : <circle key={i} cx={s.pts[0].x} cy={s.pts[0].y} r={13} fill="hsl(234 60% 30%)" />)}
    </svg>
  );
}

export default function AlphabetChart() {
  const { waypoints } = useLetterHelpWaypoints(true);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!open) return;
    const k = e => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  return (
    <div className="min-h-[100dvh] bg-indigo-50 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Link to={-1} onClick={e => { e.preventDefault(); window.history.back(); }} className="h-11 w-11 rounded-full bg-white border-2 border-indigo-100 flex items-center justify-center" aria-label="Volver">
            <ArrowLeft className="w-5 h-5 text-indigo-800" />
          </Link>
          <h1 className="text-2xl font-black text-indigo-900">Abecedario</h1>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-3">
          {SPANISH_ALPHABET.map(l => (
            <button key={l} type="button" onClick={() => setOpen(l)} data-testid={`button-alphabet-${l}`} aria-label={`Ver cómo se escribe ${l}`}
              className="rounded-3xl bg-white border-2 border-indigo-100 p-3 flex items-center justify-center gap-1 min-h-24 hover:bg-indigo-100">
              {waypoints ? <><GlyphThumb text={displayLetter(l, true)} waypoints={waypoints} /><GlyphThumb text={l} waypoints={waypoints} /></>
                : <span className="h-16 w-20 rounded-xl bg-indigo-100 animate-pulse" />}
            </button>
          ))}
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-indigo-950/50 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={() => setOpen(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Letra ${open}`} className="w-full max-w-5xl rounded-3xl bg-indigo-50 p-4 relative" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(null)} aria-label="Cerrar" data-testid="button-close-alphabet"
              className="absolute top-3 right-3 h-11 w-11 rounded-full bg-white border-2 border-indigo-100 flex items-center justify-center"><X className="w-5 h-5" /></button>
            <h2 className="text-xl font-black text-indigo-900 mb-3">{displayLetter(open, true)} {open}</h2>
            <LetterFormationPair letter={open} waypoints={waypoints} />
          </div>
        </div>
      )}
    </div>
  );
}
