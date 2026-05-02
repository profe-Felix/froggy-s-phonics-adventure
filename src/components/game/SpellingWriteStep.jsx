import React, { useRef, useState, useCallback } from 'react';

export default function SpellingWriteStep({ word, onDone, onPlaySound, wide = false }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const allStrokes = useRef([]);
  const currentStroke = useRef([]);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [tool, setTool] = useState('pen');
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [typedWord, setTypedWord] = useState('');
  const inputRef = useRef(null);
  const typingStartRef = useRef(null);
  const keystrokeLog = useRef([]); // [{char, t}] for speed tracking

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY, t: Date.now() };
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
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#1e40af';
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        const prev = stroke.points[i - 1]; const cur = stroke.points[i];
        ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
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

  const startDraw = useCallback((e) => {
    e.preventDefault();
    const pos = getPos(e);
    if (tool === 'object-eraser') { objectErase(pos); drawing.current = true; lastPos.current = pos; currentStroke.current = []; return; }
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos; currentStroke.current = [pos]; drawing.current = true;
    if (tool === 'pen') setHasDrawn(true);
  }, [tool, objectErase]);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const pos = getPos(e);
    if (tool === 'object-eraser') { objectErase(pos); lastPos.current = pos; return; }
    const ctx = canvasRef.current.getContext('2d');
    const prev = lastPos.current;
    if (tool === 'pixel-eraser') {
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 36; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(pos.x, pos.y); ctx.stroke(); ctx.restore();
    } else {
      ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1e40af';
      ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + pos.x) / 2, (prev.y + pos.y) / 2);
      ctx.stroke(); ctx.beginPath(); ctx.moveTo((prev.x + pos.x) / 2, (prev.y + pos.y) / 2);
    }
    lastPos.current = pos; currentStroke.current.push(pos);
  }, [tool, objectErase]);

  const endDraw = useCallback((e) => {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    if (currentStroke.current.length > 0) {
      allStrokes.current = [...allStrokes.current, { points: currentStroke.current, eraser: tool === 'pixel-eraser' ? 'pixel' : false }];
      currentStroke.current = [];
    }
  }, [tool]);

  const undo = () => { if (allStrokes.current.length === 0) return; allStrokes.current = allStrokes.current.slice(0, -1); redraw(); setHasDrawn(allStrokes.current.some(s => !s.eraser)); };
  const clear = () => { const canvas = canvasRef.current; canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); allStrokes.current = []; currentStroke.current = []; setHasDrawn(false); };

  const handleDone = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const w = canvas.width; const h = canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#f0f7ff'; ctx.fillRect(0, 0, w, h);
    const rowH = h / 3;
    [0,1,2].forEach(row => {
      const top = row*rowH+rowH*0.04, mid = row*rowH+rowH*0.40, base = row*rowH+rowH*0.74;
      ctx.save(); ctx.strokeStyle='#b0c4de'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,top); ctx.lineTo(w,top); ctx.stroke();
      ctx.setLineDash([8,5]); ctx.beginPath(); ctx.moveTo(0,mid); ctx.lineTo(w,mid); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle='#3b82f6'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(0,base); ctx.lineTo(w,base); ctx.stroke(); ctx.restore();
    });
    ctx.putImageData(imageData, 0, 0);
    const penStrokes = allStrokes.current.filter(s => !s.eraser).map(s => s.points);
    const url = canvas.toDataURL('image/png');
    onDone(penStrokes, url);
  };

  const handleTyping = (e) => {
    const val = e.target.value;
    if (!typingStartRef.current && val.length > 0) typingStartRef.current = Date.now();
    keystrokeLog.current.push({ val, t: Date.now() });
    setTypedWord(val);
  };

  const insertSpecialChar = (ch) => {
    const input = inputRef.current;
    if (!input) { setTypedWord(w => w + ch); return; }
    const start = input.selectionStart ?? typedWord.length;
    const end = input.selectionEnd ?? typedWord.length;
    const newVal = typedWord.slice(0, start) + ch + typedWord.slice(end);
    setTypedWord(newVal);
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + ch.length, start + ch.length);
    });
  };

  const handleKeyboardDone = () => {
    const durationMs = typingStartRef.current ? Date.now() - typingStartRef.current : null;
    // Pass typed word + timing metadata as 3rd arg
    onDone([], null, typedWord, { durationMs, keystrokes: keystrokeLog.current.length });
  };

  const canvasW = wide ? 1400 : 900;
  const canvasH = 420;
  const displayH = 220;

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div className="flex items-center gap-3 w-full justify-between">
        <div className="flex items-center gap-2">
          <p className="text-lg font-black text-indigo-700">✏️ Write the word:</p>
          <button onClick={onPlaySound}
            className="w-10 h-10 rounded-full bg-indigo-100 hover:bg-indigo-200 flex items-center justify-center text-lg">
            🔊
          </button>
        </div>

      </div>

      {keyboardMode ? (
        <div className="w-full flex flex-col items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={typedWord}
            onChange={handleTyping}
            onKeyDown={e => { if (e.key === 'Enter' && typedWord.trim()) handleKeyboardDone(); }}
            placeholder="Type the word here…"
            autoFocus
            className="w-full border-4 border-indigo-400 rounded-2xl px-5 py-4 text-4xl font-bold text-center outline-none focus:border-indigo-600 bg-indigo-50"
            style={{ fontFamily: 'Andika, system-ui, sans-serif', letterSpacing: '0.08em' }}
          />

          <button onClick={handleKeyboardDone} disabled={!typedWord.trim()}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold shadow-lg disabled:opacity-40 hover:bg-indigo-700 text-lg">
            Done → Build It
          </button>
        </div>
      ) : (
        <>
          <div
            className="relative rounded-2xl border-4 border-indigo-300 overflow-hidden w-full"
            style={{ height: displayH, background: '#f0f7ff' }}
          >
            <svg className="absolute inset-0 pointer-events-none w-full h-full" preserveAspectRatio="none" viewBox={`0 0 100 ${displayH}`}>
              {[0,1,2].map(row => {
                const rowH = displayH/3, top=row*rowH+rowH*0.04, mid=row*rowH+rowH*0.40, base=row*rowH+rowH*0.74;
                return (
                  <g key={row}>
                    <line x1="0" y1={top} x2="100" y2={top} stroke="#b0c4de" strokeWidth="0.4" />
                    <line x1="0" y1={mid} x2="100" y2={mid} stroke="#b0c4de" strokeWidth="0.4" strokeDasharray="2,1.5" />
                    <line x1="0" y1={base} x2="100" y2={base} stroke="#3b82f6" strokeWidth="0.6" />
                  </g>
                );
              })}
            </svg>
            <canvas ref={canvasRef} width={canvasW} height={canvasH}
              className="absolute inset-0 touch-none w-full h-full"
              style={{ background:'transparent', cursor: tool==='object-eraser'?'pointer':tool==='pixel-eraser'?'cell':'crosshair' }}
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
          </div>

          <div className="flex gap-2 w-full flex-wrap">
            <button onClick={() => setTool('pen')} className={`px-3 py-2 rounded-xl font-bold text-sm transition-all ${tool==='pen'?'bg-indigo-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>✏️ Pencil</button>
            <button onClick={() => setTool('pixel-eraser')} className={`px-3 py-2 rounded-xl font-bold text-sm transition-all ${tool==='pixel-eraser'?'bg-orange-500 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>🩹 Pixel</button>
            <button onClick={() => setTool('object-eraser')} className={`px-3 py-2 rounded-xl font-bold text-sm transition-all ${tool==='object-eraser'?'bg-red-500 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>🧹 Object</button>
            <button onClick={undo} disabled={allStrokes.current.length===0} className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 text-sm disabled:opacity-40">↩ Undo</button>
            <button onClick={clear} className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold hover:bg-gray-200 text-sm">🗑 Clear</button>
            <button onClick={handleDone} disabled={!hasDrawn}
              className="flex-1 py-2 rounded-xl bg-indigo-600 text-white font-bold shadow-lg disabled:opacity-40 hover:bg-indigo-700 text-sm min-w-[120px]">
              Done → Build It
            </button>
          </div>
        </>
      )}
    </div>
  );
}