import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';

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

  const handleDone = () => {
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    // snapshot
    const url = c.toDataURL('image/png');
    onDone(allStrokes.current, url);
  };

  // Canvas dimensions
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
        {/* SVG guide lines */}
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
        <button onClick={handleDone} disabled={!hasDrawn}
          className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-bold shadow-lg disabled:opacity-40 hover:bg-indigo-700">
          Done Writing → Build It
        </button>
      </div>
    </div>
  );
}

// ── Sentence builder: drag words into order ───────────────────────────────────
function WordChip({ word, isCapitalized, onCapitalize, isPlaced, isSpace, isPunct }) {
  const display = isCapitalized ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  const bg = isSpace ? 'bg-gray-200 text-gray-500 border border-gray-300' 
    : isPunct ? 'bg-yellow-100 text-yellow-800 border border-yellow-400 font-black'
    : 'bg-indigo-600 text-white shadow-md';
  return (
    <div className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl font-bold text-sm select-none ${bg} ${isPlaced ? 'opacity-30' : 'cursor-grab'}`}>
      {!isSpace && !isPunct && (
        <button onClick={onCapitalize} className="w-5 h-5 bg-white/20 rounded text-xs font-black leading-none hover:bg-white/40" title="Capitalize">↑</button>
      )}
      <span>{display}</span>
    </div>
  );
}

function SentenceBuilder({ sentence, onComplete }) {
  // Parse sentence into tokens: words, punctuation, spaces
  const tokens = sentence.trim().split(/(\s+|(?=[.,!?;:])|(?<=[.,!?;:]))/).filter(t => t && t.trim() !== '' || /^\s+$/.test(t));
  const wordTokens = sentence.trim().split(/\s+/).flatMap(w => {
    // split punctuation attached to word
    const match = w.match(/^([a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+)([.,!?;:]*)$/);
    if (match) {
      const parts = [match[1].toLowerCase()];
      if (match[2]) match[2].split('').forEach(p => parts.push(p));
      return parts;
    }
    return [w.toLowerCase()];
  });

  // Build chips: words + punctuation marks available
  const punctOptions = ['.', ',', '!', '?'];
  const chips = wordTokens.map((w, i) => ({ id: i, word: w, isCapitalized: false, isPlaced: false, isPunct: /^[.,!?;:]$/.test(w) }));

  const [chipState, setChipState] = useState(chips);
  const [built, setBuilt] = useState([]); // array of chip ids in order
  const [showResult, setShowResult] = useState(false);

  const correctSentence = sentence.trim().toLowerCase().replace(/[^a-záéíóúüñ\s]/g, '').trim();

  const handleCapitalize = (id) => {
    setChipState(prev => prev.map(c => c.id === id ? { ...c, isCapitalized: !c.isCapitalized } : c));
  };

  const handlePlace = (chipId) => {
    if (chipState.find(c => c.id === chipId)?.isPlaced) return;
    setChipState(prev => prev.map(c => c.id === chipId ? { ...c, isPlaced: true } : c));
    setBuilt(prev => [...prev, chipId]);
  };

  const handleRemove = (chipId) => {
    setChipState(prev => prev.map(c => c.id === chipId ? { ...c, isPlaced: false, isCapitalized: false } : c));
    setBuilt(prev => prev.filter(id => id !== chipId));
  };

  const handleSubmit = () => {
    setShowResult(true);
  };

  const builtText = built.map(id => {
    const c = chipState.find(ch => ch.id === id);
    return c ? (c.isCapitalized ? c.word.charAt(0).toUpperCase() + c.word.slice(1) : c.word) : '';
  }).join(' ');

  const isCorrect = builtText.toLowerCase().replace(/[^a-záéíóúüñ\s]/g, '').trim() === correctSentence;

  const reset = () => {
    setChipState(chips);
    setBuilt([]);
    setShowResult(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone — built sentence */}
      <div className="min-h-16 bg-white/80 rounded-2xl border-4 border-dashed border-indigo-300 p-3 flex flex-wrap gap-2 items-center">
        {built.length === 0 && <span className="text-gray-400 text-sm">Tap words below to build the sentence...</span>}
        <AnimatePresence>
          {built.map(id => {
            const c = chipState.find(ch => ch.id === id);
            if (!c) return null;
            const display = c.isCapitalized ? c.word.charAt(0).toUpperCase() + c.word.slice(1) : c.word;
            return (
              <motion.div key={id} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                className={`flex items-center gap-1 px-3 py-2 rounded-xl font-bold text-sm ${c.isPunct ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' : 'bg-green-500 text-white shadow'}`}>
                {!c.isPunct && (
                  <button onClick={() => handleCapitalize(id)}
                    className="w-5 h-5 bg-white/30 rounded text-xs font-black leading-none hover:bg-white/50" title="Toggle capital">
                    ↑
                  </button>
                )}
                <span>{display}</span>
                <button onClick={() => handleRemove(id)} className="w-4 h-4 bg-white/30 rounded text-xs leading-none hover:bg-white/50">✕</button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Word chips */}
      <div className="flex flex-wrap gap-2">
        {chipState.map(c => (
          <button key={c.id} disabled={c.isPlaced || showResult}
            onClick={() => handlePlace(c.id)}
            className={`px-3 py-2 rounded-xl font-bold text-sm transition-all active:scale-95
              ${c.isPunct ? 'bg-yellow-100 text-yellow-800 border border-yellow-400' : 'bg-indigo-600 text-white shadow-md'}
              ${c.isPlaced ? 'opacity-20 cursor-not-allowed' : 'hover:brightness-110 cursor-pointer'}`}>
            {c.word}
          </button>
        ))}
      </div>

      {/* Actions */}
      {!showResult && (
        <div className="flex gap-3">
          <button onClick={reset} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200">↩ Reset</button>
          <button onClick={handleSubmit} disabled={built.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-bold shadow disabled:opacity-40 hover:bg-blue-700">
            ✓ Check
          </button>
        </div>
      )}

      {showResult && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl p-4 text-center ${isCorrect ? 'bg-green-50 border-2 border-green-400' : 'bg-orange-50 border-2 border-orange-300'}`}>
          <p className="font-black text-lg mb-1">{isCorrect ? '🎉 Perfect!' : '📖 Keep going!'}</p>
          {!isCorrect && <p className="text-sm text-gray-500 mb-2">Correct: <em>{sentence}</em></p>}
          <button onClick={onComplete} className="px-6 py-2 rounded-xl bg-indigo-600 text-white font-bold shadow hover:bg-indigo-700">
            Next Sentence →
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ── Built-in sentence bank ─────────────────────────────────────────────────────
const SENTENCE_BANK = {
  1: ['El oso usa una osa.', 'Una osa ama al oso.', 'Ana usa una lupa.', 'El uno y el dos.'],
  2: ['La boda es hoy.', 'El bebé besa a mamá.', 'La bola es de boda.', 'Duda del lobo.'],
  3: ['Esa fama es fina.', 'La lata es de loma.', 'El lobo es liso.', 'Lupa y luna van.'],
  4: ['Mamá me da la mano.', 'La mesa es de madera.', 'El mono mima al niño.', 'Me gusta la mona.'],
  5: ['El nene nada en el lago.', 'No hay nada nuevo.', 'Noto la nube blanca.', 'La pala y el palo.'],
  6: ['El pelo es de la pila.', 'Solo sopa en la sala.', 'El sapo sana solo.', 'Poca pesa la paloma.'],
  7: ['Sube la suma del todo.', 'La tina está llena.', 'Todo toma su tiempo.', 'El tubo está torcido.'],
  8: ['Ya va y se va.', 'Di que sí o no.', 'Su fe es su guía.', 'Ve y di la verdad.'],
  9: ['La vaca come grama.', 'La rosa roja es de Rosa.', 'La rana salta en la roca.', 'Viva la vida nueva.'],
};

const MODULES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

async function fetchSentences(module) {
  // Return built-in sentences — no Supabase dependency needed
  const sentences = (SENTENCE_BANK[module] || []).map((s, i) => ({ id: i, sentence: s, module }));
  return sentences;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SentencesMode({ studentData, onBack }) {
  const [selectedModule, setSelectedModule] = useState(1);
  const [sentences, setSentences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [phase, setPhase] = useState('write'); // 'write' | 'build'
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    setLoading(true);
    setHasLoaded(false);
    fetchSentences(selectedModule).then(data => {
      // shuffle
      const shuffled = [...data].sort(() => Math.random() - 0.5);
      setSentences(shuffled);
      setCurrentIdx(0);
      setPhase('write');
      setLoading(false);
      setHasLoaded(true);
    });
  }, [selectedModule]);

  const currentSentence = sentences[currentIdx]?.sentence || '';

  const handleWriteDone = async (strokes) => {
    setPhase('build');
    // Save stroke
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
      // Loop with reshuffle
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
          <span className="text-sm text-gray-500 font-bold">{currentIdx + 1} / {sentences.length || '—'}</span>
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

        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && hasLoaded && sentences.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">No sentences found for Module {selectedModule}</p>
            <p className="text-sm mt-1">Add sentences to the "sentences" table in Supabase with module={selectedModule}</p>
          </div>
        )}

        {!loading && currentSentence && (
          <div className="bg-white/90 rounded-3xl shadow-xl p-5">
            {/* Sentence prompt */}
            <div className="bg-rose-50 rounded-2xl p-4 mb-4 text-center">
              <p className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-1">Sentence</p>
              <p className="text-xl font-black text-rose-800">{currentSentence}</p>
              <button onClick={() => {
                const utter = new SpeechSynthesisUtterance(currentSentence);
                utter.lang = 'es-MX';
                speechSynthesis.speak(utter);
              }} className="mt-2 text-xs text-rose-500 hover:text-rose-700 font-bold">🔊 Listen</button>
            </div>

            {phase === 'write' && (
              <SentenceWriteCanvas onDone={handleWriteDone} />
            )}

            {phase === 'build' && (
              <SentenceBuilder sentence={currentSentence} onComplete={handleComplete} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}