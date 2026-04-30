import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AnimatePresence, motion } from 'framer-motion';
import AnnotationToolbar from '@/components/notebook/AnnotationToolbar';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import StoryPageBackground from '@/components/story/StoryPageBackground';
import TeacherStoryDashboard from '@/components/story/TeacherStoryDashboard';
import LaserOverlay from '@/components/notebook/LaserOverlay';
import FloatingMicWidget from '@/components/notebook/FloatingMicWidget';
import useLaserTracker from '@/hooks/useLaserTracker';

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
  const [pages, setPages] = useState(story.pages || [{ id: 'p1', template: 'blank', strokes_data: null }]);
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

  const saveTimer = useRef(null);
  const loadedKeyRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const latestStoryRef = useRef(null);
  const isDrawingRef = useRef(false);
  const currentPageIdxRef = useRef(currentPageIdx);
  
  useEffect(() => { currentPageIdxRef.current = currentPageIdx; }, [currentPageIdx]);

  const draftKey = story ? `story-draft-${story.id}-${currentPageIdx}` : null;

  // Laser
  const laserActive = tool === 'laser';
  const laserTracker = useLaserTracker({ containerRef: canvasWrapperRef, enabled: laserActive });
  const laserTrackerRef = useRef(laserTracker);
  useEffect(() => { laserTrackerRef.current = laserTracker; });

  // Resize
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

  // Load strokes when switching pages — EXACT same pattern as StudentNotebookView
  useEffect(() => {
    if (!canvasRef.current || !currentPage || canvasSize.w < 10) return;
    const key = `${story.id}-${currentPageIdx}-${canvasSize.w}-${canvasSize.h}`;
    if (loadedKeyRef.current === key) return;

    loadedKeyRef.current = key;
    const pageData = story.strokes_by_page?.[String(currentPageIdx)];
    const localDraft = draftKey ? localStorage.getItem(draftKey) : null;

    if (localDraft) {
      try {
        canvasRef.current.clearStrokes();
        canvasRef.current.loadStrokes(JSON.parse(localDraft));
      } catch {
        canvasRef.current.clearStrokes();
      }
    } else if (pageData) {
      try {
        canvasRef.current.clearStrokes();
        canvasRef.current.loadStrokes(JSON.parse(pageData));
      } catch {
        canvasRef.current.clearStrokes();
      }
    } else {
      canvasRef.current.clearStrokes();
    }

    try {
      const micsData = story.voice_notes_by_page?.[`mics_${currentPageIdx}`] || '[]';
      setFloatingMics(JSON.parse(micsData));
    } catch {
      setFloatingMics([]);
    }
  }, [currentPageIdx, story.id, story.strokes_by_page, story.voice_notes_by_page, canvasSize.w, canvasSize.h, draftKey]);

  // Save current strokes — EXACT same pattern as StudentNotebookView
  const saveStrokes = useCallback(async (pageOverride) => {
    if (!canvasRef.current) return;

    if (isDrawingRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    const activeStory = latestStoryRef.current;
    if (!activeStory) return;

    const savePage = pageOverride ?? currentPageIdxRef.current;
    const saveDraftKey = `story-draft-${activeStory.id}-${savePage}`;

    saveInFlightRef.current = true;
    setSaving(true);

    try {
      const strokeData = canvasRef.current.getStrokes();
      const payload = {
        ...strokeData,
        canvasWidth: canvasSize.w,
        canvasHeight: canvasSize.h,
        normalized: true,
      };

      const updated = {
        ...(activeStory.strokes_by_page || {}),
        [String(savePage)]: JSON.stringify(payload),
      };

      localStorage.setItem(saveDraftKey, JSON.stringify(payload));

      await onSave({
        ...activeStory,
        strokes_by_page: updated,
        last_active: new Date().toISOString(),
      });

      const nextStory = {
        ...activeStory,
        strokes_by_page: updated,
        last_active: new Date().toISOString(),
      };

      latestStoryRef.current = nextStory;
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);

      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        void saveStrokes();
      }
    }
  }, [canvasSize, onSave]);

  const handleStrokeStart = useCallback(() => {
    isDrawingRef.current = true;
  }, []);

  const handleStrokeEnd = useCallback(() => {
    isDrawingRef.current = false;
    void saveStrokes();
  }, [saveStrokes]);

  const saveMics = useCallback(async (mics) => {
    if (!latestStoryRef.current) return;
    
    setFloatingMics(mics);
    const key = `mics_${currentPageIdxRef.current}`;
    const updated = { ...(latestStoryRef.current.voice_notes_by_page || {}), [key]: JSON.stringify(mics) };
    
    const nextStory = {
      ...latestStoryRef.current,
      voice_notes_by_page: updated,
      last_active: new Date().toISOString(),
    };
    latestStoryRef.current = nextStory;
    await onSave(nextStory);
  }, [onSave]);

  const handleCanvasClick = (e) => {
    if (!addingMic || !canvasWrapperRef.current) return;
    const src = e.changedTouches ? e.changedTouches[0] : e;
    const rect = canvasWrapperRef.current.getBoundingClientRect();
    const x_pct = (src.clientX - rect.left) / rect.width;
    const y_pct = (src.clientY - rect.top) / rect.height;
    const newMic = { id: `mic-${Date.now()}`, x_pct, y_pct, audio_url: null, laser_data: null, label: '', role: 'student' };
    const updated = [...floatingMics, newMic];
    void saveMics(updated);
    setAddingMic(false);
  };

  useEffect(() => {
    latestStoryRef.current = story;
  }, [story]);

  useEffect(() => {
    if (!story) return;
    const interval = setInterval(() => {
      void saveStrokes();
    }, 20000);
    return () => clearInterval(interval);
  }, [saveStrokes, story]);

  useEffect(() => {
    const handlePageHide = () => {
      void saveStrokes();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void saveStrokes();
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [saveStrokes]);

  const goToPage = async (idx) => {
    await saveStrokes(currentPageIdx);
    loadedKeyRef.current = null;
    setCurrentPageIdx(idx);
  };

  const addPage = async () => {
    await saveStrokes();
    const newPage = { id: `p${Date.now()}`, template: 'blank' };
    const updated = [...pages.slice(0, currentPageIdxRef.current + 1), newPage, ...pages.slice(currentPageIdxRef.current + 1)];
    setPages(updated);
    loadedKeyRef.current = null;
    setCurrentPageIdx(currentPageIdxRef.current + 1);
    const nextStory = { ...story, pages: updated, last_active: new Date().toISOString() };
    latestStoryRef.current = nextStory;
    await onSave(nextStory);
  };

  const duplicatePage = async () => {
    await saveStrokes();
    const pg = pages[currentPageIdxRef.current];
    const dup = { ...pg, id: `p${Date.now()}` };
    const updated = [...pages.slice(0, currentPageIdxRef.current + 1), dup, ...pages.slice(currentPageIdxRef.current + 1)];
    setPages(updated);
    loadedKeyRef.current = null;
    setCurrentPageIdx(currentPageIdxRef.current + 1);
    const nextStory = { ...story, pages: updated, last_active: new Date().toISOString() };
    latestStoryRef.current = nextStory;
    await onSave(nextStory);
  };

  const deletePage = () => {
    if (pages.length <= 1) return;
    const updated = pages.filter((_, i) => i !== currentPageIdxRef.current);
    setPages(updated);
    loadedKeyRef.current = null;
    setCurrentPageIdx(Math.max(0, currentPageIdxRef.current - 1));
    const nextStory = { ...story, pages: updated, last_active: new Date().toISOString() };
    latestStoryRef.current = nextStory;
    void onSave(nextStory);
  };

  const saveStory = async () => {
    await saveStrokes();
    refetch?.();
  };

  const { refetch } = useQuery({
    queryKey: ['story', story?.id],
    queryFn: () => base44.entities.StoryAssignment.filter({ class_name: className, student_number: studentNumber }),
    enabled: false,
  });

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
              onUndo={() => { canvasRef.current?.undo(); }}
              onClear={() => { canvasRef.current?.clearStrokes(); }}
              side={side} onSwapSide={() => setSide(s => s === 'left' ? 'right' : 'left')}
            />
          </div>
        )}

        <div
          ref={containerRef}
          className="flex-1 overflow-auto flex items-start justify-center p-4"
          style={{ background: '#1a1a1a', cursor: addingMic ? 'copy' : 'default' }}
          onClick={handleCanvasClick}
          onTouchEnd={addingMic ? handleCanvasClick : undefined}
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
              onUndo={() => { canvasRef.current?.undo(); }}
              onClear={() => { canvasRef.current?.clearStrokes(); }}
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

  const saveStory = async (storyData) => {
    if (!selectedStory) return;
    await base44.entities.StoryAssignment.update(selectedStory.id, {
      pages: storyData.pages,
      last_active: storyData.last_active,
    });
    setSelectedStory(storyData);
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