import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import AssessmentTemplateEditor from './AssessmentTemplateEditor';
import AssessmentStudentGrid from './AssessmentStudentGrid';
import AssessmentStudentView from './AssessmentStudentView';

const CLASS_NAMES = ['Campos', 'Felix', 'Valero'];

/**
 * AssessmentTab
 * Teacher-only tab inside the Digital Notebook area.
 * Flow: Template list → Student grid → Student annotation view
 */
export default function AssessmentTab() {
  const qc = useQueryClient();
  const [className, setClassName] = useState('Campos');
  const [view, setView] = useState('templates'); // 'templates' | 'create' | 'edit-template' | 'students' | 'student-view'
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ['assessment-templates', className],
    queryFn: () => base44.entities.AssessmentTemplate.filter({ class_name: className }),
    refetchInterval: 15000,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students-for-class', className],
    queryFn: () => base44.entities.Student.filter({ class_name: className }),
    enabled: view === 'students' || view === 'templates',
  });

  const handleCreateTemplate = async (firstFile) => {
    if (!newTitle.trim()) return alert('Please enter a title');
    setUploading(true);

    let pages = [];
    if (firstFile) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: firstFile });
      const type = firstFile.type === 'application/pdf' ? 'pdf' : 'image';
      pages = [{ id: `page-${Date.now()}`, type, url: file_url, label: firstFile.name }];
    } else {
      pages = [{ id: `page-${Date.now()}`, type: 'blank', url: null, label: 'Page 1' }];
    }

    const t = await base44.entities.AssessmentTemplate.create({
      title: newTitle.trim(),
      class_name: className,
      pages,
      template_strokes_by_page: {},
      audio_annotations: [],
      status: 'active',
    });

    setNewTitle('');
    setUploading(false);
    qc.invalidateQueries(['assessment-templates', className]);
    setSelectedTemplate(t);
    setView('edit-template');
  };

  const handleSaveTemplate = async (updates) => {
    if (!selectedTemplate) return;
    const updated = await base44.entities.AssessmentTemplate.update(selectedTemplate.id, updates);
    setSelectedTemplate(prev => ({ ...prev, ...updates }));
    qc.invalidateQueries(['assessment-templates', className]);
  };

  // Full-screen overlays for editor and student views
  if (view === 'edit-template' && selectedTemplate) {
    return (
      <div className="fixed inset-0 z-50">
        <AssessmentTemplateEditor
          template={selectedTemplate}
          onSave={handleSaveTemplate}
          onBack={() => setView('templates')}
        />
      </div>
    );
  }

  if (view === 'students' && selectedTemplate) {
    return (
      <div className="fixed inset-0 z-50">
        <AssessmentStudentGrid
          template={selectedTemplate}
          className={className}
          students={students}
          onSelectStudent={(student, record) => {
            setSelectedStudent(student);
            setSelectedRecord(record);
            setView('student-view');
          }}
          onBack={() => setView('templates')}
        />
      </div>
    );
  }

  if (view === 'student-view' && selectedTemplate && selectedStudent && selectedRecord) {
    return (
      <div className="fixed inset-0 z-50">
        <AssessmentStudentView
          record={selectedRecord}
          template={selectedTemplate}
          studentNumber={selectedStudent.student_number}
          onBack={() => setView('students')}
          onRecordUpdate={(updated) => setSelectedRecord(updated)}
        />
      </div>
    );
  }

  // Template list view
  return (
    <div className="flex flex-col h-full overflow-auto" style={{ background: '#0f0f1a', color: 'white' }}>
      {/* Class selector */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: '#1a1a2e', borderBottom: '2px solid #4338ca' }}>
        <h2 className="text-base font-black text-white flex-1">📋 Assessments</h2>
        <select value={className} onChange={e => setClassName(e.target.value)}
          className="px-3 py-1.5 rounded-xl font-bold text-white border border-indigo-500 text-sm"
          style={{ background: '#1a1a2e' }}>
          {CLASS_NAMES.map(c => <option key={c} value={c}>Class {c}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Create new template */}
        <div className="rounded-2xl p-4 flex flex-col gap-3 mb-4" style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}>
          <p className="font-bold text-indigo-200 text-sm">Create New Assessment Template</p>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Assessment name (e.g. Phonological Awareness)..."
            className="px-3 py-2 rounded-xl border border-indigo-500 text-white text-sm"
            style={{ background: '#0f0f1a' }} />
          <div className="flex gap-2">
            <button onClick={() => handleCreateTemplate(null)} disabled={!newTitle.trim() || uploading}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-40"
              style={{ background: '#4338ca' }}>
              + Blank Template
            </button>
            <label className={`flex-1 py-2.5 rounded-xl font-bold text-sm text-center cursor-pointer
              ${!newTitle.trim() ? 'opacity-40 pointer-events-none' : 'hover:opacity-80'}
              text-white`} style={{ background: '#374151' }}>
              {uploading ? '⏳ Uploading…' : '📎 Upload PDF/Image'}
              <input type="file" accept="application/pdf,image/*" className="hidden"
                disabled={!newTitle.trim() || uploading}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleCreateTemplate(f); }} />
            </label>
          </div>
        </div>

        {/* Template list */}
        {templates.length === 0 && (
          <p className="text-indigo-500 text-center text-sm mt-8">No assessment templates yet. Create one above.</p>
        )}
        <div className="flex flex-col gap-3">
          {templates.map(t => (
            <motion.div key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}>
              <div className="flex-1 min-w-0">
                <p className="font-black text-white">{t.title}</p>
                <p className="text-xs text-indigo-400">{(t.pages || []).length} page{(t.pages || []).length !== 1 ? 's' : ''} · {t.status}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setSelectedTemplate(t); setView('edit-template'); }}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-indigo-300 border border-indigo-700 hover:border-indigo-400">
                  ✏️ Edit
                </button>
                <button onClick={() => { setSelectedTemplate(t); setView('students'); }}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ background: '#4338ca' }}>
                  👥 Students
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}