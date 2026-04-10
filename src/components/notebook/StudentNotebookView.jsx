import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AnnotationToolbar from './AnnotationToolbar';
import VoiceNoteRecorder from './VoiceNoteRecorder';
import LaserRecordView from './LaserRecordView';
import AnnotationCanvas from './AnnotationCanvas';
import PdfPageRenderer from './PdfPageRenderer';


function getYouTubeEmbedUrl(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}?autoplay=1`;
  return url;
}

function AssignmentPicker({ assignments, onSelect }) {
  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4" style={{ background: '#0f0f1a' }}>
      <h2 className="text-2xl font-black text-white mb-6">📓 Your Assignments</h2>
      {assignments.length === 0 && <p className="text-indigo-400">No active assignments right now.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-xl">
        {assignments.map(a => (
          <motion.button key={a.id} whileTap={{ scale: 0.97 }} onClick={() => onSelect(a)}
            className="rounded-2xl p-5 text-left flex flex-col gap-2 hover:scale-105 transition-all"
            style={{ background: '#1a1a2e', border: '2px solid #4338ca' }}>
            <span className="text-3xl">📄</span>
            <p className="font-black text-white text-lg">{a.title}</p>
            <p className="text-xs text-indigo-300">{a.page_mode === 'locked' ? '🔒 Teacher-paced' : '🆓 Self-paced'}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export default function StudentNotebookView({ studentNumber, className, onBack }) {
  const qc = useQueryClient();
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#4338ca');
  const [size, setSize] = useState(4);
  const [side, setSide] = useState('left');
  const [session, setSession] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastUrl, setBroadcastUrl] = useState(null);
  const [showAudioHint, setShowAudioHint] = useState(false);
  const [showVoiceNote, setShowVoiceNote] = useState(false);
  const [showLaserRecord, setShowLaserRecord] = useState(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 800 });
  const [pdfRenderedSize, setPdfRenderedSize] = useState(null);
  const saveTimer = useRef(null);

  const { data: assignments = [] } = useQuery({
    queryKey: ['student-notebook-assignments', className],
    queryFn: () => base44.entities.DigitalNotebookAssignment.filter({ class_name: className, status: 'active' }),
    refetchInterval: 5000,
  });

  // Poll assignment for page lock changes & broadcast
  useQuery({
    queryKey: ['student-notebook-poll', selectedAssignment?.id],
    queryFn: async () => {
      const fresh = await base44.entities.DigitalNotebookAssignment.filter({ class_name: className, status: 'active' });
      const a = fresh.find(x => x.id === selectedAssignment?.id);
      if (!a) return null;
      // Sync locked page
      if (a.page_mode === 'locked' && a.locked_page && a.locked_page !== currentPage) {
        setCurrentPage(a.locked_page);
      }
      // Broadcast video
      if (a.broadcast_video && a.broadcast_video !== broadcastUrl) {
        setBroadcastUrl(a.broadcast_video);
        setShowBroadcast(true);
      } else if (!a.broadcast_video) {
        setBroadcastUrl(null);
        setShowBroadcast(false);
      }
      return a;
    },
    enabled: !!selectedAssignment,
    refetchInterval: 3000,
  });

  // Resize canvas to container
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setCanvasSize({ w: Math.round(width), h: Math.round(height) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [selectedAssignment]);

  // Load or create session when assignment selected
  useEffect(() => {
    if (!selectedAssignment) return;
    (async () => {
      const sessions = await base44.entities.NotebookSession.filter({
        assignment_id: selectedAssignment.id,
        student_number: studentNumber,
        class_name: className,
      });
      if (sessions.length > 0) {
        setSession(sessions[0]);
        const page = sessions[0].current_page || 1;
        setCurrentPage(selectedAssignment.page_mode === 'locked' ? (selectedAssignment.locked_page || 1) : page);
      } else {
        const newSession = await base44.entities.NotebookSession.create({
          assignment_id: selectedAssignment.id,
          class_name: className,
          student_number: studentNumber,
          current_page: 1,
          strokes_by_page: {},
        });
        setSession(newSession);
        setCurrentPage(selectedAssignment.page_mode === 'locked' ? (selectedAssignment.locked_page || 1) : 1);
      }
    })();
  }, [selectedAssignment]);

  // Load strokes for current page
  useEffect(() => {
    if (!session || !canvasRef.current) return;
    const pageData = session.strokes_by_page?.[String(currentPage)];
    if (pageData) {
      try { canvasRef.current.loadStrokes(JSON.parse(pageData)); }
      catch { canvasRef.current.clearStrokes(); }
    } else {
      canvasRef.current.clearStrokes();
    }
  }, [currentPage, session?.id]);

  const saveStrokes = useCallback(async () => {
    if (!session || !canvasRef.current) return;
    setSaving(true);
    const strokes = canvasRef.current.getStrokes();
    const updated = {
      ...((session.strokes_by_page) || {}),
      [String(currentPage)]: JSON.stringify(strokes),
    };
    await base44.entities.NotebookSession.update(session.id, {
      strokes_by_page: updated,
      current_page: currentPage,
      last_active: new Date().toISOString(),
    });
    setSession(s => ({ ...s, strokes_by_page: updated, current_page: currentPage }));
    setSaving(false);
  }, [session, currentPage]);

  const saveVoiceNote = useCallback(async (url) => {
    if (!session) return;
    const updated = { ...(session.voice_notes_by_page || {}), [String(currentPage)]: url };
    await base44.entities.NotebookSession.update(session.id, { voice_notes_by_page: updated });
    setSession(s => ({ ...s, voice_notes_by_page: updated }));
  }, [session, currentPage]);

  const deleteVoiceNote = useCallback(async () => {
    if (!session) return;
    const updated = { ...(session.voice_notes_by_page || {}) };
    delete updated[String(currentPage)];
    await base44.entities.NotebookSession.update(session.id, { voice_notes_by_page: updated });
    setSession(s => ({ ...s, voice_notes_by_page: updated }));
  }, [session, currentPage]);

  // Auto-save on page change
  const goToPage = async (p) => {
    await saveStrokes();
    setCurrentPage(p);
  };

  // Audio for current page
  const pageAudio = selectedAssignment?.audio_instructions?.filter(a => a.page === currentPage) || [];
  const pageVideo = selectedAssignment?.video_instructions?.filter(v => v.page === currentPage) || [];

  const minPage = selectedAssignment?.page_range_start || 1;
  const maxPage = selectedAssignment?.page_range_end || 999;

  if (!selectedAssignment) {
    return <AssignmentPicker assignments={assignments} onSelect={setSelectedAssignment} />;
  }

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#0f0f1a' }}>
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0" style={{ background: '#1a1a2e', borderBottom: '2px solid #4338ca' }}>
        <button onClick={() => { saveStrokes(); setSelectedAssignment(null); }}
          className="text-indigo-300 hover:text-white font-bold text-sm">← Back</button>
        <p className="flex-1 text-white font-black text-sm truncate">{selectedAssignment.title}</p>
        <span className="text-indigo-300 text-sm font-bold">Page {currentPage}</span>
        {saving && <span className="text-xs text-indigo-400 animate-pulse">Saving…</span>}
        <button onClick={saveStrokes} className="px-3 py-1.5 rounded-xl text-xs font-bold text-white" style={{ background: '#4338ca' }}>💾 Save</button>
        <button onClick={() => setShowLaserRecord(v => !v)}
          className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
          style={{ background: showLaserRecord ? '#9333ea' : '#4338ca' }}>🎥 Record</button>
      </div>

      {/* Broadcast video overlay */}
      <AnimatePresence>
        {showBroadcast && broadcastUrl && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute top-14 left-1/2 -translate-x-1/2 z-50 shadow-2xl rounded-2xl overflow-hidden"
            style={{ width: 360, border: '3px solid #9333ea', background: '#1a1a2e' }}>
            <div className="flex items-center justify-between px-3 py-1.5" style={{ background: '#9333ea' }}>
              <span className="text-white text-xs font-bold">📡 Teacher Video</span>
              <button onClick={() => setShowBroadcast(false)} className="text-white font-bold">✕</button>
            </div>
            <div style={{ aspectRatio: '16/9' }}>
              <iframe src={getYouTubeEmbedUrl(broadcastUrl)} allow="autoplay" allowFullScreen className="w-full h-full" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Audio / Video hints */}
      {(pageAudio.length > 0 || pageVideo.length > 0) && (
        <div className="absolute bottom-16 right-4 z-40 flex flex-col gap-2">
          <button onClick={() => setShowAudioHint(v => !v)}
            className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center text-2xl"
            style={{ background: '#4338ca', border: '3px solid #9333ea' }}>
            🔊
          </button>
          <AnimatePresence>
            {showAudioHint && (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="rounded-2xl p-3 flex flex-col gap-2 max-w-xs w-64"
                style={{ background: '#1a1a2e', border: '2px solid #4338ca' }}>
                {pageAudio.map((a, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <span className="text-xs text-indigo-300">{a.label}</span>
                    <audio controls src={a.url} className="w-full h-8" />
                  </div>
                ))}
                {pageVideo.map((v, i) => (
                  <div key={i}>
                    <p className="text-xs text-indigo-300 mb-1">{v.label}</p>
                    <div style={{ aspectRatio: '16/9' }} className="rounded-xl overflow-hidden">
                      <iframe src={getYouTubeEmbedUrl(v.url)} allowFullScreen className="w-full h-full" />
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Main content area: toolbar + PDF side by side */}
      {showLaserRecord ? (
        <div className="flex-1 overflow-auto">
          <LaserRecordView
            assignment={selectedAssignment}
            session={session}
            onRecordingSaved={(updated) => setSession(s => ({ ...s, recordings_by_page: updated }))}
          />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
          {/* Sidebar toolbar */}
          <div className="p-1.5 overflow-y-auto shrink-0" style={{ background: '#1a1a2e' }}>
            <AnnotationToolbar
              tool={tool} setTool={setTool}
              color={color} setColor={setColor}
              size={size} setSize={setSize}
              onUndo={() => canvasRef.current?.undo()}
              onClear={() => canvasRef.current?.clearStrokes()}
            />
          </div>

          {/* PDF + canvas */}
          <div ref={containerRef} className="flex-1 overflow-auto" style={{ background: '#e8e8e8' }}>
            {selectedAssignment.pdf_url ? (
              <div style={{ position: 'relative', display: 'inline-block', minWidth: '100%' }}>
                <PdfPageRenderer
                  pdfUrl={selectedAssignment.pdf_url}
                  pageNumber={currentPage}
                  onRendered={(w, h) => setPdfRenderedSize({ w, h })}
                />
                {pdfRenderedSize && (
                  <AnnotationCanvas
                    ref={canvasRef}
                    width={pdfRenderedSize.w}
                    height={pdfRenderedSize.h}
                    color={color}
                    size={size}
                    tool={tool}
                    mode="draw"
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full bg-white">
                <p className="text-gray-400 text-lg">No PDF uploaded</p>
              </div>
            )}
          </div>

          {/* Voice note button */}
          <button
            onClick={() => setShowVoiceNote(v => !v)}
            className="absolute bottom-20 right-4 z-40 w-12 h-12 rounded-full shadow-xl flex items-center justify-center text-xl"
            style={{ background: showVoiceNote ? '#9333ea' : '#4338ca', border: '3px solid #9333ea' }}
          >
            🎙
          </button>

          {showVoiceNote && (
            <div className="absolute bottom-36 right-4 z-40 w-72">
              <VoiceNoteRecorder
                existingUrl={session?.voice_notes_by_page?.[String(currentPage)]}
                onSaved={saveVoiceNote}
                onDelete={deleteVoiceNote}
              />
            </div>
          )}
        </div>
      )}

      {/* Page navigation */}
      {selectedAssignment.page_mode === 'free' && (
        <div className="flex items-center justify-center gap-3 py-2 shrink-0" style={{ background: '#1a1a2e', borderTop: '2px solid #4338ca' }}>
          <button disabled={currentPage <= minPage} onClick={() => goToPage(currentPage - 1)}
            className="px-4 py-1.5 rounded-xl font-bold text-white disabled:opacity-30"
            style={{ background: '#4338ca' }}>‹ Prev</button>
          <span className="text-white font-black text-sm">{currentPage} / {maxPage}</span>
          <button disabled={currentPage >= maxPage} onClick={() => goToPage(currentPage + 1)}
            className="px-4 py-1.5 rounded-xl font-bold text-white disabled:opacity-30"
            style={{ background: '#4338ca' }}>Next ›</button>
        </div>
      )}
    </div>
  );
}