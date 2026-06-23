import React, { useRef, useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { parseText } from './phonetics';

// ── Colors ──────────────────────────────────────────────────────────────────
const COLORS = {
  green: '#22c55e',
  red: '#ef4444',
  grey: '#9ca3af',
  unrevealed: '#33333f',
  pastLine: '#5a5a6a',
  sliderFilled: '#3b82f6',
  sliderEmpty: '#1e293b',
  thumb: '#3b82f6',
};
const BG_COLOR = '#0f0f1a';

// ── Rounded rect ────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ── Word wrapping (never splits words) ──────────────────────────────────────
function splitWords(units) {
  const words = [];
  let current = [];
  for (const u of units) {
    if (u.type === 'space') {
      if (current.length > 0) { words.push({ units: current, space: u }); current = []; }
    } else {
      current.push(u);
    }
  }
  if (current.length > 0) words.push({ units: current, space: null });
  return words;
}

function wrapLines(ctx, units, maxWidth, fontSize) {
  ctx.font = `bold ${fontSize}px Lexend, sans-serif`;
  const words = splitWords(units);
  const lines = [];
  let line = [];
  let lineW = 0;

  for (const word of words) {
    const wordW = word.units.reduce((s, u) => s + ctx.measureText(u.text).width, 0);
    const spaceW = word.space ? ctx.measureText(word.space.text).width : 0;

    if (lineW + wordW + spaceW <= maxWidth || line.length === 0) {
      line.push(...word.units);
      if (word.space) line.push(word.space);
      lineW += wordW + spaceW;
    } else {
      lines.push(line);
      line = [...word.units];
      lineW = wordW;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

// ── Layout ──────────────────────────────────────────────────────────────────
function calculateLayout(ctx, units, canvasW, canvasH) {
  const padding = Math.max(16, canvasW * 0.06);
  const contentW = canvasW - padding * 2;

  const pillH = Math.max(6, canvasH * 0.012);
  const sliderH = Math.max(4, canvasH * 0.008);
  const thumbR = Math.max(12, canvasH * 0.022);
  const bottomGap = Math.max(20, canvasH * 0.04);
  const bottomReserve = pillH + sliderH + thumbR * 2 + bottomGap;
  const textAreaH = canvasH - bottomReserve - padding;

  let fontSize = 16;
  let lines = null;
  let lineHeight = 22;

  const maxFs = Math.min(56, textAreaH * 0.22, contentW * 0.1);
  for (let fs = maxFs; fs >= 14; fs -= 1) {
    const wrapped = wrapLines(ctx, units, contentW, fs);
    const lh = fs * 1.35;
    if (wrapped.length * lh <= textAreaH) {
      fontSize = fs; lines = wrapped; lineHeight = lh; break;
    }
  }
  if (!lines) { lines = wrapLines(ctx, units, contentW, 14); lineHeight = 14 * 1.35; fontSize = 14; }

  ctx.font = `bold ${fontSize}px Lexend, sans-serif`;

  const lineData = lines.map(line => {
    const lineWidth = line.reduce((s, u) => s + ctx.measureText(u.text).width, 0);
    const startX = (canvasW - lineWidth) / 2;
    let x = startX;
    const tokenPositions = [];
    let tokenCount = 0;
    for (const unit of line) {
      const w = ctx.measureText(unit.text).width;
      if (unit.type === 'token') {
        tokenPositions.push({ unit, x, width: w, tokenIdx: tokenCount });
        tokenCount++;
      }
      x += w;
    }
    return { units: line, tokenPositions, tokenCount, width: lineWidth, startX };
  });

  const totalTokens = lineData.reduce((s, l) => s + l.tokenCount, 0);
  const textStartY = padding + fontSize;
  const textEndY = textStartY + (lineData.length - 1) * lineHeight;
  const pillY = textEndY + bottomGap * 0.5;
  const sliderY = pillY + pillH + fontSize * 0.15;

  return {
    fontSize, lineHeight, padding, contentW,
    lines: lineData, totalTokens,
    textStartY, textEndY,
    pillY, pillH, sliderY, sliderH, thumbR,
  };
}

// ── Pill layout for active line ─────────────────────────────────────────────
function getPillLayout(layout, activeLineIdx) {
  const line = layout.lines[activeLineIdx];
  if (!line || line.tokenPositions.length === 0) return null;

  const gap = Math.max(2, layout.fontSize * 0.06);
  const positions = line.tokenPositions.map(tp => ({
    x: tp.x - gap / 2,
    width: tp.width + gap,
    unit: tp.unit,
    tokenIdx: tp.tokenIdx,
    color: tp.unit.chars[0]?.color || 'green',
  }));

  const startX = positions[0].x;
  const endX = positions[positions.length - 1].x + positions[positions.length - 1].width;
  return { positions, startX, endX, totalW: endX - startX, gap };
}

// ── Render ──────────────────────────────────────────────────────────────────
function renderCanvas(ctx, layout, activeLine, lineProgress, hasStarted, canvasW, canvasH) {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvasW, canvasH);
  if (!layout) return;

  const { fontSize, lineHeight, lines, textStartY } = layout;

  // Hint
  if (!hasStarted) {
    ctx.fillStyle = '#4b5563';
    ctx.font = `bold ${Math.min(16, canvasW * 0.03)}px Lexend, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👉 Arrastra para leer', canvasW / 2, canvasH * 0.4);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  ctx.font = `bold ${fontSize}px Lexend, sans-serif`;

  // ── Compute revealed count for active line ──
  const pillLayout = getPillLayout(layout, activeLine);
  let revealedCount = 0;
  if (pillLayout) {
    if (lineProgress >= 0.999) {
      revealedCount = pillLayout.positions.length;
    } else if (lineProgress > 0) {
      let cumW = 0;
      for (let i = 0; i < pillLayout.positions.length; i++) {
        cumW += pillLayout.positions[i].width;
        if (cumW / pillLayout.totalW <= lineProgress + 0.001) revealedCount = i + 1;
      }
      if (revealedCount === 0) revealedCount = 1;
    }
  }

  // ── Text lines ──
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const y = textStartY + li * lineHeight;
    let x = line.startX;
    let tokIdx = 0;

    for (const unit of line.units) {
      const w = ctx.measureText(unit.text).width;

      if (unit.type === 'token') {
        let isRevealed = false;
        if (li < activeLine) {
          // Past line — dimmed but "revealed"
          isRevealed = true;
        } else if (li === activeLine) {
          isRevealed = tokIdx < revealedCount;
        }

        if (isRevealed) {
          const dim = li < activeLine;
          if (dim) {
            ctx.fillStyle = COLORS.pastLine;
            ctx.fillText(unit.text, x, y);
          } else {
            const allSame = unit.chars.every(c => c.color === unit.chars[0].color);
            if (allSame) {
              ctx.fillStyle = COLORS[unit.chars[0].color];
              ctx.fillText(unit.text, x, y);
            } else {
              let cx = x;
              for (const { char, color } of unit.chars) {
                ctx.fillStyle = COLORS[color];
                ctx.fillText(char, cx, y);
                cx += ctx.measureText(char).width;
              }
            }
          }
        } else {
          ctx.fillStyle = COLORS.unrevealed;
          ctx.fillText(unit.text, x, y);
        }
        tokIdx++;
      } else {
        // Space or punct
        if (li < activeLine) ctx.fillStyle = COLORS.pastLine;
        else ctx.fillStyle = COLORS.unrevealed;
        ctx.fillText(unit.text, x, y);
      }
      x += w;
    }
  }

  // ── Pills (active line only) ──
  if (!pillLayout) return;
  const { positions, startX, totalW } = pillLayout;
  const { pillY, pillH, sliderY, sliderH, thumbR } = layout;

  for (const pos of positions) {
    const isRevealed = pos.tokenIdx < revealedCount;
    const color = COLORS[pos.color] || COLORS.green;
    if (isRevealed) {
      ctx.fillStyle = color;
      roundRect(ctx, pos.x, pillY, pos.width, pillH, pillH / 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      roundRect(ctx, pos.x, pillY, pos.width, pillH, pillH / 2);
      ctx.stroke();
    }
  }

  // ── Slider ──
  const sY = sliderY;
  const thumbX = startX + lineProgress * totalW;

  ctx.fillStyle = COLORS.sliderEmpty;
  roundRect(ctx, startX, sY, totalW, sliderH, sliderH / 2);
  ctx.fill();

  if (lineProgress > 0) {
    ctx.fillStyle = COLORS.sliderFilled;
    roundRect(ctx, startX, sY, Math.max(thumbR * 0.5, thumbX - startX), sliderH, sliderH / 2);
    ctx.fill();
  }

  ctx.fillStyle = COLORS.thumb;
  ctx.beginPath();
  ctx.arc(thumbX, sY + sliderH / 2, thumbR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(thumbX, sY + sliderH / 2, thumbR * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

// ── Recording helpers ───────────────────────────────────────────────────────
function getSupportedMimeType() {
  for (const t of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

async function startCanvasRecording(canvas) {
  const canvasStream = canvas.captureStream(30);
  let audioStream = null;
  try { audioStream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {}
  const tracks = [...canvasStream.getVideoTracks()];
  if (audioStream) tracks.push(...audioStream.getAudioTracks());
  const combined = new MediaStream(tracks);
  const mimeType = getSupportedMimeType();
  const recorder = new MediaRecorder(combined, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  return new Promise(resolve => {
    recorder.onstart = () => resolve({ recorder, chunks, audioStream, canvasStream });
    recorder.start();
  });
}

function stopCanvasRecording(rec) {
  return new Promise(resolve => {
    if (!rec) return resolve(null);
    rec.recorder.onstop = () => {
      const blob = new Blob(rec.chunks, { type: rec.recorder.mimeType || 'video/webm' });
      rec.audioStream?.getTracks().forEach(t => t.stop());
      rec.canvasStream?.getTracks().forEach(t => t.stop());
      resolve(blob);
    };
    rec.recorder.stop();
  });
}

// ── Component ───────────────────────────────────────────────────────────────
export default function SlideToReadCanvas({ text, onRecordingComplete, onBack }) {
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [activeLine, setActiveLine] = useState(0);
  const [lineProgress, setLineProgress] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [stopping, setStopping] = useState(false);

  const recordingRef = useRef(null);
  const layoutRef = useRef(null);
  const ctxRef = useRef(null);
  const draggingRef = useRef(false);
  const hasStartedRef = useRef(false);
  const activeLineRef = useRef(0);
  const lineProgressRef = useRef(0);
  const autoStoppedRef = useRef(false);
  const dragStartRef = useRef({ clientX: 0, activeLine: 0, lineProgress: 0 });

  const units = useMemo(() => parseText(text), [text]);

  // Sync refs
  useEffect(() => { activeLineRef.current = activeLine; }, [activeLine]);
  useEffect(() => { lineProgressRef.current = lineProgress; }, [lineProgress]);

  // ── Canvas resize ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctxRef.current = ctx;
      setCanvasSize({ w: rect.width, h: rect.height });
    };
    const obs = new ResizeObserver(resize);
    obs.observe(canvas.parentElement);
    resize();
    return () => obs.disconnect();
  }, []);

  // ── Layout + render ──
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || canvasSize.w === 0) return;
    layoutRef.current = calculateLayout(ctx, units, canvasSize.w, canvasSize.h);
    renderCanvas(ctx, layoutRef.current, activeLine, lineProgress, hasStarted, canvasSize.w, canvasSize.h);
  }, [units, canvasSize, activeLine, lineProgress, hasStarted]);

  // ── Reset on text change ──
  useEffect(() => {
    setActiveLine(0); setLineProgress(0); setHasStarted(false); setIsRecording(false); setStopping(false);
    hasStartedRef.current = false; autoStoppedRef.current = false;
    activeLineRef.current = 0; lineProgressRef.current = 0;
    if (recordingRef.current) { stopCanvasRecording(recordingRef.current); recordingRef.current = null; }
  }, [text]);

  // ── Cleanup ──
  useEffect(() => () => {
    if (recordingRef.current) { stopCanvasRecording(recordingRef.current); recordingRef.current = null; }
  }, []);

  // ── Auto-stop when all revealed ──
  useEffect(() => {
    if (!hasStarted || !layoutRef.current || autoStoppedRef.current) return;
    const layout = layoutRef.current;
    if (activeLine >= layout.lines.length - 1 && lineProgress >= 0.999) {
      autoStoppedRef.current = true;
      (async () => {
        setStopping(true);
        const blob = await stopCanvasRecording(recordingRef.current);
        recordingRef.current = null;
        setIsRecording(false);
        setStopping(false);
        onRecordingComplete(blob);
      })();
    }
  }, [activeLine, lineProgress, hasStarted]);

  // ── Interaction ──
  const handlePointerDown = async (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
    dragStartRef.current = {
      clientX: e.clientX,
      activeLine: activeLineRef.current,
      lineProgress: lineProgressRef.current,
    };
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      setHasStarted(true);
      try {
        recordingRef.current = await startCanvasRecording(canvasRef.current);
        setIsRecording(true);
      } catch (err) { console.warn('Recording failed:', err); }
    }
  };

  const handlePointerMove = (e) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    const layout = layoutRef.current;
    if (!layout || layout.totalTokens === 0) return;

    const dx = e.clientX - dragStartRef.current.clientX;
    const tokensPerPx = layout.totalTokens / layout.contentW;
    const tokenDelta = dx * tokensPerPx;

    let globalTokens = 0;
    for (let i = 0; i < dragStartRef.current.activeLine; i++) {
      globalTokens += layout.lines[i].tokenCount;
    }
    globalTokens += dragStartRef.current.lineProgress * layout.lines[dragStartRef.current.activeLine].tokenCount;
    globalTokens += tokenDelta;
    globalTokens = Math.max(0, Math.min(layout.totalTokens, globalTokens));

    let remaining = globalTokens;
    let newLine = 0;
    let newProg = 0;
    for (let i = 0; i < layout.lines.length; i++) {
      const tc = layout.lines[i].tokenCount;
      if (remaining <= tc) { newLine = i; newProg = tc > 0 ? remaining / tc : 0; break; }
      remaining -= tc; newLine = i; newProg = 1;
    }

    setActiveLine(newLine);
    setLineProgress(newProg);
    activeLineRef.current = newLine;
    lineProgressRef.current = newProg;
  };

  const handlePointerUp = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
  };

  // ── Manual stop ──
  const handleStop = async () => {
    if (!recordingRef.current) return;
    setStopping(true);
    const blob = await stopCanvasRecording(recordingRef.current);
    recordingRef.current = null;
    setIsRecording(false);
    setStopping(false);
    onRecordingComplete(blob);
  };

  return (
    <div className="flex flex-col h-full" style={{ background: BG_COLOR }}>
      <div className="flex items-center gap-3 px-4 py-2.5 shrink-0" style={{ background: '#1a1a2e', borderBottom: '2px solid #4338ca' }}>
        <button onClick={() => { if (recordingRef.current) { stopCanvasRecording(recordingRef.current); recordingRef.current = null; } onBack?.(); }}
          className="text-indigo-300 hover:text-white font-bold text-sm">← Back</button>
        {isRecording && (
          <span className="flex items-center gap-1.5 ml-auto">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 font-bold text-xs">REC</span>
          </span>
        )}
      </div>

      <div className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'none', cursor: dragging ? 'grabbing' : 'pointer' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>

      <div className="shrink-0 px-4 pb-4 pt-2" style={{ background: '#1a1a2e' }}>
        {isRecording && (
          <motion.button whileTap={{ scale: 0.95 }} onClick={handleStop} disabled={stopping}
            className="w-full py-3 rounded-xl font-black text-white text-sm shadow-lg disabled:opacity-50"
            style={{ background: '#dc2626' }}>
            {stopping ? '⏳ Stopping…' : '⏹ Stop & Grade'}
          </motion.button>
        )}
        {hasStarted && !isRecording && !stopping && (
          <div className="text-center py-3 text-indigo-300 font-bold text-sm">✅ Done! Saving…</div>
        )}
        {!hasStarted && (
          <div className="text-center py-3 text-indigo-400 font-bold text-sm">👆 Drag to start reading</div>
        )}
      </div>
    </div>
  );
}