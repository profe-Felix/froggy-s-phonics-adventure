import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';

// ── Sentence lists ────────────────────────────────────────────────────────────
const SENTENCE_BANK = {
  1: [
    { id: 'M1.S001', text: 'Mi mamá me mima.' },
    { id: 'M1.S002', text: 'Memo ama a mamá.' },
    { id: 'M1.S003', text: 'Mimi me ama.' },
    { id: 'M1.S004', text: 'Amo a Mimi.' },
    { id: 'M1.S005', text: 'Mamá ama a Mimi.' },
    { id: 'M1.S006', text: 'Memo mima a mamá.' },
    { id: 'M1.S007', text: 'Amo a mamá.' },
  ],
  2: [
    { id: 'M2.S001', text: 'Mamá ama a papá.' },
    { id: 'M2.S002', text: 'Sale el sol.' },
    { id: 'M2.S003', text: 'Salió el sol.' },
    { id: 'M2.S004', text: 'Salió la luna.' },
    { id: 'M2.S005', text: 'Papá ama a mamá.' },
    { id: 'M2.S006', text: 'Papá me ama.' },
    { id: 'M2.S007', text: 'Pepe se pasea.' },
    { id: 'M2.S008', text: 'Ese es mi puma.' },
    { id: 'M2.S009', text: 'Ese es mi mapa.' },
    { id: 'M2.S010', text: 'Ese mapa es mío.' },
    { id: 'M2.S011', text: 'Ese puma es mío.' },
    { id: 'M2.S012', text: 'Mamá amasa la masa.' },
    { id: 'M2.S013', text: 'Susi sale a la sala.' },
    { id: 'M2.S014', text: 'Samuel limpia la mesa.' },
    { id: 'M2.S022', text: 'Papá sale de la sala.' },
    { id: 'M2.S032', text: 'Susi pasa la sal.' },
  ],
  3: [
    { id: 'M3.S001', text: 'Mamá se toma su soda.' },
    { id: 'M3.S002', text: 'Papá salta alto.' },
    { id: 'M3.S003', text: 'La sopa está lista.' },
    { id: 'M3.S004', text: 'El té está listo.' },
    { id: 'M3.S005', text: 'Mi mamá está lista.' },
    { id: 'M3.S007', text: 'La mesa está en la sala.' },
    { id: 'M3.S009', text: 'Puse mi dona en la mesa.' },
    { id: 'M3.S012', text: 'La dama tiene una falda.' },
    { id: 'M3.S016', text: 'El sapo saltó en la sala.' },
    { id: 'M3.S024', text: 'El pato patea la pelota.' },
    { id: 'M3.S025', text: 'Pásame la pelota.' },
    { id: 'M3.S031', text: 'Le falta sal a la sopa.' },
  ],
  4: [
    { id: 'M4.S001', text: 'Rita baila sola.' },
    { id: 'M4.S002', text: 'El perro corre.' },
    { id: 'M4.S003', text: 'La reina baila bien.' },
    { id: 'M4.S004', text: 'Rita come sopa.' },
    { id: 'M4.S005', text: 'El carro pasa.' },
  ],
  5: [
    { id: 'M5.S001', text: 'Nana nada en el mar.' },
    { id: 'M5.S002', text: 'El nene no nota nada.' },
    { id: 'M5.S003', text: 'La nube tapa el sol.' },
    { id: 'M5.S004', text: 'Ola tras ola llega.' },
    { id: 'M5.S005', text: 'El pato nada en la pila.' },
    { id: 'M5.S006', text: 'Papá pasa la pala.' },
    { id: 'M5.S007', text: 'El pato come pan.' },
  ],
  6: [
    { id: 'M6.S001', text: 'El pelo de Pepe es fino.' },
    { id: 'M6.S002', text: 'Pepe pesa poco.' },
    { id: 'M6.S003', text: 'El sapo salta en el piso.' },
    { id: 'M6.S004', text: 'Susi sana sola.' },
    { id: 'M6.S005', text: 'La sala es poca.' },
    { id: 'M6.S006', text: 'El polo está solo.' },
    { id: 'M6.S007', text: 'El puma pasa por la sala.' },
  ],
  7: [
    { id: 'M7.S001', text: 'Toma el té caliente.' },
    { id: 'M7.S002', text: 'El topo se mete en la tina.' },
    { id: 'M7.S003', text: 'Tita toma su sopa.' },
    { id: 'M7.S004', text: 'Suma todo bien.' },
    { id: 'M7.S005', text: 'El tubo es de metal.' },
    { id: 'M7.S006', text: 'Tapa la tela con cuidado.' },
    { id: 'M7.S007', text: 'Tomás sube al tren.' },
  ],
  8: [
    { id: 'M8.S001', text: 'Va a llover de nuevo.' },
    { id: 'M8.S002', text: 'Vi a mi papá ayer.' },
    { id: 'M8.S003', text: 'Ya tengo fe en ti.' },
    { id: 'M8.S004', text: 'Yo vivo con mi familia.' },
    { id: 'M8.S005', text: 'Di lo que piensas.' },
    { id: 'M8.S006', text: 'El dado es de madera.' },
    { id: 'M8.S007', text: 'Tu tío vive lejos.' },
  ],
  9: [
    { id: 'M9.S001', text: 'La vaca come pasto verde.' },
    { id: 'M9.S002', text: 'La rana salta en la rama.' },
    { id: 'M9.S003', text: 'El gato caza al ratón.' },
    { id: 'M9.S004', text: 'La rosa es de color rojo.' },
    { id: 'M9.S005', text: 'Vino mucho viento hoy.' },
    { id: 'M9.S006', text: 'La yema del huevo es rica.' },
    { id: 'M9.S007', text: 'La guía nos llevó al museo.' },
  ],
};

const SUPABASE_AUDIO_BASE = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/lettersort-audio';
const MODULES = Object.keys(SENTENCE_BANK).map(Number);

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

function parseSentenceToTiles(sentence) {
  // Returns shuffled word tiles + space tiles + punct tiles for the tray
  const raw = sentence.trim().split(/\s+/);
  const words = [];
  const puncts = [];
  raw.forEach(w => {
    const m = w.match(/^([a-záéíóúüñA-ZÁÉÍÓÚÜÑ¿¡]+)([.,!?;:]*)$/);
    if (m) {
      words.push(m[1].toLowerCase());
      if (m[2]) m[2].split('').forEach(p => puncts.push(p));
    } else {
      words.push(w.toLowerCase());
    }
  });
  return { words, puncts };
}

// ── Writing canvas ─────────────────────────────────────────────────────────────
function SentenceWriteCanvas({ onDone, onPlayAudio }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const allStrokes = useRef([]);
  const currentStroke = useRef([]);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [playing, setPlaying] = useState(false);

  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: ((src.clientX - rect.left) / rect.width) * c.width, y: ((src.clientY - rect.top) / rect.height) * c.height, t: Date.now() };
  };
  const onDown = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos; currentStroke.current = [pos]; drawing.current = true; setHasDrawn(true);
  };
  const onMove = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1e40af';
    const prev = lastPos.current;
    ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + pos.x) / 2, (prev.y + pos.y) / 2);
    ctx.stroke(); ctx.beginPath(); ctx.moveTo((prev.x + pos.x) / 2, (prev.y + pos.y) / 2);
    lastPos.current = pos; currentStroke.current.push(pos);
  };
  const onUp = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    if (currentStroke.current.length > 0) { allStrokes.current = [...allStrokes.current, currentStroke.current]; currentStroke.current = []; }
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    allStrokes.current = []; setHasDrawn(false);
  };

  const handlePlay = () => {
    setPlaying(true);
    onPlayAudio();
    setTimeout(() => setPlaying(false), 2000);
  };

  const W = 800, H = 240;
  const lineRows = [
    { top: 0, mid: H * 0.16, base: H * 0.29 },
    { top: H * 0.35, mid: H * 0.51, base: H * 0.64 },
    { top: H * 0.70, mid: H * 0.85, base: H * 0.96 },
  ];

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Speaker-only prompt */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={handlePlay}
          className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow-xl transition-all active:scale-95 ${playing ? 'bg-rose-500 scale-110' : 'bg-rose-400 hover:bg-rose-500'}`}
        >
          🔊
        </button>
        <p className="text-sm text-rose-500 font-bold">{playing ? 'Escuchando…' : 'Toca para escuchar'}</p>
      </div>
      <p className="text-base font-black text-indigo-700 text-center">✏️ Escribe la oración primero</p>
      <div className="relative rounded-2xl border-4 border-indigo-300 overflow-hidden w-full" style={{ height: 180, background: '#f0f7ff' }}>
        <svg className="absolute inset-0 pointer-events-none w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${W} ${H}`}>
          {lineRows.map((r, i) => (
            <g key={i}>
              <line x1="0" y1={r.top + 4} x2={W} y2={r.top + 4} stroke="#b0c4de" strokeWidth="1.5" />
              <line x1="0" y1={r.mid} x2={W} y2={r.mid} stroke="#b0c4de" strokeWidth="1" strokeDasharray="10,6" />
              <line x1="0" y1={r.base} x2={W} y2={r.base} stroke="#3b82f6" strokeWidth="2" />
            </g>
          ))}
        </svg>
        <canvas ref={canvasRef} width={W} height={H}
          className="absolute inset-0 touch-none w-full h-full"
          style={{ background: 'transparent', cursor: 'crosshair' }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        />
      </div>
      <div className="flex gap-3">
        <button onClick={clear} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200">🗑 Borrar</button>
        <button onClick={() => onDone(allStrokes.current)} disabled={!hasDrawn}
          className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-bold shadow-lg disabled:opacity-40 hover:bg-indigo-700">
          Listo → Construir
        </button>
      </div>
    </div>
  );
}

// ── Sentence Builder (WordSentenceBuilder-style) ──────────────────────────────
function SentenceBuilder({ sentence, onComplete, onPlayAudio }) {
  const { words, puncts } = parseSentenceToTiles(sentence);

  const makeInitialTray = () => {
    const wordTiles = words.map(w => createTile('text', w));
    // Shuffle
    for (let i = wordTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [wordTiles[i], wordTiles[j]] = [wordTiles[j], wordTiles[i]];
    }
    const spaceTiles = Array.from({ length: words.length - 1 }, () => createTile('space', ' '));
    const punctTiles = puncts.map(p => createTile('punc', p));
    return [...wordTiles, ...spaceTiles, ...punctTiles];
  };

  const [tray, setTray] = useState(() => makeInitialTray());
  const [dropZone, setDropZone] = useState([]);
  const [pendingRemove, setPendingRemove] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [playing, setPlaying] = useState(false);

  const dragRef = useRef(null);
  const dropZoneRef = useRef(null);
  const dropZoneStateRef = useRef(dropZone);
  const trayStateRef = useRef(tray);
  useEffect(() => { dropZoneStateRef.current = dropZone; }, [dropZone]);
  useEffect(() => { trayStateRef.current = tray; }, [tray]);

  const reset = () => {
    setTray(makeInitialTray()); setDropZone([]); setShowResult(false); setPendingRemove(null);
  };

  // ── Tap from tray → append to dropzone ────────────────────────────────────
  const handleTrayTap = (tile) => {
    if (showResult) return;
    setTray(prev => prev.filter(t => t.id !== tile.id));
    setDropZone(prev => [...prev, { ...tile, id: Math.random().toString(36).slice(2) }]);
    setPendingRemove(null);
  };

  // ── Tap on dropzone tile ───────────────────────────────────────────────────
  const handleDropTap = (tile) => {
    if (showResult) return;
    if (pendingRemove === tile.id) {
      // Second tap → remove back to tray
      setPendingRemove(null);
      const base = tile.type === 'text' ? createTile('text', tile.value) : createTile(tile.type, tile.value);
      setDropZone(prev => prev.filter(t => t.id !== tile.id));
      setTray(prev => [...prev, base]);
    } else {
      setPendingRemove(tile.id);
    }
  };

  // ── Cap toggle on a word in dropzone ──────────────────────────────────────
  const handleCapToggle = (tileId, up) => {
    if (showResult) return;
    setDropZone(prev => prev.map(t => {
      if (t.id !== tileId || t.type !== 'text') return t;
      const v = t.value;
      return { ...t, value: up ? v.charAt(0).toUpperCase() + v.slice(1) : v.charAt(0).toLowerCase() + v.slice(1) };
    }));
  };

  // ── Accent toggle ──────────────────────────────────────────────────────────
  const handleAccentToggle = (tileId) => {
    if (showResult) return;
    setDropZone(prev => prev.map(t => {
      if (t.id !== tileId || t.type !== 'text') return t;
      const chars = [...t.value];
      // Toggle accent on first vowel found
      let changed = false;
      const newChars = chars.map(ch => {
        if (changed) return ch;
        if (PLAIN_TO_ACC[ch]) { changed = true; return PLAIN_TO_ACC[ch]; }
        if (ACC_TO_PLAIN[ch]) { changed = true; return ACC_TO_PLAIN[ch]; }
        return ch;
      });
      return { ...t, value: newChars.join('') };
    }));
  };

  // ── Drag and drop support ─────────────────────────────────────────────────
  const handleTrayDragStart = (e, tile) => {
    dragRef.current = { tile: { ...tile, id: Math.random().toString(36).slice(2) }, fromTray: true };
    e.dataTransfer.effectAllowed = 'copy';
  };
  const handleDropZoneDragStart = (e, tile) => {
    dragRef.current = { tile, fromTray: false };
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDropZoneDrop = (e) => {
    e.preventDefault();
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (d.fromTray) {
      setTray(prev => prev.filter(t => t.id !== d.tile.id));
      setDropZone(prev => [...prev, d.tile]);
    }
  };
  const handleDropZoneDragOver = (e) => e.preventDefault();

  // ── Check ─────────────────────────────────────────────────────────────────
  const handleCheck = () => {
    const expected = [];
    words.forEach((w, i) => {
      expected.push({ type: 'text', value: i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w });
      if (i < words.length - 1) expected.push({ type: 'space', value: ' ' });
    });
    puncts.forEach(p => expected.push({ type: 'punc', value: p }));

    const feedback = dropZone.map((tile, i) => {
      const exp = expected[i];
      if (!exp) return { ...tile, correct: false };
      if (tile.type !== exp.type) return { ...tile, correct: false };
      if (tile.type === 'space') return { ...tile, correct: true };
      return { ...tile, correct: tile.value === exp.value };
    });
    const allCorrect = feedback.length === expected.length && feedback.every(t => t.correct);
    setDropZone(feedback);
    setIsCorrect(allCorrect);
    setShowResult(true);
  };

  const handlePlay = () => {
    setPlaying(true);
    onPlayAudio();
    setTimeout(() => setPlaying(false), 2000);
  };

  const wordTilesInTray = tray.filter(t => t.type === 'text');
  const spaceTilesInTray = tray.filter(t => t.type === 'space');
  const punctTilesInTray = tray.filter(t => t.type === 'punc');

  return (
    <div className="flex flex-col gap-4" style={{ fontFamily: 'Andika, system-ui, sans-serif' }}>

      {/* Speaker button (no text shown) */}
      <div className="flex justify-center">
        <button
          onClick={handlePlay}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl shadow-lg transition-all active:scale-95 ${playing ? 'bg-rose-500 scale-110' : 'bg-rose-400 hover:bg-rose-500'}`}
        >
          🔊
        </button>
      </div>

      <p className="text-sm font-bold text-indigo-600 text-center">🧩 Toca las palabras para construir la oración</p>

      {/* ── Tools bar (caps + accent) ── */}
      <div className="flex items-center gap-2 justify-center flex-wrap">
        <span className="text-xs font-bold text-gray-500 uppercase">Herramientas:</span>
        {pendingRemove && dropZone.find(t => t.id === pendingRemove && t.type === 'text') && (
          <>
            <button
              onClick={() => handleCapToggle(pendingRemove, true)}
              className="px-3 py-1.5 rounded-xl bg-amber-100 border-2 border-amber-400 text-amber-800 font-black text-sm hover:bg-amber-200 transition-all"
              title="Capitalizar"
            >↑A</button>
            <button
              onClick={() => handleCapToggle(pendingRemove, false)}
              className="px-3 py-1.5 rounded-xl bg-gray-100 border-2 border-gray-400 text-gray-700 font-black text-sm hover:bg-gray-200 transition-all"
              title="Minúscula"
            >↓a</button>
            <button
              onClick={() => handleAccentToggle(pendingRemove)}
              className="px-3 py-1.5 rounded-xl bg-purple-100 border-2 border-purple-400 text-purple-800 font-black text-sm hover:bg-purple-200 transition-all"
              title="Acento"
            >´</button>
          </>
        )}
        {!pendingRemove && (
          <span className="text-xs text-gray-400 italic">Toca una palabra en la oración para activar herramientas</span>
        )}
      </div>

      {/* ── Drop zone ── */}
      <div
        ref={dropZoneRef}
        onDragOver={handleDropZoneDragOver}
        onDrop={handleDropZoneDrop}
        className={`min-h-[72px] rounded-2xl border-4 px-4 py-3 flex flex-wrap items-baseline gap-0.5
          ${showResult ? (isCorrect ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : 'border-indigo-300 bg-white'}`}
        style={{ fontSize: '1.5rem', lineHeight: 1.6 }}
      >
        {dropZone.length === 0 && (
          <span className="text-gray-300 text-base self-center">Toca palabras abajo…</span>
        )}
        {dropZone.map((tile) => {
          const isPending = pendingRemove === tile.id;

          if (tile.type === 'space') {
            let bg = 'transparent';
            if (showResult) bg = tile.correct ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)';
            else if (isPending) bg = 'rgba(239,68,68,0.15)';
            return (
              <button key={tile.id} onClick={() => handleDropTap(tile)} disabled={showResult}
                className="inline-block transition-colors disabled:cursor-default"
                style={{ width: '0.5em', height: '1.5em', verticalAlign: 'baseline', background: bg, borderRadius: 3, cursor: showResult ? 'default' : 'pointer' }}
              />
            );
          }
          if (tile.type === 'punc') {
            const color = showResult ? (tile.correct ? '#16a34a' : '#ef4444') : isPending ? '#ef4444' : '#1f2937';
            return (
              <button key={tile.id} onClick={() => handleDropTap(tile)} disabled={showResult}
                draggable onDragStart={e => handleDropZoneDragStart(e, tile)}
                className="inline font-bold disabled:cursor-default transition-colors active:opacity-70"
                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: showResult ? 'default' : 'pointer', verticalAlign: 'baseline', color }}
              >{tile.value}</button>
            );
          }
          // text/word tile
          const color = showResult ? (tile.correct ? '#16a34a' : '#ef4444') : isPending ? '#ef4444' : '#1f2937';
          const outline = isPending && !showResult ? '2px solid #ef4444' : 'none';
          return (
            <button key={tile.id}
              onClick={() => handleDropTap(tile)}
              disabled={showResult}
              draggable onDragStart={e => handleDropZoneDragStart(e, tile)}
              className="font-bold transition-colors disabled:cursor-default rounded"
              style={{ background: isPending ? 'rgba(239,68,68,0.08)' : 'none', outline, border: 'none', padding: '0 1px', font: 'inherit', cursor: showResult ? 'default' : 'pointer', color, verticalAlign: 'baseline' }}
            >{tile.value}</button>
          );
        })}
      </div>

      {/* ── Trash zone ── */}
      <div className="flex justify-start">
        <button
          onClick={() => {
            if (pendingRemove) {
              const tile = dropZone.find(t => t.id === pendingRemove);
              if (tile) {
                setDropZone(prev => prev.filter(t => t.id !== pendingRemove));
                const base = createTile(tile.type, tile.type === 'text' ? tile.value.toLowerCase() : tile.value);
                setTray(prev => [...prev, base]);
              }
              setPendingRemove(null);
            }
          }}
          className={`flex items-center gap-1.5 border-2 border-dashed rounded-xl px-3 py-1.5 text-sm font-bold transition-colors ${pendingRemove ? 'bg-red-100 border-red-400 text-red-600 cursor-pointer hover:bg-red-200' : 'bg-red-50 border-red-200 text-red-300 cursor-default'}`}
        >
          🗑️ {pendingRemove ? 'Toca para borrar' : 'Suelta aquí para borrar'}
        </button>
      </div>

      {/* ── Word tray ── */}
      {wordTilesInTray.length > 0 && (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-3 flex flex-wrap gap-2 justify-center">
          <AnimatePresence>
            {wordTilesInTray.map(tile => (
              <motion.button key={tile.id}
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                onClick={() => handleTrayTap(tile)} disabled={showResult}
                draggable onDragStart={e => handleTrayDragStart(e, tile)}
                className="px-4 py-2 rounded-xl font-bold text-xl bg-indigo-600 text-white shadow-md hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40 cursor-grab"
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
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                    onClick={() => handleTrayTap(tile)} disabled={showResult}
                    draggable onDragStart={e => handleTrayDragStart(e, tile)}
                    className="w-14 h-10 rounded-xl border-2 border-indigo-300 bg-indigo-50 hover:bg-indigo-100 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center cursor-grab"
                  >
                    <span className="w-6 h-1 rounded-full bg-indigo-300 block" />
                  </motion.button>
                ))}
              </AnimatePresence>
            </>
          )}
          {punctTilesInTray.length > 0 && (
            <>
              <span className="text-sm text-gray-500 font-bold ml-2">Punct:</span>
              <AnimatePresence>
                {punctTilesInTray.map(tile => (
                  <motion.button key={tile.id}
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
          <p className="font-black text-lg mb-1">{isCorrect ? '🎉 ¡Perfecto!' : '📖 ¡Corrige las partes en rojo!'}</p>
          <div className="flex gap-2 justify-center mt-2">
            {!isCorrect && (
              <button onClick={reset} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200">↩ Intentar de nuevo</button>
            )}
            <button onClick={onComplete} className="px-6 py-2 rounded-xl bg-indigo-600 text-white font-bold shadow hover:bg-indigo-700">Siguiente →</button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SentencesMode({ studentData, onBack }) {
  const [selectedModule, setSelectedModule] = useState(1);
  const [sentences, setSentences] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState('write'); // 'write' | 'build'

  useEffect(() => {
    const data = (SENTENCE_BANK[selectedModule] || []);
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    setSentences(shuffled);
    setCurrentIdx(0);
    setPhase('write');
  }, [selectedModule]);

  const currentItem = sentences[currentIdx] || null;
  const currentSentence = currentItem?.text || '';

  const playAudio = () => {
    if (currentItem) playAudioById(currentItem.id);
  };

  const handleWriteDone = async (strokes) => {
    setPhase('build');
    if (studentData) {
      base44.entities.SpellingWritingSample.create({
        student_number: studentData.student_number,
        class_name: studentData.class_name,
        mode: 'sentences',
        word: currentSentence,
        strokes_data: JSON.stringify(strokes),
        was_correct: null,
      }).catch(() => {});
    }
  };

  const handleComplete = () => {
    if (currentIdx + 1 < sentences.length) {
      setCurrentIdx(i => i + 1);
      setPhase('write');
    } else {
      setSentences(s => [...s].sort(() => Math.random() - 0.5));
      setCurrentIdx(0);
      setPhase('write');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-100 via-pink-50 to-white p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="px-3 py-1.5 rounded-xl bg-white shadow font-bold text-gray-600 hover:bg-gray-50">← Back</button>
          <h1 className="text-xl font-black text-rose-700 flex-1">📝 Sentences</h1>
          <span className="text-sm text-gray-500 font-bold">{currentIdx + 1} / {sentences.length}</span>
        </div>

        {/* Module selector */}
        <div className="flex gap-1.5 flex-wrap mb-4">
          {MODULES.map(m => (
            <button key={m} onClick={() => setSelectedModule(m)}
              className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${selectedModule === m ? 'bg-rose-500 text-white shadow' : 'bg-white text-gray-600 border hover:bg-rose-50'}`}>
              Module {m}
            </button>
          ))}
        </div>

        {currentSentence && (
          <div className="bg-white/90 rounded-3xl shadow-xl p-5">
            {phase === 'write' && (
              <SentenceWriteCanvas onDone={handleWriteDone} onPlayAudio={playAudio} />
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