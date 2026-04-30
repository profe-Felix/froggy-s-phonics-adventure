import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import AnnotationToolbar from '@/components/notebook/AnnotationToolbar';
import FloatingMicWidget from '@/components/notebook/FloatingMicWidget';
import LaserOverlay from '@/components/notebook/LaserOverlay';
import useLaserTracker from '@/hooks/useLaserTracker';
import TeacherStoryDashboard from '@/components/story/TeacherStoryDashboard';
import StoryPageBackground from '@/components/story/StoryPageBackground';

const CLASS_NAMES = ['F', 'V', 'C', 'A', 'B', 'D'];
const STUDENT_NUMBERS = Array.from({ length: 30 }, (_, i) => i + 1);

const TEMPLATES = [
  { id: 'blank', label: '⬜ Blank' },
  { id: 'lined', label: '📄 Lined' },
  { id: 'half_image_top', label: '🖼 Image top' },
  { id: 'half_image_bottom', label: '📝 Lines top' },
  { id: 'story_web', label: '🕸 Story web' },
  { id: 'border', label: '🖼 Border' },
];



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
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#1e3a8a');
  const [size, setSize] = useState(4);
  const [side, setSide] = useState('left');
  const [addingMic, setAddingMic] = useState(false);
  const [floatingMics, setFloatingMics] = useState([]);

  const containerRef = useRef(null);
  const canvasWrapperRef = useRef(null);
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 500, h: 650 });

  // Mirrors of mutable state kept in refs so callbacks never go stale
  const isDrawingRef = useRef(false);
  const currentPageIdxRef = useRef(currentPageIdx);
  const pagesRef = useRef(pages);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const loadedKeyRef = useRef(null);

  useEffect(() => { currentPageIdxRef.current = currentPageIdx; }, [currentPageIdx]);
  useEffect(() => { pagesRef.current = pages; }, [pages]);

  // Laser
  const laserActive = tool === 'laser';
  const laserTracker = useLaserTracker({ containerRef: canvasWrapperRef, enabled: laserActive });
  const laserTrackerRef = useRef(laserTracker);
  useEffect(() => { laserTrackerRef.current = laserTracker; });

  // Resize — just update canvas size; AnnotationCanvas handles normalized coords itself
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(e => {
      const { width } = e[0].contentRect;
      const w = Math.max(300, width - 60);
      setCanvasSize({ w, h: Math.round(w * 1.3) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const currentPage = pages[currentPageIdx];

  // Load strokes when switching pages (use loadedKeyRef to avoid double-loads on resize)
  useEffect(() => {
    if (!canvasRef.current || !currentPage || canvasSize.w < 10) return;
    const key = `${story.id}-${currentPageIdx}-${canvasSize.w}`;
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;

    canvasRef.current.clearStrokes();
    if (currentPage.strokes_data) {
      try { canvasRef.current.loadStrokes(JSON.parse(currentPage.strokes_data)); } catch {}
    } else if (currentPage.strokes && currentPage.strokes.length > 0) {
      canvasRef.current.loadStrokes({ strokes: currentPage.strokes, normalized: true });
    }
    try { setFloatingMics(currentPage.mics ? JSON.parse(currentPage.mics) : []); } catch { setFloatingMics([]); }
  }, [currentPageIdx, story.id, canvasSize.w]);

  // Save current strokes into pages state (and persist to backend)
  const saveCurrentPage = useCallback(async (pageIdxOverride) => {
    if (!canvasRef.current) return;
    if (isDrawingRef.current) { pendingSaveRef.current = true; return; }
    if (saveInFlightRef.current) { pendingSaveRef.current = true; return; }

    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const idx = pageIdxOverride ?? currentPageIdxRef.current;
      const strokeData = canvasRef.current.getStrokes();
      const payload = JSON.stringify({ ...strokeData, normalized: true });

      // Update pages state
      pagesRef.current = pagesRef.current.map((p, i) =>
        i === idx ? { ...p, strokes_data: payload } : p
      );
      setPages(pagesRef.current);

      // Persist immediately to backend
      await onSave({ pages: pagesRef.current });
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void saveCurrentPage();
      }
    }
  }, [onSave]);

  const handleStrokeStart = useCallback(() => { isDrawingRef.current = true; }, []);
  const handleStrokeEnd = useCallback(() => {
    isDrawingRef.current = false;
    void saveCurrentPage();
  }, [saveCurrentPage]);

  // Periodic autosave (every 20s)
  useEffect(() => {
    const interval = setInterval(() => void saveCurrentPage(), 20000);
    return () => clearInterval(interval);
  }, [saveCurrentPage]);

  // Save on page hide / tab switch
  useEffect(() => {
    const onHide = () => void saveCurrentPage();
    const onVis = () => { if (document.visibilityState === 'hidden') void saveCurrentPage(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [saveCurrentPage]);

  const saveMics = useCallback((mics) => {
    setFloatingMics(mics);
    pagesRef.current = pagesRef.current.map((p, i) =>
      i === currentPageIdxRef.current ? { ...p, mics: JSON.stringify(mics) } : p
    );
    setPages(pagesRef.current);
    onSave({ pages: pagesRef.current });
  }, [onSave]);

  const handleCanvasClick = (e) => {
    if (!addingMic || !canvasWrapperRef.current) return;
    const rect = canvasWrapperRef.current.getBoundingClientRect();
    const x_pct = (e.clientX - rect.left) / rect.width;
    const y_pct = (e.clientY - rect.top) / rect.height;
    const newMic = { id: `mic-${Date.now()}`, x_pct, y_pct, audio_url: null, laser_data: null, label: '' };
    saveMics([...floatingMics, newMic]);
    setAddingMic(false);
  };

  const goToPage = async (idx) => {
    await saveCurrentPage(currentPageIdxRef.current);
    loadedKeyRef.current = null;
    setCurrentPageIdx(idx);
  };

  const addPage = async () => {
    await saveCurrentPage();
    const newPage = { id: `p${Date.now()}`, template: 'blank', strokes_data: null, mics: null };
    const updated = [...pagesRef.current.slice(0, currentPageIdxRef.current + 1), newPage, ...pagesRef.current.slice(currentPageIdxRef.current + 1)];
    pagesRef.current = updated;
    setPages(updated);
    loadedKeyRef.current = null;
    setCurrentPageIdx(currentPageIdxRef.current + 1);
    onSave({ pages: updated });
  };

  const duplicatePage = async () => {
    await saveCurrentPage();
    const pg = pagesRef.current[currentPageIdxRef.current];
    const dup = { ...pg, id: `p${Date.now()}` };
    const updated = [...pagesRef.current.slice(0, currentPageIdxRef.current + 1), dup, ...pagesRef.current.slice(currentPageIdxRef.current + 1)];
    pagesRef.current = updated;
    setPages(updated);
    loadedKeyRef.current = null;
    setCurrentPageIdx(currentPageIdxRef.current + 1);
    onSave({ pages: updated });
  };

  const deletePage = () => {
    if (pages.length <= 1) return;
    const updated = pagesRef.current.filter((_, i) => i !== currentPageIdxRef.current);
    pagesRef.current = updated;
    setPages(updated);
    loadedKeyRef.current = null;
    setCurrentPageIdx(Math.max(0, currentPageIdxRef.current - 1));
    onSave({ pages: updated });
  };

  const saveStory = async () => {
    await saveCurrentPage();
  };

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#0d0d1a' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ background: '#1a1a2e', borderBottom: '2px solid #7c3aed' }}>
        <button onClick={onBack} className="text-violet-300 hover:text-white font-bold text-sm">← Back</button>
        <p className="flex-1 text-white font-black text-sm truncate">{story.title}</p>
        <span className="text-violet-400 text-xs">#{studentNumber}</span>
        {saving && <span className="text-xs text-violet-400 animate-pulse">Saving…</span>}
        <button onClick={() => void saveStory()} className="px-3 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: '#7c3aed' }}>
          💾 Save
        </button>
      </div>

      {/* Page tools bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 shrink-0 flex-wrap" style={{ background: '#12123a', borderBottom: '1px solid #4c1d95' }}>
        <button onClick={() => setShowTemplates(v => !v)} className="px-3 py-1.5 rounded-xl font-bold text-xs text-white" style={{ background: '#4c1d95' }}>📄 Template</button>
        <button onClick={addPage} className="px-3 py-1.5 rounded-xl font-bold text-xs text-white" style={{ background: '#065f46' }}>➕ Add Page</button>
        <button onClick={duplicatePage} className="px-3 py-1.5 rounded-xl font-bold text-xs text-white" style={{ background: '#1e40af' }}>⧉ Duplicate</button>
        {pages.length > 1 && (
          <button onClick={deletePage} className="px-3 py-1.5 rounded-xl font-bold text-xs text-red-300 border border-red-800">🗑 Delete</button>
        )}
        {/* Add mic button */}
        <button
          onClick={() => setAddingMic(v => !v)}
          className="px-3 py-1.5 rounded-xl font-bold text-xs text-white"
          style={{ background: addingMic ? '#f59e0b' : '#374151', border: addingMic ? '2px solid #fbbf24' : '2px solid #6b7280' }}
        >
          {addingMic ? '📍 Tap to place mic' : '🎙+ Add Mic'}
        </button>
        {/* Page thumbnails */}
        <div className="flex gap-1 ml-auto overflow-x-auto">
          {pages.map((pg, i) => (
            <button key={pg.id} onClick={() => goToPage(i)}
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
              <button key={t.id} onClick={() => {
                setPages(prev => prev.map((p, i) => i === currentPageIdx ? { ...p, template: t.id } : p));
                setShowTemplates(false);
              }}
                className={`shrink-0 px-4 py-2 rounded-xl font-bold text-xs ${currentPage?.template === t.id ? 'bg-violet-600 text-white' : 'text-violet-300 border border-indigo-700 hover:bg-indigo-900'}`}>
                {t.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main drawing area */}
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        {side === 'left' && (
          <div className="p-1.5 shrink-0" style={{ background: '#1a1a2e' }}>
            <AnnotationToolbar
              tool={tool} setTool={setTool}
              color={color} setColor={setColor}
              size={size} setSize={setSize}
              onUndo={() => { canvasRef.current?.undo(); void saveCurrentPage(); }}
              onClear={() => { canvasRef.current?.clearStrokes(); void saveCurrentPage(); }}
              side={side} onSwapSide={() => setSide(s => s === 'left' ? 'right' : 'left')}
            />
          </div>
        )}

        <div
          ref={containerRef}
          className="flex-1 overflow-auto flex items-start justify-center p-4"
          style={{ background: '#1a1a1a', cursor: addingMic ? 'copy' : 'default' }}
          onClick={handleCanvasClick}
        >
          {canvasSize.w > 0 && (
            <div
              ref={canvasWrapperRef}
              style={{ position: 'relative', width: canvasSize.w, height: canvasSize.h, background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', flexShrink: 0 }}
            >
              <StoryPageBackground template={currentPage?.template} width={canvasSize.w} height={canvasSize.h} />

              <AnnotationCanvas
                ref={canvasRef}
                width={canvasSize.w}
                height={canvasSize.h}
                color={color}
                size={size}
                tool={tool === 'laser' ? 'none' : tool}
                mode={tool === 'laser' ? 'none' : 'draw'}
                passThrough={addingMic}
                onStrokeStart={handleStrokeStart}
                onStrokeEnd={handleStrokeEnd}
              />

              {laserActive && (
                <LaserOverlay
                  trailPoints={laserTracker.trailPoints}
                  width={canvasSize.w}
                  height={canvasSize.h}
                />
              )}

              {/* Floating mic widgets */}
              {floatingMics.map(mic => (
                <FloatingMicWidget
                  key={mic.id}
                  note={mic}
                  containerRef={canvasWrapperRef}
                  canvasRef={canvasRef}
                  laserTrackerRef={laserTrackerRef}
                  containerSize={canvasSize}
                  role="student"
                  onSave={(updated) => saveMics(floatingMics.map(m => m.id === mic.id ? updated : m))}
                  onRemove={() => saveMics(floatingMics.filter(m => m.id !== mic.id))}
                />
              ))}
            </div>
          )}
        </div>

        {side === 'right' && (
          <div className="p-1.5 shrink-0" style={{ background: '#1a1a2e' }}>
            <AnnotationToolbar
              tool={tool} setTool={setTool}
              color={color} setColor={setColor}
              size={size} setSize={setSize}
              onUndo={() => { canvasRef.current?.undo(); void saveCurrentPage(); }}
              onClear={() => { canvasRef.current?.clearStrokes(); void saveCurrentPage(); }}
              side={side} onSwapSide={() => setSide(s => s === 'left' ? 'right' : 'left')}
            />
          </div>
        )}
      </div>

      {/* Page nav footer */}
      <div className="shrink-0 flex items-center justify-center gap-4 px-4 py-2" style={{ background: '#1a1a2e', borderTop: '1px solid #4c1d95' }}>
        <button onClick={() => goToPage(currentPageIdx - 1)} disabled={currentPageIdx === 0}
          className="w-8 h-8 rounded-lg font-bold text-white disabled:opacity-30" style={{ background: '#7c3aed' }}>‹</button>
        <span className="text-violet-300 font-bold text-sm">Page {currentPageIdx + 1} of {pages.length}</span>
        <button onClick={() => goToPage(currentPageIdx + 1)} disabled={currentPageIdx === pages.length - 1}
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
  const isTeacher = params.get('mode') === 'teacher';

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
    queryFn: () => base44.entities.StoryAssignment.filter({ class_name: studentInfo.className, student_number: studentInfo.number }),
    enabled: !!studentInfo,
  });

  const createStory = async () => {
    if (!newTitle.trim() || !studentInfo) return;
    const story = await base44.entities.StoryAssignment.create({
      title: newTitle.trim(),
      class_name: studentInfo.className,
      student_number: studentInfo.number,
      pages: [{ id: 'p1', template: 'blank', strokes_data: null, mics: null }],
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

  if (isTeacher) {
    return <TeacherStoryDashboard onBack={() => window.history.back()} />;
  }

  if (selectedStory && studentInfo) {
    return (
      <StoryEditor
        key={selectedStory.id}
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
        <StudentLogin onEnter={(cls, num) => setStudentInfo({ className: cls, number: num })} preselectedClass={urlClass} />
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