import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { LETTER_WAYPOINTS } from '@/components/data/letterWaypoints';
import { ACCENT_MAP, buildAccentStrokes } from '@/lib/accentLetters';
import { splinePathD } from '@/components/tracing/strokeMath';
import { CachedGuideKeyVisual } from '@/components/tracing/GuideKeyVisual';
import { letterHelpStrokeColor } from '@/lib/notebookLetterHelp.mjs';

// TEACHER EDITOR ONLY. Session cache of teacher waypoint overrides. Same merge rule as
// useMergedWaypoints, but fetched at most once per page session so replays,
// letter changes and re-openings never hit the network again.
let overridesPromise = null;
export function loadLetterHelpWaypoints() {
  if (!overridesPromise) {
    // Newest-first; first record per letter wins (same rule as the server snapshot).
    overridesPromise = base44.entities.LetterWaypoint.list('-updated_date', 500)
      .then(records => {
        const list = Array.isArray(records) ? records : [];
        const merged = { ...LETTER_WAYPOINTS }, seen = new Set();
        for (const r of list) {
          if (!r.letter || !r.strokes_data || seen.has(r.letter)) continue;
          try {
            const strokes = JSON.parse(r.strokes_data);
            if (Array.isArray(strokes) && strokes.length) { seen.add(r.letter); merged[r.letter] = { strokes, hint: r.hint || merged[r.letter]?.hint || '' }; }
          } catch { /* ignore malformed */ }
        }
        return { waypoints: merged, truncated: list.length >= 500, failed: false };
      })
      .catch(() => { overridesPromise = null; return { waypoints: LETTER_WAYPOINTS, truncated: false, failed: true }; });
  }
  return overridesPromise;
}

export function useLetterHelpWaypoints(active) {
  const [wp, setWp] = useState({ waypoints: null, truncated: false, failed: false });
  useEffect(() => {
    if (!active) return;
    let off = false;
    loadLetterHelpWaypoints().then(m => { if (!off) setWp(m); });
    return () => { off = true; };
  }, [active]);
  return wp;
}

// Student path: merge server-provided snapshot (workbook.letterHelpWaypoints)
// with built-ins. No network. Accepts {letter:{strokes,hint}}, {letter:[...strokes]}
// or {letter:{strokes_data:'json'}}.
export function mergeTeacherWaypoints(teacher) {
  const merged = { ...LETTER_WAYPOINTS };
  if (!teacher || typeof teacher !== 'object') return merged;
  for (const [letter, v] of Object.entries(teacher)) {
    let strokes = Array.isArray(v) ? v : v?.strokes;
    if (!strokes && typeof v?.strokes_data === 'string') { try { strokes = JSON.parse(v.strokes_data); } catch { strokes = null; } }
    if (Array.isArray(strokes) && strokes.length) merged[letter] = { strokes, hint: v?.hint || merged[letter]?.hint || '' };
  }
  return merged;
}

export const displayLetter = (letter, upper) => {
  return upper ? letter.toLocaleUpperCase('es') : letter;
};

const CW = 300, CH = 375, GAP = 0.08;
// Same authored coordinate system and equal-zone lines as LetterTracingCanvas.
const GUIDE_W = 260;
const WRITING_LINES = [
  { y: .10, color: '#4a90e2', width: 2.5 },
  { y: .367, color: '#000000', width: 2, dash: '8 6' },
  { y: .633, color: '#16a34a', width: 2.5 },
  { y: .90, color: '#8d6e63', width: 2.5, dash: '6 6' },
];
function strokesFor(ch, wp) {
  const own = wp[ch];
  if (own?.strokes?.length) return own.strokes;
  const acc = ACCENT_MAP?.[ch];
  if (acc && wp[acc.base]?.strokes?.length) {
    const base = wp[acc.base].strokes;
    return [...base, ...buildAccentStrokes(acc.accent, bounds(base))];
  }
  return null;
}
function bounds(strokes) {
  let minX = Infinity, maxX = -Infinity;
  for (const s of strokes) for (const p of Array.isArray(s) ? s : []) if (p?.x != null) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); }
  return isFinite(minX) ? { minX, maxX } : { minX: 0, maxX: .5 };
}

// Builds the glyph: real teacher stroke order, corner flags preserved.
export function buildGlyph(text, wp) {
  if (!wp) return null;
  const chars = [...text];
  const parts = chars.map(ch => strokesFor(ch, wp));
  if (parts.some(p => !p)) return { missing: chars.filter((_, i) => !parts[i]) };
  let cursor = 0;
  const strokes = [];
  parts.forEach(ps => {
    const b = bounds(ps);
    for (const s of ps) {
      if (!Array.isArray(s) || !s.length) continue;
      const pts = s.map(p => ({ x: (p.x - b.minX + cursor) * CW, y: p.y * CH, ...(p.corner ? { corner: true } : {}) }));
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      strokes.push({ pts, len, d: pts.length > 1 ? splinePathD(pts) : null });
    }
    cursor += b.maxX - b.minX + GAP;
  });
  const width = Math.max(.4, cursor - GAP) * CW;
  // Timeline at 1x: slow drawing (~140px/s) with a 0.7s pause between strokes.
  let t = 0.4;
  const timed = strokes.map(s => { const dur = Math.max(.6, s.len / 140); const seg = { ...s, start: t, dur }; t += dur + .7; return seg; });
  return { strokes: timed, total: t, width };
}

export default function LetterHelpReplay({ text, waypoints, speed = .5, onSpeedChange, compact = false, autoPlay = true }) {
  const glyph = useMemo(() => buildGlyph(text, waypoints), [text, waypoints]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const raf = useRef(0);
  const timeRef = useRef(0);
  const seek = v => { timeRef.current = v; setTime(v); };
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const total = glyph?.total || 1;
  const pathRefs = useRef([]);
  const pathLengths = useRef(new WeakMap());
  const tipRef = useRef(null);
  const activeIndex = glyph?.strokes?.findIndex(s => time >= s.start && time < s.start + s.dur) ?? -1;

  // Follow the rendered spline's arc length, not a straight-line interpolation
  // between waypoints: the tip must stay on curved and retraced parts of a/d/p.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    const stroke = glyph?.strokes?.[activeIndex];
    if (!stroke) { tip.setAttribute('visibility', 'hidden'); return; }
    const progress = Math.max(0, Math.min(1, (time - stroke.start) / stroke.dur));
    let point = stroke.pts[0];
    const path = pathRefs.current[activeIndex];
    if (stroke.d && path) {
      let length = pathLengths.current.get(path);
      if (length === undefined) { length = path.getTotalLength(); pathLengths.current.set(path, length); }
      point = path.getPointAtLength(length * progress);
    }
    tip.setAttribute('transform', `translate(${point.x} ${point.y})`);
    tip.setAttribute('visibility', 'visible');
  }, [time, glyph, activeIndex]);

  useEffect(() => { seek(0); setPlaying(autoPlay); }, [text, waypoints, autoPlay]); // eslint-disable-line
  useEffect(() => {
    if (!playing || !glyph?.strokes) return;
    let last = performance.now();
    const tick = now => {
      const dt = (now - last) / 1000; last = now;
      const n = Math.min(total, timeRef.current + dt * speedRef.current);
      seek(n);
      if (n >= total) setPlaying(false); else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, glyph, total]);

  if (!waypoints) return <div className="aspect-[4/5] w-full rounded-2xl animate-pulse" style={{ background: 'hsl(42 50% 90%)' }} data-testid="status-letter-loading" aria-label="Cargando letra" />;
  if (glyph.missing) {
    return (
      <div role="status" data-testid="status-letter-unavailable" className="rounded-2xl p-6 text-center" style={{ background: 'hsl(42 60% 94%)', color: 'hsl(18 50% 30%)', border: '2px dashed hsl(28 60% 70%)' }}>
        <p className="font-black text-4xl mb-2" style={{ fontFamily: "'Andika', sans-serif" }}>{text}</p>
        <p className="text-sm font-bold">Todavía no hay modelo de trazo para {glyph.missing.join(', ')}.</p>
        <p className="text-xs mt-1">Pide a tu maestra que te enseñe a escribirla.</p>
      </div>
    );
  }
  const pct = time / total;
  const letterAreaWidth = Math.max(CW, glyph.width + 60);
  const canvasWidth = GUIDE_W + letterAreaWidth;
  const letterX = GUIDE_W + (letterAreaWidth - glyph.width) / 2;
  const restart = () => { seek(0); setPlaying(true); };
  const btn = 'h-11 min-w-11 px-3 rounded-full font-bold flex items-center justify-center gap-1 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2';
  return (
    <div className="flex flex-col gap-3">
      <svg viewBox={`0 0 ${canvasWidth} ${CH}`} className={`w-full ${compact ? 'max-h-48' : 'max-h-[42vh]'} rounded-2xl`} style={{ background: '#ffffff' }}
        role="img" aria-label={`Cómo se escribe ${text}`} data-testid="svg-letter-replay">
        <CachedGuideKeyVisual skyY={.10 * CH} fenceY={.367 * CH} grassY={.633 * CH} dirtY={.90 * CH} width={GUIDE_W} />
        {WRITING_LINES.map(line => <line key={line.y} x1={0} x2={canvasWidth} y1={line.y * CH} y2={line.y * CH}
          stroke={line.color} strokeWidth={line.width} strokeDasharray={line.dash} opacity={line.y === .90 ? .85 : .8}
          vectorEffect="non-scaling-stroke" data-guide-line={line.y} />)}
        <g transform={`translate(${letterX} 0)`}>
        {glyph.strokes.map((s, i) => s.d
          ? <path key={`g${i}`} d={s.d} fill="none" stroke="hsl(30 20% 82%)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
          : <circle key={`g${i}`} cx={s.pts[0].x} cy={s.pts[0].y} r={7} fill="hsl(30 20% 82%)" />)}
        {glyph.strokes.map((s, i) => {
          const p = Math.max(0, Math.min(1, (time - s.start) / s.dur));
          const strokeColor = letterHelpStrokeColor(i);
          const startPt = s.pts[0];
          const isNext = time < s.start && (i === 0 || time >= glyph.strokes[i - 1].start + glyph.strokes[i - 1].dur);
          return (
            <g key={`i${i}`}>
              {p > 0 && (s.d
                ? <path ref={node => { pathRefs.current[i] = node; }} d={s.d} fill="none" stroke={strokeColor} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p} />
                : <circle cx={startPt.x} cy={startPt.y} r={8} fill={strokeColor} opacity={p} />)}
              {(isNext || (p > 0 && p < 1)) && <g>
                <circle cx={startPt.x} cy={startPt.y} r={15} fill={strokeColor} />
                <text x={startPt.x} y={startPt.y + 6} textAnchor="middle" fontSize={17} fontWeight={800} fill="hsl(44 70% 97%)">{i + 1}</text>
              </g>}
            </g>
          );
        })}
        <g ref={tipRef} visibility="hidden" pointerEvents="none" aria-hidden="true" data-testid="letter-pencil-tip">
          <circle r={11} fill="#ffffff" stroke="#0f172a" strokeWidth={1.5} />
          <circle r={7} fill="#f97316" />
        </g>
        </g>
      </svg>
      <div className="flex flex-wrap gap-1" aria-label="Colores de los trazos" data-testid="letter-stroke-colors">
        {glyph.strokes.map((_, i) => <span key={i} className="rounded-full px-2 py-1 text-xs font-bold text-white"
          style={{ background: letterHelpStrokeColor(i) }}>Trazo {i + 1}</span>)}
      </div>
      <input type="range" min={0} max={1000} value={Math.round(pct * 1000)} aria-label="Posición de la animación" data-testid="input-letter-scrub"
        onChange={e => { setPlaying(false); seek(Number(e.target.value) / 1000 * total); }}
        className="w-full accent-[hsl(172_70%_28%)] h-8" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} style={{ background: 'hsl(172 70% 28%)', color: 'hsl(44 70% 97%)' }} data-testid="button-letter-playpause"
          aria-label={playing ? 'Pausa' : 'Reproducir'} onClick={() => { if (time >= total) restart(); else setPlaying(p => !p); }}>
          {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
        <button type="button" className={btn} style={{ background: 'hsl(42 60% 88%)', color: 'hsl(18 50% 25%)' }} onClick={restart} aria-label="Repetir desde el principio" data-testid="button-letter-replay">
          <RotateCcw className="w-5 h-5" />
        </button>
        <div role="radiogroup" aria-label="Velocidad" className="ml-auto flex gap-1">
          {[.25, .5, 1].map(v => (
            <button key={v} type="button" role="radio" aria-checked={speed === v} onClick={() => onSpeedChange?.(v)} data-testid={`button-speed-${v}`}
              className={btn} style={speed === v ? { background: 'hsl(18 50% 25%)', color: 'hsl(44 70% 97%)' } : { background: 'hsl(42 60% 92%)', color: 'hsl(18 50% 25%)' }}>
              {v}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
