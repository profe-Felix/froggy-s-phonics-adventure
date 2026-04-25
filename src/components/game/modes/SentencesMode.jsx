import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';

// ── Real sentence lists from the reading program (Supabase Oraciones) ──────────
// Each entry keeps { id, text } so we can play the correct audio file by ID
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
    { id: 'M2.S015', text: 'Memo limpia la mesa.' },
    { id: 'M2.S016', text: 'Ese es un limón.' },
    { id: 'M2.S017', text: 'Esa es una mesa.' },
    { id: 'M2.S018', text: 'Pepe usa el mapa.' },
    { id: 'M2.S019', text: 'Me peino mi pelo.' },
    { id: 'M2.S022', text: 'Papá sale de la sala.' },
    { id: 'M2.S024', text: 'Limpia el piso.' },
    { id: 'M2.S032', text: 'Susi pasa la sal.' },
    { id: 'M2.S033', text: 'Nina usa el mapa.' },
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
    { id: 'M3.S013', text: 'Me falta mi dado.' },
    { id: 'M3.S016', text: 'El sapo saltó en la sala.' },
    { id: 'M3.S017', text: 'Pepe se mete en la tina.' },
    { id: 'M3.S021', text: 'El sapo salta con dos patas.' },
    { id: 'M3.S023', text: 'Susi se siente mal.' },
    { id: 'M3.S024', text: 'El pato patea la pelota.' },
    { id: 'M3.S025', text: 'Pásame la pelota.' },
    { id: 'M3.S027', text: 'Las palomas se posan en palos.' },
    { id: 'M3.S031', text: 'Le falta sal a la sopa.' },
  ],
  4: [
    { id: 'M4.S001', text: 'Rita baila sola.' },
    { id: 'M4.S002', text: 'El perro corre.' },
    { id: 'M4.S003', text: 'La reina baila bien.' },
    { id: 'M4.S004', text: 'Rita come sopa.' },
    { id: 'M4.S005', text: 'El carro pasa.' },
  ],
};

const SUPABASE_AUDIO_BASE = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/lettersort-audio';

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

const MODULES = Object.keys(SENTENCE_BANK).map(Number);

// ── Primary-line canvas for writing the sentence ──────────────────────────────
function SentenceWriteCanvas({ onDone }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const allStrokes = useRef([]);
  const currentStroke = useRef([]);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = (e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: ((src.clientX - rect.left) / rect.width) * c.width,
      y: ((src.clientY - rect.top) / rect.height) * c.height,
      t: Date.now()
    };
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
    if (currentStroke.current.length > 0) {
      allStrokes.current = [...allStrokes.current, currentStroke.current];
      currentStroke.current = [];
    }
  };

  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    allStrokes.current = []; setHasDrawn(false);
  };

  const W = 800, H = 240;
  const lineRows = [
    { top: 0, mid: H * 0.16, base: H * 0.29 },
    { top: H * 0.35, mid: H * 0.51, base: H * 0.64 },
    { top: H * 0.70, mid: H * 0.85, base: H * 0.96 },
  ];

  return (
    <div className="flex flex-col gap-3 w-full">
      <p className="text-base font-black text-indigo-700 text-center">✏️ Write the sentence first</p>
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
        <button onClick={clear} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200">
          🗑 Clear
        </button>
        <button onClick={() => onDone(allStrokes.current)} disabled={!hasDrawn}
          className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-bold shadow-lg disabled:opacity-40 hover:bg-indigo-700">
          Done Writing → Build It
        </button>
      </div>
    </div>
  );
}

// ── Sentence builder ───────────────────────────────────────────────────────────
// Renders the sentence as continuous flowing text. Words and spaces are inline —
// no gap between them unless a space tile is placed. Tap a token to remove it.

function parseSentence(sentence) {
  // Split into words (strip punct) and collect all punct chars as separate tokens
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

function SentenceBuilder({ sentence, onComplete }) {
  const { words, puncts } = parseSentence(sentence);

  const makeInitialState = () => {
    const wordTiles = words.map((w, i) => ({ id: `w${i}`, type: 'word', word: w, capitalized: false }));
    for (let i = wordTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [wordTiles[i], wordTiles[j]] = [wordTiles[j], wordTiles[i]];
    }
    const spaceTiles = Array.from({ length: words.length - 1 }, (_, i) => ({ id: `s${i}`, type: 'space' }));
    const punctTiles = puncts.map((p, i) => ({ id: `p${i}`, type: 'punct', char: p }));
    return [...wordTiles, ...spaceTiles, ...punctTiles];
  };

  const [tray, setTray] = useState(() => makeInitialState());
  const [dropZone, setDropZone] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(null); // id of tile staged for removal

  const reset = () => { setTray(makeInitialState()); setDropZone([]); setShowResult(false); setPendingRemove(null); };

  const handleTrayTap = (tile) => {
    if (showResult) return;
    setTray(prev => prev.filter(t => t.id !== tile.id));
    setDropZone(prev => [...prev, tile]);
  };

  const handleDropTap = (tile) => {
    if (showResult) return;
    if (pendingRemove === tile.id) {
      // second tap → remove
      setPendingRemove(null);
      setDropZone(prev => prev.filter(t => t.id !== tile.id));
      setTray(prev => [...prev, tile.type === 'word' ? { ...tile, capitalized: false } : tile]);
    } else {
      // first tap → stage red
      setPendingRemove(tile.id);
    }
  };

  const handleCapToggle = (tileId) => {
    if (showResult) return;
    setDropZone(prev => prev.map(t => t.id === tileId ? { ...t, capitalized: !t.capitalized } : t));
  };

  const handleCheck = () => {
    // Build expected token sequence from the correct sentence
    // Expected: [word0, space, word1, space, ..., wordN, ...puncts]
    const expected = [];
    words.forEach((w, i) => {
      expected.push({ type: 'word', value: i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w });
      if (i < words.length - 1) expected.push({ type: 'space' });
    });
    puncts.forEach(p => expected.push({ type: 'punct', value: p }));

    // Map each placed tile to correct/incorrect
    const feedback = dropZone.map((tile, i) => {
      const exp = expected[i];
      if (!exp) return { ...tile, correct: false };
      if (tile.type !== exp.type) return { ...tile, correct: false };
      if (tile.type === 'space') return { ...tile, correct: true };
      if (tile.type === 'word') {
        const display = tile.capitalized ? tile.word.charAt(0).toUpperCase() + tile.word.slice(1) : tile.word;
        return { ...tile, correct: display === exp.value };
      }
      if (tile.type === 'punct') return { ...tile, correct: tile.char === exp.value };
      return { ...tile, correct: false };
    });
    // also mark if student placed fewer tokens than expected
    const allCorrect = feedback.length === expected.length && feedback.every(t => t.correct);
    setDropZone(feedback);
    setIsCorrect(allCorrect);
    setShowResult(true);
  };

  const wordTilesInTray = tray.filter(t => t.type === 'word');
  const spaceTilesInTray = tray.filter(t => t.type === 'space');
  const punctTilesInTray = tray.filter(t => t.type === 'punct');

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-bold text-indigo-600 text-center">🧩 Tap words, spaces, and punctuation to build the sentence</p>

      {/* Sentence display — continuous flowing text */}
      <div
        className={`min-h-[72px] rounded-2xl border-4 px-4 py-3 flex flex-wrap items-baseline
          ${showResult ? (isCorrect ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50') : 'border-indigo-300 bg-white'}`}
        style={{ fontSize: '1.6rem', lineHeight: 1.5, letterSpacing: 0 }}
      >
        {dropZone.length === 0 && (
          <span className="text-gray-300 text-base self-center">Tap tiles below…</span>
        )}
        {dropZone.map((tile) => {
          if (tile.type === 'space') {
            const isPending = pendingRemove === tile.id;
            let bg = 'transparent';
            if (showResult) bg = tile.correct ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)';
            else if (isPending) bg = 'rgba(239,68,68,0.15)';
            return (
              <button
                key={tile.id}
                onClick={() => handleDropTap(tile)}
                disabled={showResult}
                title="Tap to remove space"
                className="inline-block disabled:cursor-default transition-colors"
                style={{
                  width: '0.55em',
                  height: '1.5em',
                  verticalAlign: 'baseline',
                  flexShrink: 0,
                  background: bg,
                  borderRadius: '3px',
                }}
              />
            );
          }
          if (tile.type === 'punct') {
            const isPending = pendingRemove === tile.id;
            const color = showResult
              ? (tile.correct ? '#16a34a' : '#ef4444')
              : isPending ? '#ef4444' : '#1f2937';
            return (
              <button
                key={tile.id}
                onClick={() => handleDropTap(tile)}
                disabled={showResult}
                className="inline font-bold disabled:cursor-default transition-colors active:opacity-70"
                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: showResult ? 'default' : 'pointer', verticalAlign: 'baseline', color }}
              >
                {tile.char}
              </button>
            );
          }
          // word tile
          const isPending = pendingRemove === tile.id;
          const display = tile.capitalized
            ? tile.word.charAt(0).toUpperCase() + tile.word.slice(1)
            : tile.word;
          const wordColor = showResult
            ? (tile.correct ? '#16a34a' : '#ef4444')
            : isPending ? '#ef4444' : '#1f2937';
          return (
            <span key={tile.id} className="inline-flex flex-col items-center" style={{ verticalAlign: 'baseline' }}>
              <button
                onClick={() => handleDropTap(tile)}
                disabled={showResult}
                className="inline font-bold leading-none transition-colors disabled:cursor-default"
                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: showResult ? 'default' : 'pointer', color: wordColor }}
              >
                {display}
              </button>
              {!showResult && (
                <button
                  onClick={() => handleCapToggle(tile.id)}
                  className={`leading-none px-1 rounded font-black mt-0.5 transition-all ${tile.capitalized ? 'bg-amber-400 text-amber-900' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}
                  style={{ fontSize: '9px' }}
                >
                  Aa
                </button>
              )}
            </span>
          );
        })}
      </div>

      {/* Word tray */}
      {wordTilesInTray.length > 0 && (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-3 flex flex-wrap gap-2 justify-center">
          <AnimatePresence>
            {wordTilesInTray.map(tile => (
              <motion.button key={tile.id}
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                onClick={() => handleTrayTap(tile)} disabled={showResult}
                className="px-4 py-2 rounded-xl font-bold text-xl bg-indigo-600 text-white shadow-md hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40"
              >
                {tile.word}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Space + Punct tray */}
      {(spaceTilesInTray.length > 0 || punctTilesInTray.length > 0) && (
        <div className="flex gap-3 items-center justify-center flex-wrap">
          {spaceTilesInTray.length > 0 && (
            <>
              <span className="text-sm text-gray-500 font-bold">Space:</span>
              <AnimatePresence>
                {spaceTilesInTray.map(tile => (
                  <motion.button key={tile.id}
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                    onClick={() => handleTrayTap(tile)} disabled={showResult}
                    className="w-14 h-10 rounded-xl border-2 border-indigo-300 bg-indigo-50 hover:bg-indigo-100 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center"
                    title="Space"
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
                    className="w-12 h-10 rounded-xl border-2 border-yellow-400 bg-yellow-50 text-yellow-800 font-black text-xl hover:bg-yellow-100 active:scale-95 transition-all disabled:opacity-40"
                  >
                    {tile.char}
                  </motion.button>
                ))}
              </AnimatePresence>
            </>
          )}
        </div>
      )}

      {/* Actions */}
      {!showResult && (
        <div className="flex gap-3">
          <button onClick={reset} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200">↩ Reset</button>
          <button onClick={handleCheck} disabled={dropZone.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold shadow disabled:opacity-40 hover:bg-blue-700">
            ✓ Check
          </button>
        </div>
      )}

      {showResult && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 text-center ${isCorrect ? 'bg-green-50 border-2 border-green-400' : 'bg-orange-50 border-2 border-orange-300'}`}>
          <p className="font-black text-lg mb-1">{isCorrect ? '🎉 Perfect!' : '📖 Fix the red parts and try again!'}</p>
          <div className="flex gap-2 justify-center mt-2">
            {!isCorrect && (
              <button onClick={reset} className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200">↩ Try Again</button>
            )}
            <button onClick={onComplete} className="px-6 py-2 rounded-xl bg-indigo-600 text-white font-bold shadow hover:bg-indigo-700">Next →</button>
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
            {/* Sentence prompt */}
            <div className="bg-rose-50 rounded-2xl p-4 mb-4 text-center">
              <p className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-1">Sentence</p>
              <p className="text-xl font-black text-rose-800">{currentSentence}</p>
              <button onClick={() => currentItem && playAudioById(currentItem.id)}
                className="mt-2 text-xs text-rose-500 hover:text-rose-700 font-bold">🔊 Listen</button>
            </div>

            {phase === 'write' && (
              <SentenceWriteCanvas onDone={handleWriteDone} />
            )}

            {phase === 'build' && (
              <SentenceBuilder key={currentSentence} sentence={currentSentence} onComplete={handleComplete} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}