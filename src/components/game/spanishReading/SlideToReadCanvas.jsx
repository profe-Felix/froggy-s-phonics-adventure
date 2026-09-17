import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Mic, Headphones } from 'lucide-react';
import { parseText } from './phonetics';
import { AUDIO_BASE, playTts } from '@/lib/audio';
import { useLiveVoice } from '@/hooks/useLiveVoice';

// ── Colors (white bg, black text) ─────────────────────────────────────────────
const THEMES = {
  default: { bg: '#ffffff', textRevealed: '#000000', textUnrevealed: '#d3d3d3' },
  mint: { bg: '#d1f7e6', textRevealed: '#0e1133', textUnrevealed: '#a3c9bd' },
};
const PILL_COLORS = { green: '#008000', red: '#ff0000', grey: '#999999' };
const SLIDER_TRACK = '#d3d3d3';
const SLIDER_FILLED = '#007bff';
const THUMB_COLOR = '#007bff';

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
function calculateLayout(ctx, units, canvasW, canvasH) {
  const padding = Math.max(16, canvasW * 0.06);
  const contentW = canvasW - padding * 2;

  const pillH = Math.max(6, canvasH * 0.014);
  const sliderH = Math.max(4, canvasH * 0.008);
  const thumbR = Math.max(12, canvasH * 0.022);
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

function getClusterY(layout, activeLineIdx) {
  const lineTopY = layout.textStartY - layout.fontSize + activeLineIdx * layout.lineHeight;
  const textBottomY = lineTopY + layout.fontSize;
  const gap = Math.max(4, layout.fontSize * 0.2);
  const pillY = textBottomY + gap;
  const sliderY = pillY + layout.pillH + gap;
  return { pillY, sliderY, textBottomY };
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderCanvas(ctx, layout, activeLine, thumbX, isRecording, canvasW, canvasH, theme = 'default', inkContinuity = 0, replayContinuity = null) {
  const tc = THEMES[theme] || THEMES.default;
  ctx.fillStyle = tc.bg;
  ctx.fillRect(0, 0, canvasW, canvasH);
  if (!layout) return;

  const { fontSize, lineHeight, lines, textStartY, padding } = layout;

  const pillLayout = getPillLayout(layout, activeLine);
  let revealedCount = 0;
  if (isRecording && pillLayout && thumbX !== null) {
    for (const pos of pillLayout.positions) {
      if (thumbX > pos.x) revealedCount++;
    }
  }

  ctx.font = `bold ${fontSize}px Andika, sans-serif`;

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

  if (!pillLayout) return;
  const { pillY, pillH, sliderY, sliderH, thumbR } = { ...layout, ...getClusterY(layout, activeLine) };
  const { startX, endX, totalW, positions } = pillLayout;
  const currentThumbX = thumbX !== null ? thumbX : startX;

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

  ctx.fillStyle = SLIDER_TRACK;
  roundRect(ctx, startX, sliderY, totalW, sliderH, sliderH / 2);
  ctx.fill();

  if (currentThumbX > startX) {
    ctx.fillStyle = SLIDER_FILLED;
    roundRect(ctx, startX, sliderY, Math.max(thumbR * 0.5, currentThumbX - startX), sliderH, sliderH / 2);
    ctx.fill();
  }

  ctx.fillStyle = THUMB_COLOR;
  ctx.beginPath();
  ctx.arc(currentThumbX, sliderY + sliderH / 2, thumbR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(currentThumbX, sliderY + sliderH / 2, thumbR * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // ── Ink fill overlay on active line (mic monitoring) ──
  // Draws a semi-transparent ink wash over the active line's text area.
  // The fill height rises from the bottom based on voice continuity (0-1).
  // When the student pauses, continuity drops and the ink level falls.
  const inkLevel = replayContinuity != null ? replayContinuity : (inkContinuity || 0);
  if (inkLevel > 0.1 && layout.lines[activeLine]) {
    const line = layout.lines[activeLine];
    const lineTopY = layout.textStartY - layout.fontSize + activeLine * layout.lineHeight;
    const textBottomY = lineTopY + layout.fontSize;
    const textHeight = layout.fontSize;
    const inkHeight = textHeight * Math.min(1, inkLevel);

    // Draw ink fill as a semi-transparent overlay on the text bounds
    ctx.save();
    ctx.fillStyle = 'rgba(82, 213, 198, 0.28)'; // teal ink wash
    ctx.fillRect(line.startX, textBottomY - inkHeight, line.width, inkHeight);
    ctx.restore();
  }
}

// ── Audio-only recording (no video — avoids CORS + payload size limits) ───────
function getSupportedAudioMimeType() {
  for (const t of ['audio/webm', 'audio/ogg', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

async function startAudioRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = getSupportedAudioMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  return new Promise(resolve => {
    recorder.onstart = () => resolve({ recorder, chunks, stream });
    recorder.onerror = () => resolve(null);
    recorder.start(100);
  });
}

function stopAudioRecording(rec) {
  return new Promise(resolve => {
    if (!rec) return resolve(null);
    rec.recorder.onstop = () => {
      const blob = new Blob(rec.chunks, { type: rec.recorder.mimeType || 'audio/webm' });
      rec.stream?.getTracks().forEach(t => t.stop());
      resolve(blob);
    };
    rec.recorder.stop();
  });
}

// ── Replay: animate slider from recorded keyframes synced to audio ────────────
function startSliderReplay(audioEl, sliderData, setActiveLine, setThumbX, onDone) {
  if (!sliderData || sliderData.length === 0) {
    audioEl?.play().catch(() => {});
    audioEl?.addEventListener('ended', () => onDone?.());
    return () => {};
  }
  audioEl?.play().catch(() => {});
  let rafId = null;
  const animate = () => {
    if (!audioEl || audioEl.ended) {
      onDone?.();
      return;
    }
    const t = audioEl.currentTime * 1000;
    let prev = sliderData[0], next = sliderData[sliderData.length - 1];
    for (let i = 0; i < sliderData.length - 1; i++) {
      if (sliderData[i].t <= t && sliderData[i + 1].t >= t) {
        prev = sliderData[i];
        next = sliderData[i + 1];
        break;
      }
    }
    const ratio = next.t === prev.t ? 0 : (t - prev.t) / (next.t - prev.t);
    const x = prev.x + (next.x - prev.x) * ratio;
    const line = prev.line + (next.line - prev.line) * ratio;
    setActiveLine(Math.round(line));
    setThumbX(x);
    rafId = requestAnimationFrame(animate);
  };
  rafId = requestAnimationFrame(animate);
  return () => { if (rafId) cancelAnimationFrame(rafId); };
}

// ── Component ────────────────────────────────────────────────────────────────
export default function SlideToReadCanvas({
  text, itemId, itemType, syllables, onGrade, onBack, theme = 'default',
  demoMode = false, onDemoRecorded, teacherMode = false, onSaveModel,
  onRecordingComplete,
  // Replay mode: when replayData ({audioUrl, sliderData, continuityData}) is provided, the canvas
  // shows a Play button and replays the teacher's slider animation + audio + ink fill.
  replayData = null,
  // Mic monitoring: when true, enables voice-activated ink fill on the active line.
  // Students see their text fill with ink as they read; pauses cause the ink to drop.
  micEnabled = false,
}) {
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [recordingState, setRecordingState] = useState('idle');
  const [activeLine, setActiveLine] = useState(0);
  const [thumbX, setThumbX] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [reviewUrl, setReviewUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [showMicToggle, setShowMicToggle] = useState(false);

  // ── Live voice monitoring (ink fill) ──
  const voice = useLiveVoice();
  const { continuity, state: voiceState, hasHeadphones } = voice;

  const recordingRef = useRef(null);
  const layoutRef = useRef(null);
  const ctxRef = useRef(null);
  const draggingRef = useRef(false);
  const activeLineRef = useRef(0);
  const thumbXRef = useRef(null);
  const recordingStateRef = useRef('idle');
  const advanceDirRef = useRef(0);
  const sliderDataRef = useRef([]);
  const recStartTimeRef = useRef(0);
  const replayAudioRef = useRef(null);
  const stopReplayRef = useRef(null);

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
    const showInteractive = recordingState === 'recording' || recordingState === 'review' || isReplaying;
    renderCanvas(ctx, layoutRef.current, activeLine, thumbX, showInteractive, canvasSize.w, canvasSize.h, theme);
  }, [units, canvasSize, activeLine, thumbX, recordingState, isReplaying, theme]);

  // ── Reset on text change ──
  useEffect(() => {
    setRecordingState('idle'); setActiveLine(0); setThumbX(null); setDragging(false);
    advanceDirRef.current = 0;
    activeLineRef.current = 0; thumbXRef.current = null; recordingStateRef.current = 'idle';
    if (recordingRef.current) { stopAudioRecording(recordingRef.current); recordingRef.current = null; }
    if (reviewUrl) { URL.revokeObjectURL(reviewUrl); setReviewUrl(null); }
    setAudioBlob(null);
    setSaving(false);
    setIsReplaying(false);
    sliderDataRef.current = [];
  }, [text]);

  // ── Cleanup ──
  useEffect(() => () => {
    if (recordingRef.current) { stopAudioRecording(recordingRef.current); recordingRef.current = null; }
    if (stopReplayRef.current) { stopReplayRef.current(); stopReplayRef.current = null; }
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
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

  // ── Start recording (audio-only + slider data capture) ──
  const handleStartRecording = async () => {
    setRecordingState('recording');
    recordingStateRef.current = 'recording';
    sliderDataRef.current = [];
    const layout = layoutRef.current;
    if (layout) {
      const pillLayout = getPillLayout(layout, 0);
      setThumbX(pillLayout ? pillLayout.startX : 0);
      thumbXRef.current = pillLayout ? pillLayout.startX : 0;
    }
    try {
      recordingRef.current = await startAudioRecording();
      recStartTimeRef.current = Date.now();
      // Record initial slider position
      sliderDataRef.current.push({ t: 0, x: thumbXRef.current || 0, line: 0 });
    } catch (err) {
      console.warn('Audio recording unavailable:', err);
      recordingRef.current = null;
    }
  };

  // ── Stop recording — enter review mode ──
  const handleStop = async () => {
    setRecordingState('stopping');
    recordingStateRef.current = 'stopping';
    // Record final position
    sliderDataRef.current.push({
      t: Date.now() - recStartTimeRef.current,
      x: thumbXRef.current || 0,
      line: activeLineRef.current,
    });
    const blob = await stopAudioRecording(recordingRef.current);
    recordingRef.current = null;
    if (blob) {
      setReviewUrl(URL.createObjectURL(blob));
      setAudioBlob(blob);
      setRecordingState('review');
      recordingStateRef.current = 'review';
      onRecordingComplete?.({ audioBlob: blob, sliderData: sliderDataRef.current });
    } else {
      setRecordingState('idle');
      recordingStateRef.current = 'idle';
    }
  };

  // ── Review: replay audio + slider animation on the canvas ──
  const playReviewRecording = () => {
    if (!reviewUrl || !audioBlob) return;
    // Stop any existing replay
    if (stopReplayRef.current) { stopReplayRef.current(); stopReplayRef.current = null; }
    const audio = new Audio(reviewUrl);
    replayAudioRef.current = audio;
    setIsReplaying(true);
    stopReplayRef.current = startSliderReplay(
      audio,
      sliderDataRef.current,
      setActiveLine,
      setThumbX,
      () => {
        setIsReplaying(false);
        stopReplayRef.current = null;
      }
    );
  };

  // ── Replay mode (teacher demo playback) ──
  const handleReplayDemo = () => {
    if (!replayData?.audioUrl) return;
    if (stopReplayRef.current) { stopReplayRef.current(); stopReplayRef.current = null; }
    const audio = new Audio(replayData.audioUrl);
    replayAudioRef.current = audio;
    setIsReplaying(true);
    stopReplayRef.current = startSliderReplay(
      audio,
      replayData.sliderData || [],
      setActiveLine,
      setThumbX,
      () => {
        setIsReplaying(false);
        setActiveLine(0);
        const layout = layoutRef.current;
        if (layout) {
          const pillLayout = getPillLayout(layout, 0);
          setThumbX(pillLayout ? pillLayout.startX : null);
        }
        stopReplayRef.current = null;
      }
    );
  };

  const stopReplay = () => {
    if (stopReplayRef.current) { stopReplayRef.current(); stopReplayRef.current = null; }
    if (replayAudioRef.current) { replayAudioRef.current.pause(); replayAudioRef.current = null; }
    setIsReplaying(false);
  };

  const handleGrade = async (grade) => {
    if (saving) return;
    setSaving(true);
    try { await onGrade?.(grade, { audioBlob, sliderData: sliderDataRef.current }); } finally { setSaving(false); }
  };

  const handleRerecord = () => {
    if (reviewUrl) { URL.revokeObjectURL(reviewUrl); setReviewUrl(null); }
    setAudioBlob(null);
    setRecordingState('idle');
    recordingStateRef.current = 'idle';
    setActiveLine(0);
    setThumbX(null);
    activeLineRef.current = 0;
    thumbXRef.current = null;
    sliderDataRef.current = [];
  };

  // ── Thumb update (absolute finger tracking + slider data capture) ──
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
      if (recordingStateRef.current === 'recording') {
        sliderDataRef.current.push({ t: Date.now() - recStartTimeRef.current, x: nextPillLayout ? nextPillLayout.startX : newThumbX, line: nextLine });
      }
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
      if (recordingStateRef.current === 'recording') {
        sliderDataRef.current.push({ t: Date.now() - recStartTimeRef.current, x: prevPillLayout ? prevPillLayout.endX : newThumbX, line: prevLine });
      }
      return;
    }

    setThumbX(newThumbX);
    thumbXRef.current = newThumbX;
    if (recordingStateRef.current === 'recording') {
      sliderDataRef.current.push({ t: Date.now() - recStartTimeRef.current, x: newThumbX, line: activeLineRef.current });
    }
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

  // ── Replay mode (no recording controls) ──
  if (replayData) {
    return (
      <div className="flex flex-col h-full" style={{ background: (THEMES[theme] || THEMES.default).bg }}>
        <div className="flex-1 relative overflow-hidden">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ touchAction: 'none' }}
          />
        </div>
        <div className="shrink-0 px-2 sm:px-4 pb-3 sm:pb-4 pt-2" style={{ background: '#f8f9fa' }}>
          {!isReplaying ? (
            <motion.button whileTap={{ scale: 0.95 }} onClick={handleReplayDemo}
              className="w-full py-2.5 sm:py-3 rounded-xl font-black text-white text-sm shadow-lg"
              style={{ background: '#007bff' }}>
              ▶ Ver modelo
            </motion.button>
          ) : (
            <motion.button whileTap={{ scale: 0.95 }} onClick={stopReplay}
              className="w-full py-2.5 sm:py-3 rounded-xl font-black text-white text-sm shadow-lg"
              style={{ background: '#dc2626' }}>
              ⏸ Detener
            </motion.button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: (THEMES[theme] || THEMES.default).bg }}>
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
            <button onClick={playReviewRecording} disabled={isReplaying}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-white text-sm shadow transition active:scale-95 ${isReplaying ? 'opacity-60' : ''}`}
              style={{ background: '#007bff' }}>
              {isReplaying ? '▶ Playing…' : '▶ Review'}
            </button>
            <button onClick={handleRerecord}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-gray-700 text-sm shadow transition active:scale-95"
              style={{ background: '#e5e7eb' }}>
              🔄 Redo
            </button>
            {demoMode ? (
              <>
                <div className="flex-1 min-w-2" />
                <button onClick={() => onDemoRecorded?.({ audioBlob, sliderData: sliderDataRef.current })}
                  className="flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-black text-white text-sm shadow transition active:scale-95"
                  style={{ background: '#16a34a' }}>
                  📤 Upload Demo
                </button>
              </>
            ) : (
              <>
                {syllables?.length ? (
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    {syllables.map((syllable, index) => (
                      <button
                        key={index}
                        onClick={() => playTts(
                          typeof syllable === 'string' ? syllable : syllable?.text || '',
                          'es',
                          0.85
                        )}
                        className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-black text-white text-base sm:text-lg shadow transition active:scale-95"
                        style={{ background: '#f87171' }}
                        title="Escuchar sílaba"
                      >
                        🔊 {typeof syllable === 'string' ? syllable : syllable?.text || ''}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button onClick={handlePlayAudio} disabled={playing}
                    className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-white text-sm shadow transition active:scale-95 ${playing ? 'opacity-60' : ''}`}
                    style={{ background: '#f87171' }}>
                    🔊 Listen
                  </button>
                )}
                {teacherMode && (
                  <button onClick={() => onSaveModel?.({ audioBlob, sliderData: sliderDataRef.current })}
                    className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-black text-white text-sm shadow transition active:scale-95"
                    style={{ background: '#16a34a' }}>
                    💾 Save model
                  </button>
                )}
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}