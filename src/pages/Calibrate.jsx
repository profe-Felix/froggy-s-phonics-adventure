import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';

const CANVAS_W = 400;
const CANVAS_H = 500;
const TOP_LINE = 0.10 * CANVAS_H;
const MID_LINE = 0.42 * CANVAS_H;
const BASE_LINE = 0.72 * CANVAS_H;
const DESC_LINE = 0.92 * CANVAS_H;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');

// A stroke is an array of segments.
// Segment types:
//   { type: 'L', p: {x,y} }  — line-to anchor
//   { type: 'Q', cp: {x,y}, p: {x,y} }  — quadratic bezier (arc)
// First point of stroke is always a move-to stored as strokes[i].start = {x,y}

function buildSvgPath(stroke) {
  if (!stroke || !stroke.segments || stroke.segments.length === 0) return '';
  let d = `M ${stroke.start.x} ${stroke.start.y}`;
  for (const seg of stroke.segments) {
    if (seg.type === 'L') {
      d += ` L ${seg.p.x} ${seg.p.y}`;
    } else {
      d += ` Q ${seg.cp.x} ${seg.cp.y} ${seg.p.x} ${seg.p.y}`;
    }
  }
  return d;
}

function exportWaypoints(letter, strokes) {
  // Export as array of arrays of {x,y} normalized 0-1
  const result = strokes.map(stroke => {
    const pts = [stroke.start]; // canvas coords during computation
    for (const seg of stroke.segments) {
      if (seg.type === 'L') {
        pts.push(seg.p);
      } else {
        // Use last canvas-coord point as bezier start
        const prev = pts[pts.length - 1];
        for (let t = 0.2; t <= 1.01; t += 0.2) {
          const x = (1 - t) * (1 - t) * prev.x + 2 * (1 - t) * t * seg.cp.x + t * t * seg.p.x;
          const y = (1 - t) * (1 - t) * prev.y + 2 * (1 - t) * t * seg.cp.y + t * t * seg.p.y;
          pts.push({ x, y }); // still canvas coords
        }
      }
    }
    // Normalize all points at the end
    return pts.map(p => ({ x: +(p.x / CANVAS_W).toFixed(4), y: +(p.y / CANVAS_H).toFixed(4) }));
  });
  const json = JSON.stringify({ [letter]: { strokes: result, hint: '' } }, null, 2);
  navigator.clipboard.writeText(json);
  return json;
}

const HANDLE_R = 8;
const CP_R = 6;

export default function Calibrate() {
  const [letter, setLetter] = useState('a');
  const [tool, setTool] = useState('line'); // 'line' | 'arc'
  const [strokes, setStrokes] = useState([]);
  const [activeStroke, setActiveStroke] = useState(null); // current stroke being built
  const [dragging, setDragging] = useState(null); // {strokeIdx, type: 'start'|'anchor'|'cp', segIdx}
  const [exported, setExported] = useState('');
  const svgRef = useRef();

  const suppressNextClick = useRef(false);

  const getSvgPt = useCallback((e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const pt = svgRef.current.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgPt = pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
    return { x: Math.round(svgPt.x), y: Math.round(svgPt.y) };
  }, []);

  const handleCanvasClick = useCallback((e) => {
    if (suppressNextClick.current) { suppressNextClick.current = false; return; }
    const pt = getSvgPt(e);

    if (!activeStroke) {
      setActiveStroke({ start: pt, segments: [] });
      return;
    }

    const prevPt = activeStroke.segments.length === 0
      ? activeStroke.start
      : activeStroke.segments[activeStroke.segments.length - 1].p;

    if (tool === 'line') {
      setActiveStroke(s => ({ ...s, segments: [...s.segments, { type: 'L', p: pt }] }));
    } else {
      const cp = { x: Math.round((prevPt.x + pt.x) / 2), y: Math.round((prevPt.y + pt.y) / 2) - 30 };
      setActiveStroke(s => ({ ...s, segments: [...s.segments, { type: 'Q', cp, p: pt }] }));
    }
  }, [activeStroke, tool, getSvgPt]);

  const commitStroke = () => {
    if (!activeStroke || activeStroke.segments.length === 0) return;
    setStrokes(s => [...s, activeStroke]);
    setActiveStroke(null);
  };

  const undoLast = () => {
    if (activeStroke && activeStroke.segments.length > 0) {
      setActiveStroke(s => ({ ...s, segments: s.segments.slice(0, -1) }));
    } else if (activeStroke) {
      setActiveStroke(null);
    } else {
      setStrokes(s => s.slice(0, -1));
    }
  };

  const clearAll = () => {
    setStrokes([]);
    setActiveStroke(null);
  };

  // --- Dragging logic ---
  const onMouseDown = useCallback((e, info) => {
    e.stopPropagation();
    suppressNextClick.current = true;
    setDragging(info);
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!dragging) return;
    const pt = getSvgPt(e);
    const { strokeIdx, type, segIdx } = dragging;

    const updateStroke = (strk) => {
      if (type === 'start') return { ...strk, start: pt };
      const segs = strk.segments.map((seg, i) => {
        if (i !== segIdx) return seg;
        if (type === 'anchor') return { ...seg, p: pt };
        if (type === 'cp') return { ...seg, cp: pt };
        return seg;
      });
      return { ...strk, segments: segs };
    };

    if (strokeIdx === 'active') {
      setActiveStroke(s => updateStroke(s));
    } else {
      setStrokes(s => s.map((strk, i) => i === strokeIdx ? updateStroke(strk) : strk));
    }
  }, [dragging, getSvgPt]);

  const onMouseUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    return () => {
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [onMouseMove, onMouseUp]);

  const handleExport = () => {
    const all = activeStroke && activeStroke.segments.length > 0 ? [...strokes, activeStroke] : strokes;
    const json = exportWaypoints(letter, all);
    setExported(json);
  };

  const renderStroke = (stroke, strokeIdx) => {
    const d = buildSvgPath(stroke);
    const color = strokeIdx === 'active' ? '#f59e0b' : `hsl(${(strokeIdx * 60) % 360}, 70%, 50%)`;
    return (
      <g key={strokeIdx}>
        <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {/* Control point lines for arcs */}
        {stroke.segments.map((seg, si) => {
          if (seg.type !== 'Q') return null;
          const prevPt = si === 0 ? stroke.start : stroke.segments[si - 1].p;
          return (
            <g key={`cp-line-${si}`}>
              <line x1={prevPt.x} y1={prevPt.y} x2={seg.cp.x} y2={seg.cp.y} stroke="#999" strokeWidth="1" strokeDasharray="4" />
              <line x1={seg.cp.x} y1={seg.cp.y} x2={seg.p.x} y2={seg.p.y} stroke="#999" strokeWidth="1" strokeDasharray="4" />
              <circle
                cx={seg.cp.x} cy={seg.cp.y} r={CP_R}
                fill="#fff" stroke="#9333ea" strokeWidth="2"
                className="cursor-move"
                onMouseDown={(e) => onMouseDown(e, { strokeIdx, type: 'cp', segIdx: si })}
              />
            </g>
          );
        })}
        {/* Start handle */}
        <circle
          cx={stroke.start.x} cy={stroke.start.y} r={HANDLE_R}
          fill="#22c55e" stroke="#fff" strokeWidth="2"
          className="cursor-move"
          onMouseDown={(e) => onMouseDown(e, { strokeIdx, type: 'start', segIdx: -1 })}
        />
        {/* Anchor handles */}
        {stroke.segments.map((seg, si) => (
          <circle
            key={`anchor-${si}`}
            cx={seg.p.x} cy={seg.p.y} r={HANDLE_R}
            fill={color} stroke="#fff" strokeWidth="2"
            className="cursor-move"
            onMouseDown={(e) => onMouseDown(e, { strokeIdx, type: 'anchor', segIdx: si })}
          />
        ))}
      </g>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-4 text-gray-800">Letter Waypoint Calibrator</h1>

        {/* Letter picker */}
        <div className="bg-white rounded-xl p-4 mb-4 shadow">
          <p className="text-sm font-semibold text-gray-600 mb-2">Select Letter</p>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {LETTERS.map(l => (
              <button
                key={l}
                onClick={() => { setLetter(l); clearAll(); }}
                className={`w-8 h-8 rounded text-sm font-mono font-bold border ${letter === l ? 'bg-blue-500 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-4 flex-wrap">
          {/* Canvas */}
          <div className="flex-1 min-w-[320px]">
            <div className="bg-white rounded-xl shadow p-2">
              <svg
                ref={svgRef}
                width={CANVAS_W}
                height={CANVAS_H}
                viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                className="w-full border border-gray-200 rounded cursor-crosshair select-none"
                style={{ maxHeight: '60vh', touchAction: 'none' }}
                onClick={handleCanvasClick}
              >
                {/* Primary writing lines */}
                <line x1="0" y1={TOP_LINE} x2={CANVAS_W} y2={TOP_LINE} stroke="#93c5fd" strokeWidth="1.5" />
                <line x1="0" y1={MID_LINE} x2={CANVAS_W} y2={MID_LINE} stroke="#93c5fd" strokeWidth="1" strokeDasharray="8 6" />
                <line x1="0" y1={BASE_LINE} x2={CANVAS_W} y2={BASE_LINE} stroke="#93c5fd" strokeWidth="1.5" />
                <line x1="0" y1={DESC_LINE} x2={CANVAS_W} y2={DESC_LINE} stroke="#fca5a5" strokeWidth="1" strokeDasharray="4 6" />

                {/* Letter reference */}
                <text
                  x={CANVAS_W / 2} y={BASE_LINE}
                  fontSize={letter === letter.toUpperCase() && letter !== letter.toLowerCase() ? 320 : 300}
                  fontFamily="Lexend, sans-serif"
                  fill="rgba(0,0,0,0.06)"
                  textAnchor="middle"
                  dominantBaseline="auto"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {letter}
                </text>

                {/* Committed strokes */}
                {strokes.map((s, i) => renderStroke(s, i))}

                {/* Active stroke */}
                {activeStroke && renderStroke(activeStroke, 'active')}

                {/* Line labels */}
                <text x="4" y={TOP_LINE - 3} fontSize="10" fill="#93c5fd">top</text>
                <text x="4" y={MID_LINE - 3} fontSize="10" fill="#93c5fd">mid</text>
                <text x="4" y={BASE_LINE - 3} fontSize="10" fill="#93c5fd">base</text>
                <text x="4" y={DESC_LINE - 3} fontSize="10" fill="#fca5a5">desc</text>
              </svg>
            </div>
          </div>

          {/* Controls */}
          <div className="w-48 flex flex-col gap-3">
            <div className="bg-white rounded-xl shadow p-3">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Tool</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setTool('line')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border ${tool === 'line' ? 'bg-blue-500 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
                >
                  📏 Straight Line
                </button>
                <button
                  onClick={() => setTool('arc')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border ${tool === 'arc' ? 'bg-purple-500 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300'}`}
                >
                  🌀 Arc / Curve
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow p-3">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Stroke</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={commitStroke}
                  disabled={!activeStroke || activeStroke.segments.length === 0}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-40"
                >
                  ✅ End Stroke
                </button>
                <button
                  onClick={undoLast}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-yellow-400 text-white hover:bg-yellow-500"
                >
                  ↩️ Undo
                </button>
                <button
                  onClick={clearAll}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-red-400 text-white hover:bg-red-500"
                >
                  🗑️ Clear All
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow p-3">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Export</p>
              <button
                onClick={handleExport}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-gray-800 text-white hover:bg-gray-900"
              >
                📋 Copy JSON
              </button>
              <p className="text-xs text-gray-400 mt-2">Paste into letterWaypoints.js</p>
            </div>

            <div className="bg-white rounded-xl shadow p-3 text-xs text-gray-500 space-y-1">
              <p className="font-semibold text-gray-600">How to use:</p>
              <p>1. Pick a letter</p>
              <p>2. Click canvas to place start point</p>
              <p>3. Click to add more points</p>
              <p>4. Drag dots to adjust</p>
              <p>5. For arcs, drag the <span className="text-purple-600 font-medium">◇ control handle</span></p>
              <p>6. Click "End Stroke" to finish a stroke</p>
              <p>7. Repeat for more strokes</p>
              <p>8. Copy JSON when done</p>
            </div>
          </div>
        </div>

        {/* Stroke count indicator */}
        <div className="mt-3 flex gap-2 items-center">
          <span className="text-sm text-gray-600">Strokes: {strokes.length}{activeStroke ? ' + 1 active' : ''}</span>
          {strokes.length > 0 && strokes.map((_, i) => (
            <span key={i} className="w-4 h-4 rounded-full inline-block" style={{ background: `hsl(${(i * 60) % 360}, 70%, 50%)` }} />
          ))}
        </div>

        {exported && (
          <div className="mt-4 bg-gray-800 rounded-xl p-4">
            <p className="text-green-400 text-sm mb-2">✅ Copied to clipboard!</p>
            <pre className="text-gray-300 text-xs overflow-x-auto whitespace-pre-wrap">{exported}</pre>
          </div>
        )}
      </div>
    </div>
  );
}