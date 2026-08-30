import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { splinePathD } from '@/components/tracing/strokeMath';
import { Save, Check, RotateCcw } from 'lucide-react';

const CANVAS_W = 300;
const CANVAS_H = 375;

// Composes a two-digit number (10-20) from the teacher-authored single digits
// (loaded from the LetterWaypoint entity). Each digit is draggable to position
// it; a shared scale slider sizes both digits together. Save writes the
// composed strokes back to the DB under the number's key, so the student
// tracing game picks them up just like any other authored character.
export default function NumberComposer({ target, onSaved }) {
  const tensKey = target[0];
  const onesKey = target[1];

  const [digitStrokes, setDigitStrokes] = useState({});
  const [scale, setScale] = useState(0.48);
  const [tens, setTens] = useState({ x: 0.02, y: 0 });
  const [ones, setOnes] = useState({ x: 0.50, y: 0 });
  const [drag, setDrag] = useState(null); // 'tens' | 'ones' | null
  const grabRef = useRef(null); // offset between pointer and digit's top-left
  const svgRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Load the two constituent digits from the DB.
  useEffect(() => {
    let cancelled = false;
    const keys = [tensKey, onesKey];
    Promise.all(keys.map((k) => base44.entities.LetterWaypoint.filter({ letter: k })))
      .then((results) => {
        if (cancelled) return;
        const ds = {};
        results.forEach((recs, i) => {
          if (recs && recs.length) {
            try {
              const strokes = JSON.parse(recs[0].strokes_data);
              if (Array.isArray(strokes) && strokes.length) ds[keys[i]] = strokes;
            } catch { /* malformed */ }
          }
        });
        setDigitStrokes(ds);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tensKey, onesKey]);

  const transformStroke = useCallback((stroke, off) =>
    stroke.map((p) => ({
      x: p.x * scale + off.x,
      y: p.y + off.y,
      ...(p.corner ? { corner: true } : {}),
    })), [scale]);

  const composedStrokes = useMemo(() => {
    const out = [];
    if (digitStrokes[tensKey]) {
      for (const s of digitStrokes[tensKey]) out.push(transformStroke(s, tens));
    }
    if (digitStrokes[onesKey]) {
      for (const s of digitStrokes[onesKey]) out.push(transformStroke(s, ones));
    }
    return out;
  }, [digitStrokes, tensKey, onesKey, tens, ones, transformStroke]);

  // Bounding box (normalized) for each digit, for hit-testing the drag.
  const bbox = (off) => {
    if (!digitStrokes[tensKey] && off === tens) return null;
    const strokes = off === tens ? digitStrokes[tensKey] : digitStrokes[onesKey];
    if (!strokes) return null;
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const s of strokes) {
      for (const p of s) {
        const tx = p.x * scale + off.x;
        const ty = p.y + off.y;
        if (tx < minX) minX = tx;
        if (ty < minY) minY = ty;
        if (tx > maxX) maxX = tx;
        if (ty > maxY) maxY = ty;
      }
    }
    return { minX, minY, maxX, maxY };
  };
  const tensBBox = useMemo(() => bbox(tens), [tens, digitStrokes, scale]);
  const onesBBox = useMemo(() => bbox(ones), [ones, digitStrokes, scale]);

  const toCanvas = (p) => ({
    x: p.x * CANVAS_W,
    y: p.y * CANVAS_H,
    ...(p.corner ? { corner: true } : {}),
  });

  const getNormPos = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const startDrag = (which) => (e) => {
    e.preventDefault();
    const cur = which === 'tens' ? tens : ones;
    const np = getNormPos(e);
    grabRef.current = { which, dx: np.x - cur.x, dy: np.y - cur.y };
    setDrag(which);
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
  };

  const onPointerMove = (e) => {
    if (!drag || !grabRef.current) return;
    e.preventDefault();
    const np = getNormPos(e);
    const next = {
      x: Math.max(-0.1, Math.min(1 - scale, np.x - grabRef.current.dx)),
      y: Math.max(-0.1, Math.min(0.9, np.y - grabRef.current.dy)),
    };
    if (drag === 'tens') setTens(next);
    else setOnes(next);
  };

  const endDrag = (e) => {
    if (e) { try { svgRef.current.releasePointerCapture(e.pointerId); } catch {} }
    setDrag(null);
    grabRef.current = null;
  };

  const save = async () => {
    if (!composedStrokes.length) return;
    setSaving(true);
    setSaveError('');
    try {
      const existing = await base44.entities.LetterWaypoint.filter({ letter: target });
      const payload = {
        letter: target,
        strokes_data: JSON.stringify(composedStrokes),
        hint: `${tensKey}, then ${onesKey}`,
      };
      if (existing.length) {
        await base44.entities.LetterWaypoint.update(existing[0].id, payload);
      } else {
        await base44.entities.LetterWaypoint.create(payload);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      onSaved?.();
    } catch {
      setSaveError('Could not save — try again.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setScale(0.48);
    setTens({ x: 0.02, y: 0 });
    setOnes({ x: 0.50, y: 0 });
  };

  const ready = digitStrokes[tensKey] && digitStrokes[onesKey];

  const renderDigit = (strokes, off, which, color) => {
    if (!strokes) return null;
    return strokes.map((stroke, si) => {
      const pts = stroke.map((p) => toCanvas(transformStroke([p], off)[0]));
      if (pts.length === 1) {
        const p = pts[0];
        return <circle key={`${which}-${si}`} cx={p.x} cy={p.y} r="6" fill={color} opacity="0.55" pointerEvents="none" />;
      }
      return (
        <path
          key={`${which}-${si}`}
          d={splinePathD(pts)}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
          pointerEvents="none"
        />
      );
    });
  };

  const hitRect = (bb, which) => {
    if (!bb) return null;
    return (
      <rect
        x={bb.minX * CANVAS_W}
        y={bb.minY * CANVAS_H}
        width={(bb.maxX - bb.minX) * CANVAS_W}
        height={(bb.maxY - bb.minY) * CANVAS_H}
        fill="transparent"
        style={{ cursor: drag === which ? 'grabbing' : 'grab' }}
        onPointerDown={startDrag(which)}
      />
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Compose · <span className="text-indigo-600 text-xl align-middle">{target}</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          <button
            onClick={save}
            disabled={!ready || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {!ready && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
          Author digit <span className="font-bold">{!digitStrokes[tensKey] ? tensKey : onesKey}</span> first —
          select it above, draw it, and save. Then come back here to compose {target}.
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className="rounded-2xl border-4 border-slate-200 bg-white touch-none"
          style={{ width: '100%', maxWidth: 360, aspectRatio: `${CANVAS_W}/${CANVAS_H}`, cursor: drag ? 'grabbing' : 'default' }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {/* Writing lines */}
          <line x1="0" y1={0.10 * CANVAS_H} x2={CANVAS_W} y2={0.10 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
          <line x1="0" y1={0.367 * CANVAS_H} x2={CANVAS_W} y2={0.367 * CANVAS_H} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
          <line x1="0" y1={0.633 * CANVAS_H} x2={CANVAS_W} y2={0.633 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
          <line x1="0" y1={0.90 * CANVAS_H} x2={CANVAS_W} y2={0.90 * CANVAS_H} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.85" />

          {renderDigit(digitStrokes[tensKey], tens, 'tens', '#6366f1')}
          {renderDigit(digitStrokes[onesKey], ones, 'ones', '#ec4899')}
          {hitRect(tensBBox, 'tens')}
          {hitRect(onesBBox, 'ones')}
        </svg>

        <div className="w-full max-w-sm space-y-2">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 uppercase">Digit size</span>
            <input
              type="range" min="0.25" max="0.70" step="0.01" value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-full accent-indigo-600"
            />
          </label>
          <p className="text-xs text-slate-400 text-center">
            Drag each digit to position it. <span className="text-indigo-500">■</span> tens · <span className="text-pink-500">■</span> ones
          </p>
        </div>
      </div>

      {saveError && <p className="text-xs text-red-600 mt-2 text-center">{saveError}</p>}
    </div>
  );
}