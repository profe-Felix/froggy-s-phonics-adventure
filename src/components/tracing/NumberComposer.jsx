import { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { splinePathD } from '@/components/tracing/strokeMath';
import LetterTracingCanvas from '@/components/game/LetterTracingCanvas';
import { Save, Check, RotateCcw, Play, ImagePlus, X, Move } from 'lucide-react';

const CANVAS_W = 300;
const CANVAS_H = 375;
const BASELINE = 0.633; // solid blue line digits sit on
const PAD = 0.05; // outer horizontal padding

// Composes a two-digit number (10-20) from the teacher-authored single digits
// (loaded from the LetterWaypoint entity). Spacing is computed from each
// digit's actual INK bounding box (not the 0-1 canvas box), exactly like word
// tracing: the ones digit's ink left edge sits a slider-controlled gap to the
// right of the tens digit's ink right edge. Both digits auto-scale uniformly
// to fit the canvas and stay anchored to the baseline. Save writes the
// composed strokes to the DB under the number's key so the student tracing
// game picks them up like any other authored character.
export default function NumberComposer({ target, onSaved }) {
  const tensKey = target[0];
  const onesKey = target[1];

  const [digitStrokes, setDigitStrokes] = useState({});
  const [spacing, setSpacing] = useState(0.04);
  const [bg, setBg] = useState(null); // { url, img, aspect }
  const [bgScale, setBgScale] = useState(1);
  const [bgX, setBgX] = useState(0);
  const [bgY, setBgY] = useState(0);
  const [bgOpacity, setBgOpacity] = useState(0.45);
  const [moveMode, setMoveMode] = useState(false);
  const moveStartRef = useRef(null);
  const svgRef = useRef(null);
  const [previewing, setPreviewing] = useState(false);
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

  // Ink bounding box (minX/maxX) of a digit's authored strokes, in normalized 0-1.
  const inkBounds = (strokes) => {
    if (!strokes) return null;
    let minX = Infinity, maxX = -Infinity;
    for (const s of strokes) {
      if (!Array.isArray(s)) continue;
      for (const p of s) {
        if (p && p.x != null) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
        }
      }
    }
    if (!isFinite(minX)) return null;
    return { minX, maxX, w: maxX - minX };
  };

  const tensInk = useMemo(() => inkBounds(digitStrokes[tensKey]), [digitStrokes, tensKey]);
  const onesInk = useMemo(() => inkBounds(digitStrokes[onesKey]), [digitStrokes, onesKey]);

  // Auto-scale uniformly so both digits + spacing fit, capped at 1.0 (never
  // upscale beyond the authored size). y is scaled around the baseline so
  // digits stay anchored to it as they shrink.
  const layout = useMemo(() => {
    if (!tensInk || !onesInk) return null;
    const totalInkW = tensInk.w + onesInk.w;
    const s = totalInkW > 0
      ? Math.min(1.0, (1 - 2 * PAD - spacing) / totalInkW)
      : 1.0;
    const contentW = totalInkW * s + spacing;
    const leftPad = (1 - contentW) / 2;
    const offsetY = BASELINE * (1 - s);
    const tensOffX = leftPad - tensInk.minX * s;
    const onesOffX = leftPad + tensInk.w * s + spacing - onesInk.minX * s;
    return { s, offsetY, tensOffX, onesOffX };
  }, [tensInk, onesInk, spacing]);

  const transformStroke = (stroke, offX) => {
    if (!layout) return [];
    const { s, offsetY } = layout;
    return stroke.map((p) => ({
      x: p.x * s + offX,
      y: p.y * s + offsetY,
      ...(p.corner ? { corner: true } : {}),
    }));
  };

  const composedStrokes = useMemo(() => {
    if (!layout) return [];
    const out = [];
    if (digitStrokes[tensKey]) for (const s of digitStrokes[tensKey]) out.push(transformStroke(s, layout.tensOffX));
    if (digitStrokes[onesKey]) for (const s of digitStrokes[onesKey]) out.push(transformStroke(s, layout.onesOffX));
    return out;
  }, [digitStrokes, tensKey, onesKey, layout]);

  const toCanvas = (p) => ({
    x: p.x * CANVAS_W,
    y: p.y * CANVAS_H,
    ...(p.corner ? { corner: true } : {}),
  });

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
      if (existing.length) await base44.entities.LetterWaypoint.update(existing[0].id, payload);
      else await base44.entities.LetterWaypoint.create(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      onSaved?.();
    } catch {
      setSaveError('Could not save — try again.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setSpacing(0.04);
  const ready = tensInk && onesInk;

  // Load an uploaded image file, capture its aspect ratio, and fit it to the
  // canvas height (centered) — same model as the letter authoring canvas so the
  // teacher only drags to position, never resizes by hand.
  const loadTraceImage = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result;
      const img = new Image();
      img.onload = () => {
        const aspect = img.width / img.height || 1;
        const scale = 1; // fit to canvas height (dispH = CANVAS_H)
        const dh = CANVAS_H * scale;
        const dw = dh * aspect;
        setBg({ url, img, aspect });
        setBgScale(scale);
        setBgX((CANVAS_W - dw) / 2);
        setBgY((CANVAS_H - dh) / 2);
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  const getPos = (e) => {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (CANVAS_W / rect.width),
      y: (e.clientY - rect.top) * (CANVAS_H / rect.height),
    };
  };

  const onPointerDown = (e) => {
    if (!moveMode || !bg) return;
    e.preventDefault();
    try { svgRef.current.setPointerCapture(e.pointerId); } catch {}
    const pos = getPos(e);
    moveStartRef.current = { x: pos.x, y: pos.y, bgX, bgY };
  };
  const onPointerMove = (e) => {
    if (!moveMode || !moveStartRef.current || !bg) return;
    e.preventDefault();
    const pos = getPos(e);
    const s = moveStartRef.current;
    setBgX(s.bgX + (pos.x - s.x));
    setBgY(s.bgY + (pos.y - s.y));
  };
  const onPointerUp = (e) => {
    if (!moveMode) return;
    moveStartRef.current = null;
    try { svgRef.current.releasePointerCapture(e.pointerId); } catch {}
  };

  const dispH = CANVAS_H * bgScale;
  const dispW = dispH * (bg?.aspect || 1);

  const renderDigit = (strokes, offX, color) => {
    if (!strokes || !layout) return null;
    return strokes.map((stroke, si) => {
      const pts = stroke.map((p) => toCanvas(transformStroke([p], offX)[0]));
      if (pts.length === 1) {
        const p = pts[0];
        return <circle key={si} cx={p.x} cy={p.y} r="6" fill={color} opacity="0.55" pointerEvents="none" />;
      }
      return (
        <path key={si} d={splinePathD(pts)} fill="none" stroke={color}
          strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
          opacity="0.55" pointerEvents="none" />
      );
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Compose · <span className="text-indigo-600 text-xl align-middle">{target}</span>
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-white text-slate-600 border border-slate-200 hover:bg-slate-100">
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          <button onClick={save} disabled={!ready || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
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
        <svg ref={svgRef} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className="rounded-2xl border-4 border-slate-200 bg-white touch-none"
          style={{
            width: '100%', maxWidth: 360, aspectRatio: `${CANVAS_W}/${CANVAS_H}`,
            cursor: moveMode && bg ? 'move' : 'default', touchAction: 'none',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Reference image (behind everything) — drag with Move to position */}
          {bg && (
            <image href={bg.url} x={bgX} y={bgY} width={dispW} height={dispH}
              opacity={bgOpacity} pointerEvents="none" />
          )}
          {/* Writing lines */}
          <line x1="0" y1={0.10 * CANVAS_H} x2={CANVAS_W} y2={0.10 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
          <line x1="0" y1={0.367 * CANVAS_H} x2={CANVAS_W} y2={0.367 * CANVAS_H} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" opacity="0.7" />
          <line x1="0" y1={0.633 * CANVAS_H} x2={CANVAS_W} y2={0.633 * CANVAS_H} stroke="#93c5fd" strokeWidth="1.5" opacity="0.7" />
          <line x1="0" y1={0.90 * CANVAS_H} x2={CANVAS_W} y2={0.90 * CANVAS_H} stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.85" />
          {renderDigit(digitStrokes[tensKey], layout?.tensOffX, '#6366f1')}
          {renderDigit(digitStrokes[onesKey], layout?.onesOffX, '#ec4899')}
        </svg>

        <div className="w-full max-w-sm space-y-1">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 uppercase">Spacing between digits</span>
            <input type="range" min="0" max="0.15" step="0.005" value={spacing}
              onChange={(e) => setSpacing(parseFloat(e.target.value))}
              className="w-full accent-indigo-600" />
          </label>
          <p className="text-xs text-slate-400 text-center">
            Gap is measured between the ink edges, not the canvas boxes.
          </p>
        </div>

        {/* Reference image to match spacing against */}
        <div className="w-full max-w-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase">Trace image</span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 cursor-pointer">
                <ImagePlus className="w-3.5 h-3.5" /> {bg ? 'Change' : 'Add image'}
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { loadTraceImage(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {bg && (
                <>
                  <button onClick={() => setMoveMode((m) => !m)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border ${
                      moveMode
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                    }`}>
                    <Move className="w-3.5 h-3.5" /> {moveMode ? 'Dragging' : 'Move'}
                  </button>
                  <button onClick={() => { setBg(null); setMoveMode(false); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-white text-slate-500 border border-slate-200 hover:bg-slate-100">
                    <X className="w-3.5 h-3.5" /> Clear
                  </button>
                </>
              )}
            </div>
          </div>
          {bg && (
            <>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <span className="w-14 shrink-0">Scale</span>
                <input type="range" min="0.2" max="80" step="0.1" value={bgScale}
                  onChange={(e) => {
                    const ns = parseFloat(e.target.value);
                    const dh = CANVAS_H * ns;
                    const dw = dh * (bg?.aspect || 1);
                    setBgScale(ns);
                    setBgX((CANVAS_W - dw) / 2);
                    setBgY((CANVAS_H - dh) / 2);
                  }}
                  className="flex-1 accent-indigo-600" />
                <span className="w-10 text-right tabular-nums">{bgScale.toFixed(2)}×</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <span className="w-14 shrink-0">Opacity</span>
                <input type="range" min="0.1" max="1" step="0.05" value={bgOpacity}
                  onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
                  className="flex-1 accent-indigo-600" />
                <span className="w-10 text-right tabular-nums">{Math.round(bgOpacity * 100)}%</span>
              </label>
            </>
          )}
          <p className="text-xs text-slate-400 text-center">
            Upload a picture of the number, then use Move to drag it into place and Scale to fit.
          </p>
        </div>
      </div>

      {/* Student preview — trace the composed number like a student would */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Student preview</h2>
          <button
            onClick={() => setPreviewing((p) => !p)}
            disabled={!ready || !composedStrokes.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" /> {previewing ? 'Hide' : 'Preview'}
          </button>
        </div>
        {previewing && ready && composedStrokes.length > 0 ? (
          <div className="flex justify-center bg-gradient-to-b from-purple-400 to-indigo-600 rounded-xl p-4">
            <LetterTracingCanvas
              key={target + JSON.stringify(composedStrokes)}
              letter={target}
              strokes={composedStrokes}
              onComplete={() => {}}
              onReset={() => {}}
            />
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-6">
            {ready ? 'Press Preview to trace your number like a student would.' : 'Author both digits first, then preview.'}
          </p>
        )}
      </div>

      {saveError && <p className="text-xs text-red-600 mt-2 text-center">{saveError}</p>}
    </div>
  );
}