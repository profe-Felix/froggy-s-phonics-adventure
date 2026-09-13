import React, { useRef, useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { parseText } from './phonetics';
import { AUDIO_BASE, playTts } from '@/lib/audio';

// ── Colors (white bg, black text) ─────────────────────────────────────────────
const THEMES = {
  default: { bg: '#ffffff', textRevealed: '#000000', textUnrevealed: '#d3d3d3' },
  mint: { bg: '#d1f7e6', textRevealed: '#0e1133', textUnrevealed: '#a3c9bd' },
};
const PILL_COLORS = { green: '#008000', red: '#ff0000', grey: '#999999' };
const SLIDER_TRACK = '#d3d3d3';
const SLIDER_FILLED = '#007bff';
const THUMB_COLOR = '#007bff';
// Spanish reading items live under the matching category by item id:
// sentence items → es/sentences, word/syllable items → es/words.
function playAudioById(id, itemType) {
  if (!id) return;
  const category = itemType === 'sentence' ? 'sentences' : 'words';
  const base = `${AUDIO_BASE}/es/${category}`;
  const candidates = [`${base}/${id}.mp3`, `${base}/${id}.wav`];
  let i = 0;
  const tryNext = () => {
    if (i >= candidates.length) return;
    const a = new Audio(candidates[i++]);
    a.onerror = tryNext;
    a.play().catch(() => {});
  };
  tryNext();
}

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

// ── Word wrapping (never splits words) ───────────────────────────────────────
function splitWords(units) {
  const words = [];
  let current = [];
  for (const u of units) {
    if (u.type === 'space') {
      if (current.length > 0) { words.push({ units: current, space: u }); current = []; }
    } else { current.push(u); }
  }
  if (current.length > 0) words.push({ units: current, space: null });
  return words;
}

function wrapLines(ctx, units, maxWidth, fontSize) {
  ctx.font = `bold ${fontSize}px Andika, sans-serif`;
  const words = splitWords(units);
  const lines = [];
  let line = [], lineW = 0;
  for (const word of words) {
    const wordW = word.units.reduce((s, u) => s + ctx.measureText(u.text).width, 0);
    const spaceW = word.space ? ctx.measureText(word.space.text).width : 0;
    const totalW = wordW + spaceW;
    if (line.length === 0 || lineW + totalW <= maxWidth) {
      line.push(...word.units);
      if (word.space) line.push(word.space);
      lineW += totalW;
    } else {
      lines.push(line);
      line = [...word.units];
      if (word.space) line.push(word.space);
      lineW = totalW;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

// ── Layout ───────────────────────────────────────────────────────────────────
// Each line reserves space below it for the pill + slider cluster so the
// interactive elements sit directly under the active line without overlap.
function calculateLayout(ctx, units, canvasW, canvasH) {
  const padding = Math.max(16, canvasW * 0.06);
  const contentW = canvasW - padding * 2;

  const pillH = Math.max(6, canvasH * 0.014);
  const sliderH = Math.max(4, canvasH * 0.008);
  const thumbR = Math.max(12, canvasH * 0.022);
  // vertical space reserved under each line for the slider cluster
  const clusterSpace = pillH + sliderH + thumbR * 2 + Math.max(6, canvasH * 0.01);

  let fontSize = 16, lines = null, lineHeight = 22;
  const maxFs = Math.min(140, canvasH * 0.45, contentW * 0.28);
  for (let fs = maxFs; fs >= 14; fs -= 1) {
    const wrapped = wrapLines(ctx, units, contentW, fs);
    const lh = fs * 1.35 + clusterSpace;
    if (wrapped.length * lh <= canvasH - padding * 2) { fontSize = fs; lines = wrapped; lineHeight = lh; break; }
  }
  if (!lines) { lines = wrapLines(ctx, units, contentW, 14); lineHeight = 14 * 1.35 + clusterSpace; fontSize = 14; }

  ctx.font = `bold ${fontSize}px Andika, sans-serif`;

  const lineData = lines.map(line => {
    const lineWidth = line.reduce((s, u) => s + ctx.measureText(u.text).width, 0);
    const startX = (canvasW - lineWidth) / 2;
    const tokenPositions = [];
    let x = startX, tokIdx = 0;
    for (const unit of line) {
      const w = ctx.measureText(unit.text).width;
      if (unit.type === 'token') {
        tokenPositions.push({ unit, x, width: w, tokenIdx: tokIdx });
        tokIdx++;
      }
      x += w;
    }
    return { units: line, tokenPositions, tokenCount: tokIdx, width: lineWidth, startX };
  });

  // Vertically center the whole text block
  const blockH = lineData.length * lineHeight;
  const textStartY = Math.max(padding + fontSize, (canvasH - blockH) / 2 + fontSize);

  const totalTokens = lineData.reduce((s, l) => s + l.tokenCount, 0);

  return {
    fontSize, lineHeight, padding, contentW,
    lines: lineData, totalTokens, textStartY,
    pillH, sliderH, thumbR, clusterSpace, canvasW, canvasH,
  };
}

// ── Pill layout for active line (exact text coordinates) ──────────────────────
function getPillLayout(layout, activeLineIdx) {
  const line = layout.lines[activeLineIdx];
  if (!line || line.tokenPositions.length === 0) return null;

  const positions = line.tokenPositions.map(tp => ({
    x: tp.x,
    width: tp.width,
    rightEdge: tp.x + tp.width,
    unit: tp.unit,
    tokenIdx: tp.tokenIdx,
    color: tp.unit.chars[0]?.color || 'green',
  }));

  const startX = positions[0].x;
  const endX = positions[positions.length - 1].rightEdge;
  return { positions, startX, endX, totalW: endX - startX };
}

// Position pills + slider directly under the active text line
function getClusterY(layout, activeLineIdx) {
  const lineTopY = layout.textStartY - layout.fontSize + activeLineIdx * layout.lineHeight;
  const textBottomY = lineTopY + layout.fontSize;
  const gap = Math.max(4, layout.fontSize * 0.2);
  const pillY = textBottomY + gap;
  const sliderY = pillY + layout.pillH + gap;
  return { pillY, sliderY, textBottomY };
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderCanvas(ctx, layout, activeLine, thumbX, isRecording, canvasW, canvasH, theme = 'default') {
  const tc = THEMES[theme] || THEMES.default;
  ctx.fillStyle = tc.bg;
  ctx.fillRect(0, 0, canvasW, canvasH);
  if (!layout) return;

  const { fontSize, lineHeight, lines, textStartY, padding } = layout;

  // Determine revealed count: token is revealed when thumb reaches its LEFT edge
  const pillLayout = getPillLayout(layout, activeLine);
  let revealedCount = 0;
  if (isRecording && pillLayout && thumbX !== null) {
    for (const pos of pillLayout.positions) {
      if (thumbX >= pos.x) revealedCount++;
    }
  }

  ctx.font = `bold ${fontSize}px Andika, sans-serif`;

  // ── Text lines ──
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const y = textStartY + li * lineHeight;
    let x = line.startX;
    let tokIdx = 0;
    let prevRevealed = li < activeLine;

    for (const unit of line.units) {
      const w = ctx.measureText(unit.text).width;
      if (unit.type === 'token') {
        const isRevealed = li < activeLine || (li === activeLine && tokIdx < revealedCount);
        ctx.fillStyle = isRevealed ? tc.textRevealed : tc.textUnrevealed;
        ctx.fillText(unit.text, x, y);
        prevRevealed = isRevealed;
        tokIdx++;
      } else {
        ctx.fillStyle = prevRevealed ? tc.textRevealed : tc.textUnrevealed;
        ctx.fillText(unit.text, x, y);
      }
      x += w;
    }
  }

  // ── Idle hint ──
  if (!isRecording) {
    ctx.fillStyle = '#6c757d';
    ctx.font = `bold ${Math.min(16, canvasW * 0.035)}px Andika, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Press "Start Recording" then drag to read', canvasW / 2, canvasH - padding - 20);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    return;
  }

  // ── Pills + Slider (directly under active line) ──
  if (!pillLayout) return;
  const { pillY, pillH, sliderY, sliderH, thumbR } = { ...layout, ...getClusterY(layout, activeLine) };
  const { startX, endX, totalW, positions } = pillLayout;
  const currentThumbX = thumbX !== null ? thumbX : startX;

  // Pills
  const inset = Math.min(1.5, pillH * 0.15);
  for (const pos of positions) {
    const isRevealed = pos.tokenIdx < revealedCount;
    const color = PILL_COLORS[pos.color] || PILL_COLORS.green;
    if (isRevealed) {
      ctx.fillStyle = color;
      roundRect(ctx, pos.x + inset, pillY, pos.width - inset * 2, pillH, pillH / 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      roundRect(ctx, pos.x + inset, pillY, pos.width - inset * 2, pillH, pillH / 2);
      ctx.stroke();
    }
  }

  // Slider track
  ctx.fillStyle = SLIDER_TRACK;
  roundRect(ctx, startX, sliderY, totalW, sliderH, sliderH / 2);
  ctx.fill();

  // Filled portion
  if (currentThumbX > startX) {
    ctx.fillStyle = SLIDER_FILLED;
    roundRect(ctx, startX, sliderY, Math.max(thumbR * 0.5, currentThumbX - startX), sliderH, sliderH / 2);
    ctx.fill();
  }

  // Thumb (exactly at finger position)
  ctx.fillStyle = THUMB_COLOR;
  ctx.beginPath();
  ctx.arc(currentThumbX, sliderY + sliderH / 2, thumbR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(currentThumbX, sliderY + sliderH / 2, thumbR * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

// ── Recording helpers ────────────────────────────────────────────────────────
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
    recorder.onerror = () => resolve(null);
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

// ── Component ────────────────────────────────────────────────────────────────
export default function SlideToReadCanvas({ text, itemId, itemType, onGrade, onBack, theme = 'default' }) {
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [recordingState, setRecordingState] = useState('idle');
  const [activeLine, setActiveLine] = useState(0);
  const [thumbX, setThumbX] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState(null);
  const [reviewUrl, setReviewUrl] = useState(null);
  const [playingRecording, setPlayingRecording] = useState(false);
  const [saving, setSaving] = useState(false);

  const recordingRef = useRef(null);
  const layoutRef = useRef(null);
  const ctxRef = useRef(null);
  const draggingRef = useRef(false);
  const activeLineRef = useRef(0);
  const thumbXRef = useRef(null);
  const recordingStateRef = useRef('idle');
  const advanceDirRef = useRef(0);

  const units = useMemo(() => parseText(text), [text]);

  useEffect(() => { activeLineRef.current = activeLine; }, [activeLine]);
  useEffect(() => { thumbXRef.current = thumbX; }, [thumbX]);
  useEffect(() => { recordingStateRef.current = recordingState; }, [recordingState]);

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
    renderCanvas(ctx, layoutRef.current, activeLine, thumbX, recordingState === 'recording' || recordingState === 'review', canvasSize.w, canvasSize.h, theme);
  }, [units, canvasSize, activeLine, thumbX, recordingState]);

  // ── Reset on text change ──
  useEffect(() => {
    setRecordingState('idle'); setActiveLine(0); setThumbX(null); setDragging(false);
    advanceDirRef.current = 0;
    activeLineRef.current = 0; thumbXRef.current = null; recordingStateRef.current = 'idle';
    if (recordingRef.current) { stopCanvasRecording(recordingRef.current); recordingRef.current = null; }
    if (reviewUrl) { URL.revokeObjectURL(reviewUrl); setReviewUrl(null); }
    setRecordingBlob(null);
    setSaving(false);
  }, [text]);

  // ── Cleanup ──
  useEffect(() => () => {
    if (recordingRef.current) { stopCanvasRecording(recordingRef.current); recordingRef.current = null; }
  }, []);

  const handlePlayAudio = async () => {
    setPlaying(true);
    try {
      if (itemId) {
        playAudioById(itemId, itemType);
        setTimeout(() => setPlaying(false), 2000);
      } else {
        await playTts(text, 'es', 0.85);
        setPlaying(false);
      }
    } catch { setPlaying(false); }
  };

  // ── Start recording (interaction reveals regardless of media success) ──
  const handleStartRecording = async () => {
    // Enter interactive mode immediately so slider/pills show
    setRecordingState('recording');
    recordingStateRef.current = 'recording';
    const layout = layoutRef.current;
    if (layout) {
      const pillLayout = getPillLayout(layout, 0);
      setThumbX(pillLayout ? pillLayout.startX : 0);
      thumbXRef.current = pillLayout ? pillLayout.startX : 0;
    }
    // Best-effort media capture — if it fails, interaction still works
    try {
      recordingRef.current = await startCanvasRecording(canvasRef.current);
    } catch (err) {
      console.warn('Media recording unavailable, continuing without it:', err);
      recordingRef.current = null;
    }
  };

  // ── Stop recording — enter review mode (compact bar, no page change) ──
  const handleStop = async () => {
    setRecordingState('stopping');
    recordingStateRef.current = 'stopping';
    const blob = await stopCanvasRecording(recordingRef.current);
    recordingRef.current = null;
    if (blob) {
      setReviewUrl(URL.createObjectURL(blob));
      setRecordingBlob(blob);
      setRecordingState('review');
      recordingStateRef.current = 'review';
    } else {
      setRecordingState('idle');
      recordingStateRef.current = 'idle';
    }
  };

  // ── Review helpers (compact in-place bar — no separate screen) ──
  const playReviewRecording = () => {
    if (!reviewUrl) return;
    setPlayingRecording(true);
    const v = document.createElement('video');
    v.src = reviewUrl;
    v.style.display = 'none';
    document.body.appendChild(v);
    v.play().catch(() => {});
    const done = () => { v.remove(); setPlayingRecording(false); };
    v.onended = done;
    v.onerror = done;
  };

  const handleGrade = async (grade) => {
    if (saving) return;
    setSaving(true);
    try { await onGrade?.(grade, recordingBlob); } finally { setSaving(false); }
  };

  const handleRerecord = () => {
    if (reviewUrl) { URL.revokeObjectURL(reviewUrl); setReviewUrl(null); }
    setRecordingBlob(null);
    setRecordingState('idle');
    recordingStateRef.current = 'idle';
    setActiveLine(0);
    setThumbX(null);
    activeLineRef.current = 0;
    thumbXRef.current = null;
  };

  // ── Thumb update (absolute finger tracking) ──
  const updateThumb = (clientX) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const pillLayout = getPillLayout(layout, activeLineRef.current);
    if (!pillLayout) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const { startX, endX, totalW } = pillLayout;

    if (advanceDirRef.current === 1) {
      if (x < startX + totalW * 0.5) {
        advanceDirRef.current = 0;
        setThumbX(Math.max(startX, Math.min(endX, x)));
      }
      return;
    }
    if (advanceDirRef.current === -1) {
      if (x > startX + totalW * 0.5) {
        advanceDirRef.current = 0;
        setThumbX(Math.max(startX, Math.min(endX, x)));
      }
      return;
    }

    const newThumbX = Math.max(startX, Math.min(endX, x));

    if (newThumbX >= endX - 1 && activeLineRef.current < layout.lines.length - 1) {
      const nextLine = activeLineRef.current + 1;
      const nextPillLayout = getPillLayout(layout, nextLine);
      setActiveLine(nextLine);
      activeLineRef.current = nextLine;
      setThumbX(nextPillLayout ? nextPillLayout.startX : newThumbX);
      thumbXRef.current = nextPillLayout ? nextPillLayout.startX : newThumbX;
      advanceDirRef.current = 1;
      return;
    }

    if (newThumbX <= startX + 1 && activeLineRef.current > 0) {
      const prevLine = activeLineRef.current - 1;
      const prevPillLayout = getPillLayout(layout, prevLine);
      setActiveLine(prevLine);
      activeLineRef.current = prevLine;
      setThumbX(prevPillLayout ? prevPillLayout.endX : newThumbX);
      thumbXRef.current = prevPillLayout ? prevPillLayout.endX : newThumbX;
      advanceDirRef.current = -1;
      return;
    }

    setThumbX(newThumbX);
    thumbXRef.current = newThumbX;
  };

  const handlePointerDown = (e) => {
    if (recordingStateRef.current !== 'recording') return;
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
    updateThumb(e.clientX);
  };

  const handlePointerMove = (e) => {
    if (!draggingRef.current || recordingStateRef.current !== 'recording') return;
    e.preventDefault();
    updateThumb(e.clientX);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
    setDragging(false);
  };

  return (
    <div className="flex flex-col h-full" style={{ background: (THEMES[theme] || THEMES.default).bg }}>
      {/* Header — no back button; parent SpanishReadingGame handles navigation. */}
      <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2 sm:py-2.5 shrink-0 border-b-2" style={{ background: '#f8f9fa', borderColor: '#007bff' }}>
        {itemId && (
          <button onClick={handlePlayAudio}
            className={`ml-auto w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-base sm:text-xl shadow transition-all active:scale-95 ${playing ? 'bg-rose-500 scale-110' : 'bg-rose-400 hover:bg-rose-500'}`}
            title="Escucha la palabra/oración">
            🔊
          </button>
        )}
        {recordingState === 'recording' && (
          <span className="flex items-center gap-1.5 ml-1">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-500 font-bold text-xs">REC</span>
          </span>
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'none', cursor: recordingState === 'recording' ? (dragging ? 'grabbing' : 'pointer') : 'default' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>

      {/* Controls */}
      <div className="shrink-0 px-2 sm:px-4 pb-3 sm:pb-4 pt-2" style={{ background: '#f8f9fa' }}>
        {recordingState === 'idle' && (
          <motion.button whileTap={{ scale: 0.95 }} onClick={handleStartRecording}
            className="w-full py-2.5 sm:py-3 rounded-xl font-black text-white text-sm shadow-lg"
            style={{ background: '#007bff' }}>
            🔴 Start Recording
          </motion.button>
        )}
        {recordingState === 'recording' && (
          <motion.button whileTap={{ scale: 0.95 }} onClick={handleStop}
            className="w-full py-2.5 sm:py-3 rounded-xl font-black text-white text-sm shadow-lg"
            style={{ background: '#dc2626' }}>
            ⏹ Stop & Grade
          </motion.button>
        )}
        {recordingState === 'stopping' && (
          <div className="text-center py-3 text-gray-500 font-bold text-sm">⏳ Stopping…</div>
        )}
        {recordingState === 'review' && (
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
            <button onClick={playReviewRecording} disabled={playingRecording}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-white text-sm shadow transition active:scale-95 ${playingRecording ? 'opacity-60' : ''}`}
              style={{ background: '#007bff' }}>
              {playingRecording ? '⏸ Playing…' : '▶ Review'}
            </button>
            <button onClick={handlePlayAudio} disabled={playing}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-white text-sm shadow transition active:scale-95 ${playing ? 'opacity-60' : ''}`}
              style={{ background: '#f87171' }}>
              🔊 Listen
            </button>
            <button onClick={handleRerecord}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-gray-700 text-sm shadow transition active:scale-95"
              style={{ background: '#e5e7eb' }}>
              🔄 Redo
            </button>
            <div className="flex-1 min-w-2" />
            <button onClick={() => handleGrade('correct')} disabled={saving}
              className={`flex items-center justify-center px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-black text-white text-lg shadow transition active:scale-95 ${saving ? 'opacity-60' : ''}`}
              style={{ background: '#16a34a' }}>
              👍
            </button>
            <button onClick={() => handleGrade('incorrect')} disabled={saving}
              className={`flex items-center justify-center px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-black text-white text-lg shadow transition active:scale-95 ${saving ? 'opacity-60' : ''}`}
              style={{ background: '#dc2626' }}>
              👎
            </button>
          </div>
        )}
      </div>
    </div>
  );
}