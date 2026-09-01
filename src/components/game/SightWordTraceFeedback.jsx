import { useState, useEffect, useRef, useMemo } from 'react';
import WordTracingCanvas from './WordTracingCanvas';
import { LETTER_WAYPOINTS } from '../data/letterWaypoints';
import { base44 } from '@/api/base44Client';
import { scale, buildDensePath, fonemaUrl } from '@/lib/tracingCore';
import { AUDIO_BASE, toAudioName, getSilenceStartSync, preloadSilenceStart } from '@/lib/audio';

const W = 220;
const H = 275;

function playPhoneme(letter, lang) {
  try {
    const url = fonemaUrl(letter, lang);
    const a = new Audio(url);
    const trim = getSilenceStartSync(url);
    if (trim > 0) {
      a.addEventListener('loadedmetadata', () => { a.currentTime = trim; }, { once: true });
    }
    a.play().catch(() => {});
    return a;
  } catch {
    return null;
  }
}

function playWord(word, lang) {
  try {
    const url = `${AUDIO_BASE}/${lang}/words/${encodeURIComponent(toAudioName(word))}.mp3`;
    const a = new Audio(url);
    a.play().catch(() => {});
    return a;
  } catch {
    return null;
  }
}

// Animates drawing one letter's strokes while its phoneme plays, then onDone.
function LetterReplay({ letter, lang, onDone, waypoints }) {
  const strokes = (waypoints || LETTER_WAYPOINTS)[letter]?.strokes || [];
  const [visibleStrokes, setVisibleStrokes] = useState([]);
  const rafRef = useRef(null);

  // Shared scale function — used both by the animation effect and the guide
  // path rendering so the full letter pathway and the animated stroke overlap
  // perfectly.
  const scaleFn = (pt) => scale(pt, W, H);

  useEffect(() => {
    const dense = strokes.map(s => buildDensePath(s, scaleFn));
    const total = dense.reduce((a, s) => a + s.length, 0);

    // No geometry to animate (e.g. an unauthored letter) — show the letter and
    // move on after a brief beat so the demo never gets stuck.
    if (total === 0) {
      const t = setTimeout(onDone, 500);
      return () => clearTimeout(t);
    }

    const duration = Math.max(500, total * 11);
    playPhoneme(letter, lang);
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const count = Math.ceil(t * total);
      const out = [];
      let remaining = count;
      for (const ds of dense) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, ds.length);
        out.push(ds.slice(0, take));
        remaining -= take;
      }
      setVisibleStrokes(out);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setTimeout(onDone, 250);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [letter, strokes]);

  const pathD = (pts) => pts.length < 2 ? '' :
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Full letter pathway as a faint guide so the student can see the complete
  // letter shape at all times — not just the partial stroke the animation has
  // revealed so far. Without this, a partially-drawn 'e' (horizontal bar +
  // incomplete curve) can look like an upside-down or garbled letter while the
  // animation is in progress, even though the finished stroke is correct.
  const fullGuidePaths = strokes.map(s => buildDensePath(s, scaleFn));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="rounded-2xl border-4 border-sky-200 bg-white"
      style={{ width: 360, height: 450 }}
    >
      <line x1="0" y1={0.10 * H} x2={W} y2={0.10 * H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
      <line x1="0" y1={0.367 * H} x2={W} y2={0.367 * H} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
      <line x1="0" y1={0.633 * H} x2={W} y2={0.633 * H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
      <line x1="0" y1={0.90 * H} x2={W} y2={0.90 * H} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.85" />
      {/* Full letter pathway — faint grey guide showing the complete letter shape */}
      {fullGuidePaths.map((pts, i) => (
        <path key={`guide-${i}`} d={pathD(pts)} fill="none" stroke="#cbd5e1"
          strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
      ))}
      {/* Animated stroke drawn on top of the guide */}
      {visibleStrokes.map((pts, i) => (
        <path key={i} d={pathD(pts)} fill="none" stroke="#6366f1" strokeWidth="10"
          strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      ))}
    </svg>
  );
}

// Two-phase miss feedback for sight words:
//   1) Demo — animate each letter's stroke while playing its phoneme, then
//      say the whole word (blend): /u/ /n/ -> "un".
//   2) Try — the student traces the word themselves (guided) and gets an
//      accuracy score, then the game continues.
export default function SightWordTraceFeedback({ word, lang, onDone }) {
  const letters = useMemo(() => (word || '').split(''), [word]);
  const [phase, setPhase] = useState('demo');
  const [demoIdx, setDemoIdx] = useState(0);
  const [waypoints, setWaypoints] = useState(LETTER_WAYPOINTS);
  // Don't render the demo until teacher-authored waypoints have loaded from the
  // DB. Without this gate, LetterReplay starts animating with the hardcoded
  // fallback waypoints (which look wrong/outdated), and its animation effect
  // (deps: [letter]) never re-runs when the real waypoints arrive — so the
  // student sees the wrong letter shapes for the entire demo.
  const [waypointsLoaded, setWaypointsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    base44.entities.LetterWaypoint.list()
      .then((records) => {
        if (cancelled) return;
        if (Array.isArray(records) && records.length > 0) {
          setWaypoints((prev) => {
            const merged = { ...prev };
            for (const r of records) {
              if (!r.letter || !r.strokes_data) continue;
              try {
                const strokes = JSON.parse(r.strokes_data);
                if (Array.isArray(strokes) && strokes.length) {
                  merged[r.letter] = { strokes, hint: r.hint || prev[r.letter]?.hint || '' };
                }
              } catch { /* ignore malformed */ }
            }
            return merged;
          });
        }
        setWaypointsLoaded(true);
      })
      .catch(() => { if (!cancelled) setWaypointsLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    letters.forEach(l => {
      if (waypoints[l]) preloadSilenceStart(fonemaUrl(l, lang));
    });
  }, [word, lang, waypoints]);

  const handleLetterDone = () => {
    if (demoIdx + 1 < letters.length) {
      setDemoIdx(demoIdx + 1);
    } else {
      // Blend: say the whole word, then hand off to the student.
      playWord(word, lang);
      setTimeout(() => setPhase('trace'), 1000);
    }
  };

  if (!word) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-4 max-w-4xl w-full flex flex-col gap-2 max-h-[95vh] min-h-[480px]">
        <div className="text-center shrink-0">
          <div className="text-lg font-bold text-slate-800">Let's practice! ✏️</div>
          <div className="text-sm text-slate-500">
            {phase === 'demo' ? 'Watch: ' : 'Now you trace: '}
            <span className="font-black text-indigo-600">{word}</span>
          </div>
        </div>

        {/* Word with the current demo letter highlighted */}
        <div className="flex gap-1 text-3xl font-bold justify-center shrink-0">
          {letters.map((l, i) => (
            <span
              key={i}
              className={
                phase === 'demo' && i === demoIdx
                  ? 'text-indigo-600 scale-125 transition-transform'
                  : 'text-slate-400'
              }
            >
              {l}
            </span>
          ))}
        </div>

        <div className="flex-1 min-h-0 flex items-center justify-center overflow-y-auto">
          {phase === 'demo' ? (
            waypointsLoaded ? (
              <LetterReplay key={demoIdx} letter={letters[demoIdx]} lang={lang} onDone={handleLetterDone} waypoints={waypoints} />
            ) : (
              <div className="flex items-center justify-center" style={{ width: 360, height: 450 }}>
                <div className="w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )
          ) : (
            <WordTracingCanvas
              key={word}
              word={word}
              waypoints={waypoints}
              lang={lang}
              renderWidth={1000}
              repetitions={1}
              fillHeight
              onComplete={() => setTimeout(onDone, 300)}
            />
          )}
        </div>

        <button
          onClick={onDone}
          className="text-slate-400 hover:text-slate-700 text-sm underline shrink-0"
        >
          Skip
        </button>
      </div>
    </div>
  );
}