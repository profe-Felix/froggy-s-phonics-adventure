import React, { useRef, useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { parseText } from './phonetics';

// ── Colors ──────────────────────────────────────────────────────────────────
const COLORS = {
  green: '#22c55e',
  red: '#ef4444',
  grey: '#6b7280',
  unrevealed: '#2a2a3a',
  pillFilled: '#22c55e',
  pillBorder: '#22c55e',
  sliderFilled: '#3b82f6',
  sliderEmpty: '#374151',
  thumb: '#3b82f6',
};
const BG_COLOR = '#0f0f1a';

// ── Rounded rect helper ─────────────────────────────────────────────────────
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

// ── Layout calculation ───────────────────────────────────────────────────────
function calculateLayout(ctx, units, canvasW, canvasH) {
  const padding = Math.max(20, canvasW * 0.08);
  const contentW = canvasW - padding * 2;

  const tokenUnits = units.filter(u => u.type === 'token');
  const numTokens = tokenUnits.length;

  const textAreaH = canvasH * 0.50;
  const startSize = Math.min(textAreaH * 0.35, contentW * 0.2, 72);

  let fontSize = 18;
  let lines = [];
  let lineHeight = 24;

  for (let fs = startSize; fs >= 18; fs -= 2) {
    ctx.font = `bold ${fs}px Lexend, sans-serif`;
    lineHeight = fs * 1.3;

    lines = [];
    let curLine = [];
    let curW = 0;
    for (const unit of units) {
      const unitW = ctx.measureText(unit.text).width;
      if (curW + unitW > contentW && curLine.length > 0) {
        lines.push(curLine);
        curLine = [];
        curW = 0;
      }
      curLine.push({ unit, width: unitW });
      curW += unitW;
    }
    if (curLine.length > 0) lines.push(curLine);

    if (lines.length * lineHeight <= textAreaH) {
      fontSize = fs;
      break;
    }
  }

  // Pill widths proportional to token widths
  ctx.font = `bold ${fontSize}px Lexend, sans-serif`;
  const tokenWidths = tokenUnits.map(u => ctx.measureText(u.text).width);
  const totalTokenW = tokenWidths.reduce((a, b) => a + b, 0);
  const pillTotalW = Math.min(totalTokenW, contentW);
  const pillScale = totalTokenW > 0 ? pillTotalW / totalTokenW : 1;
  const pillWidths = tokenWidths.map(w => w * pillScale);

  // Cumulative widths for progress→token mapping
  const cumWidths = [];
  let cum = 0;
  for (const w of pillWidths) { cum += w; cumWidths.push(cum); }

  // Vertical layout
  const textH = lines.length * lineHeight;
  const textStartY = padding;
  const pillH = Math.max(6, fontSize * 0.12);
  const pillY = textStartY + textH + fontSize * 0.4;
  const sliderH = Math.max(4, fontSize * 0.06);
  const sliderY = pillY + pillH + fontSize * 0.25;
  const thumbR = Math.max(10, fontSize * 0.2);

  // Horizontal: centered
  const pillStartX = padding + (contentW - pillTotalW) / 2;
  const sliderStartX = pillStartX;
  const sliderEndX = pillStartX + pillTotalW;

  return {
    fontSize, lines, lineHeight, textH, textStartY,
    padding, contentW,
    pillWidths, pillTotalW, pillStartX, pillY, pillH,
    cumWidths,
    sliderStartX, sliderEndX, sliderY, sliderH, thumbR,
    numTokens,
  };
}

// ── Render ──────────────────────────────────────────────────────────────────
function renderCanvas(ctx, layout, revealProgress, hasStarted, canvasW, canvasH) {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvasW, canvasH);
  if (!layout) return;

  if (!hasStarted) {
    ctx.fillStyle = '#4b5563';
    ctx.font = `bold ${Math.min(18, canvasW * 0.035)}px Lexend, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👉 Arrastra el control azul para leer', canvasW / 2, canvasH / 2);
    return;
  }

  const { fontSize, lines, lineHeight, textStartY, canvasW: _w,
    pillWidths, pillTotalW, pillStartX, pillY, pillH,
    cumWidths, sliderStartX, sliderY, sliderH, thumbR, numTokens } = layout;

  ctx.font = `bold ${fontSize}px Lexend, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Determine revealed token count from progress
  let revealedCount = 0;
  if (pillTotalW > 0) {
    for (let i = 0; i < numTokens; i++) {
      if (revealProgress >= cumWidths[i] / pillTotalW) revealedCount = i + 1;
      else break;
    }
  }

  // ── Text ──
  let tokenIdx = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const y = textStartY + fontSize + li * lineHeight;
    const lineWidth = line.reduce((s, { width }) => s + width, 0);
    let x = (canvasW - lineWidth) / 2;

    for (const { unit, width } of line) {
      if (unit.type === 'token') {
        const isRevealed = tokenIdx < revealedCount;
        if (isRevealed) {
          const allSame = unit.chars.every(c => c.color === unit.chars[0].color);
          if (allSame) {
            ctx.fillStyle = COLORS[unit.chars[0].color];
            ctx.fillText(unit.text, x, y);
          } else {
            let charX = x;
            for (const { char, color } of unit.chars) {
              ctx.fillStyle = COLORS[color];
              ctx.fillText(char, charX, y);
              charX += ctx.measureText(char).width;
            }
          }
        } else {
          ctx.fillStyle = COLORS.unrevealed;
          ctx.fillText(unit.text, x, y);
        }
        tokenIdx++;
      } else {
        ctx.fillStyle = unit.type === 'punct' ? COLORS.grey : COLORS.unrevealed;
        ctx.fillText(unit.text, x, y);
      }
      x += width;
    }
  }

  // ── Pills ──
  let px = pillStartX;
  for (let i = 0; i < numTokens; i++) {
    const pw = pillWidths[i];
    const isRevealed = i < revealedCount;
    if (isRevealed) {
      ctx.fillStyle = COLORS.pillFilled;
      roundRect(ctx, px, pillY, pw, pillH, pillH / 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = COLORS.pillBorder;
      ctx.lineWidth = 1.5;
      roundRect(ctx, px, pillY, pw, pillH, pillH / 2);
      ctx.stroke();
    }
    px += pw;
  }

  // ── Slider ──
  const thumbX = sliderStartX + revealProgress * pillTotalW;

  ctx.fillStyle = COLORS.sliderEmpty;
  roundRect(ctx, sliderStartX, sliderY, pillTotalW, sliderH, sliderH / 2);
  ctx.fill();

  if (revealProgress > 0) {
    ctx.fillStyle = COLORS.sliderFilled;
    roundRect(ctx, sliderStartX, sliderY, Math.max(thumbR, thumbX - sliderStartX), sliderH, sliderH / 2);
    ctx.fill();
  }

  // Thumb
  ctx.fillStyle = COLORS.thumb;
  ctx.beginPath();
  ctx.arc(thumbX, sliderY + sliderH / 2, thumbR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(thumbX, sliderY + sliderH / 2, thumbR * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

// ── MediaRecorder helpers ───────────────────────────────────────────────────
function getSupportedMimeType() {
  for (const t of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4', 'video/ogg']) {
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

// ── Main component ──────────────────────────────────────────────────────────
export default function SlideToReadCanvas({ text, onRecordingComplete, onBack }) {
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [revealProgress, setRevealProgress] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [stopping, setStopping] = useState(false);

  const recordingRef = useRef(null);
  const layoutRef = useRef(null);
  const ctxRef = useRef(null);
  const draggingRef = useRef(false);
  const hasStartedRef = useRef(false);

  const units = useMemo(() => parseText(text), [text]);

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
    renderCanvas(ctx, layoutRef.current, revealProgress, hasStarted, canvasSize.w, canvasSize.h);
  }, [units, canvasSize, revealProgress, hasStarted]);

  // ── Reset on text change ──
  useEffect(() => {
    setRevealProgress(0);
    setHasStarted(false);
    setIsRecording(false);
    setStopping(false);
    hasStartedRef.current = false;
    if (recordingRef.current) {
      stopCanvasRecording(recordingRef.current);
      recordingRef.current = null;
    }
  }, [text]);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        stopCanvasRecording(recordingRef.current);
        recordingRef.current = null;
      }
    };
  }, []);

  // ── Slider interaction ──
  const getProgressFromX = (clientX) => {
    const layout = layoutRef.current;
    if (!layout || layout.pillTotalW <= 0) return 0;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(1, (x - layout.sliderStartX) / layout.pillTotalW));
  };

  const handlePointerDown = async (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);

    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      setHasStarted(true);
      try {
        recordingRef.current = await startCanvasRecording(canvasRef.current);
        setIsRecording(true);
      } catch (err) {
        console.warn('Recording failed:', err);
      }
    }
    setRevealProgress(getProgressFromX(e.clientX));
  };

  const handlePointerMove = (e) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    setRevealProgress(getProgressFromX(e.clientX));
  };

  const handlePointerUp = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
  };

  // ── Stop ──
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
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 shrink-0" style={{ background: '#1a1a2e', borderBottom: '2px solid #4338ca' }}>
        <button onClick={() => { if (recordingRef.current) { stopCanvasRecording(recordingRef.current); recordingRef.current = null; } onBack?.(); }}
          className="text-indigo-300 hover:text-white font-bold text-sm">
          ← Back
        </button>
        {isRecording && (
          <span className="flex items-center gap-1.5 ml-auto">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 font-bold text-xs">REC</span>
          </span>
        )}
      </div>

      {/* Canvas — text + pills + slider all rendered here */}
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

      {/* Stop button (HTML, below canvas) */}
      <div className="shrink-0 px-4 pb-4 pt-2" style={{ background: '#1a1a2e' }}>
        {isRecording && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleStop}
            disabled={stopping}
            className="w-full py-3 rounded-xl font-black text-white text-sm shadow-lg disabled:opacity-50"
            style={{ background: '#dc2626' }}
          >
            {stopping ? '⏳ Stopping…' : '⏹ Stop & Grade'}
          </motion.button>
        )}
        {hasStarted && !isRecording && !stopping && (
          <div className="text-center py-3 text-indigo-300 font-bold text-sm">✅ Done! Saving…</div>
        )}
        {!hasStarted && (
          <div className="text-center py-3 text-indigo-400 font-bold text-sm">
            👆 Drag the blue slider to start reading
          </div>
        )}
      </div>
    </div>
  );
}