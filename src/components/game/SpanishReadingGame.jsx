import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';

const SUPABASE_URL = "https://dmlsiyyqpcupbizpxwhp.supabase.co";

// ── Spanish helpers ──
const DIGRAPHS = ["ch", "ll", "rr", "qu"];
function getSyllables(word) {
  const vowels = new Set(['a','e','i','o','u','á','é','í','ó','ú']);
  const text = (word || "").toLowerCase();
  const syls = [];
  let cur = "";
  for (let i = 0; i < text.length; i++) {
    cur += text[i];
    const isV = vowels.has(text[i]);
    const nextIsV = i + 1 < text.length && vowels.has(text[i + 1]);
    if (isV && (!nextIsV || i === text.length - 1)) { syls.push(cur); cur = ""; }
  }
  if (cur) syls.push(cur);
  return syls.filter(s => s.trim());
}

// ── Balloon ──
function Balloon({ inflation }) {
  const size = 36 + inflation * 100;
  const color = inflation > 0.7 ? '#22c55e' : inflation > 0.4 ? '#3b82f6' : '#ef4444';
  return (
    <div className="flex flex-col items-center">
      <motion.div
        animate={{ width: size, height: size * 1.15 }}
        transition={{ type: 'spring', stiffness: 180, damping: 15 }}
        style={{
          borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
          background: `radial-gradient(circle at 35% 30%, ${color}bb, ${color})`,
          boxShadow: `0 4px 18px ${color}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        <span style={{ fontSize: Math.max(10, size * 0.26), fontWeight: 900, color: 'white', textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
          {Math.round(inflation * 100)}%
        </span>
      </motion.div>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, opacity: 0.8, marginTop: 1 }} />
      <div style={{ width: 2, height: 24, background: '#9ca3af' }} />
    </div>
  );
}

// ── Recording Canvas ──
function RecordingCanvas({ onRecordingComplete }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const strokesRef = useRef([]);
  const currentRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startTimeRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [saving, setSaving] = useState(false);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.offsetWidth, c.offsetHeight);
    const all = [...strokesRef.current, currentRef.current].filter(Boolean);
    all.forEach(pts => {
      if (!pts || pts.length < 2) return;
      ctx.beginPath(); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    const c = canvasRef.current;
    if (!el || !c) return;
    const size = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = el.offsetWidth * dpr;
      c.height = el.offsetHeight * dpr;
      c.style.width = el.offsetWidth + 'px';
      c.style.height = el.offsetHeight + 'px';
      draw();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const getPos = (e) => {
      const r = c.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: src.clientX - r.left, y: src.clientY - r.top };
    };
    const onDown = (e) => { e.preventDefault(); currentRef.current = [getPos(e)]; draw(); };
    const onMove = (e) => { e.preventDefault(); if (!currentRef.current) return; currentRef.current.push(getPos(e)); draw(); };
    const onUp = () => { if (currentRef.current && currentRef.current.length > 1) strokesRef.current.push([...currentRef.current]); currentRef.current = null; draw(); };
    c.addEventListener('mousedown', onDown);
    c.addEventListener('mousemove', onMove);
    c.addEventListener('mouseup', onUp);
    c.addEventListener('mouseleave', onUp);
    c.addEventListener('touchstart', onDown, { passive: false });
    c.addEventListener('touchmove', onMove, { passive: false });
    c.addEventListener('touchend', onUp);
    return () => {
      c.removeEventListener('mousedown', onDown);
      c.removeEventListener('mousemove', onMove);
      c.removeEventListener('mouseup', onUp);
      c.removeEventListener('mouseleave', onUp);
      c.removeEventListener('touchstart', onDown);
      c.removeEventListener('touchmove', onMove);
      c.removeEventListener('touchend', onUp);
    };
  }, [draw]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      startTimeRef.current = Date.now();
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setSaving(true);
        try {
          const file = new File([blob], 'reading.webm', { type: 'audio/webm' });
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          onRecordingComplete && onRecordingComplete({ audioUrl: file_url, strokes: strokesRef.current, duration: (Date.now() - startTimeRef.current) / 1000 });
        } catch (err) {
          console.warn('Upload failed, using local url', err);
          onRecordingComplete && onRecordingComplete({ audioUrl: url, strokes: strokesRef.current, duration: (Date.now() - startTimeRef.current) / 1000 });
        }
        setSaving(false);
      };
      mr.start();
      setRecording(true);
    } catch (e) {
      alert('Microphone access needed for recording.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const clear = () => {
    strokesRef.current = [];
    currentRef.current = null;
    setRecordedUrl(null);
    draw();
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <div ref={containerRef} className="relative w-full rounded-xl overflow-hidden border-2 border-blue-200 bg-white"
        style={{ height: 110 }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, cursor: 'crosshair', touchAction: 'none' }} />
        {strokesRef.current.length === 0 && !recording && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-blue-200 text-sm font-bold">✏️ Draw / write here</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!recording ? (
          <button onClick={startRecording}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white shadow-md transition-all active:scale-95"
            style={{ background: '#dc2626' }}>
            🎙 Record Reading
          </button>
        ) : (
          <button onClick={stopRecording}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white shadow-md animate-pulse"
            style={{ background: '#7c3aed' }}>
            ⏹ Stop
          </button>
        )}
        {recording && <span className="text-xs text-red-500 font-bold animate-pulse">● Recording…</span>}
        {saving && <span className="text-xs text-blue-500 font-bold animate-pulse">Saving…</span>}
        {recordedUrl && !saving && (
          <>
            <audio src={recordedUrl} controls className="h-8 flex-1" />
            <button onClick={clear} className="text-xs text-gray-400 hover:text-red-500 font-bold">✕ Clear</button>
          </>
        )}
        {strokesRef.current.length > 0 && !recording && (
          <button onClick={clear} className="text-xs text-gray-400 hover:text-red-500 font-bold ml-auto">🗑</button>
        )}
      </div>
    </div>
  );
}

// ── Main game ──
export default function SpanishReadingGame({ onBack }) {
  const [lists, setLists] = useState({});
  const [selectedList, setSelectedList] = useState('');
  const [words, setWords] = useState([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('read'); // 'read' | 'spell'
  const [sliderPct, setSliderPct] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [spellingResult, setSpellingResult] = useState(null);

  // Balloon / mic
  const [inflation, setInflation] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const micStreamRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastSoundRef = useRef(null);
  const PAUSE_MS = 500;

  // Load lists
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
      } catch (e) { console.warn('Could not load lists', e); }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedList || !lists[selectedList]) return;
    const entry = lists[selectedList];
    let arr = Array.isArray(entry) ? entry : (entry.M1 || Object.values(entry)[0] || []);
    if (arr && !Array.isArray(arr) && arr.new) arr = arr.new;
    if (!Array.isArray(arr)) arr = [];
    const wordStrs = arr.map(w => typeof w === 'object' ? w.text : w).filter(Boolean);
    setWords(wordStrs.slice().sort(() => Math.random() - 0.5));
    setWordIndex(0);
    resetWord();
  }, [selectedList, lists]);

  const resetWord = () => {
    setSliderPct(0);
    setInflation(0);
    setIsReading(false);
    setUserInput('');
    setSpellingResult(null);
    lastSoundRef.current = null;
  };

  const currentWord = words[wordIndex] || '';
  const syllables = getSyllables(currentWord);

  const nextWord = () => { setWordIndex(i => (i + 1) % words.length); resetWord(); };
  const prevWord = () => { setWordIndex(i => (i - 1 + words.length) % words.length); resetWord(); };

  // Mic / balloon
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
        analyserRef.current?.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const norm = Math.min(avg / 35, 1);
        if (norm > 0.12) {
          lastSoundRef.current = Date.now();
          setIsReading(true);
          setInflation(p => Math.min(1, p + norm * 0.05));
        } else {
          const gap = Date.now() - (lastSoundRef.current || 0);
          if (gap > PAUSE_MS && lastSoundRef.current !== null) {
            setIsReading(false);
            setInflation(p => Math.max(0, p - 0.04));
          }
        }
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
      setMicOn(true);
    } catch (e) { console.warn('Mic denied', e); }
  }, []);

  const stopMic = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    setMicOn(false);
    setIsReading(false);
  }, []);

  useEffect(() => () => stopMic(), [stopMic]);

  const playAudio = () => {
    const norm = (currentWord || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const urls = [
      `${SUPABASE_URL}/storage/v1/object/public/app-presets/slidetoread/audio/${encodeURIComponent(currentWord)}.mp3`,
      `${SUPABASE_URL}/storage/v1/object/public/app-presets/slidetoread/audio/${norm}.mp3`,
    ];
    let i = 0;
    const tryNext = () => { if (i >= urls.length) return; const a = new Audio(urls[i++]); a.onerror = tryNext; a.play().catch(tryNext); };
    tryNext();
  };

  const checkSpelling = () => {
    const clean = s => (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    setSpellingResult(clean(userInput) === clean(currentWord) ? 'correct' : 'incorrect');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #e0f2fe, #f0fdf4)' }}>
        <div className="text-2xl animate-pulse">Loading lists…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%)' }}>
      <link href="https://fonts.googleapis.com/css2?family=Andika&display=swap" rel="stylesheet" />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-blue-100 shadow-sm">
        <button onClick={onBack} className="text-blue-600 hover:text-blue-800 font-bold text-sm">← Back</button>
        <h1 className="text-lg font-black text-blue-900 flex-1">📖 Spanish Reading</h1>
        <select value={selectedList} onChange={e => setSelectedList(e.target.value)}
          className="text-sm border border-blue-200 rounded-lg px-2 py-1 bg-white">
          {Object.keys(lists).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* Mode tabs */}
      <div className="flex bg-white border-b border-blue-100">
        {[['read', '📖 Read'], ['spell', '✏️ Spell']].map(([id, label]) => (
          <button key={id} onClick={() => setMode(id)}
            className={`px-6 py-2.5 font-bold text-sm transition-all ${mode === id ? 'text-blue-700 border-b-2 border-blue-500 bg-blue-50' : 'text-gray-400 hover:text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {words.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-lg">Select a word list to begin</div>
      ) : (
        <div className="flex-1 flex flex-col items-center gap-4 p-4 max-w-xl mx-auto w-full">

          {/* Word display + audio */}
          <div className="bg-white rounded-3xl shadow-xl p-6 w-full flex flex-col items-center gap-3">
            <p className="text-xs text-gray-400 font-bold">{wordIndex + 1} / {words.length}</p>
            <div className="text-5xl font-black" style={{ fontFamily: 'Andika, sans-serif', color: '#1e1b4b' }}>
              {currentWord}
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {syllables.map((syl, i) => (
                <span key={i} className="px-3 py-1 rounded-lg text-lg font-bold"
                  style={{ background: i % 2 === 0 ? '#e0e7ff' : '#fce7f3', color: i % 2 === 0 ? '#3730a3' : '#9d174d', fontFamily: 'Andika, sans-serif' }}>
                  {syl}
                </span>
              ))}
            </div>
            <button onClick={playAudio}
              className="px-4 py-1.5 rounded-xl bg-blue-100 text-blue-700 font-bold text-sm hover:bg-blue-200">
              🔊 Play Audio
            </button>
          </div>

          {/* READ MODE */}
          {mode === 'read' && (
            <>
              {/* Recording canvas + mic — before reading */}
              <div className="bg-white rounded-2xl shadow-lg p-4 w-full">
                <p className="text-xs font-bold text-gray-500 mb-2">📝 Write / draw, then record yourself reading:</p>
                <RecordingCanvas onRecordingComplete={(data) => console.log('Recording saved', data)} />
              </div>

              {/* Slider */}
              <div className="bg-white rounded-2xl shadow-lg p-4 w-full flex flex-col gap-3">
                <p className="text-xs font-bold text-gray-500 text-center">Drag the slider as you read each syllable</p>
                <div className="w-full relative">
                  <div className="flex w-full h-5 rounded-full overflow-hidden">
                    {syllables.map((_, i) => (
                      <div key={i} className="flex-1 h-full"
                        style={{ background: i % 2 === 0 ? '#c7d2fe' : '#fbcfe8' }} />
                    ))}
                  </div>
                  <input type="range" min={0} max={100} value={sliderPct}
                    onChange={e => setSliderPct(Number(e.target.value))}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer" style={{ height: '100%' }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-indigo-600 shadow-lg border-2 border-white pointer-events-none"
                    style={{ left: `calc(${sliderPct}% - 14px)` }} />
                </div>
                {/* Syllable highlight + Balloon side by side */}
                <div className="flex items-end gap-4">
                  <div className="flex gap-2 flex-wrap flex-1">
                    {syllables.map((syl, i) => {
                      const start = (i / syllables.length) * 100;
                      const end = ((i + 1) / syllables.length) * 100;
                      const active = sliderPct >= start && sliderPct < end;
                      return (
                        <span key={i} className="px-3 py-1.5 rounded-xl font-black text-lg transition-all"
                          style={{
                            fontFamily: 'Andika, sans-serif',
                            background: active ? (i % 2 === 0 ? '#6366f1' : '#ec4899') : (i % 2 === 0 ? '#e0e7ff' : '#fce7f3'),
                            color: active ? 'white' : (i % 2 === 0 ? '#3730a3' : '#9d174d'),
                            transform: active ? 'scale(1.15)' : 'scale(1)',
                            boxShadow: active ? '0 4px 12px rgba(0,0,0,0.18)' : 'none',
                          }}>
                          {syl}
                        </span>
                      );
                    })}
                  </div>
                  {/* Balloon */}
                  <div className="flex flex-col items-center gap-1">
                    <Balloon inflation={inflation} />
                    <button
                      onClick={micOn ? stopMic : startMic}
                      className="px-2 py-1 rounded-lg text-xs font-bold transition-all"
                      style={{ background: micOn ? '#dc2626' : '#e0f2fe', color: micOn ? 'white' : '#0369a1' }}>
                      {micOn ? '🔴 Mic On' : '🎙 Balloon'}
                    </button>
                    {micOn && (
                      <span className={`text-xs font-bold ${isReading ? 'text-green-500' : 'text-gray-400'}`}>
                        {isReading ? '🗣 Reading…' : '⏸ Paused'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* SPELL MODE */}
          {mode === 'spell' && (
            <div className="bg-white rounded-2xl shadow-lg p-5 w-full flex flex-col gap-4">
              <p className="text-sm font-bold text-gray-500 text-center">Type the word</p>
              <div className="flex gap-3">
                <input value={userInput} onChange={e => { setUserInput(e.target.value); setSpellingResult(null); }}
                  onKeyDown={e => e.key === 'Enter' && checkSpelling()}
                  placeholder="Type here…" autoCapitalize="none" spellCheck={false}
                  className="flex-1 border-2 border-blue-200 rounded-xl px-4 py-3 text-2xl font-bold focus:outline-none focus:border-blue-500"
                  style={{ fontFamily: 'Andika, sans-serif' }} />
                <button onClick={checkSpelling}
                  className="px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700">✅</button>
              </div>
              <AnimatePresence>
                {spellingResult && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className={`rounded-2xl p-4 text-center font-black text-xl ${spellingResult === 'correct' ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {spellingResult === 'correct' ? '🎉 ¡Correcto!' : `❌ Correct: "${currentWord}"`}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-4 items-center pb-2">
            <button onClick={prevWord} className="px-5 py-3 rounded-xl bg-white shadow font-bold text-gray-700 hover:bg-gray-50">⟵ Prev</button>
            <span className="text-gray-500 text-sm font-bold">{wordIndex + 1}/{words.length}</span>
            <button onClick={nextWord} className="px-5 py-3 rounded-xl bg-indigo-600 text-white shadow font-bold hover:bg-indigo-700">Next ⟶</button>
          </div>
        </div>
      )}
    </div>
  );
}