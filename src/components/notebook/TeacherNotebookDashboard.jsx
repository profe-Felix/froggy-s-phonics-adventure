import { useState, useRef, useEffect } from 'react';
import LaserRecordView from './LaserRecordView';
import { motion, AnimatePresence } from 'framer-motion';
import ReplayModal from './ReplayModal';
import StudentThumbnail from './StudentThumbnail';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const CLASS_NAMES = ['F', 'V', 'C', 'A', 'B', 'D'];

function AudioRecorder({ onSave, onCancel }) {
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  const start = async () => {
    chunksRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRef.current = new MediaRecorder(stream);
    mediaRef.current.ondataavailable = e => chunksRef.current.push(e.data);
    mediaRef.current.onstop = () => {
      const b = new Blob(chunksRef.current, { type: 'audio/webm' });
      setBlob(b);
      setAudioUrl(URL.createObjectURL(b));
    };
    mediaRef.current.start();
    setRecording(true);
  };

  const stop = () => { mediaRef.current?.stop(); setRecording(false); };

  const handleSave = async () => {
    if (!blob) return;
    const file = new File([blob], 'instruction.webm', { type: 'audio/webm' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    onSave(file_url);
  };

  return (
    <div className="p-4 rounded-2xl bg-indigo-900 border border-indigo-500 flex flex-col gap-3">
      <p className="text-white font-bold text-sm">🎙 Record Audio Instruction</p>
      {!blob && (
        <button onClick={recording ? stop : start}
          className={`py-2 rounded-xl font-bold text-white ${recording ? 'bg-red-600 animate-pulse' : 'bg-indigo-600'}`}>
          {recording ? '⏹ Stop Recording' : '🎙 Start Recording'}
        </button>
      )}
      {audioUrl && (
        <>
          <audio controls src={audioUrl} className="w-full" />
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex-1 py-2 rounded-xl bg-green-600 text-white font-bold">Save</button>
            <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-gray-600 text-white font-bold">Cancel</button>
          </div>
        </>
      )}
      {!blob && !recording && (
        <button onClick={onCancel} className="py-2 rounded-xl bg-gray-700 text-white font-bold">Cancel</button>
      )}
    </div>
  );
}

function VideoUrlInput({ onSave, onCancel }) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  return (
    <div className="p-4 rounded-2xl bg-indigo-900 border border-indigo-500 flex flex-col gap-3">
      <p className="text-white font-bold text-sm">🎬 Add Video Instruction</p>
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (e.g. Letter Formation)"
        className="px-3 py-2 rounded-xl bg-indigo-800 text-white border border-indigo-500 text-sm" />
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="YouTube or video URL"
        className="px-3 py-2 rounded-xl bg-indigo-800 text-white border border-indigo-500 text-sm" />
      <div className="flex gap-2">
        <button onClick={() => url && onSave(url, label)} className="flex-1 py-2 rounded-xl bg-green-600 text-white font-bold disabled:opacity-40" disabled={!url}>Save</button>
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-gray-600 text-white font-bold">Cancel</button>
      </div>
    </div>
  );
}

function StudentCard({ session, assignment, onViewWork, onReplayStrokes }) {
  const page = session.current_page || 1;
  const hasWork = session.strokes_by_page && Object.keys(session.strokes_by_page).length > 0;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-3 flex flex-col gap-2"
      style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}>
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white text-lg"
          style={{ background: '#4338ca' }}>
          {session.student_number}
        </div>
        <span className="text-xs text-indigo-300">Page {page}</span>
      </div>
      <div className="flex gap-1">
        {hasWork && <>
          <button onClick={() => onViewWork(session)} className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#2563eb' }}>
            👁 View
          </button>
          <button onClick={() => onReplayStrokes(session)} className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#9333ea' }}>
            ▶ Replay
          </button>
        </>}
        {!hasWork && <span className="text-xs text-indigo-500 italic">No work yet</span>}
      </div>
    </motion.div>
  );
}

export default function TeacherNotebookDashboard({ onBack }) {
  const qc = useQueryClient();
  const [className, setClassName] = useState('F');
  const [tab, setTab] = useState('assignments');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showAudio, setShowAudio] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [audioPage, setAudioPage] = useState(1);
  const [videoBroadcast, setVideoBroadcast] = useState('');
  const [globalViewPage, setGlobalViewPage] = useState(null);
  const [replaySession, setReplaySession] = useState(null);
  const [replayAssignment, setReplayAssignment] = useState(null);
  const [replayPage, setReplayPage] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [totalPages, setTotalPages] = useState('');

  const { data: assignments = [] } = useQuery({
    queryKey: ['notebook-assignments', className],
    queryFn: () => base44.entities.DigitalNotebookAssignment.filter({ class_name: className }),
    refetchInterval: 5000,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['notebook-sessions', selectedAssignment?.id],
    queryFn: () => base44.entities.NotebookSession.filter({ assignment_id: selectedAssignment.id }),
    enabled: !!selectedAssignment,
    refetchInterval: 5000,
  });

  const updateAssignment = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DigitalNotebookAssignment.update(id, data),
    onSuccess: () => qc.invalidateQueries(['notebook-assignments', className]),
  });

  const extractPageCount = async (file) => {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      return pdf.numPages;
    } catch {
      return null;
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file || file.type !== 'application/pdf') return alert('Please drop a PDF file');
    if (!newTitle.trim()) return alert('Please enter a title first');
    setUploading(true);
    const [{ file_url }, pageCount] = await Promise.all([
      base44.integrations.Core.UploadFile({ file }),
      extractPageCount(file),
    ]);
    await base44.entities.DigitalNotebookAssignment.create({
      title: newTitle.trim(),
      class_name: className,
      pdf_url: file_url,
      status: 'draft',
      page_mode: 'free',
      page_range_start: 1,
      page_range_end: pageCount || 1,
      pdf_page_count: pageCount || 1,
      page_count: pageCount || 1,
    });
    setNewTitle('');
    setUploading(false);
    qc.invalidateQueries(['notebook-assignments', className]);
  };

  const handleSaveAudio = async (url) => {
    const existing = selectedAssignment.audio_instructions || [];
    await updateAssignment.mutateAsync({
      id: selectedAssignment.id,
      data: { audio_instructions: [...existing, { page: audioPage, url, label: `Page ${audioPage} instruction` }] }
    });
    setShowAudio(false);
    const refreshed = assignments.find(a => a.id === selectedAssignment.id);
    if (refreshed) setSelectedAssignment(refreshed);
  };

  const handleSaveVideo = async (url, label) => {
    const existing = selectedAssignment.video_instructions || [];
    await updateAssignment.mutateAsync({
      id: selectedAssignment.id,
      data: { video_instructions: [...existing, { page: audioPage, url, label: label || 'Video', type: 'url' }] }
    });
    setShowVideo(false);
  };

  useEffect(() => {
    setRangeStart(selectedAssignment?.page_range_start ?? '');
    setRangeEnd(selectedAssignment?.page_range_end ?? '');
    setTotalPages(selectedAssignment?.pdf_page_count ?? selectedAssignment?.page_count ?? '');
  }, [selectedAssignment?.id]);

  const setPageMode = (mode) => {
  if (!selectedAssignment) return;

  const effectiveTotalPages =
    selectedAssignment.pdf_page_count ||
    selectedAssignment.page_count ||
    selectedAssignment.page_range_end ||
    1;

  const safeLockedPage = Math.max(
    1,
    Math.min(
      effectiveTotalPages,
      selectedAssignment.locked_page ||
      selectedAssignment.page_range_start ||
      selectedAssignment.current_page ||
      1
    )
  );

  const data =
    mode === 'locked'
      ? { page_mode: mode, locked_page: safeLockedPage }
      : { page_mode: mode };

  updateAssignment.mutate({ id: selectedAssignment.id, data });
  setSelectedAssignment(a => ({ ...a, ...data }));
};

  const setLockedPage = (page) => {
    updateAssignment.mutate({ id: selectedAssignment.id, data: { locked_page: page } });
    setSelectedAssignment(a => ({ ...a, locked_page: page }));
  };

  const setStatus = (status) => {
    updateAssignment.mutate({ id: selectedAssignment.id, data: { status } });
    setSelectedAssignment(a => ({ ...a, status }));
  };

  const broadcastVideo = () => {
    if (!videoBroadcast.trim() || !selectedAssignment) return;
    updateAssignment.mutate({ id: selectedAssignment.id, data: { broadcast_video: videoBroadcast.trim() } });
  };

  const effectiveTotalPages =
    selectedAssignment?.pdf_page_count ||
    selectedAssignment?.page_count ||
    selectedAssignment?.page_range_end ||
    1;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f0f1a', color: 'white' }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: '#4338ca', background: '#1a1a2e' }}>
        <button onClick={onBack} className="text-indigo-300 hover:text-white font-bold">← Back</button>
        <h1 className="text-lg font-black text-white flex-1">📓 Digital Notebook</h1>
        <select value={className} onChange={e => setClassName(e.target.value)}
          className="px-3 py-1.5 rounded-xl font-bold text-white border border-indigo-500"
          style={{ background: '#1a1a2e' }}>
          {CLASS_NAMES.map(c => <option key={c} value={c}>Class {c}</option>)}
        </select>
      </div>

      <div className="flex gap-0 border-b" style={{ borderColor: '#4338ca', background: '#1a1a2e' }}>
        {[['assignments', '📋 Assignments'], ['manage', '⚙️ Manage'], ['students', '👥 Students'], ['record', '🎥 Record']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-5 py-2.5 font-bold text-sm transition-all ${tab === id ? 'text-white border-b-2 border-indigo-400' : 'text-indigo-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {tab === 'assignments' && (
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}>
              <p className="font-bold text-indigo-200 text-sm">Create New Assignment</p>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Assignment title..."
                className="px-3 py-2 rounded-xl border border-indigo-500 text-white text-sm"
                style={{ background: '#0f0f1a' }} />
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => !uploading && document.getElementById('pdf-file-input').click()}
                className={`h-32 rounded-2xl border-4 border-dashed flex flex-col items-center justify-center gap-2 transition-all cursor-pointer
                  ${dragging ? 'border-indigo-400 bg-indigo-900/30' : 'border-indigo-700 hover:border-indigo-500'}`}>
                {uploading ? <div className="w-6 h-6 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  : <><span className="text-3xl">📄</span><p className="text-indigo-300 text-sm font-bold">Drop PDF here or tap to browse</p></>}
              </div>
              <input id="pdf-file-input" type="file" accept="application/pdf" className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  if (!newTitle.trim()) return alert('Please enter a title first');
                  setUploading(true);
                  const [{ file_url }, pageCount] = await Promise.all([
                    base44.integrations.Core.UploadFile({ file }),
                    extractPageCount(file),
                  ]);
                  await base44.entities.DigitalNotebookAssignment.create({
                    title: newTitle.trim(),
                    class_name: className,
                    pdf_url: file_url,
                    status: 'draft',
                    page_mode: 'free',
                    page_range_start: 1,
                    page_range_end: pageCount || 1,
                    pdf_page_count: pageCount || 1,
                    page_count: pageCount || 1,
                  });
                  setNewTitle('');
                  setUploading(false);
                  qc.invalidateQueries(['notebook-assignments', className]);
                }} />
            </div>

            {assignments.map(a => (
              <motion.div key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="rounded-2xl p-4 flex items-center justify-between cursor-pointer"
                style={{ background: selectedAssignment?.id === a.id ? '#2563eb22' : '#1a1a2e', border: `1px solid ${selectedAssignment?.id === a.id ? '#2563eb' : '#4338ca'}` }}
                onClick={() => { setSelectedAssignment(a); setTab('manage'); }}>
                <div>
                  <p className="font-black text-white">{a.title}</p>
                  <p className="text-xs text-indigo-300">
                    {a.status} • {a.page_mode} mode • {a.pdf_page_count || a.page_count || a.page_range_end || '?'} pages
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold
                  ${a.status === 'active' ? 'bg-green-700 text-green-200' : a.status === 'closed' ? 'bg-gray-700 text-gray-300' : 'bg-indigo-900 text-indigo-300'}`}>
                  {a.status}
                </span>
              </motion.div>
            ))}
          </div>
        )}

        {tab === 'manage' && (
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            {!selectedAssignment ? (
              <p className="text-indigo-400 text-center mt-8">Select an assignment from the Assignments tab</p>
            ) : (
              <>
                <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}>
                  <p className="font-black text-white text-lg">{selectedAssignment.title}</p>

                  <div className="rounded-xl p-3" style={{ background: '#0f0f1a', border: '1px solid #4338ca' }}>
                    <p className="text-indigo-300 text-xs font-bold uppercase mb-2">PDF Info</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-indigo-300 text-sm">Total pages:</label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Total"
                        value={totalPages}
                        onChange={e => setTotalPages(e.target.value)}
                        onBlur={e => {
                          const v = parseInt(e.target.value);
                          if (!isNaN(v) && v > 0) {
                            updateAssignment.mutate({
                              id: selectedAssignment.id,
                              data: { pdf_page_count: v, page_count: v }
                            });
                            setSelectedAssignment(a => ({ ...a, pdf_page_count: v, page_count: v }));
                          }
                        }}
                        className="w-24 px-2 py-1.5 rounded-xl border border-indigo-500 text-white text-center font-bold"
                        style={{ background: '#0f0f1a' }}
                      />
                      <span className="text-indigo-400 text-xs">
                        Set this for older assignments so students see the real last page.
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {['draft', 'active', 'closed'].map(s => (
                      <button key={s} onClick={() => setStatus(s)}
                        className={`flex-1 py-2 rounded-xl font-bold text-sm ${selectedAssignment.status === s ? 'bg-indigo-600 text-white' : 'text-indigo-300 border border-indigo-700'}`}>
                        {s}
                      </button>
                    ))}
                  </div>

                  <p className="text-indigo-300 text-xs font-bold uppercase mt-1">Page Control</p>
                  <div className="flex gap-2">
                    <button onClick={() => setPageMode('free')}
                      className={`flex-1 py-2 rounded-xl font-bold text-sm ${selectedAssignment.page_mode === 'free' ? 'bg-indigo-600 text-white' : 'text-indigo-300 border border-indigo-700'}`}>
                      🆓 Student Free
                    </button>
                    <button onClick={() => setPageMode('locked')}
                      className={`flex-1 py-2 rounded-xl font-bold text-sm ${selectedAssignment.page_mode === 'locked' ? 'bg-orange-600 text-white' : 'text-indigo-300 border border-indigo-700'}`}>
                      🔒 Teacher Controls
                    </button>
                  </div>

                  {selectedAssignment.page_mode === 'locked' && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="text-indigo-300 text-sm font-bold">Current page:</label>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={(selectedAssignment.locked_page || 1) <= 1}
                          onClick={() => setLockedPage(Math.max(1, (selectedAssignment.locked_page || 1) - 1))}
                          className="w-10 h-10 rounded-xl font-black text-white text-lg flex items-center justify-center disabled:opacity-30 transition-all hover:scale-105"
                          style={{ background: '#4338ca' }}
                        >‹</button>
                        <span className="text-white font-black text-xl w-16 text-center">
                          {selectedAssignment.locked_page || 1}
                        </span>
                        <button
                          disabled={(selectedAssignment.locked_page || 1) >= effectiveTotalPages}
                          onClick={() => setLockedPage(Math.min(effectiveTotalPages, (selectedAssignment.locked_page || 1) + 1))}
                          className="w-10 h-10 rounded-xl font-black text-white text-lg flex items-center justify-center disabled:opacity-30 transition-all hover:scale-105"
                          style={{ background: '#4338ca' }}
                        >›</button>
                      </div>
                      <span className="text-indigo-400 text-sm">of {effectiveTotalPages}</span>
                    </div>
                  )}

                  {selectedAssignment.page_mode === 'free' && (
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!selectedAssignment.limit_pages}
                          onChange={e => {
                            const v = e.target.checked;
                            updateAssignment.mutate({ id: selectedAssignment.id, data: { limit_pages: v } });
                            setSelectedAssignment(a => ({ ...a, limit_pages: v }));
                          }}
                          className="w-4 h-4 accent-indigo-500"
                        />
                        <span className="text-indigo-300 text-sm font-bold">Limit pages</span>
                      </label>

                      {selectedAssignment.limit_pages && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="text-indigo-300 text-sm">Page range:</label>
                          <input
                            type="number"
                            min="1"
                            max={effectiveTotalPages}
                            placeholder="From"
                            value={rangeStart}
                            onChange={e => setRangeStart(e.target.value)}
                            onBlur={e => {
                              const v = parseInt(e.target.value);
                              if (!isNaN(v)) {
                                updateAssignment.mutate({ id: selectedAssignment.id, data: { page_range_start: v } });
                                setSelectedAssignment(a => ({ ...a, page_range_start: v }));
                              }
                            }}
                            className="w-20 px-2 py-1.5 rounded-xl border border-indigo-500 text-white text-center font-bold"
                            style={{ background: '#0f0f1a' }}
                          />
                          <span className="text-indigo-400">–</span>
                          <input
                            type="number"
                            min="1"
                            max={effectiveTotalPages}
                            placeholder="To"
                            value={rangeEnd}
                            onChange={e => setRangeEnd(e.target.value)}
                            onBlur={e => {
                              const v = parseInt(e.target.value);
                              if (!isNaN(v)) {
                                updateAssignment.mutate({ id: selectedAssignment.id, data: { page_range_end: v } });
                                setSelectedAssignment(a => ({ ...a, page_range_end: v }));
                              }
                            }}
                            className="w-20 px-2 py-1.5 rounded-xl border border-indigo-500 text-white text-center font-bold"
                            style={{ background: '#0f0f1a' }}
                          />
                          <span className="text-indigo-400 text-xs">of {effectiveTotalPages}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}>
                  <p className="text-indigo-200 font-bold text-sm">Instructions</p>
                  <div className="flex items-center gap-2">
                    <label className="text-indigo-300 text-xs">For page:</label>
                    <input type="number" min="1" value={audioPage} onChange={e => setAudioPage(parseInt(e.target.value))}
                      className="w-16 px-2 py-1 rounded-lg border border-indigo-500 text-white text-center text-sm"
                      style={{ background: '#0f0f1a' }} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowAudio(true)} className="flex-1 py-2 rounded-xl font-bold text-sm text-white" style={{ background: '#4338ca' }}>🎙 Record Audio</button>
                    <button onClick={() => setShowVideo(true)} className="flex-1 py-2 rounded-xl font-bold text-sm text-white" style={{ background: '#9333ea' }}>🎬 Add Video</button>
                  </div>

                  {showAudio && <AudioRecorder onSave={handleSaveAudio} onCancel={() => setShowAudio(false)} />}
                  {showVideo && <VideoUrlInput onSave={handleSaveVideo} onCancel={() => setShowVideo(false)} />}

                  {(selectedAssignment.audio_instructions || []).map((ai, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: '#0f0f1a' }}>
                      <span className="text-xs text-indigo-300">Pg {ai.page}:</span>
                      <audio controls src={ai.url} className="flex-1 h-8" />
                    </div>
                  ))}
                  {(selectedAssignment.video_instructions || []).map((vi, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: '#0f0f1a' }}>
                      <span className="text-xs text-indigo-300">Pg {vi.page}:</span>
                      <span className="text-xs text-white flex-1 truncate">{vi.label}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}>
                  <p className="text-indigo-200 font-bold text-sm">🎙 Recording — Enabled Pages</p>
                  <p className="text-indigo-400 text-xs">Students can only record voice notes on pages you enable here.</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {Array.from({ length: effectiveTotalPages }, (_, i) => i + 1).map(pg => {
                      const enabled = (selectedAssignment.recording_pages || []).includes(pg);
                      const toggle = () => {
                        const current = selectedAssignment.recording_pages || [];
                        const next = enabled ? current.filter(p => p !== pg) : [...current, pg];
                        updateAssignment.mutate({ id: selectedAssignment.id, data: { recording_pages: next } });
                        setSelectedAssignment(a => ({ ...a, recording_pages: next }));
                      };
                      return (
                        <button key={pg} onClick={toggle}
                          className={`w-10 h-10 rounded-xl font-bold text-sm transition-all ${enabled ? 'bg-indigo-600 text-white' : 'text-indigo-400 border border-indigo-700'}`}>
                          {pg}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}>
                  <p className="text-indigo-200 font-bold text-sm">📡 Broadcast Video to All Students</p>
                  <input value={videoBroadcast} onChange={e => setVideoBroadcast(e.target.value)}
                    placeholder="Paste YouTube/video URL..."
                    className="px-3 py-2 rounded-xl border border-indigo-500 text-white text-sm"
                    style={{ background: '#0f0f1a' }} />
                  <div className="flex gap-2">
                    <button onClick={broadcastVideo} className="flex-1 py-2 rounded-xl font-bold text-sm text-white" style={{ background: '#2563eb' }}>📡 Send to Students</button>
                    <button onClick={() => updateAssignment.mutate({ id: selectedAssignment.id, data: { broadcast_video: null } })}
                      className="flex-1 py-2 rounded-xl font-bold text-sm text-red-300 border border-red-800">Stop</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'students' && (
          <div className="max-w-5xl mx-auto">
            {!selectedAssignment ? (
              <p className="text-indigo-400 text-center mt-8">Select an assignment first</p>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <p className="text-indigo-300 text-sm font-bold">{sessions.length} student{sessions.length !== 1 ? 's' : ''} joined</p>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-indigo-400 text-xs font-bold">View page:</span>
                    <button onClick={() => setGlobalViewPage(v => Math.max(1, (v || (selectedAssignment?.locked_page || 1)) - 1))}
                      className="w-8 h-8 rounded-lg font-bold text-white flex items-center justify-center" style={{ background: '#4338ca' }}>‹</button>
                    <span className="text-white font-black text-sm w-6 text-center">{globalViewPage || '—'}</span>
                    <button onClick={() => setGlobalViewPage(v => (v || (selectedAssignment?.locked_page || 1)) + 1)}
                      className="w-8 h-8 rounded-lg font-bold text-white flex items-center justify-center" style={{ background: '#4338ca' }}>›</button>
                    {globalViewPage && <button onClick={() => setGlobalViewPage(null)} className="text-xs text-indigo-400 hover:text-white font-bold">Reset</button>}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
                  {sessions.map(s => (
                    <StudentThumbnail
                      key={s.id}
                      session={s}
                      assignment={selectedAssignment}
                      viewPage={globalViewPage}
                      onOpen={(sess, pg) => { setReplaySession(sess); setReplayAssignment(selectedAssignment); setReplayPage(pg); }}
                    />
                  ))}
                </div>

                {replaySession && (
                  <ReplayModal
                    session={replaySession}
                    assignment={replayAssignment}
                    pageOverride={replayPage}
                    onClose={() => { setReplaySession(null); setReplayPage(null); }}
                  />
                )}
              </>
            )}
          </div>
        )}

        {tab === 'record' && (
          <LaserRecordView assignment={selectedAssignment} />
        )}
      </div>
    </div>
  );
}