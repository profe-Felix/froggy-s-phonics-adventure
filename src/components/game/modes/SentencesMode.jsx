import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import PrizeWheel from '@/components/game/PrizeWheel';

const SUPABASE_AUDIO_BASE = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/lettersort-audio';
const SUPABASE_LISTS_URL = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/slidetoread/lists.json';

function playAudioById(id) {
  const candidates = [
    `${SUPABASE_AUDIO_BASE}/${id}.mp3`,
    `${SUPABASE_AUDIO_BASE}/${id}.wav`,
  ];
  let i = 0;
  const tryNext = () => {
    if (i >= candidates.length) return;
    const a = new Audio(candidates[i++]);
    a.onerror = tryNext;
    a.play().catch(tryNext);
  };
  tryNext();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function createTile(type, value) {
  return { id: Math.random().toString(36).slice(2), type, value };
}

const PLAIN_TO_ACC = { a:'á',e:'é',i:'í',o:'ó',u:'ú',A:'Á',E:'É',I:'Í',O:'Ó',U:'Ú' };
const ACC_TO_PLAIN = { á:'a',é:'e',í:'i',ó:'o',ú:'u',Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U' };

// Ghost element for touch drag (matches WordSentenceBuilder)
function createGhostEl(label) {
  removeGhostEl();
  const ghost = document.createElement('div');
  ghost.id = '__sent_drag_ghost__';
  ghost.textContent = label;
  ghost.style.cssText = `position:fixed;z-index:9999;pointer-events:none;background:white;border:2px solid #4f46e5;border-radius:12px;padding:6px 14px;font-size:1.4rem;font-weight:bold;font-family:Andika,system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.25);opacity:0.92;transform:translate(-50%,-60%);white-space:nowrap;`;
  document.body.appendChild(ghost);
  return ghost;
}
function removeGhostEl() { document.getElementById('__sent_drag_ghost__')?.remove(); }
function moveGhostEl(x, y) { const g = document.getElementById('__sent_drag_ghost__'); if (g) { g.style.left = x+'px'; g.style.top = y+'px'; } }

// Calculate which character index in a tile element the cursor is over
function calcAccentCharIdx(tileEl, clientX) {
  if (!tileEl) return 0;
  const text = tileEl.textContent || '';
  if (text.length <= 1) return 0;
  const r = tileEl.getBoundingClientRect();
  const frac = (clientX - r.left) / r.width;
  return Math.max(0, Math.min(text.length - 1, Math.floor(frac * text.length)));
}

// ── Spanish syllabification ───────────────────────────────────────────────────
const STRONG = 'aeoáéó';
const WEAK_VOWELS = 'iuü';
const ACCENTED_WEAK = 'íú';
const VOWELS_STR = 'aeiouáéíóúü';

function _isVowel(ch) { return VOWELS_STR.includes(ch); }
function _isStrong(ch) { return STRONG.includes(ch); }
function _isAccentedWeak(ch) { return ACCENTED_WEAK.includes(ch); }

function _shouldSplitVowels(v1, v2) {
  if (_isAccentedWeak(v1) || _isAccentedWeak(v2)) return true;
  if (_isStrong(v1) && _isStrong(v2)) return true;
  return false;
}

function _tokenize(word) {
  const w = word.toLowerCase();
  const units = [];
  for (let i = 0; i < w.length; i++) {
    const two = w.slice(i, i + 2);
    if (['ch', 'll', 'rr'].includes(two)) { units.push(two); i++; }
    else units.push(w[i]);
  }
  return units;
}

function syllabify(word) {
  const units = _tokenize(word);
  const syllables = [];
  let current = '';
  const VALID_CLUSTERS = ['br','bl','cr','cl','dr','fr','fl','gr','gl','pr','pl','tr','tl','dr'];

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const next = units[i + 1];
    const afterNext = units[i + 2];
    current += unit;

    if (!next) { syllables.push(current); break; }

    const unitIsVowel = unit.length === 1 && _isVowel(unit);
    const nextIsVowel = next && next.length === 1 && _isVowel(next);
    const nextIsConsonant = next && next.length >= 1 && !_isVowel(next[0]);

    // vowel + vowel → check if they split
    if (unitIsVowel && nextIsVowel) {
      if (_shouldSplitVowels(unit, next)) { syllables.push(current); current = ''; }
      continue;
    }

    // vowel + consonant(s)
    if (unitIsVowel && nextIsConsonant) {
      // Look ahead: how many consonants before next vowel?
      let consonantCount = 0;
      let j = i + 1;
      while (j < units.length && units[j] && !_isVowel(units[j][0])) {
        consonantCount++;
        j++;
      }
      const hasVowelAfter = j < units.length && _isVowel(units[j][0]);

      if (!hasVowelAfter) {
        // End of word, keep all consonants with this syllable
        continue;
      }

      // vowel + 1 consonant + vowel → split before consonant
      if (consonantCount === 1) {
        syllables.push(current);
        current = '';
        continue;
      }

      // vowel + 2+ consonants + vowel
      if (consonantCount >= 2) {
        const cluster = units[i + 1] + (units[i + 2] || '');
        if (VALID_CLUSTERS.includes(cluster)) {
          // Valid cluster: keep with next syllable
          syllables.push(current);
          current = '';
        } else {
          // Invalid cluster: split after first consonant
          current += units[i + 1];
          syllables.push(current);
          current = '';
          i++;
        }
      }
    }
  }

  return syllables.filter(s => s.length > 0);
}



function parseSentenceToTiles(sentence) {
  // Returns: words (array of syllable arrays), puncts, flat lowercase syllables (for tray)
  const raw = sentence.trim().split(/\s+/);
  const wordSyllables = []; // [[syll,syll,...], ...] — preserves original casing for validation
  const puncts = [];
  raw.forEach(w => {
    const m = w.match(/^([a-záéíóúüñA-ZÁÉÍÓÚÜÑ¿¡]+)([.,!?;:]*)$/);
    const originalWord = m ? m[1] : w;
    const wordPartLower = originalWord.toLowerCase();
    const punct = m ? m[2] : '';
    
    // Get syllables from lowercased word
    const lowSyllables = syllabify(wordPartLower);
    
    // Preserve original casing for validation
    const casingPreservedSyllables = [];
    let charIdx = 0;
    for (const syll of lowSyllables) {
      const capsVersion = originalWord.slice(charIdx, charIdx + syll.length);
      casingPreservedSyllables.push(capsVersion);
      charIdx += syll.length;
    }
    
    wordSyllables.push(casingPreservedSyllables);
    if (punct) punct.split('').forEach(p => puncts.push(p));
  });
  // Flat list of ALL syllables — but always LOWERCASE for tray display
  const allSyllables = wordSyllables.flat().map(s => s.toLowerCase());
  return { wordSyllables, allSyllables, puncts };
}

// ── Writing canvas ─────────────────────────────────────────────────────────────
function SentenceWriteCanvas({ onDone, onPlayAudio, currentSentence, studentData }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const allStrokes = useRef([]); // {points, eraser: false|'pixel'}
  const currentStroke = useRef([]);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tool, setTool] = useState('pen'); // 'pen' | 'pixel-eraser' | 'object-eraser'
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [typedSentence, setTypedSentence] = useState('');
  const textareaRef = useRef(null);
  const typingStartRef = useRef(null);
  const keystrokeLog = useRef([]);

  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: ((src.clientX - rect.left) / rect.width) * c.width, y: ((src.clientY - rect.top) / rect.height) * c.height, t: Date.now() };
  };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    allStrokes.current.forEach(stroke => {
      if (stroke.points.length < 2) return;
      ctx.save();
      if (stroke.eraser === 'pixel') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = 36;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#1e40af';
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        const p = stroke.points[i-1], c2 = stroke.points[i];
        ctx.quadraticCurveTo(p.x, p.y, (p.x+c2.x)/2, (p.y+c2.y)/2);
      }
      ctx.stroke(); ctx.restore();
    });
  }, []);

  const objectErase = useCallback((pos) => {
    const threshold = 30;
    allStrokes.current = allStrokes.current.filter(stroke => {
      if (stroke.eraser) return true;
      return !stroke.points.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) < threshold);
    });
    redraw();
    setHasDrawn(allStrokes.current.some(s => !s.eraser));
  }, [redraw]);

  const onDown = useCallback((e) => {
    e.preventDefault();
    const pos = getPos(e);
    if (tool === 'object-eraser') {
      objectErase(pos); drawing.current = true; lastPos.current = pos; currentStroke.current = []; return;
    }
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos; currentStroke.current = [pos]; drawing.current = true;
    if (tool === 'pen') setHasDrawn(true);
  }, [tool, objectErase]);

  const onMove = useCallback((e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const pos = getPos(e);
    if (tool === 'object-eraser') { objectErase(pos); lastPos.current = pos; return; }
    const ctx = canvasRef.current.getContext('2d');
    const prev = lastPos.current;
    if (tool === 'pixel-eraser') {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 36; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(pos.x, pos.y);
      ctx.stroke(); ctx.restore();
    } else {
      ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1e40af';
      ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + pos.x) / 2, (prev.y + pos.y) / 2);
      ctx.stroke(); ctx.beginPath(); ctx.moveTo((prev.x + pos.x) / 2, (prev.y + pos.y) / 2);
    }
    lastPos.current = pos; currentStroke.current.push(pos);
  }, [tool, objectErase]);

  const onUp = useCallback((e) => {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    if (currentStroke.current.length > 0) {
      allStrokes.current = [...allStrokes.current, { points: currentStroke.current, eraser: tool === 'pixel-eraser' ? 'pixel' : false }];
      currentStroke.current = [];
    }
  }, [tool]);

  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    allStrokes.current = []; setHasDrawn(false);
  };

  const undo = () => {
    if (allStrokes.current.length === 0) return;
    allStrokes.current = allStrokes.current.slice(0, -1);
    redraw();
    if (allStrokes.current.length === 0) setHasDrawn(false);
  };

  const handlePlay = () => {
    setPlaying(true);
    onPlayAudio();
    setTimeout(() => setPlaying(false), 2000);
  };

  const handleUnclearAudio = async () => {
    await base44.entities.AudioFeedback.create({
      mode: 'sentences',
      item_text: currentSentence,
      feedback_type: 'unclear_audio',
      student_number: studentData?.student_number || null,
      class_name: studentData?.class_name || null,
      reported_date: new Date().toISOString(),
    }).catch(() => {});
  };

  const displayH = 220;
  const cursorStyle = tool === 'object-eraser' ? 'pointer' : tool === 'pixel-eraser' ? 'cell' : 'crosshair';

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Speaker-only prompt */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col items-center gap-1 flex-1">
          <button onClick={handlePlay}
            className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-xl transition-all active:scale-95 ${playing ? 'bg-rose-500 scale-110' : 'bg-rose-400 hover:bg-rose-500'}`}>
            🔊
          </button>
          <p className="text-sm text-rose-500 font-bold">{playing ? 'Escuchando…' : 'Toca para escuchar'}</p>
          <button onClick={handleUnclearAudio}
            className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 rounded-full px-3 py-1 font-bold hover:bg-yellow-200">
            😕 No entiendo
          </button>
        </div>
        <button
          onClick={() => { setKeyboardMode(k => !k); setTypedSentence(''); typingStartRef.current = null; keystrokeLog.current = []; }}
          className={`self-start px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${keyboardMode ? 'bg-purple-600 text-white border-purple-600' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'}`}
          title="Toggle keyboard input">
          ⌨️
        </button>
      </div>

      {keyboardMode ? (
        <div className="flex flex-col gap-3">
          <p className="text-base font-black text-indigo-700 text-center">⌨️ Escribe la oración primero</p>
          <textarea
            ref={textareaRef}
            value={typedSentence}
            onChange={e => {
              if (!typingStartRef.current && e.target.value.length > 0) typingStartRef.current = Date.now();
              keystrokeLog.current.push({ val: e.target.value, t: Date.now() });
              setTypedSentence(e.target.value);
            }}
            placeholder="Escribe la oración aquí…"
            autoFocus
            rows={3}
            className="w-full border-4 border-indigo-400 rounded-2xl px-4 py-3 text-2xl font-bold outline-none focus:border-indigo-600 bg-indigo-50 resize-none"
            style={{ fontFamily: 'Andika, system-ui, sans-serif' }}
          />

          <button onClick={() => {
            const durationMs = typingStartRef.current ? Date.now() - typingStartRef.current : null;
            onDone([], typedSentence, { durationMs, keystrokes: keystrokeLog.current.length });
          }} disabled={!typedSentence.trim()}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold shadow-lg disabled:opacity-40 hover:bg-indigo-700">
            Listo → Construir
          </button>
        </div>
      ) : (
        <>
          <p className="text-base font-black text-indigo-700 text-center">✏️ Escribe la oración primero</p>
          <div className="relative rounded-2xl border-4 border-indigo-300 overflow-hidden w-full" style={{ height: displayH, background: '#f0f7ff' }}>
            <svg className="absolute inset-0 pointer-events-none w-full h-full" preserveAspectRatio="none" viewBox={`0 0 100 ${displayH}`}>
              {[0,1,2].map(row => {
                const rowH = displayH / 3;
                const top = row * rowH + rowH * 0.04, mid = row * rowH + rowH * 0.40, base = row * rowH + rowH * 0.74;
                return (
                  <g key={row}>
                    <line x1="0" y1={top} x2="100" y2={top} stroke="#b0c4de" strokeWidth="0.4" />
                    <line x1="0" y1={mid} x2="100" y2={mid} stroke="#b0c4de" strokeWidth="0.4" strokeDasharray="2,1.5" />
                    <line x1="0" y1={base} x2="100" y2={base} stroke="#3b82f6" strokeWidth="0.6" />
                  </g>
                );
              })}
            </svg>
            <canvas ref={canvasRef} width={1400} height={420}
              className="absolute inset-0 touch-none w-full h-full"
              style={{ background: 'transparent', cursor: cursorStyle }}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
              onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setTool('pen')} className={`px-3 py-2 rounded-xl font-bold text-sm transition-all ${tool==='pen'?'bg-indigo-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>✏️ Pencil</button>
            <button onClick={() => setTool('pixel-eraser')} className={`px-3 py-2 rounded-xl font-bold text-sm transition-all ${tool==='pixel-eraser'?'bg-orange-500 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>🩹 Pixel</button>
            <button onClick={() => setTool('object-eraser')} className={`px-3 py-2 rounded-xl font-bold text-sm transition-all ${tool==='object-eraser'?'bg-red-500 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>🧹 Object</button>
            <button onClick={undo} disabled={allStrokes.current.length === 0} className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 text-sm disabled:opacity-40">↩ Undo</button>
            <button onClick={clear} className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 text-sm">🗑 Borrar</button>
            <button onClick={() => onDone(allStrokes.current.filter(s => !s.eraser).map(s => s.points))} disabled={!hasDrawn}
              className="flex-1 py-2 rounded-xl bg-indigo-600 text-white font-bold shadow-lg disabled:opacity-40 hover:bg-indigo-700 text-sm">
              Listo → Construir
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sentence Builder ──────────────────────────────────────────────────────────
// Mirrors WordSentenceBuilder exactly: always-visible draggable tool tiles,
// character-level accent targeting via drag hover, touch drag with ghost element.
function SentenceBuilder({ sentence, onComplete, onPlayAudio }) {
  const { wordSyllables, allSyllables, puncts } = parseSentenceToTiles(sentence);
  // Number of words = number of word groups
  const numWords = wordSyllables.length;

  const makeInitialTray = () => {
    // One tile per syllable occurrence (exact count needed), shuffled
    const syllTiles = allSyllables.map(s => createTile('text', s));
    for (let i = syllTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [syllTiles[i], syllTiles[j]] = [syllTiles[j], syllTiles[i]];
    }
    // Spaces between words (numWords - 1)
    const spaceTiles = Array.from({ length: numWords - 1 }, () => createTile('space', ' '));
    const punctTiles = puncts.map(p => createTile('punc', p));
    return [...syllTiles, ...spaceTiles, ...punctTiles];
  };

  const [tray, setTray] = useState(() => makeInitialTray());
  const [dropZone, setDropZone] = useState([]);
  const [pendingRemove, setPendingRemove] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [playing, setPlaying] = useState(false);
  // For tool hover highlighting: which dropzone tile index is hovered, and which char
  const [toolHoverIdx, setToolHoverIdx] = useState(null);
  const [accentCharIdx, setAccentCharIdx] = useState(null);
  const [dropHoverIdx, setDropHoverIdx] = useState(null); // insertion ghost position
  const [isDraggingNormal, setIsDraggingNormal] = useState(false); // true when dragging a non-tool tile

  const dragRef = useRef(null);
  const dropZoneRef = useRef(null);
  const dropZoneStateRef = useRef(dropZone);
  const trayStateRef = useRef(tray);
  const handleTrayTapRef = useRef(null);
  const handleDropTapRef = useRef(null);
  useEffect(() => { dropZoneStateRef.current = dropZone; }, [dropZone]);
  useEffect(() => { trayStateRef.current = tray; }, [tray]);

  const reset = () => { setTray(makeInitialTray()); setDropZone([]); setShowResult(false); setPendingRemove(null); setToolHoverIdx(null); setAccentCharIdx(null); setDropHoverIdx(null); setIsDraggingNormal(false); };

  // ── Apply a tool to a tile in the dropzone ────────────────────────────────
  const applyTool = useCallback((tileId, toolType, charIdx) => {
    setDropZone(prev => prev.map(t => {
      if (t.id !== tileId || t.type !== 'text') return t;
      if (toolType === 'captool-up') {
        return { ...t, value: t.value.charAt(0).toUpperCase() + t.value.slice(1) };
      }
      if (toolType === 'captool-down') {
        return { ...t, value: t.value.charAt(0).toLowerCase() + t.value.slice(1) };
      }
      if (toolType === 'accenttool') {
        const chars = [...t.value];
        const ci = charIdx ?? 0;
        if (ci >= 0 && ci < chars.length) {
          const ch = chars[ci];
          chars[ci] = PLAIN_TO_ACC[ch] || ACC_TO_PLAIN[ch] || ch;
        }
        return { ...t, value: chars.join('') };
      }
      return t;
    }));
    setShowResult(false);
  }, []);

  // ── Tray tap → move into dropzone (use up the tile) ───────────────────────
  const handleTrayTap = useCallback((tile) => {
    if (showResult) return;
    setDropZone(prev => [...prev, { ...tile, id: Math.random().toString(36).slice(2) }]);
    setTray(prev => prev.filter(t => t.id !== tile.id));
    setPendingRemove(null);
  }, [showResult]);

  // ── Dropzone tile tap ──────────────────────────────────────────────────────
  const handleDropTap = useCallback((tile) => {
    if (showResult) return;
    setPendingRemove(prev => {
      if (prev === tile.id) {
        setDropZone(dz => dz.filter(t => t.id !== tile.id));
        setTray(tr => [...tr, tile]);
        return null;
      }
      return tile.id;
    });
  }, [showResult]);

  // Keep refs in sync so touch handler closures can call them
  useEffect(() => { handleTrayTapRef.current = handleTrayTap; }, [handleTrayTap]);
  useEffect(() => { handleDropTapRef.current = handleDropTap; }, [handleDropTap]);

  // ── Mouse drag: tray tiles and tool tiles ─────────────────────────────────
  const handleTrayDragStart = (e, tile, isTool = false) => {
    dragRef.current = { tile, isTool, fromTray: true, fromDropZone: false };
    e.dataTransfer.effectAllowed = 'copy';
    if (!isTool) setIsDraggingNormal(true);
  };
  const handleDropZoneDragStart = (e, tile) => {
    dragRef.current = { tile, isTool: false, fromDropZone: true };
    e.dataTransfer.effectAllowed = 'move';
    setIsDraggingNormal(true);
  };

  // Compute insert index from pointer position within the dropzone
  const calcDropHoverIdx = (clientX, clientY) => {
    if (!dropZoneRef.current) return null;
    const slotEls = [...dropZoneRef.current.querySelectorAll('[data-slottile]')];
    for (let i = 0; i < slotEls.length; i++) {
      const r = slotEls[i].getBoundingClientRect();
      if (clientX <= r.left + r.width / 2 && clientY >= r.top && clientY <= r.bottom) return i;
    }
    if (slotEls.length > 0) {
      // Check if past the last tile on its row
      const last = slotEls[slotEls.length - 1].getBoundingClientRect();
      if (clientY >= last.top && clientY <= last.bottom) return slotEls.length;
    }
    return slotEls.length;
  };

  // dragover on the drop zone: for tool tiles, compute hover idx; for normal, show insertion ghost
  const handleDropZoneDragOver = (e) => {
    e.preventDefault();
    const d = dragRef.current;
    if (!d) return;
    if (d.isTool) {
      if (!dropZoneRef.current) return;
      const slotEls = [...dropZoneRef.current.querySelectorAll('[data-slottile]')];
      let hi = null;
      for (let i = 0; i < slotEls.length; i++) {
        const r = slotEls[i].getBoundingClientRect();
        const dz = dropZoneStateRef.current;
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom && dz[i]?.type === 'text') {
          hi = i;
          if (d.tile.type === 'accenttool') setAccentCharIdx(calcAccentCharIdx(slotEls[i], e.clientX));
          break;
        }
      }
      setToolHoverIdx(hi);
    } else {
      setDropHoverIdx(calcDropHoverIdx(e.clientX, e.clientY));
    }
  };
  const handleDropZoneDragLeave = (e) => {
    if (!dropZoneRef.current?.contains(e.relatedTarget)) {
      setToolHoverIdx(null); setAccentCharIdx(null); setDropHoverIdx(null); setIsDraggingNormal(false);
    }
  };

  const handleDropZoneDrop = (e) => {
    e.preventDefault();
    const d = dragRef.current;
    dragRef.current = null;
    const capturedHoverIdx = dropHoverIdx;
    setDropHoverIdx(null); setIsDraggingNormal(false);

    if (!d) return;

    if (d.isTool) {
      const dz = dropZoneStateRef.current;
      if (toolHoverIdx !== null && dz[toolHoverIdx]?.type === 'text') {
        applyTool(dz[toolHoverIdx].id, d.tile.type, accentCharIdx);
      }
      setToolHoverIdx(null); setAccentCharIdx(null);
      return;
    }

    const at = capturedHoverIdx !== null ? capturedHoverIdx : dropZoneStateRef.current.length;

    if (d.fromDropZone) {
      // Dropped inside dropzone → reorder
      setDropZone(prev => {
        const from = prev.findIndex(t => t.id === d.tile.id);
        if (from === -1) return prev;
        const next = prev.filter(t => t.id !== d.tile.id);
        const ins = Math.max(0, Math.min(at, next.length));
        next.splice(ins, 0, d.tile);
        return next;
      });
    } else if (d.fromTray) {
      // From tray → move (use up tile, remove from tray)
      setDropZone(prev => {
        const next = [...prev];
        const ins = Math.max(0, Math.min(at, next.length));
        next.splice(ins, 0, { ...d.tile, id: Math.random().toString(36).slice(2) });
        return next;
      });
      setTray(prev => prev.filter(t => t.id !== d.tile.id));
    }
  };

  // Called when a dropzone tile is dragged and released outside the dropzone
  const handleDropZoneDragEnd = (e, tile) => {
    // If dropEffect is 'none', the drag was not dropped onto a valid target (i.e. outside dropzone)
    if (e.dataTransfer.dropEffect === 'none') {
      // Delete from dropzone and restore to tray
      setDropZone(prev => prev.filter(t => t.id !== tile.id));
      setTray(prev => [...prev, tile]);
      setPendingRemove(null);
    }
    setDropHoverIdx(null);
    setIsDraggingNormal(false);
    dragRef.current = null;
  };

  // ── Touch drag (mirrors WordSentenceBuilder) ───────────────────────────────
  useEffect(() => {
    const DRAG_THRESHOLD = 10;
    const handleTouchStart = (e) => {
      const target = e.target.closest('[data-traytile],[data-slottile],[data-tooltile]');
      if (!target) return;
      // Block page scroll immediately when touching a draggable tile
      e.preventDefault();

      const touch0 = e.touches[0];
      const startX = touch0.clientX, startY = touch0.clientY;
      let dragging = false;
      let pendingData = null;
      let touchAccentIdx = 0;

      const isTool = !!target.closest('[data-tooltile]');
      const isTray = !!target.closest('[data-traytile]') && !isTool;
      const tileType = target.dataset.tiletype;
      const tileValue = target.dataset.tilevalue;
      const tileId = target.dataset.tileid;
      const ghostLabel = tileType === 'space' ? '␣' : (tileValue || target.textContent?.trim() || '?');

      if (isTool && tileType) {
        pendingData = { tile: createTile(tileType, tileValue || ''), isTool: true, fromDropZone: false };
      } else if (isTray && tileType) {
        // Find tile in tray by id
        const trayTile = trayStateRef.current.find(t => t.id === tileId);
        if (trayTile) pendingData = { tile: trayTile, isTool: false, fromTray: true, fromDropZone: false };
      } else if (tileId) {
        pendingData = { tile: { id: tileId, type: tileType, value: tileValue }, isTool: false, fromDropZone: true };
      }

      if (!pendingData) return;

      const onTouchMove = (ev) => {
        ev.preventDefault();
        const t = ev.touches[0];
        const dx = t.clientX - startX, dy = t.clientY - startY;
        if (!dragging) {
          if (Math.sqrt(dx*dx + dy*dy) < DRAG_THRESHOLD) { return; }
          dragging = true;
          dragRef.current = pendingData;
          createGhostEl(ghostLabel);
          if (!pendingData.isTool) setIsDraggingNormal(true);
        }
        moveGhostEl(t.clientX, t.clientY);

        if (pendingData.isTool && dropZoneRef.current) {
          const slotEls = [...dropZoneRef.current.querySelectorAll('[data-slottile]')];
          let hi = null;
          const dz = dropZoneStateRef.current;
          for (let i = 0; i < slotEls.length; i++) {
            const r = slotEls[i].getBoundingClientRect();
            if (t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom && dz[i]?.type === 'text') {
              hi = i;
              if (tileType === 'accenttool') { touchAccentIdx = calcAccentCharIdx(slotEls[i], t.clientX); setAccentCharIdx(touchAccentIdx); }
              break;
            }
          }
          setToolHoverIdx(hi);
        } else if (!pendingData.isTool && dropZoneRef.current) {
          const dzr = dropZoneRef.current.getBoundingClientRect();
          const insideDropZone = t.clientX >= dzr.left && t.clientX <= dzr.right && t.clientY >= dzr.top && t.clientY <= dzr.bottom;
          if (insideDropZone) {
            const slotEls = [...dropZoneRef.current.querySelectorAll('[data-slottile]')];
            let ins = slotEls.length;
            for (let i = 0; i < slotEls.length; i++) {
              const r = slotEls[i].getBoundingClientRect();
              if (t.clientX <= r.left + r.width / 2 && t.clientY >= r.top && t.clientY <= r.bottom) { ins = i; break; }
            }
            setDropHoverIdx(ins);
          } else {
            setDropHoverIdx(null);
          }
        }
      };

      const onTouchEnd = (ev) => {
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        if (!dragging) {
          // Was a tap — use refs so closure always has latest handler
          if (isTray && tileId) {
            const trayTile = trayStateRef.current.find(t => t.id === tileId);
            if (trayTile) handleTrayTapRef.current?.(trayTile);
          } else if (!isTool && tileId) {
            const dzTile = dropZoneStateRef.current.find(t => t.id === tileId);
            if (dzTile) handleDropTapRef.current?.(dzTile);
          }
          return;
        }
        ev.preventDefault();
        removeGhostEl();
        dragRef.current = null;
        setDropHoverIdx(null); setIsDraggingNormal(false);
        const ct = ev.changedTouches[0];

        if (pendingData.isTool && dropZoneRef.current) {
          const slotEls = [...dropZoneRef.current.querySelectorAll('[data-slottile]')];
          const dz = dropZoneStateRef.current;
          for (let i = 0; i < slotEls.length; i++) {
            const r = slotEls[i].getBoundingClientRect();
            if (ct.clientX >= r.left && ct.clientX <= r.right && ct.clientY >= r.top && ct.clientY <= r.bottom && dz[i]?.type === 'text') {
              applyTool(dz[i].id, tileType, touchAccentIdx);
              break;
            }
          }
        } else if (dropZoneRef.current) {
          const dzr = dropZoneRef.current.getBoundingClientRect();
          const insideDropZone = ct.clientX >= dzr.left && ct.clientX <= dzr.right && ct.clientY >= dzr.top && ct.clientY <= dzr.bottom;

          if (insideDropZone) {
            // Find insert position
            const slotEls = [...dropZoneRef.current.querySelectorAll('[data-slottile]')];
            let insertIdx = null;
            for (let i = 0; i < slotEls.length; i++) {
              const r = slotEls[i].getBoundingClientRect();
              if (ct.clientX <= r.right && ct.clientY >= r.top && ct.clientY <= r.bottom) { insertIdx = i; break; }
            }

            if (pendingData.fromDropZone) {
              // Reorder
              setDropZone(prev => {
                const from = prev.findIndex(t => t.id === pendingData.tile.id);
                if (from === -1) return prev;
                const next = prev.filter(t => t.id !== pendingData.tile.id);
                const at = insertIdx !== null ? Math.min(insertIdx, next.length) : next.length;
                next.splice(at, 0, pendingData.tile);
                return next;
              });
            } else if (pendingData.fromTray) {
              // Move from tray into dropzone
              setDropZone(prev => {
                const next = [...prev];
                const newTile = { ...pendingData.tile, id: Math.random().toString(36).slice(2) };
                const at = insertIdx !== null ? Math.min(insertIdx, next.length) : next.length;
                next.splice(at, 0, newTile);
                return next;
              });
              setTray(prev => prev.filter(t => t.id !== pendingData.tile.id));
            }
          } else if (pendingData.fromDropZone) {
            // Dragged dropzone tile released outside → delete and restore to tray
            setDropZone(prev => prev.filter(t => t.id !== pendingData.tile.id));
            setTray(prev => [...prev, pendingData.tile]);
            setPendingRemove(null);
          }
        }

        setToolHoverIdx(null); setAccentCharIdx(null);
      };

      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    return () => document.removeEventListener('touchstart', handleTouchStart);
  }, [applyTool]);

  // ── Check ─────────────────────────────────────────────────────────────────
  const handleCheck = () => {
    // Expected: flatten wordSyllables (which preserve original casing from sentence)
    const expected = [];
    wordSyllables.forEach((sylls, wi) => {
      sylls.forEach((s) => {
        expected.push({ type: 'text', value: s }); // Keep original casing
      });
      if (wi < wordSyllables.length - 1) expected.push({ type: 'space', value: ' ' });
    });
    puncts.forEach(p => expected.push({ type: 'punc', value: p }));

    // Feedback: compare student dropzone against expected (case-sensitive for text tiles)
    const feedback = dropZone.map((tile, i) => {
      const exp = expected[i];
      if (!exp) return { ...tile, correct: false };
      if (tile.type !== exp.type) return { ...tile, correct: false };
      if (tile.type === 'space' || tile.type === 'punc') return { ...tile, correct: true };
      return { ...tile, correct: tile.value === exp.value };
    });
    
    const allCorrect = feedback.length === expected.length && feedback.every(t => t.correct);
    setDropZone(feedback);
    setIsCorrect(allCorrect);
    setShowResult(true);
  };

  const handlePlay = () => { setPlaying(true); onPlayAudio(); setTimeout(() => setPlaying(false), 2000); };

  const syllTilesInTray = tray.filter(t => t.type === 'text');
  const spaceTilesInTray = tray.filter(t => t.type === 'space');
  const punctTilesInTray = tray.filter(t => t.type === 'punc');

  // Tool tiles (always visible, just like WordSentenceBuilder)
  const toolTiles = [
    { type: 'captool-up', label: '↑', title: 'Capitalizar', cls: 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100' },
    { type: 'captool-down', label: '↓', title: 'Minúscula', cls: 'border-gray-400 bg-gray-50 text-gray-700 hover:bg-gray-100' },
    { type: 'accenttool', label: '~', title: 'Acento (arrastra sobre la vocal)', cls: 'border-purple-400 bg-purple-50 text-purple-800 hover:bg-purple-100' },
  ];

  return (
    <div className="flex flex-col gap-4" style={{ fontFamily: 'Andika, system-ui, sans-serif' }}>

      {/* Speaker */}
      <div className="flex justify-center">
        <button onClick={handlePlay}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-lg transition-all active:scale-95 ${playing ? 'bg-rose-500 scale-110' : 'bg-rose-400 hover:bg-rose-500'}`}>
          🔊
        </button>
      </div>

      <p className="text-sm font-bold text-indigo-600 text-center">🧩 Toca o arrastra sílabas para construir la oración</p>

      {/* ── Drop zone ── */}
      <div
        ref={dropZoneRef}
        data-dropzone
        onDragOver={!showResult ? handleDropZoneDragOver : undefined}
        onDragLeave={!showResult ? handleDropZoneDragLeave : undefined}
        onDrop={!showResult ? handleDropZoneDrop : undefined}
        className={`min-h-[72px] rounded-2xl border-4 px-4 py-3 flex flex-wrap items-baseline gap-0.5
          ${showResult ? (isCorrect ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : 'border-indigo-300 bg-white'}
          ${showResult ? 'select-none' : ''}`}
        style={{ fontSize: '1.5rem', lineHeight: 1.6 }}
      >
        {dropZone.length === 0 && dropHoverIdx === null && <span className="text-gray-300 text-base self-center">Toca sílabas abajo…</span>}
        {dropZone.map((tile, i) => {
          const isPending = pendingRemove === tile.id;
          const isToolHover = toolHoverIdx === i;
          const showGhostBefore = isDraggingNormal && dropHoverIdx === i;

          const ghostEl = showGhostBefore ? (
            <div key={`ghost-${i}`} className="inline-flex items-center self-center"
              style={{ width: '2.5ch', minHeight: '1.8rem', borderLeft: '3px solid #3b82f6', background: 'rgba(59,130,246,0.08)', borderRadius: 4, margin: '0 2px', verticalAlign: 'baseline' }} />
          ) : null;

          if (tile.type === 'space') {
            let bg = 'transparent';
            if (showResult) bg = tile.correct ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)';
            else if (isPending) bg = 'rgba(239,68,68,0.15)';
            else if (isToolHover) bg = 'rgba(59,130,246,0.2)';
            return (
              <React.Fragment key={tile.id}>
                {ghostEl}
                <button data-slottile data-tileid={tile.id} data-tiletype="space" data-tilevalue=" "
                  onClick={() => handleDropTap(tile)} disabled={showResult}
                  draggable onDragStart={e => handleDropZoneDragStart(e, tile)} onDragEnd={e => handleDropZoneDragEnd(e, tile)}
                  style={{ width: '0.5em', height: '1.5em', verticalAlign: 'baseline', background: bg, borderRadius: 3, cursor: showResult ? 'default' : 'pointer', border: isToolHover ? '1px solid #3b82f6' : 'none', padding: 0, display: 'inline-block' }}
                />
              </React.Fragment>
            );
          }
          if (tile.type === 'punc') {
            const color = showResult ? (tile.correct ? '#16a34a' : '#ef4444') : isPending ? '#ef4444' : '#1f2937';
            return (
              <React.Fragment key={tile.id}>
                {ghostEl}
                <button data-slottile data-tileid={tile.id} data-tiletype="punc" data-tilevalue={tile.value}
                  onClick={() => handleDropTap(tile)} disabled={showResult}
                  draggable onDragStart={e => handleDropZoneDragStart(e, tile)} onDragEnd={e => handleDropZoneDragEnd(e, tile)}
                  className="inline font-bold disabled:cursor-default transition-colors"
                  style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: showResult ? 'default' : 'pointer', verticalAlign: 'baseline', color }}
                >{tile.value}</button>
              </React.Fragment>
            );
          }
          // text tile — show accent char highlight when accenttool hovers
          const color = showResult ? (tile.correct ? '#16a34a' : '#ef4444') : isPending ? '#ef4444' : isToolHover ? '#1d4ed8' : '#1f2937';
          const outline = isToolHover ? '2px solid rgba(59,130,246,0.6)' : isPending && !showResult ? '2px solid #ef4444' : 'none';

          const displayText = isToolHover && accentCharIdx !== null && dragRef.current?.tile?.type === 'accenttool'
            ? [...tile.value].map((ch, ci) => (
                <span key={ci} style={{
                  color: ci === accentCharIdx ? '#dc2626' : 'inherit',
                  background: ci === accentCharIdx ? 'rgba(220,38,38,0.15)' : 'transparent',
                  borderRadius: ci === accentCharIdx ? '3px' : 0,
                  padding: ci === accentCharIdx ? '0 1px' : 0,
                }}>{ch}</span>
              ))
            : tile.value;

          return (
            <React.Fragment key={tile.id}>
              {ghostEl}
              <button data-slottile data-tileid={tile.id} data-tiletype="text" data-tilevalue={tile.value}
                onClick={() => handleDropTap(tile)}
                disabled={showResult}
                draggable onDragStart={e => handleDropZoneDragStart(e, tile)} onDragEnd={e => handleDropZoneDragEnd(e, tile)}
                className="font-bold transition-colors disabled:cursor-default rounded cursor-grab"
                style={{ background: isPending ? 'rgba(239,68,68,0.08)' : isToolHover ? 'rgba(59,130,246,0.08)' : 'none', outline, border: 'none', padding: '0 1px', font: 'inherit', cursor: showResult ? 'default' : 'pointer', color, verticalAlign: 'baseline' }}
              >{displayText}</button>
            </React.Fragment>
          );
        })}
        {/* Ghost at the end */}
        {isDraggingNormal && dropHoverIdx === dropZone.length && (
          <div className="inline-flex items-center self-center"
            style={{ width: '2.5ch', minHeight: '1.8rem', borderLeft: '3px solid #3b82f6', background: 'rgba(59,130,246,0.08)', borderRadius: 4, margin: '0 2px', verticalAlign: 'baseline' }} />
        )}
      </div>

      {/* ── Trash + Tools bar (always visible, draggable) ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => {
            if (!pendingRemove) return;
            const tileToRestore = dropZone.find(t => t.id === pendingRemove);
            if (tileToRestore) {
              setDropZone(prev => prev.filter(t => t.id !== pendingRemove));
              setTray(prev => [...prev, tileToRestore]);
            }
            setPendingRemove(null);
          }}
          className={`flex items-center gap-1.5 border-2 border-dashed rounded-xl px-3 py-2 text-sm font-bold transition-colors ${pendingRemove ? 'bg-red-100 border-red-400 text-red-600 cursor-pointer hover:bg-red-200' : 'bg-red-50 border-red-200 text-red-300 cursor-default'}`}
        >
          🗑️ Borrar
        </button>

        <span className="text-xs font-bold text-gray-400 uppercase ml-1">Herramientas:</span>
        {toolTiles.map(tool => (
          <button
            key={tool.type}
            data-tooltile
            data-tiletype={tool.type}
            data-tilevalue={tool.type}
            draggable
            onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; dragRef.current = { tile: createTile(tool.type, tool.type), isTool: true, fromDropZone: false }; }}
            onClick={() => {
              // Tap: apply to pendingRemove tile if it's a text tile
              if (!pendingRemove) return;
              const tile = dropZone.find(t => t.id === pendingRemove && t.type === 'text');
              if (!tile) return;
              if (tool.type === 'accenttool') {
                // For tap: cycle through vowels in order
                applyTool(tile.id, 'accenttool', tile.value.split('').findIndex(ch => PLAIN_TO_ACC[ch] || ACC_TO_PLAIN[ch]));
              } else {
                applyTool(tile.id, tool.type, null);
              }
            }}
            title={tool.title}
            className={`cursor-grab rounded-xl border-2 px-3 py-2 font-black text-sm select-none transition-all hover:scale-105 active:scale-95 ${tool.cls}`}
          >
            {tool.label}
          </button>
        ))}
      </div>

      {/* ── Syllable tray ── */}
      {syllTilesInTray.length > 0 && (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-3 flex flex-wrap gap-2 justify-center">
          <AnimatePresence>
            {syllTilesInTray.map(tile => (
              <motion.button key={tile.id}
                data-traytile data-tileid={tile.id} data-tiletype="text" data-tilevalue={tile.value}
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                onClick={() => handleTrayTap(tile)} disabled={showResult}
                draggable onDragStart={e => handleTrayDragStart(e, tile)}
                className="px-3 py-2 rounded-xl font-bold text-lg bg-indigo-500 text-white shadow-md hover:bg-indigo-600 active:scale-95 transition-all disabled:opacity-40 cursor-grab"
                style={{ fontFamily: 'Andika, system-ui, sans-serif' }}
              >{tile.value}</motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Space + Punct tray ── */}
      {(spaceTilesInTray.length > 0 || punctTilesInTray.length > 0) && (
        <div className="flex gap-3 items-center justify-center flex-wrap">
          {spaceTilesInTray.length > 0 && (
            <>
              <span className="text-sm text-gray-500 font-bold">Espacio:</span>
              <AnimatePresence>
                {spaceTilesInTray.map(tile => (
                <motion.button key={tile.id}
                  data-traytile data-tileid={tile.id} data-tiletype="space" data-tilevalue=" "
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                  onClick={() => handleTrayTap(tile)} disabled={showResult}
                  draggable onDragStart={e => handleTrayDragStart(e, tile)}
                  className="w-14 h-10 rounded-xl border-2 border-indigo-300 bg-indigo-50 hover:bg-indigo-100 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center cursor-grab"
                ><span className="w-6 h-1 rounded-full bg-indigo-300 block" /></motion.button>
                ))}
              </AnimatePresence>
            </>
          )}
          {punctTilesInTray.length > 0 && (
            <>
              <span className="text-sm text-gray-500 font-bold ml-2">Punt:</span>
              <AnimatePresence>
                {punctTilesInTray.map(tile => (
                <motion.button key={tile.id}
                  data-traytile data-tileid={tile.id} data-tiletype="punc" data-tilevalue={tile.value}
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                  onClick={() => handleTrayTap(tile)} disabled={showResult}
                  draggable onDragStart={e => handleTrayDragStart(e, tile)}
                  className="w-12 h-10 rounded-xl border-2 border-yellow-400 bg-yellow-50 text-yellow-800 font-black text-xl hover:bg-yellow-100 active:scale-95 transition-all disabled:opacity-40 cursor-grab"
                >{tile.value}</motion.button>
                ))}
              </AnimatePresence>
            </>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      {!showResult && (
        <div className="flex gap-3">
          <button onClick={reset} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200">↩ Reiniciar</button>
          <button onClick={handleCheck} disabled={dropZone.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold shadow disabled:opacity-40 hover:bg-blue-700">
            ✓ Verificar
          </button>
        </div>
      )}

      {showResult && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 text-center ${isCorrect ? 'bg-green-50 border-2 border-green-400' : 'bg-orange-50 border-2 border-orange-300'}`}>
          <p className="font-black text-lg mb-1">{isCorrect ? '🎉 ¡Perfecto!' : '📖 ¡Las partes en rojo están incorrectas!'}</p>
          <div className="flex gap-2 justify-center mt-2">
            <button onClick={reset} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200">↩ Intentar de nuevo</button>
            {isCorrect && <button onClick={() => onComplete(isCorrect)} className="px-6 py-2 rounded-xl bg-indigo-600 text-white font-bold shadow hover:bg-indigo-700">Siguiente →</button>}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Sticker progress bar ────────────────────────────────────────────────────
const PTS_PER_STICKER = 100;
const MAX_PTS_PER_SENTENCE = 3; // Cap: students can't farm same sentence

function getSentencePointsForModule(moduleNumber) {
  if (moduleNumber <= 2) return 2;
  if (moduleNumber === 3) return 3;
  if (moduleNumber === 4) return 4;
  return 5;
}

function StickerProgressBar({ sessionPts, totalPts }) {
  const spins = Math.floor(totalPts / PTS_PER_STICKER);
  const progress = totalPts % PTS_PER_STICKER;
  const pct = (progress / PTS_PER_STICKER) * 100;
  return (
    <div className="bg-white rounded-2xl border-2 border-rose-200 p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-rose-600 uppercase tracking-wide">⭐ Sentence Stars</span>
        <span className="text-xs font-bold text-gray-500">+{sessionPts} pts today</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-4 rounded-full bg-rose-100 overflow-hidden border border-rose-200">
          <div className="h-full bg-gradient-to-r from-rose-400 to-pink-400 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-black text-rose-700 whitespace-nowrap">{progress}/{PTS_PER_STICKER} 🎡</span>
      </div>
      {spins > 0 && <p className="text-xs text-rose-500 font-bold">{spins} prize spin{spins > 1 ? 's' : ''} earned 🎡</p>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SentencesMode({ studentData, onBack }) {
  const [selectedModule, setSelectedModule] = useState(1);
  const [sentences, setSentences] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState('write'); // 'write' | 'build'
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessionPts, setSessionPts] = useState(0);
  const [totalPts, setTotalPts] = useState(() => studentData?.sentences_total_points || 0);
  const [showWheel, setShowWheel] = useState(false);
  const [redeemedPrizes, setRedeemedPrizes] = useState(() => studentData?.redeemed_prizes || []);

  useEffect(() => {
    const loadLists = async () => {
      try {
        const res = await fetch(SUPABASE_LISTS_URL);
        const data = await res.json();
        const oraciones = data["Oraciones"] || {};
        const moduleNums = Object.keys(oraciones)
          .map(k => parseInt(k.replace(/\D/g, '')))
          .filter(num => !isNaN(num) && num > 0)
          .sort((a, b) => a - b);
        setModules(moduleNums);
        if (moduleNums.length > 0) {
          const firstModule = moduleNums[0];
          setSelectedModule(firstModule);
          const moduleData = oraciones[`M${firstModule}`]?.new || [];
          const shuffled = [...moduleData].sort(() => Math.random() - 0.5);
          setSentences(shuffled);
        }
      } catch (e) {
        console.error('Failed to load sentence lists:', e);
      } finally {
        setLoading(false);
      }
    };
    loadLists();
  }, []);

  useEffect(() => {
    if (modules.length === 0) return;
    const loadModule = async () => {
      try {
        const res = await fetch(SUPABASE_LISTS_URL);
        const data = await res.json();
        const oraciones = data["Oraciones"] || {};
        const moduleData = oraciones[`M${selectedModule}`]?.new || [];
        const shuffled = moduleData.sort(() => Math.random() - 0.5);
        setSentences(shuffled);
        setCurrentIdx(0);
        setPhase('write');
  
      } catch (e) {
        console.error('Failed to load module:', e);
      
      }
    };
    loadModule();
  }, [selectedModule, modules.length]);

  const currentItem = sentences[currentIdx] || null;
  const currentSentence = currentItem?.text || '';

  const playAudio = () => {
    if (currentItem) playAudioById(currentItem.id);
  };

  const handleWriteDone = async (strokes, typedText, typingMeta) => {
    setPhase('build');
    if (studentData) {
      const isKeyboard = Array.isArray(strokes) && strokes.length === 0 && typingMeta;
      base44.entities.SpellingWritingSample.create({
        student_number: studentData.student_number,
        class_name: studentData.class_name,
        mode: 'sentences',
        word: currentSentence,
        strokes_data: isKeyboard
          ? JSON.stringify({ typed: typedText, durationMs: typingMeta?.durationMs, keystrokes: typingMeta?.keystrokes })
          : JSON.stringify(strokes),
        was_correct: null,
      }).catch(() => {});
    }
  };

  const handleComplete = (wasCorrect = false) => {
    // Only award points for fully correct answers
    if (!wasCorrect) {
      // Advance to next sentence without points
      if (currentIdx + 1 < sentences.length) {
        setCurrentIdx(i => i + 1);
        setPhase('write');
      } else {
        setSentences(s => [...s].sort(() => Math.random() - 0.5));
        setCurrentIdx(0);
        setPhase('write');
      }
      return;
    }

    // Check if this sentence was already completed this session (prevent farming)
    const completedSentences = JSON.parse(sessionStorage.getItem('completedSentences') || '{}');
    const sentenceKey = currentSentence.trim();
    const timesCompleted = completedSentences[sentenceKey] || 0;

    // Award points only if under the cap (max 3 completions per sentence per session)
    let ptsToAward = 0;
    if (timesCompleted < MAX_PTS_PER_SENTENCE) {
      ptsToAward = getSentencePointsForModule(selectedModule);
      completedSentences[sentenceKey] = timesCompleted + 1;
      sessionStorage.setItem('completedSentences', JSON.stringify(completedSentences));
    }

    const newTotal = totalPts + ptsToAward;
    const oldSpins = Math.floor(totalPts / PTS_PER_STICKER);
    const newSpins = Math.floor(newTotal / PTS_PER_STICKER);
    setTotalPts(newTotal);
    if (ptsToAward > 0) {
      setSessionPts(p => p + ptsToAward);
    }

    // Trigger prize wheel if crossed a 100-pt milestone
    if (newSpins > oldSpins) {
      setShowWheel(true);
    }

    // Persist points to student record
    if (studentData?.id && ptsToAward > 0) {
      base44.entities.Student.update(studentData.id, { sentences_total_points: newTotal }).catch(() => {});
    }

    if (currentIdx + 1 < sentences.length) {
      setCurrentIdx(i => i + 1);
      setPhase('write');
    } else {
      setSentences(s => [...s].sort(() => Math.random() - 0.5));
      setCurrentIdx(0);
      setPhase('write');
    }
  };

  const handleClaimPrize = (prize) => {
    setShowWheel(false);
    if (prize.oneTime && !redeemedPrizes.includes(prize.id)) {
      const updated = [...redeemedPrizes, prize.id];
      setRedeemedPrizes(updated);
      if (studentData?.id) {
        base44.entities.Student.update(studentData.id, { redeemed_prizes: updated }).catch(() => {});
      }
    }
  };

  const handleCloseWheel = () => {
    setShowWheel(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-100 via-pink-50 to-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-100 via-pink-50 to-white p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="px-3 py-1.5 rounded-xl bg-white shadow font-bold text-gray-600 hover:bg-gray-50">← Back</button>
          <h1 className="text-xl font-black text-rose-700 flex-1">📝 Sentences</h1>
          <span className="text-sm text-gray-500 font-bold">{currentIdx + 1} / {sentences.length}</span>
        </div>

        {/* Sticker progress */}
        <StickerProgressBar sessionPts={sessionPts} totalPts={totalPts} />

        {/* Module selector */}
        {modules.length > 0 && (
          <div className="flex gap-1.5 flex-wrap my-3">
            {modules.map(m => (
              <button key={m} onClick={() => setSelectedModule(m)}
                className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${selectedModule === m ? 'bg-rose-500 text-white shadow' : 'bg-white text-gray-600 border hover:bg-rose-50'}`}>
                Module {m}
              </button>
            ))}
          </div>
        )}

        {/* Prize wheel */}
        <AnimatePresence>
          {showWheel && (
            <PrizeWheel
              key={`wheel-${totalPts}`}
              redeemedPrizes={redeemedPrizes}
              onClaim={handleClaimPrize}
              onClose={handleCloseWheel}
            />
          )}
        </AnimatePresence>

        {currentSentence && (
          <div className="bg-white/90 rounded-3xl shadow-xl p-5">
            {phase === 'write' && (
              <SentenceWriteCanvas onDone={handleWriteDone} onPlayAudio={playAudio} currentSentence={currentSentence} studentData={studentData} />
            )}
            {phase === 'build' && (
              <SentenceBuilder key={currentSentence} sentence={currentSentence} onComplete={handleComplete} onPlayAudio={playAudio} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}