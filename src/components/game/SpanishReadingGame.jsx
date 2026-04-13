import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Supabase config (same project as the original game) ──
const SUPABASE_URL = "https://dmlsiyyqpcupbizpxwhp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtbHNpeXlxcGN1cGJpenB4d2hwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0MDI1NjUsImV4cCI6MjA3Mzk3ODU2NX0.mkgeUtjC8ulLyHHVVOic4LmhhQP_JJtMi2JQztdzjsg";

let sbClient = null;
function getSB() {
  if (sbClient) return sbClient;
  if (window.supabase) {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return sbClient;
}

// ── Spanish grapheme parser ──
const DIGRAPHS = ["ch", "ll", "rr", "qu"];
function parseWord(word) {
  const out = [];
  const w = word || "";
  for (let i = 0; i < w.length;) {
    const ch = w[i];
    if (ch === " ") { out.push({ text: " ", isSpace: true }); i++; continue; }
    if (/[.,!?;]/.test(ch)) { out.push({ text: ch, isPunct: true }); i++; continue; }
    const lower = w.toLowerCase();
    const dg = DIGRAPHS.find(d => lower.startsWith(d, i));
    if (dg) { out.push({ text: dg }); i += dg.length; }
    else { out.push({ text: w[i] }); i++; }
  }
  return out;
}

function getSyllables(word) {
  // Simple CV syllabification for Spanish
  const vowels = new Set(['a','e','i','o','u','á','é','í','ó','ú']);
  const text = (word || "").toLowerCase();
  const syls = [];
  let cur = "";
  for (let i = 0; i < text.length; i++) {
    cur += text[i];
    const isV = vowels.has(text[i]);
    const nextIsV = i + 1 < text.length && vowels.has(text[i + 1]);
    const nextNextIsV = i + 2 < text.length && vowels.has(text[i + 2]);
    if (isV && (!nextIsV || i === text.length - 1)) {
      syls.push(cur);
      cur = "";
    } else if (!isV && nextIsV && nextNextIsV) {
      // consonant before two vowels — split before it
    }
  }
  if (cur) syls.push(cur);
  return syls.filter(s => s.trim());
}

// ── Balloon component ──
function Balloon({ inflation, color = '#ef4444', deflating }) {
  // inflation 0-1
  const size = 40 + inflation * 120;
  const opacity = 0.3 + inflation * 0.7;
  return (
    <motion.div className="flex flex-col items-center" animate={{ scale: deflating ? [1, 0.85, 1] : 1 }}>
      <motion.div
        animate={{ width: size, height: size * 1.15 }}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        style={{
          borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
          background: `radial-gradient(circle at 35% 30%, ${color}cc, ${color})`,
          opacity,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 4px 20px ${color}44`,
        }}
      >
        <span style={{ fontSize: size * 0.28, fontWeight: 900, color: 'white', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
          {Math.round(inflation * 100)}%
        </span>
      </motion.div>
      {/* Knot */}
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, opacity: opacity * 0.8 }} />
      {/* String */}
      <div style={{ width: 2, height: 30, background: '#9ca3af' }} />
    </motion.div>
  );
}

// ── Word card ──
function WordCard({ word, syllables, onFluencyChange }) {
  const graphemes = parseWord(word).filter(g => !g.isSpace && !g.isPunct).map(g => g.text);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-5xl font-black tracking-widest" style={{ fontFamily: 'Andika, sans-serif', color: '#1e1b4b' }}>
        {word}
      </div>
      <div className="flex gap-2 mt-1">
        {syllables.map((syl, i) => (
          <span key={i} className="px-3 py-1 rounded-lg text-lg font-bold"
            style={{
              background: i % 2 === 0 ? '#e0e7ff' : '#fce7f3',
              color: i % 2 === 0 ? '#3730a3' : '#9d174d',
              fontFamily: 'Andika, sans-serif'
            }}>
            {syl}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SpanishReadingGame({ onBack }) {
  const [lists, setLists] = useState({});
  const [selectedList, setSelectedList] = useState('');
  const [words, setWords] = useState([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('read'); // 'read' | 'spell'
  const [gameMode, setGameMode] = useState('slider'); // 'slider' | 'balloon'

  // Balloon/fluency state
  const [inflation, setInflation] = useState(0);
  const [deflating, setDeflating] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const lastSoundTime = useRef(null);
  const animFrameRef = useRef(null);
  const PAUSE_DEFLATE_MS = 600; // gap longer than this deflates balloon

  // Slider state (canvas-based from original)
  const canvasRef = useRef(null);
  const sliderXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const [sliderPct, setSliderPct] = useState(0);

  // Spelling state
  const [userInput, setUserInput] = useState('');
  const [spellingResult, setSpellingResult] = useState(null);

  // Load lists from Supabase storage
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/app-presets/slidetoread/lists.json`);
        if (res.ok) {
          const data = await res.json();
          setLists(data);
          const first = Object.keys(data)[0];
          if (first) setSelectedList(first);
        }
      } catch (e) {
        console.warn('Could not load lists from Supabase', e);
      }
      setLoading(false);
    })();
  }, []);

  // Load words when list changes
  useEffect(() => {
    if (!selectedList || !lists[selectedList]) return;
    const entry = lists[selectedList];
    let arr = Array.isArray(entry) ? entry : (entry.M1 || Object.values(entry)[0] || []);
    if (arr && !Array.isArray(arr) && arr.new) arr = arr.new;
    if (!Array.isArray(arr)) arr = [];
    const wordStrs = arr.map(w => typeof w === 'object' ? w.text : w).filter(Boolean);
    const shuffled = wordStrs.slice().sort(() => Math.random() - 0.5);
    setWords(shuffled);
    setWordIndex(0);
    setInflation(0);
    setSliderPct(0);
    setUserInput('');
    setSpellingResult(null);
  }, [selectedList, lists]);

  const currentWord = words[wordIndex] || '';
  const syllables = getSyllables(currentWord);

  const nextWord = () => {
    setWordIndex(i => (i + 1) % words.length);
    setInflation(0);
    setSliderPct(0);
    setUserInput('');
    setSpellingResult(null);
    setIsReading(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  };

  const prevWord = () => {
    setWordIndex(i => (i - 1 + words.length) % words.length);
    setInflation(0);
    setSliderPct(0);
    setUserInput('');
    setSpellingResult(null);
  };

  // Balloon: mic-based inflation via Web Audio API
  const micStreamRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);

  const startMic = useCallback(async () => {
    if (micStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const normalized = Math.min(avg / 40, 1); // 0-1

        if (normalized > 0.1) {
          lastSoundTime.current = Date.now();
          setDeflating(false);
          setIsReading(true);
          setInflation(prev => Math.min(1, prev + normalized * 0.04));
        } else {
          const gap = Date.now() - (lastSoundTime.current || 0);
          if (gap > PAUSE_DEFLATE_MS && lastSoundTime.current !== null) {
            setDeflating(true);
            setInflation(prev => Math.max(0, prev - 0.03));
          }
        }
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    } catch (e) {
      console.warn('Mic access denied', e);
    }
  }, []);

  const stopMic = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    setIsReading(false);
    lastSoundTime.current = null;
  }, []);

  useEffect(() => {
    if (gameMode === 'balloon') startMic();
    else stopMic();
    return () => stopMic();
  }, [gameMode]);

  // Play audio
  const playAudio = () => {
    const normWord = (currentWord || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const candidates = [
      `${SUPABASE_URL}/storage/v1/object/public/app-presets/slidetoread/audio/${encodeURIComponent(currentWord)}.mp3`,
      `${SUPABASE_URL}/storage/v1/object/public/app-presets/slidetoread/audio/${normWord}.mp3`,
    ];
    let i = 0;
    const tryNext = () => {
      if (i >= candidates.length) return;
      const a = new Audio(candidates[i++]);
      a.onerror = tryNext;
      a.play().catch(tryNext);
    };
    tryNext();
  };

  // Spelling check
  const checkSpelling = () => {
    const clean = s => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    setSpellingResult(clean(userInput) === clean(currentWord) ? 'correct' : 'incorrect');
  };

  const listNames = Object.keys(lists);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%)' }}>
      {/* Load Andika font */}
      <link href="https://fonts.googleapis.com/css2?family=Andika&display=swap" rel="stylesheet" />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-blue-100 shadow-sm">
        <button onClick={onBack} className="text-blue-600 hover:text-blue-800 font-bold text-sm">← Back</button>
        <h1 className="text-lg font-black text-blue-900 flex-1">📖 Spanish Reading</h1>
        <select value={selectedList} onChange={e => setSelectedList(e.target.value)}
          className="text-sm border border-blue-200 rounded-lg px-2 py-1 bg-white">
          {listNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-0 bg-white border-b border-blue-100">
        {[['slider', '📖 Read (Slider)'], ['balloon', '🎈 Read (Balloon)'], ['spell', '✏️ Spell']].map(([id, label]) => (
          <button key={id} onClick={() => setMode(id === 'spell' ? 'spell' : 'read') || setGameMode(id)}
            className={`px-5 py-2.5 font-bold text-sm transition-all ${(id === 'spell' ? mode === 'spell' : gameMode === id && mode === 'read') ? 'text-blue-700 border-b-2 border-blue-500 bg-blue-50' : 'text-gray-400 hover:text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-2xl animate-pulse">Loading lists…</div>
        </div>
      ) : words.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-lg">Select a word list to begin</div>
      ) : (
        <div className="flex-1 flex flex-col items-center gap-6 p-6">

          {/* Word display */}
          <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-lg flex flex-col items-center gap-4">
            <p className="text-xs text-gray-400 font-bold">{wordIndex + 1} / {words.length}</p>
            <WordCard word={currentWord} syllables={syllables} />
            <button onClick={playAudio}
              className="px-4 py-2 rounded-xl bg-blue-100 text-blue-700 font-bold text-sm hover:bg-blue-200 transition-all">
              🔊 Play Audio
            </button>
          </div>

          {/* BALLOON MODE */}
          {mode === 'read' && gameMode === 'balloon' && (
            <div className="flex flex-col items-center gap-4 w-full max-w-lg">
              <div className="bg-white rounded-3xl shadow-lg p-6 w-full flex flex-col items-center gap-4">
                <p className="text-sm font-bold text-gray-500 text-center">
                  Read the word smoothly — the balloon inflates as long as you keep reading!
                  <br/>
                  <span className="text-red-500">Pausing deflates the balloon.</span>
                </p>

                <Balloon inflation={inflation} deflating={deflating}
                  color={inflation > 0.7 ? '#22c55e' : inflation > 0.4 ? '#3b82f6' : '#ef4444'} />

                {inflation >= 0.95 && (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                    className="text-2xl font-black text-green-600">
                    🎉 Great fluency!
                  </motion.div>
                )}

                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${isReading ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                  <span className="text-xs text-gray-500">{isReading ? 'Reading detected…' : 'Start reading aloud!'}</span>
                </div>
              </div>
            </div>
          )}

          {/* SLIDER MODE */}
          {mode === 'read' && gameMode === 'slider' && (
            <div className="bg-white rounded-3xl shadow-lg p-6 w-full max-w-lg flex flex-col items-center gap-4">
              <p className="text-sm font-bold text-gray-500 text-center">Drag the slider across as you read each sound</p>
              <div className="w-full relative h-12 flex items-center">
                {/* Slider track with syllable segments */}
                <div className="w-full relative">
                  <div className="flex w-full h-4 rounded-full overflow-hidden">
                    {syllables.map((syl, i) => (
                      <div key={i} className="flex-1 h-full"
                        style={{ background: i % 2 === 0 ? '#c7d2fe' : '#fbcfe8' }} />
                    ))}
                  </div>
                  {/* Thumb */}
                  <input type="range" min={0} max={100} value={sliderPct}
                    onChange={e => setSliderPct(Number(e.target.value))}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer h-4"
                    style={{ height: '100%' }}
                  />
                  {/* Visual thumb */}
                  <div className="absolute top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-indigo-600 shadow-lg border-2 border-white pointer-events-none"
                    style={{ left: `calc(${sliderPct}% - 14px)` }} />
                </div>
              </div>
              {/* Syllable highlight based on slider position */}
              <div className="flex gap-2 flex-wrap justify-center">
                {syllables.map((syl, i) => {
                  const start = (i / syllables.length) * 100;
                  const end = ((i + 1) / syllables.length) * 100;
                  const active = sliderPct >= start && sliderPct < end;
                  return (
                    <span key={i}
                      className="px-4 py-2 rounded-xl font-black text-xl transition-all"
                      style={{
                        fontFamily: 'Andika, sans-serif',
                        background: active ? (i % 2 === 0 ? '#6366f1' : '#ec4899') : (i % 2 === 0 ? '#e0e7ff' : '#fce7f3'),
                        color: active ? 'white' : (i % 2 === 0 ? '#3730a3' : '#9d174d'),
                        transform: active ? 'scale(1.15)' : 'scale(1)',
                        boxShadow: active ? '0 4px 12px rgba(0,0,0,0.2)' : 'none',
                      }}>
                      {syl}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* SPELLING MODE */}
          {mode === 'spell' && (
            <div className="bg-white rounded-3xl shadow-lg p-6 w-full max-w-lg flex flex-col gap-4">
              <p className="text-sm font-bold text-gray-500 text-center">Type the word you hear/see</p>
              <div className="flex gap-3">
                <input
                  value={userInput}
                  onChange={e => { setUserInput(e.target.value); setSpellingResult(null); }}
                  onKeyDown={e => e.key === 'Enter' && checkSpelling()}
                  placeholder="Type here…"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="flex-1 border-2 border-blue-200 rounded-xl px-4 py-3 text-2xl font-bold focus:outline-none focus:border-blue-500"
                  style={{ fontFamily: 'Andika, sans-serif' }}
                />
                <button onClick={checkSpelling}
                  className="px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-all">
                  ✅
                </button>
              </div>
              <AnimatePresence>
                {spellingResult && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className={`rounded-2xl p-4 text-center font-black text-xl ${spellingResult === 'correct' ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {spellingResult === 'correct' ? '🎉 ¡Correcto!' : `❌ Correct: "${currentWord}"`}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-4 items-center">
            <button onClick={prevWord}
              className="px-5 py-3 rounded-xl bg-white shadow font-bold text-gray-700 hover:bg-gray-50 transition-all">
              ⟵ Prev
            </button>
            <span className="text-gray-500 text-sm font-bold">{wordIndex + 1}/{words.length}</span>
            <button onClick={nextWord}
              className="px-5 py-3 rounded-xl bg-indigo-600 text-white shadow font-bold hover:bg-indigo-700 transition-all">
              Next ⟶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}