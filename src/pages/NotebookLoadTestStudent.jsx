import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Eye, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useClassNames } from '@/hooks/useClassNames';
import { requestWithRetry, retryDelay } from '@/lib/classroomSync';
import { useQueryClient } from '@tanstack/react-query';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import PageNavBar from '@/components/notebook/PageNavBar';
import { getAssignmentPageBounds, getEffectiveLockedPage } from '@/components/notebook/notebookPageBounds';
import useSharedNotebookTest from '@/components/notebook-test/useSharedNotebook';
import useNotebookAssignmentsTest from '@/components/notebook-test/useNotebookAssignments';
import useNotebookMediaTest from '@/components/notebook-test/useNotebookMedia';
import useNotebookPagePositionTest from '@/components/notebook-test/useNotebookPagePosition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STUDENT_NUMBERS = Array.from({ length: 90 }, (_, i) => i + 1);

export default function NotebookLoadTestStudent() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const { classList } = useClassNames();
  const [className, setClassName] = useState(params.get('class') || '');
  const [studentNumber, setStudentNumber] = useState(Number(params.get('student')) || 0);
  const [assignmentId, setAssignmentId] = useState(params.get('assignment') || '');
  const [page, setPage] = useState(1);
  const [color, setColor] = useState('#1e40af');
  const [tool, setTool] = useState('pen');
  const [size, setSize] = useState(4);
  const [saveError, setSaveError] = useState('');
  const [liveAssessment, setLiveAssessment] = useState(null);
  const [liveEnded, setLiveEnded] = useState(false);
  const canvasRef = useRef(null);
  const latestSessionRef = useRef(null);
  const currentPageRef = useRef(1);
  const [session, setSession] = useState(null);
  const liveAssessmentId = params.get('live');

  // Fetch assignments for this class
  const { data: assignments = [] } = useNotebookAssignmentsTest(className, '', assignmentId);
  const assignment = assignments.find(a => a.id === assignmentId) || assignments[0] || null;

  // Shared notebook connection
  const notebook = useSharedNotebookTest(assignment, className, studentNumber, page, false);
  const { ready, status, pages: notebookPages, enqueue, flush, session: nbSession } = notebook;

  useEffect(() => { if (nbSession) { latestSessionRef.current = nbSession; setSession(nbSession); } }, [nbSession]);
  useEffect(() => { currentPageRef.current = page; }, [page]);

  // Media and page position hooks (test versions)
  const saveMedia = useNotebookMediaTest(session?.id, latestSessionRef, setSession);
  const savePagePosition = useNotebookPagePositionTest(latestSessionRef, currentPageRef, setSession);

  // Page bounds
  const bounds = assignment ? getAssignmentPageBounds(assignment) : { total: 1, min: 1, max: 1 };
  const effectiveLockedPage = assignment ? getEffectiveLockedPage(assignment) : 1;

  // Live assessment following
  useEffect(() => {
    if (!liveAssessmentId) return;
    let alive = true;
    let timer;

    const apply = fresh => {
      if (!alive || !fresh) return;
      if (fresh.active === false) { setLiveEnded(true); return; }
      if (Array.isArray(fresh.finished_students) && fresh.finished_students.some(
        t => String(t.class_name || '') === String(className || '') &&
          Number(t.student_number) === Number(studentNumber)
      )) { setLiveEnded(true); return; }
      setLiveAssessment(prev => ({ ...prev, ...fresh, id: liveAssessmentId }));
      if (fresh.current_page && fresh.release_mode === 'follow') setPage(fresh.current_page);
    };

    const load = async () => {
      if (!alive) return;
      try {
        const fresh = await requestWithRetry(() => base44.entities.TestLiveNotebookAssessment.get(liveAssessmentId));
        if (alive) apply(fresh);
      } catch {}
    };

    const unsub = base44.entities.TestLiveNotebookAssessment.subscribe(event => {
      if (!alive || (event.id || event.data?.id) !== liveAssessmentId) return;
      if (event.type === 'delete') { apply({ active: false }); return; }
      if (event.data) apply(event.data); else void load();
    });

    load();
    timer = setInterval(load, 30000);

    return () => { alive = false; unsub(); clearInterval(timer); };
  }, [liveAssessmentId, className, studentNumber]);

  // Save page position when page changes
  useEffect(() => {
    if (session?.id) savePagePosition(session.id, page);
  }, [page, session?.id]);

  // Flush on unmount
  useEffect(() => {
    return () => { if (assignment) flush(); };
  }, [assignment]);

  const handleOperation = useCallback((op) => {
    if (!ready) return;
    try {
      enqueue(page, op);
      setSaveError('');
    } catch (e) {
      setSaveError(e.message);
    }
  }, [ready, enqueue, page]);

  const handleStrokeEnd = useCallback(() => {
    flush();
  }, [flush]);

  const currentPageData = notebookPages[page];
  const livePaused = !!liveAssessment?.paused;

  // Login screen
  if (!className || !studentNumber) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-red-600 text-white text-center py-2 px-4 font-bold text-sm flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          NOTEBOOK LOAD TEST — NOT LIVE CLASSWORK
        </div>
        <div className="max-w-md mx-auto p-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-6 text-center">Student Login (Load Test)</h1>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Class</Label>
              <div className="flex flex-wrap gap-2">
                {classList.map(c => (
                  <button key={c} onClick={() => setClassName(c)}
                    className={`px-3 py-1.5 rounded-lg font-medium text-sm ${className === c ? 'bg-indigo-600 text-white' : 'bg-white border text-slate-600'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            {className && (
              <div>
                <Label className="mb-2 block">Student Number</Label>
                <div className="grid grid-cols-10 gap-1.5">
                  {STUDENT_NUMBERS.map(n => (
                    <button key={n} onClick={() => setStudentNumber(n)}
                      className={`aspect-square rounded-lg font-bold text-sm transition ${studentNumber === n ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Assignment picker
  if (!assignment) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-red-600 text-white text-center py-2 px-4 font-bold text-sm flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          NOTEBOOK LOAD TEST — NOT LIVE CLASSWORK
        </div>
        <div className="max-w-2xl mx-auto p-6">
          <button onClick={() => { setClassName(''); setStudentNumber(0); }} className="text-slate-400 hover:text-slate-600 mb-4 text-sm">← Back</button>
          <h1 className="text-xl font-bold text-slate-800 mb-4">Pick an assignment — Student #{studentNumber}, {className}</h1>
          <div className="space-y-2">
            {assignments.map(a => (
              <button key={a.id} onClick={() => setAssignmentId(a.id)}
                className="w-full text-left p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition">
                <div className="font-medium text-slate-700">{a.title}</div>
                <div className="text-xs text-slate-400 mt-1">{a.pdf_page_count} pages</div>
              </button>
            ))}
            {assignments.length === 0 && (
              <div className="text-slate-400 text-center py-8">No test assignments for this class. Ask your teacher to create one.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Test banner */}
      <div className="bg-red-600 text-white text-center py-2 px-4 font-bold text-sm flex items-center justify-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        NOTEBOOK LOAD TEST — NOT LIVE CLASSWORK
      </div>

      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-3">
        <button onClick={() => { setAssignmentId(''); }} className="text-slate-400 hover:text-slate-600 text-sm">← Assignments</button>
        <div className="font-medium text-slate-700 text-sm truncate">{assignment.title}</div>
        <div className="flex items-center gap-2 text-xs">
          {saveError ? <span className="text-red-500">{saveError}</span> :
            ready ? <span className="text-green-600">✓ Saved</span> :
            <span className="text-slate-400">{status}</span>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          {['pen', 'highlighter', 'eraser_object'].map(t => (
            <button key={t} onClick={() => setTool(t)}
              className={`px-2 py-1 rounded text-xs font-medium ${tool === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {t === 'pen' ? 'Pen' : t === 'highlighter' ? 'Highlight' : 'Eraser'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {['#1e40af', '#dc2626', '#059669', '#7c3aed', '#000000'].map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-slate-800' : 'border-transparent'}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
        <div className="flex items-center gap-1">
          {[2, 4, 8].map(s => (
            <button key={s} onClick={() => setSize(s)}
              className={`px-2 py-1 rounded text-xs ${size === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {s}px
            </button>
          ))}
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-auto flex justify-center p-4 relative">
        <div className="relative" style={{ width: '900px', maxWidth: '100%' }}>
          {assignment.pdf_url && (
            <PdfPageRenderer
              pdfUrl={assignment.pdf_url}
              pageNumber={page}
              fitMode="width"
              renderScale={1.5}
            />
          )}
          <AnnotationCanvas
            ref={canvasRef}
            width={900}
            height={1200}
            color={color}
            size={size}
            tool={tool}
            mode="draw"
            onOperation={handleOperation}
            onStrokeEnd={handleStrokeEnd}
            writerId={notebook.writer || 0}
            pageIdentity={{ page, sessionId: session?.id }}
          />
          {currentPageData?.notes?.length > 0 && (
            <div className="absolute inset-0 pointer-events-none">
              {currentPageData.notes.map(n => (
                <div key={n.id} className="absolute bg-yellow-100 border border-yellow-300 rounded px-2 py-1 text-xs max-w-[200px]"
                  style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}>
                  {n.text}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Paused overlay */}
        {livePaused && (
          <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center z-40">
            <div className="text-center text-white">
              <Eye className="w-16 h-16 mx-auto mb-4" />
              <div className="text-2xl font-bold">Eyes on board</div>
              <div className="text-slate-300 mt-2">Wait for your teacher to resume.</div>
            </div>
          </div>
        )}

        {/* Live ended overlay */}
        {liveEnded && (
          <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center z-40">
            <div className="text-center text-white">
              <div className="text-2xl font-bold mb-4">Assessment ended</div>
              <Button onClick={() => { setAssignmentId(''); setLiveEnded(false); }} className="bg-white text-slate-800 hover:bg-slate-100">
                Back to assignments
              </Button>
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {!ready && !liveEnded && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-30">
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              {status}
            </div>
          </div>
        )}
      </div>

      {/* Page navigation */}
      <div className="bg-white border-t border-slate-200 px-4 py-2 flex justify-center">
        <PageNavBar
          currentPage={page}
          minPage={bounds.min}
          maxPage={bounds.max === 999 ? bounds.max : bounds.total}
          onGo={setPage}
        />
      </div>
    </div>
  );
}