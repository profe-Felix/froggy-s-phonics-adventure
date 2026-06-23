import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseText } from './phonetics';

// ── Colors ──────────────────────────────────────────────────────────────────
const COLORS = {
  green: '#22c55e',    // continuous / voiced / soft
  red: '#ef4444',       // stop / plosive / hard
  grey: '#6b7280',     // silent letter (revealed)
  unrevealed: '#d1d5db', // not yet read
};

const BG_COLOR = '#0f0f1a';

// ── Font size auto-fit ──────────────────────────────────────────────────────
function calculateLayout(ctx, units, canvasW, canvasH) {
  const padding = Math.max(24, canvasW * 0.06);
  const maxW = canvasW - padding * 2;
  const maxH = canvasH - padding * 2;
  const startSize = Math.min(maxH * 0.35, maxW * 0.25, 100);

  for (let fontSize = startSize; fontSize >= 18; fontSize -= 2) {
    ctx.font = `bold ${fontSize}px Lexend, sans-serif`;
    const lineHeight = fontSize * 1.4;

    const lines = [];
    let currentLine = [];
    let currentW = 0;

    for (const unit of units) {
      const unitW = ctx.measureText(unit.text).width;
      if (currentW + unitW > maxW && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = [];
        currentW = 0;
      }
      currentLine.push({ unit, width: unitW });
      currentW += unitW;
    }
    if (currentLine.length > 0) lines.push(currentLine);

    if (lines.length * lineHeight <= maxH) {
      return { fontSize, lines, lineHeight, totalH: lines.length * lineHeight };
    }
  }

  // Fallback: minimum size
  ctx.font = 'bold 18px Lexend, sans-serif';
  const lines = [];
  let currentLine = [];
  let currentW = 0;
  for (const unit of units) {
    const unitW = ctx.measureText(unit.text).width;
    if (currentW + unitW > maxW && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [];
      currentW = 0;
    }
    currentLine.push({ unit, width: unitW });
    currentW += unitW;
  }
  if (currentLine.length > 0) lines.push(currentLine);
  return { fontSize: 18, lines, lineHeight: 25, totalH: lines.length * 25 };
}

// ── Canvas rendering ────────────────────────────────────────────────────────
function renderCanvas(ctx, layout, revealProgress, hasStarted, canvasW, canvasH) {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvasW, canvasH);

  if (!hasStarted || !layout) {
    ctx.fillStyle = '#4b5563';
    ctx.font = 'bold 20px Lexend, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👉 Arrastra el control para leer', canvasW / 2, canvasH / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return;
  }

  const { fontSize, lines, lineHeight } = layout;
  ctx.font = `bold ${fontSize}px Lexend, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const totalUnits = lines.flat().length;
  const revealedCount = Math.ceil(revealProgress * totalUnits);

  const startY = (canvasH - layout.totalH) / 2 + fontSize * 0.85;
  let unitIndex = 0;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const y = startY + li * lineHeight;
    const lineWidth = line.reduce((s, { width }) => s + width, 0);
    let x = (canvasW - lineWidth) / 2;

    for (const { unit, width } of line) {
      const isRevealed = unitIndex < revealedCount;

      if (isRevealed) {
        // Check if all chars in unit have the same color
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

      x += width;
      unitIndex++;
    }
  }
}

// ── MediaRecorder helpers ───────────────────────────────────────────────────
function getSupportedMimeType() {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
    'video/ogg',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

async function startCanvasRecording(canvas) {
  const fps = 30;
  const canvasStream = canvas.captureStream(fps);

  let audioStream = null;
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    // Audio denied — continue with video only
  }

  const tracks = [...canvasStream.getVideoTracks()];
  if (audioStream) tracks.push(...audioStream.getAudioTracks());
  const combinedStream = new MediaStream(tracks);

  const mimeType = getSupportedMimeType();
  const recorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  return new Promise((resolve) => {
    recorder.onstart = () => resolve({
      recorder,
      chunks,
      audioStream,
      canvasStream,
    });
    recorder.start();
  });
}

function stopCanvasRecording(recording) {
  return new Promise((resolve) => {
    if (!recording) return resolve(null);
    recording.recorder.onstop = () => {
      const blob = new Blob(recording.chunks, {
        type: recording.recorder.mimeType || 'video/webm',
      });
      recording.audioStream?.getTracks().forEach(t => t.stop());
      recording.canvasStream?.getTracks().forEach(t => t.stop());
      resolve(blob);
    };
    recording.recorder.stop();
  });
}

// ── Main component ──────────────────────────────────────────────────────────
export default function SlideToReadCanvas({ text, onRecordingComplete, onBack }) {
  const canvasRef = useRef(null);
  const sliderRef = useRef(null);
  const containerRef = useRef(null);

  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [revealProgress, setRevealProgress] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [stopping, setStopping] = useState(false);

  const recordingRef = useRef(null);
  const layoutRef = useRef(null);
  const ctxRef = useRef(null);

  const units = useMemo(() => parseText(text), [text]);

  // ── Canvas size observer ──────────────────────────────────────────────────
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

  // ── Layout + render ─────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || canvasSize.w === 0) return;

    layoutRef.current = calculateLayout(ctx, units, canvasSize.w, canvasSize.h);
    renderCanvas(ctx, layoutRef.current, revealProgress, hasStarted, canvasSize.w, canvasSize.h);
  }, [units, canvasSize, revealProgress, hasStarted]);

  // ── Reset on text change ───────────────────────────────────────────────────
  useEffect(() => {
    setRevealProgress(0);
    setHasStarted(false);
    setIsRecording(false);
    setStopping(false);
    // Clean up any active recording
    if (recordingRef.current) {
      stopCanvasRecording(recordingRef.current);
      recordingRef.current = null;
    }
  }, [text]);

  // ── Slider interaction ─────────────────────────────────────────────────────
  const updateProgress = useCallback((clientX) => {
    const slider = sliderRef.current;
    if (!slider) return;
    const rect = slider.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setRevealProgress(progress);
  }, []);

  const handlePointerDown = async (e) => {
    e.preventDefault();
    setDragging(true);
    e.target.setPointerCapture(e.pointerId);

    if (!hasStarted) {
      setHasStarted(true);
      // Start recording
      try {
        recordingRef.current = await startCanvasRecording(canvasRef.current);
        setIsRecording(true);
      } catch (err) {
        console.warn('Failed to start recording:', err);
      }
    }
    updateProgress(e.clientX);
  };

  const handlePointerMove = (e) => {
    if (!dragging) return;
    e.preventDefault();
    updateProgress(e.clientX);
  };

  const handlePointerUp = (e) => {
    if (!dragging) return;
    setDragging(false);
    // Do NOT stop recording — only Stop/Next buttons do that
  };

  // ── Stop recording ──────────────────────────────────────────────────────────
  const handleStop = async () => {
    if (!recordingRef.current) return;
    setStopping(true);
    const blob = await stopCanvasRecording(recordingRef.current);
    recordingRef.current = null;
    setIsRecording(false);
    setStopping(false);
    onRecordingComplete(blob);
  };

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        stopCanvasRecording(recordingRef.current);
        recordingRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: BG_COLOR }} ref={containerRef}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 shrink-0" style={{ background: '#1a1a2e', borderBottom: '2px solid #4338ca' }}>
        <button onClick={() => { handleStop(); onBack?.(); }} className="text-indigo-300 hover:text-white font-bold text-sm">
          ← Back
        </button>
        {isRecording && (
          <span className="flex items-center gap-1.5 ml-auto">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 font-bold text-xs">REC</span>
          </span>
        )}
      </div>

      {/* Canvas text area */}
      <div className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'none' }}
        />
      </div>

      {/* Slider */}
      <div className="shrink-0 px-6 pb-3 pt-2" style={{ background: '#1a1a2e' }}>
        <div
          ref={sliderRef}
          className="relative h-12 flex items-center touch-none"
          style={{ touchAction: 'none', cursor: dragging ? 'grabbing' : 'pointer' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Track */}
          <div className="absolute left-0 right-0 h-2.5 rounded-full" style={{ background: '#374151' }} />
          {/* Filled portion */}
          <div
            className="absolute left-0 h-2.5 rounded-full transition-all"
            style={{ width: `${revealProgress * 100}%`, background: 'linear-gradient(90deg, #4338ca, #6366f1)' }}
          />
          {/* Pill */}
          <motion.div
            className="absolute w-11 h-11 rounded-full flex items-center justify-center shadow-lg"
            style={{
              left: `calc(${revealProgress * 100}% - 22px)`,
              background: 'white',
              border: '4px solid #4338ca',
            }}
            animate={{ scale: dragging ? 1.15 : 1 }}
          >
            <span className="text-lg">{hasStarted ? '👉' : '▶'}</span>
          </motion.div>
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 px-4 pb-4 flex gap-3" style={{ background: '#1a1a2e' }}>
        {isRecording && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleStop}
            disabled={stopping}
            className="flex-1 py-3 rounded-xl font-black text-white text-sm shadow-lg disabled:opacity-50"
            style={{ background: '#dc2626' }}
          >
            {stopping ? '⏳ Stopping…' : '⏹ Stop & Grade'}
          </motion.button>
        )}
        {hasStarted && !isRecording && !stopping && (
          <div className="flex-1 text-center py-3 text-indigo-300 font-bold text-sm">
            ✅ Done! Saving…
          </div>
        )}
        {!hasStarted && (
          <div className="flex-1 text-center py-3 text-indigo-400 font-bold text-sm">
            👆 Drag the slider above to start reading
          </div>
        )}
      </div>
    </div>
  );
}