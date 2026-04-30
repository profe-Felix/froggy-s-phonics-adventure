import { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import StoryPageBackground from './StoryPageBackground';

function drawStroke(ctx, s, w, h, alpha = 1) {
  if (!s.pts || s.pts.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (s.tool === 'highlighter') {
    ctx.strokeStyle = s.color; ctx.lineWidth = Math.max(1, s.size * 2.5); ctx.globalAlpha = 0.35 * alpha;
  } else if (s.tool === 'eraser_object' || s.tool === 'eraser_pixel') {
    ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, s.size * 1.5); ctx.globalAlpha = alpha;
  } else {
    ctx.strokeStyle = s.color; ctx.lineWidth = Math.max(1, s.size); ctx.globalAlpha = alpha;
  }
  ctx.beginPath();
  ctx.moveTo(s.pts[0].x * w, s.pts[0].y * h);
  for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x * w, s.pts[i].y * h);
  ctx.stroke();
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

const MODAL_W = 380;
const MODAL_H = Math.round(MODAL_W * 1.3);

export default function StoryReplayModal({ story, initialPageIdx = 0, onClose }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const [pageIdx, setPageIdx] = useState(initialPageIdx);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1

  const pages = story.pages || [];
  const page = pages[pageIdx];
  const strokesData = page?.strokes_data
    ? (typeof page.strokes_data === 'string' ? JSON.parse(page.strokes_data) : page.strokes_data)
    : { strokes: [] };
  const allStrokes = strokesData.strokes || [];

  // Build a flat timeline of all points sorted by timestamp
  const timeline = (() => {
    const pts = [];
    allStrokes.forEach((s, si) => {
      s.pts.forEach((p, pi) => pts.push({ si, pi, t: p.t || 0 }));
    });
    pts.sort((a, b) => a.t - b.t);
    const minT = pts[0]?.t || 0;
    return pts.map(p => ({ ...p, t: p.t - minT }));
  })();
  const totalDuration = timeline[timeline.length - 1]?.t || 1000;

  const renderUpTo = useCallback((ms) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, MODAL_W, MODAL_H);

    // Build partial strokes
    const drawn = {}; // si -> pts shown so far
    for (const entry of timeline) {
      if (entry.t > ms) break;
      if (!drawn[entry.si]) drawn[entry.si] = [];
      drawn[entry.si].push(allStrokes[entry.si].pts[entry.pi]);
    }
    Object.entries(drawn).forEach(([si, pts]) => {
      if (pts.length < 2) return;
      const s = allStrokes[Number(si)];
      drawStroke(ctx, { ...s, pts }, MODAL_W, MODAL_H);
    });
  }, [allStrokes, timeline]);

  // Draw full strokes on page change (not playing)
  useEffect(() => {
    if (playing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, MODAL_W, MODAL_H);
    allStrokes.forEach(s => drawStroke(ctx, s, MODAL_W, MODAL_H));
    setProgress(1);
  }, [pageIdx, playing]);

  const play = () => {
    cancelAnimationFrame(rafRef.current);
    setPlaying(true);
    const start = Date.now();
    const animate = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(elapsed / totalDuration, 1);
      setProgress(pct);
      renderUpTo(elapsed);
      if (elapsed < totalDuration) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setPlaying(false);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  };

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    // Show full
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, MODAL_W, MODAL_H);
    allStrokes.forEach(s => drawStroke(ctx, s, MODAL_W, MODAL_H));
    setProgress(1);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // Setup canvas size
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = MODAL_W * dpr; c.height = MODAL_H * dpr;
    c.style.width = MODAL_W + 'px'; c.style.height = MODAL_H + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    // draw full immediately
    allStrokes.forEach(s => drawStroke(ctx, s, MODAL_W, MODAL_H));
    setProgress(1);
  }, [pageIdx]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
        className="rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#1a1a2e', border: '2px solid #7c3aed', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ background: '#0f0f1a', borderBottom: '1px solid #7c3aed' }}>
          <p className="text-white font-black text-sm">Story: {story.title} — #{story.student_number}</p>
          <button onClick={onClose} className="text-violet-300 font-bold text-lg">✕</button>
        </div>

        {/* Page */}
        <div style={{ position: 'relative', width: MODAL_W, height: MODAL_H, background: 'white', flexShrink: 0 }}>
          {page && <StoryPageBackground template={page.template} width={MODAL_W} height={MODAL_H} />}
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
        </div>

        {/* Controls */}
        <div className="p-3 flex flex-col gap-2" style={{ background: '#0f0f1a' }}>
          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full" style={{ background: '#374151' }}>
            <div className="h-1.5 rounded-full" style={{ background: '#7c3aed', width: `${progress * 100}%`, transition: 'width 0.1s' }} />
          </div>

          <div className="flex items-center gap-2">
            {!playing ? (
              <button onClick={play} disabled={allStrokes.length === 0}
                className="px-4 py-1.5 rounded-xl font-bold text-white text-sm disabled:opacity-30"
                style={{ background: '#7c3aed' }}>▶ Replay</button>
            ) : (
              <button onClick={stop}
                className="px-4 py-1.5 rounded-xl font-bold text-white text-sm"
                style={{ background: '#dc2626' }}>⏹ Stop</button>
            )}
            <span className="text-violet-400 text-xs flex-1 text-center">Page {pageIdx + 1} of {pages.length}</span>
            <button onClick={() => { stop(); setPageIdx(i => Math.max(0, i - 1)); }} disabled={pageIdx === 0}
              className="w-8 h-8 rounded-lg font-bold text-white disabled:opacity-30" style={{ background: '#4c1d95' }}>‹</button>
            <button onClick={() => { stop(); setPageIdx(i => Math.min(pages.length - 1, i + 1)); }} disabled={pageIdx === pages.length - 1}
              className="w-8 h-8 rounded-lg font-bold text-white disabled:opacity-30" style={{ background: '#4c1d95' }}>›</button>
          </div>

          {/* Mic recordings on this page */}
          {(() => {
            try {
              const mics = page?.mics ? JSON.parse(page.mics) : [];
              return mics.filter(m => m.audio_url).map(m => (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="text-xs text-violet-300">🎙</span>
                  <audio controls src={m.audio_url} className="flex-1 h-8" />
                </div>
              ));
            } catch { return null; }
          })()}
        </div>
      </motion.div>
    </div>
  );
}