import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Trash2, Play, Pause, Square, ChevronLeft, ChevronRight, AlertTriangle, RefreshCw, Copy, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useClassNames } from '@/hooks/useClassNames';
import StudentThumbnail from '@/components/notebook/StudentThumbnail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STUDENT_NUMBERS = Array.from({ length: 90 }, (_, i) => i + 1);

export default function NotebookLoadTest() {
  const qc = useQueryClient();
  const { classList } = useClassNames();
  const [className, setClassName] = useState('');
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [liveAssessment, setLiveAssessment] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const fileInputRef = useRef(null);

  // List test assignments for this class
  const { data: assignments = [], refetch: refetchAssignments } = useQuery({
    queryKey: ['test-notebook-assignments-dashboard', className],
    queryFn: () => base44.entities.TestNotebookAssignment.filter({ class_name: className, status: 'active' }),
    enabled: !!className,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // List test assignments shared across classes
  const { data: sharedAssignments = [] } = useQuery({
    queryKey: ['test-notebook-shared-assignments'],
    queryFn: () => base44.entities.TestNotebookAssignment.filter({ shared_across_classes: true, status: 'active' }),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Subscribe to live assessment for this class
  const { data: liveData } = useQuery({
    queryKey: ['test-live-assessment', className],
    queryFn: () => base44.entities.TestLiveNotebookAssessment.filter({ class_name: className, active: true, school_year: ACTIVE_SCHOOL_YEAR }),
    enabled: !!className,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: 30000,
  });

  useEffect(() => {
    const latest = liveData?.[0] || null;
    setLiveAssessment(latest);
  }, [liveData]);

  // Subscribe to live assessment changes
  useEffect(() => {
    if (!className) return;
    return base44.entities.TestLiveNotebookAssessment.subscribe(event => {
      if (!event.data) return;
      if (event.type === 'delete') { setLiveAssessment(null); return; }
      if (event.data.class_name !== className) return;
      setLiveAssessment(prev => prev?.id === event.data.id ? { ...prev, ...event.data } : event.data);
    });
  }, [className]);

  // Create test assignment
  const createMutation = useMutation({
    mutationFn: async ({ title, pdfUrl, pageCount, shared }) => {
      return base44.entities.TestNotebookAssignment.create({
        title,
        class_name: className,
        pdf_url: pdfUrl,
        pdf_page_count: pageCount,
        status: 'active',
        page_mode: 'free',
        shared_across_classes: shared,
        school_year: ACTIVE_SCHOOL_YEAR,
      });
    },
    onSuccess: () => {
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ['test-notebook-assignments-dashboard'] });
      qc.invalidateQueries({ queryKey: ['test-notebook-shared-assignments'] });
    },
  });

  // Upload PDF
  const uploadPdf = useCallback(async (file) => {
    const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
    return file_uri;
  }, []);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadPdf(file);
    return url;
  };

  // Start live assessment
  const startLive = async () => {
    if (!selectedAssignment) return;
    await base44.entities.TestLiveNotebookAssessment.create({
      class_name: className,
      assignment_id: selectedAssignment.id,
      assignment_title: selectedAssignment.title,
      school_year: ACTIVE_SCHOOL_YEAR,
      current_page: 1,
      total_pages: selectedAssignment.pdf_page_count || 1,
      paused: false,
      active: true,
      release_mode: 'follow',
      started_at: new Date().toISOString(),
    });
    qc.invalidateQueries({ queryKey: ['test-live-assessment'] });
  };

  const togglePause = async () => {
    if (!liveAssessment) return;
    await base44.entities.TestLiveNotebookAssessment.update(liveAssessment.id, { paused: !liveAssessment.paused });
  };

  const endLive = async () => {
    if (!liveAssessment) return;
    await base44.entities.TestLiveNotebookAssessment.update(liveAssessment.id, { active: false });
    setLiveAssessment(null);
  };

  const pageAdvance = async (dir) => {
    if (!liveAssessment) return;
    const next = Math.max(1, Math.min(liveAssessment.total_pages, liveAssessment.current_page + dir));
    await base44.entities.TestLiveNotebookAssessment.update(liveAssessment.id, { current_page: next });
  };

  // Delete all test data
  const deleteAllTest = async () => {
    if (!confirm('Delete ALL test notebook data (assignments, sessions, assessments)? This cannot be undone.')) return;
    await base44.entities.TestNotebookAssignment.deleteMany({});
    await base44.entities.TestNotebookSession.deleteMany({});
    await base44.entities.TestLiveNotebookAssessment.deleteMany({ active: true });
    qc.invalidateQueries({ queryKey: ['test-notebook'] });
    qc.invalidateQueries({ queryKey: ['test-live-assessment'] });
    setSelectedAssignment(null);
    setLiveAssessment(null);
  };

  const allAssignments = [...assignments, ...sharedAssignments.filter(a => !assignments.find(x => x.id === a.id))];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Test banner */}
      <div className="bg-red-600 text-white text-center py-2 px-4 font-bold text-sm sticky top-0 z-50 flex items-center justify-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        NOTEBOOK LOAD TEST — NOT LIVE CLASSWORK
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Notebook Load Test Dashboard</h1>
          <Button variant="destructive" size="sm" onClick={deleteAllTest}>
            <Trash2 className="w-4 h-4 mr-1" /> Delete All Test Data
          </Button>
        </div>

        {/* Class selector */}
        <div className="mb-6">
          <Label className="mb-2 block">Select Class</Label>
          <div className="flex flex-wrap gap-2">
            {classList.map(c => (
              <button
                key={c}
                onClick={() => { setClassName(c); setSelectedAssignment(null); }}
                className={`px-4 py-2 rounded-lg font-medium transition ${className === c ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {className && (
          <>
            {/* Assignment management */}
            <div className="mb-6 bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-slate-700">Test Assignments</h2>
                <Button size="sm" onClick={() => setShowCreate(s => !s)}>
                  {showCreate ? 'Cancel' : '+ New Assignment'}
                </Button>
              </div>

              {showCreate && (
                <CreateAssignmentForm
                  onCreate={(data) => createMutation.mutate(data)}
                  onFileSelect={handleFileSelect}
                  fileInputRef={fileInputRef}
                  loading={createMutation.isPending}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                {allAssignments.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAssignment(a)}
                    className={`text-left p-3 rounded-lg border transition ${selectedAssignment?.id === a.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  >
                    <div className="font-medium text-slate-700 truncate">{a.title}</div>
                    <div className="text-xs text-slate-400 mt-1">{a.pdf_page_count} pages {a.shared_across_classes && '· Shared'}</div>
                  </button>
                ))}
                {allAssignments.length === 0 && (
                  <div className="text-slate-400 text-sm col-span-full py-4">No test assignments yet. Create one above.</div>
                )}
              </div>
            </div>

            {/* Live assessment controls */}
            {selectedAssignment && (
              <div className="mb-6 bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-semibold text-slate-700 mb-3">Live Assessment — {selectedAssignment.title}</h2>
                {!liveAssessment ? (
                  <Button onClick={startLive} className="bg-green-600 hover:bg-green-700">
                    <Play className="w-4 h-4 mr-1" /> Start Live Assessment
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        onClick={togglePause}
                        className={liveAssessment.paused ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-500 hover:bg-amber-600'}
                      >
                        {liveAssessment.paused ? <><Play className="w-4 h-4 mr-1" /> Resume</> : <><Pause className="w-4 h-4 mr-1" /> Pause</>}
                      </Button>
                      <Button onClick={endLive} variant="destructive">
                        <Square className="w-4 h-4 mr-1" /> End
                      </Button>
                      <div className="flex items-center gap-2 ml-2">
                        <Button size="sm" variant="outline" onClick={() => pageAdvance(-1)} disabled={liveAssessment.current_page <= 1}>
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="font-medium text-slate-600">Page {liveAssessment.current_page} / {liveAssessment.total_pages}</span>
                        <Button size="sm" variant="outline" onClick={() => pageAdvance(1)} disabled={liveAssessment.current_page >= liveAssessment.total_pages}>
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                      {liveAssessment.paused && (
                        <span className="text-amber-600 font-medium text-sm">⚠ Students paused (Eyes on board)</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                      <span className="text-sm font-medium text-indigo-700">Student login URL:</span>
                      <code className="text-xs text-indigo-900 bg-white px-2 py-1 rounded border border-indigo-200 flex-1 min-w-0 truncate">
                        {window.location.origin}/notebook-load-test-student?class={encodeURIComponent(className)}&live={liveAssessment.id}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const url = `${window.location.origin}/notebook-load-test-student?class=${encodeURIComponent(className)}&live=${liveAssessment.id}`;
                          navigator.clipboard?.writeText(url);
                        }}
                      >
                        <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const url = `${window.location.origin}/notebook-load-test-student?class=${encodeURIComponent(className)}&live=${liveAssessment.id}`;
                          window.open(url, '_blank');
                        }}
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1" /> Open Student
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Student thumbnails */}
            {selectedAssignment && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h2 className="font-semibold text-slate-700 mb-3">Student Notebooks (1–90)</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {STUDENT_NUMBERS.map(n => (
                    <StudentThumbnail
                      key={n}
                      assignment={selectedAssignment}
                      className={className}
                      studentNumber={n}
                      schoolYear={ACTIVE_SCHOOL_YEAR}
                      live={liveAssessment}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!className && (
          <div className="text-center text-slate-400 py-12">Select a class to begin load testing.</div>
        )}
      </div>
    </div>
  );
}

function CreateAssignmentForm({ onCreate, onFileSelect, fileInputRef, loading }) {
  const [title, setTitle] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [pageCount, setPageCount] = useState(1);
  const [shared, setShared] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    setUploading(true);
    try {
      const url = await onFileSelect(e);
      if (url) setPdfUrl(url);
    } finally { setUploading(false); }
  };

  return (
    <div className="border border-slate-200 rounded-lg p-4 mb-3 bg-slate-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="mb-1 block text-sm">Title</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Test Assignment 1" />
        </div>
        <div>
          <Label className="mb-1 block text-sm">Page Count</Label>
          <Input type="number" min="1" value={pageCount} onChange={e => setPageCount(Number(e.target.value))} />
        </div>
      </div>
      <div className="mt-3">
        <Label className="mb-1 block text-sm">PDF (stored privately)</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFile}
          className="text-sm"
        />
        {uploading && <span className="text-xs text-slate-400 ml-2">Uploading…</span>}
        {pdfUrl && <span className="text-xs text-green-600 ml-2">✓ Uploaded</span>}
      </div>
      <label className="flex items-center gap-2 mt-3 text-sm text-slate-600">
        <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} />
        Shared across all classes
      </label>
      <Button
        className="mt-3"
        disabled={!title || !pdfUrl || loading}
        onClick={() => onCreate({ title, pdfUrl, pageCount, shared })}
      >
        {loading ? 'Creating…' : 'Create Assignment'}
      </Button>
    </div>
  );
}