import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const CLASS_NAMES = ['F', 'V', 'C', 'A', 'B', 'D'];
const STUDENT_NUMBERS = Array.from({ length: 30 }, (_, i) => i + 1);

// Page templates
const TEMPLATES = [
  { id: 'blank', label: '⬜ Blank', lines: [] },
  { id: 'lined', label: '📄 Lined', lines: 'lined' },
  { id: 'half_image_top', label: '🖼 Image top, lines bottom', lines: 'half_bottom' },
  { id: 'half_image_bottom', label: '📝 Lines top, image bottom', lines: 'half_top' },
  { id: 'story_web', label: '🕸 Story web', lines: 'web' },
  { id: 'border', label: '🖼 Border frame', lines: 'border' },
];

function getPageBackground(template) {
  switch (template) {
    case 'lined':
      return { type: 'lined', rows: 14 };
    case 'half_bottom':
      return { type: 'half_bottom' };
    case 'half_top':
      return { type: 'half_top' };
    case 'web':
      return { type: 'web' };
    case 'border':
      return { type: 'border' };
    default:
      return { type: 'blank' };
  }
}

function PageBackground({ template, width, height }) {
  const bg = getPageBackground(template);

  if (bg.type === 'lined') {
    const lineCount = 14;
    const lineSpacing = height / (lineCount + 1);
    return (
      <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={width} height={height}>
        {Array.from({ length: lineCount }, (_, i) => (
          <line key={i} x1={30} y1={(i + 1) * lineSpacing} x2={width - 10} y2={(i + 1) * lineSpacing}
            stroke="#aaaadd" strokeWidth="1" />
        ))}
        <line x1={52} y1={0} x2={52} y2={height} stroke="#ffaaaa" strokeWidth="1.5" />
      </svg>
    );
  }

  if (bg.type === 'half_bottom') {
    const midY = height / 2;
    return (
      <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={width} height={height}>
        <rect x={0} y={0} width={width} height={midY} fill="#f0f0f0" stroke="#cccccc" strokeWidth="1" />
        <text x={width / 2} y={midY / 2 + 10} textAnchor="middle" fill="#aaaaaa" fontSize={14}>Draw here</text>
        {Array.from({ length: 7 }, (_, i) => (
          <line key={i} x1={30} y1={midY + (i + 1) * (midY / 8)} x2={width - 10} y2={midY + (i + 1) * (midY / 8)}
            stroke="#aaaadd" strokeWidth="1" />
        ))}
        <line x1={52} y1={midY} x2={52} y2={height} stroke="#ffaaaa" strokeWidth="1.5" />
      </svg>
    );
  }

  if (bg.type === 'half_top') {
    const midY = height / 2;
    return (
      <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={width} height={height}>
        {Array.from({ length: 7 }, (_, i) => (
          <line key={i} x1={30} y1={(i + 1) * (midY / 8)} x2={width - 10} y2={(i + 1) * (midY / 8)}
            stroke="#aaaadd" strokeWidth="1" />
        ))}
        <line x1={52} y1={0} x2={52} y2={midY} stroke="#ffaaaa" strokeWidth="1.5" />
        <rect x={0} y={midY} width={width} height={midY} fill="#f0f0f0" stroke="#cccccc" strokeWidth="1" />
        <text x={width / 2} y={midY + midY / 2 + 10} textAnchor="middle" fill="#aaaaaa" fontSize={14}>Draw here</text>
      </svg>
    );
  }

  if (bg.type === 'border') {
    return (
      <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={width} height={height}>
        <rect x={10} y={10} width={width - 20} height={height - 20} fill="none" stroke="#4338ca" strokeWidth="3" rx={8} />
        <rect x={18} y={18} width={width - 36} height={height - 36} fill="none" stroke="#818cf8" strokeWidth="1" rx={5} />
      </svg>
    );
  }

  if (bg.type === 'web') {
    const cx = width / 2, cy = height / 2;
    return (
      <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={width} height={height}>
        <circle cx={cx} cy={cy} r={50} fill="#f0f0ff" stroke="#818cf8" strokeWidth="1.5" />
        <text x={cx} y={cy + 5} textAnchor="middle" fill="#818cf8" fontSize={12}>Topic</text>
        {[0, 60, 120, 180, 240, 300].map((angle, i) => {
          const rad = (angle * Math.PI) / 180;
          const nx = cx + 130 * Math.cos(rad);
          const ny = cy + 130 * Math.sin(rad);
          return (
            <g key={i}>
              <line x1={cx + 50 * Math.cos(rad)} y1={cy + 50 * Math.sin(rad)} x2={nx} y2={ny} stroke="#c4b5fd" strokeWidth="1" />
              <circle cx={nx} cy={ny} r={35} fill="#fdf4ff" stroke="#a78bfa" strokeWidth="1.5" />
            </g>
          );
        })}
      </svg>
    );
  }

  return null;
}

// Drawing canvas per page
const DrawingCanvas = ({ pageData, onUpdate, width, height }) => {
  const canvasRef = useRef(null);
  const strokes = useRef(pageData?.strokes || []);
  const current = useRef(null);
  const drawing = useRef(false);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#1e3a8a');
  const [size, setSize] = useState(4);
  // Lasso
  const [lassoPts, setLassoPts] = useState([]);
  const [lassoRect, setLassoRect] = useState(null);
  const [copied, setCopied] = useState(null); // strokes within lasso
  const lassoRef = useRef(null);
  const lassoDrawing = useRef(false);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    // Clear in CSS-pixel space (ctx is scaled by DPR)
    ctx.clearRect(0, 0, width, height);
    strokes.current.forEach(s => drawStroke(ctx, s, width, height));
    if (current.current) drawStroke(ctx, current.current, width, height);
    // Draw lasso (points stored as CSS pixels)
    if (lassoPts.length > 1) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      lassoPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }, [lassoPts, width, height]);

  function drawStroke(ctx, s, w, h) {
    if (!s.pts || s.pts.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = Math.max(1, s.size * 4);
    } else if (s.tool === 'highlighter') {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(1, s.size * 3);
    } else {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(1, s.size);
    }
    ctx.beginPath();
    s.pts.forEach((p, i) => {
      const px = p.x * w, py = p.y * h;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();
  }

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr; c.height = height * dpr;
    c.style.width = `${width}px`; c.style.height = `${height}px`;
    c.getContext('2d').scale(dpr, dpr);
    redraw();
  }, [width, height, redraw]);

  useEffect(() => { redraw(); }, [lassoPts, redraw]);

  const getPos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) / r.width, y: (src.clientY - r.top) / r.height };
  };

  const save = () => {
    onUpdate({ strokes: strokes.current });
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const onDown = (e) => {
      if (e.touches && e.touches.length > 1) return;
      e.preventDefault();
      const p = getPos(e);
      if (tool === 'lasso') {
        lassoDrawing.current = true;
        lassoRef.current = [{ x: p.x * c.offsetWidth, y: p.y * c.offsetHeight }];
        setLassoPts([{ x: p.x * c.offsetWidth, y: p.y * c.offsetHeight }]);
        return;
      }
      drawing.current = true;
      current.current = { color, size, tool: tool === 'eraser' ? 'eraser' : tool === 'highlighter' ? 'highlighter' : 'pen', pts: [p] };
      redraw();
    };
    const onMove = (e) => {
      if (e.touches && e.touches.length > 1) return;
      e.preventDefault();
      const p = getPos(e);
      if (tool === 'lasso' && lassoDrawing.current) {
        const newPts = [...(lassoRef.current || []), { x: p.x * c.offsetWidth, y: p.y * c.offsetHeight }];
        lassoRef.current = newPts;
        setLassoPts(newPts);
        return;
      }
      if (!drawing.current || !current.current) return;
      current.current.pts.push(p);
      redraw();
    };
    const onUp = () => {
      if (tool === 'lasso' && lassoDrawing.current) {
        lassoDrawing.current = false;
        // Find strokes within lasso bounds
        if (lassoRef.current && lassoRef.current.length > 2) {
          const xs = lassoRef.current.map(p => p.x);
          const ys = lassoRef.current.map(p => p.y);
          const minX = Math.min(...xs) / c.offsetWidth;
          const maxX = Math.max(...xs) / c.offsetWidth;
          const minY = Math.min(...ys) / c.offsetHeight;
          const maxY = Math.max(...ys) / c.offsetHeight;
          const inside = strokes.current.filter(s =>
            s.pts.some(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)
          );
          setCopied(inside);
          setLassoRect({ minX, maxX, minY, maxY });
        }
        return;
      }
      if (!drawing.current || !current.current) return;
      if (current.current.pts.length >= 1) strokes.current.push(current.current);
      current.current = null;
      drawing.current = false;
      redraw();
      save();
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
  }, [tool, color, size, redraw]);

  const undo = () => { strokes.current.pop(); redraw(); save(); };
  const clear = () => { strokes.current = []; redraw(); save(); };

  const paste = () => {
    if (!copied) return;
    const offset = 0.03;
    const pasted = copied.map(s => ({
      ...s,
      pts: s.pts.map(p => ({ ...p, x: p.x + offset, y: p.y + offset }))
    }));
    strokes.current = [...strokes.current, ...pasted];
    setCopied(null);
    setLassoPts([]);
    setLassoRect(null);
    redraw();
    save();
  };

  const COLORS = ['#000000', '#1e3a8a', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#ffffff'];
  const SIZES = [2, 4, 7, 12];
  const TOOLS = [
    { id: 'pen', label: '✏️' },
    { id: 'highlighter', label: '🖍' },
    { id: 'eraser', label: '◻️' },
    { id: 'lasso', label: '🔲' },
  ];

  return (
    <div className="flex gap-2" style={{ height: height }}>
      {/* Toolbar */}
      <div className="flex flex-col gap-1 p-1 rounded-xl shrink-0" style={{ background: '#1a1a2e', border: '2px solid #4338ca' }}>
        {TOOLS.map(t => (
          <button key={t.id} onClick={() => { setTool(t.id); setLassoPts([]); setCopied(null); }}
            className={`w-9 h-9 rounded-xl text-base flex items-center justify-center ${tool === t.id ? 'bg-indigo-600' : 'hover:bg-indigo-900'}`}>
            {t.label}
          </button>
        ))}
        <div className="h-px bg-indigo-800 my-0.5" />
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={`w-9 h-9 rounded-full border-4 transition-all ${color === c ? 'border-white scale-110' : 'border-transparent'}`}
            style={{ background: c }} />
        ))}
        <div className="h-px bg-indigo-800 my-0.5" />
        {SIZES.map(s => (
          <button key={s} onClick={() => setSize(s)}
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${size === s ? 'bg-indigo-600' : 'hover:bg-indigo-900'}`}>
            <div className="rounded-full bg-white" style={{ width: Math.min(s * 2, 18), height: Math.min(s * 2, 18) }} />
          </button>
        ))}
        <div className="h-px bg-indigo-800 my-0.5" />
        <button onClick={undo} className="w-9 h-9 rounded-xl hover:bg-indigo-900 text-white text-base flex items-center justify-center">↩</button>
        <button onClick={clear} className="w-9 h-9 rounded-xl hover:bg-red-900 text-red-400 flex items-center justify-center font-bold text-sm">✕</button>
        {copied && (
          <button onClick={paste} className="w-9 h-9 rounded-xl bg-green-700 text-white text-sm flex items-center justify-center font-bold" title="Paste copy">📋</button>
        )}
      </div>

      {/* Canvas */}
      <div style={{ position: 'relative', width, height, background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <PageBackground template={pageData?.template} width={width} height={height} />
        <canvas ref={canvasRef}
          style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: tool === 'eraser' ? 'cell' : tool === 'lasso' ? 'crosshair' : 'crosshair' }} />
      </div>
    </div>
  );
};

function StudentLogin({ onEnter, preselectedClass }) {
  const [className, setClassName] = useState(preselectedClass || null);
  if (!className) return (
    <div className="flex flex-col items-center gap-6 py-10 px-4">
      <h2 className="text-2xl font-black text-white">📖 Select Your Class</h2>
      <div className="grid grid-cols-3 gap-3">
        {CLASS_NAMES.map(c => (
          <motion.button key={c} whileTap={{ scale: 0.9 }} onClick={() => setClassName(c)}
            className="w-20 h-20 rounded-2xl text-3xl font-black text-white shadow-xl"
            style={{ background: '#7c3aed', border: '3px solid #a78bfa' }}>{c}</motion.button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-6 py-10 px-4">
      <h2 className="text-2xl font-black text-white">Class {className} — Your Number</h2>
      <div className="grid grid-cols-5 gap-2 max-w-sm">
        {STUDENT_NUMBERS.map(n => (
          <motion.button key={n} whileTap={{ scale: 0.85 }} onClick={() => onEnter(className, n)}
            className="w-14 h-14 rounded-2xl font-black text-white text-xl shadow-lg"
            style={{ background: '#6d28d9', border: '2px solid #7c3aed' }}>{n}</motion.button>
        ))}
      </div>
    </div>
  );
}

function StoryEditor({ story, studentNumber, className, onBack, onSave }) {
  const [pages, setPages] = useState(story.pages || [{ id: 'p1', template: 'blank', strokes: [] }]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [showTemplates, setShowTemplates] = useState(false);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 500, h: 650 });

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(e => {
      const { width } = e[0].contentRect;
      setCanvasSize({ w: Math.max(300, width - 60), h: Math.round((Math.max(300, width - 60)) * 1.3) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const updateCurrentPage = (data) => {
    setPages(prev => prev.map((p, i) => i === currentPageIdx ? { ...p, ...data } : p));
  };

  const addPage = () => {
    const newPage = { id: `p${Date.now()}`, template: 'blank', strokes: [] };
    const updated = [...pages.slice(0, currentPageIdx + 1), newPage, ...pages.slice(currentPageIdx + 1)];
    setPages(updated);
    setCurrentPageIdx(currentPageIdx + 1);
  };

  const duplicatePage = () => {
    const pg = pages[currentPageIdx];
    const dup = { ...pg, id: `p${Date.now()}` };
    const updated = [...pages.slice(0, currentPageIdx + 1), dup, ...pages.slice(currentPageIdx + 1)];
    setPages(updated);
    setCurrentPageIdx(currentPageIdx + 1);
  };

  const deletePage = () => {
    if (pages.length <= 1) return;
    const updated = pages.filter((_, i) => i !== currentPageIdx);
    setPages(updated);
    setCurrentPageIdx(Math.max(0, currentPageIdx - 1));
  };

  const saveStory = async () => {
    setSaving(true);
    await onSave({ pages });
    setSaving(false);
  };

  const setTemplate = (templateId) => {
    updateCurrentPage({ template: templateId });
    setShowTemplates(false);
  };

  const currentPage = pages[currentPageIdx];

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#0d0d1a' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ background: '#1a1a2e', borderBottom: '2px solid #7c3aed' }}>
        <button onClick={onBack} className="text-violet-300 hover:text-white font-bold text-sm">← Back</button>
        <p className="flex-1 text-white font-black text-sm truncate">{story.title}</p>
        <span className="text-violet-400 text-xs">#{studentNumber}</span>
        {saving && <span className="text-xs text-violet-400 animate-pulse">Saving…</span>}
        <button onClick={saveStory}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
          style={{ background: '#7c3aed' }}>
          💾 Save
        </button>
      </div>

      {/* Page tools bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 shrink-0 flex-wrap" style={{ background: '#12123a', borderBottom: '1px solid #4c1d95' }}>
        <button onClick={() => setShowTemplates(v => !v)}
          className="px-3 py-1.5 rounded-xl font-bold text-xs text-white"
          style={{ background: '#4c1d95' }}>📄 Template</button>
        <button onClick={addPage}
          className="px-3 py-1.5 rounded-xl font-bold text-xs text-white"
          style={{ background: '#065f46' }}>➕ Add Page</button>
        <button onClick={duplicatePage}
          className="px-3 py-1.5 rounded-xl font-bold text-xs text-white"
          style={{ background: '#1e40af' }}>⧉ Duplicate</button>
        {pages.length > 1 && (
          <button onClick={deletePage}
            className="px-3 py-1.5 rounded-xl font-bold text-xs text-red-300 border border-red-800">🗑 Delete</button>
        )}

        {/* Page thumbnails */}
        <div className="flex gap-1 ml-auto overflow-x-auto">
          {pages.map((pg, i) => (
            <button key={pg.id} onClick={() => setCurrentPageIdx(i)}
              className={`w-8 h-10 rounded-lg font-bold text-xs flex items-center justify-center border-2 ${i === currentPageIdx ? 'border-violet-400 bg-violet-900 text-white' : 'border-indigo-800 bg-indigo-950 text-indigo-400'}`}>
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Template picker */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="shrink-0 flex gap-2 px-3 py-2 overflow-x-auto"
            style={{ background: '#1a1a2e', borderBottom: '1px solid #4c1d95' }}>
            {TEMPLATES.map(t => (
              <button key={t.id} onClick={() => setTemplate(t.id)}
                className={`shrink-0 px-4 py-2 rounded-xl font-bold text-xs ${currentPage?.template === t.id ? 'bg-violet-600 text-white' : 'text-violet-300 border border-indigo-700 hover:bg-indigo-900'}`}>
                {t.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drawing area */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4" ref={containerRef}>
        {canvasSize.w > 0 && (
          <DrawingCanvas
            key={`${currentPageIdx}-${currentPage?.id}`}
            pageData={currentPage}
            onUpdate={updateCurrentPage}
            width={canvasSize.w}
            height={canvasSize.h}
          />
        )}
      </div>

      {/* Page indicator */}
      <div className="shrink-0 flex items-center justify-center gap-4 px-4 py-2" style={{ background: '#1a1a2e', borderTop: '1px solid #4c1d95' }}>
        <button onClick={() => setCurrentPageIdx(p => Math.max(0, p - 1))} disabled={currentPageIdx === 0}
          className="w-8 h-8 rounded-lg font-bold text-white disabled:opacity-30" style={{ background: '#7c3aed' }}>‹</button>
        <span className="text-violet-300 font-bold text-sm">Page {currentPageIdx + 1} of {pages.length}</span>
        <button onClick={() => setCurrentPageIdx(p => Math.min(pages.length - 1, p + 1))} disabled={currentPageIdx === pages.length - 1}
          className="w-8 h-8 rounded-lg font-bold text-white disabled:opacity-30" style={{ background: '#7c3aed' }}>›</button>
      </div>
    </div>
  );
}

export default function StoryBuilder() {
  const qc = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const urlClass = params.get('class');
  const urlNumber = parseInt(params.get('number') || params.get('student'));

  const [studentInfo, setStudentInfo] = useState(null);
  const [selectedStory, setSelectedStory] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [autoResolved, setAutoResolved] = useState(false);

  useEffect(() => {
    if (autoResolved) return;
    if (urlClass && !isNaN(urlNumber) && urlNumber > 0) {
      setStudentInfo({ className: urlClass, number: urlNumber });
      setAutoResolved(true);
    } else if (urlClass) {
      setAutoResolved(true);
    }
  }, [urlClass, urlNumber, autoResolved]);

  const { data: stories = [], refetch } = useQuery({
    queryKey: ['stories', studentInfo?.className, studentInfo?.number],
    queryFn: () => base44.entities.StoryAssignment.filter({
      class_name: studentInfo.className,
      student_number: studentInfo.number,
    }),
    enabled: !!studentInfo,
  });

  const createStory = async () => {
    if (!newTitle.trim() || !studentInfo) return;
    const story = await base44.entities.StoryAssignment.create({
      title: newTitle.trim(),
      class_name: studentInfo.className,
      student_number: studentInfo.number,
      pages: [{ id: 'p1', template: 'blank', strokes: [] }],
      status: 'in_progress',
      last_active: new Date().toISOString(),
    });
    setNewTitle('');
    setSelectedStory(story);
    refetch();
  };

  const saveStory = async (data) => {
    if (!selectedStory) return;
    await base44.entities.StoryAssignment.update(selectedStory.id, {
      ...data,
      last_active: new Date().toISOString(),
    });
    refetch();
  };

  if (selectedStory && studentInfo) {
    return (
      <StoryEditor
        story={selectedStory}
        studentNumber={studentInfo.number}
        className={studentInfo.className}
        onBack={() => setSelectedStory(null)}
        onSave={saveStory}
      />
    );
  }

  if (!studentInfo) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#0d0d1a' }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: '#7c3aed', background: '#1a1a2e' }}>
          <h1 className="text-lg font-black text-white">📖 Story Builder</h1>
        </div>
        <StudentLogin
          onEnter={(className, number) => setStudentInfo({ className, number })}
          preselectedClass={urlClass}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0d0d1a' }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: '#7c3aed', background: '#1a1a2e' }}>
        <button onClick={() => setStudentInfo(null)} className="text-violet-300 hover:text-white font-bold">← Back</button>
        <h1 className="text-lg font-black text-white flex-1">📖 My Stories</h1>
        <span className="text-violet-400 text-xs font-bold">Class {studentInfo.className} · #{studentInfo.number}</span>
      </div>

      <div className="p-4 max-w-xl mx-auto w-full">
        {/* New story */}
        <div className="flex gap-2 mb-4">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="New story title…"
            onKeyDown={e => e.key === 'Enter' && createStory()}
            className="flex-1 px-3 py-2 rounded-xl border border-violet-600 text-white text-sm"
            style={{ background: '#1a1a2e' }} />
          <button onClick={createStory} disabled={!newTitle.trim()}
            className="px-5 py-2 rounded-xl font-bold text-white disabled:opacity-40"
            style={{ background: '#7c3aed' }}>
            ➕ Create
          </button>
        </div>

        {stories.length === 0 && (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">📖</div>
            <p className="text-violet-300 font-bold">No stories yet!</p>
            <p className="text-violet-500 text-sm mt-1">Create your first story above.</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {stories.map(s => (
            <motion.button key={s.id} whileTap={{ scale: 0.98 }} onClick={() => setSelectedStory(s)}
              className="rounded-2xl p-4 text-left flex items-center gap-3"
              style={{ background: '#1a1a2e', border: '1px solid #7c3aed' }}>
              <span className="text-3xl">📖</span>
              <div>
                <p className="font-black text-white">{s.title}</p>
                <p className="text-violet-400 text-xs">{(s.pages || []).length} pages · {s.status}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}