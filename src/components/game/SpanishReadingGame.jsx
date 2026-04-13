import { useState, useEffect, useRef, useCallback } from 'react';

const SUPABASE_URL = "https://dmlsiyyqpcupbizpxwhp.supabase.co";

// ── Spanish syllable splitter ──
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

// ── Drawing canvas (overlaid on the word area) ──
function DrawingCanvas({ onRef }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const strokesRef = useRef([]);
  const currentRef = useRef(null);

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
      ctx.beginPath(); ctx.strokeStyle = '#1e40af'; ctx.lineWidth = 2.5;
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
    const onUp = () => {
      if (currentRef.current && currentRef.current.length > 1) strokesRef.current.push([...currentRef.current]);
      currentRef.current = null; draw();
    };
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

  // Expose clear and undo to parent
  useEffect(() => {
    if (onRef) onRef({
      clear: () => { strokesRef.current = []; currentRef.current = null; draw(); },
      undo: () => { strokesRef.current = strokesRef.current.slice(0, -1); draw(); },
    });
  }, [onRef, draw]);

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, cursor: 'crosshair', touchAction: 'none' }} />
    </div>
  );
}

export default function SpanishReadingGame({ onBack }) {
  const [lists, setLists] = useState({});
  const [selectedList, setSelectedList] = useState('');
  const [modules, setModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState('');
  const [upToModule, setUpToModule] = useState('');
  const [words, setWords] = useState([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sliderPct, setSliderPct] = useState(0);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const chunksRef = useRef([]);
  const canvasApiRef = useRef(null);
  const [drawMode, setDrawMode] = useState(false);

  // Load lists from Supabase
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/app-presets/slidetoread/lists.json`);
        if (res.ok) {
          const data = await res.json();
          setLists(data);
          const firstList = Object.keys(data)[0];
          if (firstList) {
            setSelectedList(firstList);
          }
        }
      } catch (e) { console.warn('Could not load lists', e); }
      setLoading(false);
    })();
  }, []);

  // When list changes, extract modules
  useEffect(() => {
    if (!selectedList || !lists[selectedList]) return;
    const entry = lists[selectedList];
    if (Array.isArray(entry)) {
      // flat array — no modules
      setModules([]);
      setSelectedModule('');
      setUpToModule('');
      const wordStrs = entry.map(w => typeof w === 'object' ? w.text : w).filter(Boolean);
      setWords(wordStrs);
      setWordIndex(0);
      setSliderPct(0);
    } else if (typeof entry === 'object') {
      const mods = Object.keys(entry);
      setModules(mods);
      setSelectedModule(mods[0] || '');
      setUpToModule(mods[mods.length - 1] || '');
    }
  }, [selectedList, lists]);

  // When module selection changes, build word list
  useEffect(() => {
    if (!selectedList || !lists[selectedList] || !selectedModule) return;
    const entry = lists[selectedList];
    if (Array.isArray(entry)) return;
    // Collect words from all modules up to upToModule
    const mods = Object.keys(entry);
    const upToIdx = upToModule ? mods.indexOf(upToModule) : mods.length - 1;
    const startIdx = mods.indexOf(selectedModule);
    const range = mods.slice(startIdx, upToIdx + 1);
    let collected = [];
    for (const m of range) {
      let arr = entry[m];
      if (!Array.isArray(arr) && arr?.new) arr = arr.new;
      if (!Array.isArray(arr)) arr = [];
      collected = collected.concat(arr.map(w => typeof w === 'object' ? w.text : w).filter(Boolean));
    }
    setWords(collected);
    setWordIndex(0);
    setSliderPct(0);
  }, [selectedModule, upToModule, selectedList, lists]);

  const currentWord = words[wordIndex] || '';
  const syllables = getSyllables(currentWord);

  const prevWord = () => { setWordIndex(i => Math.max(0, i - 1)); setSliderPct(0); };
  const nextWord = () => { setWordIndex(i => Math.min(words.length - 1, i + 1)); setSliderPct(0); };

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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedUrl(URL.createObjectURL(blob));
      };
      mr.start();
      setMediaRecorder(mr);
      setRecording(true);
    } catch (e) { alert('Microphone access needed.'); }
  };

  const stopRecording = () => {
    mediaRecorder?.stop();
    setRecording(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-lg text-gray-500 animate-pulse">Loading…</div>
      </div>
    );
  }

  // Determine active syllable based on slider
  const activeSylIdx = syllables.length > 0
    ? Math.min(Math.floor(sliderPct / 100 * syllables.length), syllables.length - 1)
    : -1;

  return (
    <div className="min-h-screen flex flex-col bg-white" style={{ fontFamily: 'Arial, sans-serif' }}>

      {/* Top bar */}
      <div className="flex items-center justify-center gap-2 px-4 pt-4 pb-2 border-b border-gray-200">
        <button onClick={onBack} className="mr-2 text-gray-500 hover:text-gray-800 text-sm font-bold">←</button>
        <h1 className="text-xl font-bold text-gray-800">Spanish Reading Game</h1>
      </div>

      {/* Controls row 1: list, module, up-to */}
      <div className="flex items-center justify-center gap-2 px-4 py-2 border-b border-gray-100">
        <select value={selectedList} onChange={e => setSelectedList(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
          {Object.keys(lists).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        {modules.length > 0 && (<>
          <select value={selectedModule} onChange={e => setSelectedModule(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
            {modules.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={upToModule} onChange={e => setUpToModule(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
            style={{ background: '#dcfce7' }}>
            {modules.map(m => <option key={m} value={m}>Hasta {m}</option>)}
          </select>
        </>)}
      </div>

      {/* Controls row 2: undo, clear, mode, play audio, prev/next, submit */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 flex-wrap">
        <button onClick={() => canvasApiRef.current?.undo()}
          className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded text-gray-500 hover:bg-gray-100 text-xs">↩</button>
        <button onClick={() => canvasApiRef.current?.clear()}
          className="flex items-center gap-1 px-2 py-1 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-100">
          🧹 Clear
        </button>
        <span className="text-sm font-bold text-gray-600 ml-1">Modo:</span>
        <select value="slider" className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
          <option value="slider">📖 Leer (Slider)</option>
        </select>
        <button onClick={playAudio}
          className="flex items-center gap-1 px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50">
          🔊 Play Audio
        </button>
        <button onClick={prevWord} disabled={wordIndex === 0}
          className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50">
          ← Prev
        </button>
        <button onClick={nextWord} disabled={wordIndex >= words.length - 1}
          className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50">
          Next →
        </button>
        <button className="flex items-center gap-1 px-3 py-1 border border-gray-300 rounded text-sm bg-green-50 text-green-700 hover:bg-green-100 ml-auto">
          ✅ Submit
        </button>
      </div>

      {/* Main word + canvas area */}
      <div className="flex-1 flex flex-col mx-4 my-3 border border-gray-200 rounded" style={{ minHeight: 400, position: 'relative' }}>
        {/* Word display — large, light gray */}
        <div style={{ position: 'relative', flex: 1, userSelect: 'none' }}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -60%)',
            fontSize: 96, fontWeight: 300, color: '#d1d5db',
            fontFamily: 'Arial, sans-serif',
            pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            {currentWord}
          </div>

          {/* Syllable boxes + slider — positioned in lower part of canvas */}
          <div style={{ position: 'absolute', bottom: 60, left: 40, right: 40 }}>
            {/* Syllable pill boxes */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {syllables.map((syl, i) => {
                const active = i === activeSylIdx && sliderPct > 0;
                const isGreen = i % 2 === 0;
                return (
                  <div key={i} style={{
                    padding: '3px 10px',
                    border: `2px solid ${isGreen ? '#22c55e' : '#ef4444'}`,
                    borderRadius: 20,
                    background: active ? (isGreen ? '#22c55e' : '#ef4444') : 'transparent',
                    color: active ? 'white' : (isGreen ? '#16a34a' : '#dc2626'),
                    fontWeight: 700,
                    fontSize: 15,
                    minWidth: 32,
                    textAlign: 'center',
                    transition: 'all 0.15s',
                  }}>
                    {syl}
                  </div>
                );
              })}
            </div>
            {/* Slider */}
            <div style={{ position: 'relative', height: 20 }}>
              <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 4, background: '#e5e7eb', borderRadius: 2, transform: 'translateY(-50%)' }} />
              <input type="range" min={0} max={100} value={sliderPct}
                onChange={e => setSliderPct(Number(e.target.value))}
                style={{ position: 'absolute', inset: 0, width: '100%', margin: 0, cursor: 'pointer', accentColor: '#3b82f6' }} />
            </div>
          </div>

          {/* Drawing canvas overlay */}
          <DrawingCanvas onRef={api => { canvasApiRef.current = api; }} />
        </div>
      </div>

      {/* Recording controls at bottom */}
      <div className="flex items-center justify-center gap-3 py-3 border-t border-gray-200">
        {recordedUrl && !recording && (
          <audio src={recordedUrl} controls className="h-8" />
        )}
        <button onClick={startRecording} disabled={recording}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50"
          style={{ background: recording ? '#f3f4f6' : 'white' }}>
          🎙 Start Recording
        </button>
        <button onClick={stopRecording} disabled={!recording}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded text-sm disabled:opacity-40 hover:bg-gray-50">
          ⏹ Stop Recording
        </button>
        <span className="text-sm text-gray-500">{wordIndex + 1} / {words.length}</span>
      </div>
    </div>
  );
}