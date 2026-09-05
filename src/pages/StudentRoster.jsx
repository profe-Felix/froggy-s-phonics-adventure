import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Printer, Upload, Link2, Camera, Images, LayoutGrid } from 'lucide-react';
import RosterStudentModal from '@/components/dashboard/RosterStudentModal';
import ImportSheetDialog from '@/components/roster/ImportSheetDialog';
import SheetLinkManager from '@/components/roster/SheetLinkManager';
import PhotoCaptureDialog from '@/components/roster/PhotoCaptureDialog';
import BulkPhotoUploader from '@/components/roster/BulkPhotoUploader';

const DEFAULT_PROGRESS = {
  letter_sounds: { mastered_items: [], learning_items: ['o', 'i', 'a'], item_attempts: {}, total_correct: 0, total_attempts: 0, unlocked: true },
  sight_words_easy: { mastered_items: [], learning_items: ['el', 'la', 'un'], item_attempts: {}, total_correct: 0, total_attempts: 0, unlocked: true },
  sight_words_spelling: { mastered_items: [], learning_items: ['el', 'la', 'un'], item_attempts: {}, total_correct: 0, total_attempts: 0, unlocked: true },
  spelling: { mastered_items: [], learning_items: ['ala', 'ama', 'amo'], item_attempts: {}, total_correct: 0, total_attempts: 0, unlocked: true },
  case_matching: { mastered_items: [], learning_items: ['a', 'b', 'c'], item_attempts: {}, total_correct: 0, total_attempts: 0, unlocked: true }
};

// Dedicated roster page — focused on photos, names, and class assignment.
// Import from Google Sheets, manage saved sheet links, then print ID cards.
export default function StudentRoster() {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [captureStudent, setCaptureStudent] = useState(null);
  const [showBulk, setShowBulk] = useState(false);

  const loadClasses = async () => {
    const all = await base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-updated_date', 200);
    const unique = [...new Set(all.map(s => s.class_name).filter(Boolean))].sort();
    setClasses(unique);
    if (unique.length > 0 && !selectedClass) setSelectedClass(unique[0]);
    setLoading(false);
  };

  useEffect(() => { loadClasses(); }, []);

  useEffect(() => {
    if (!selectedClass) return;
    base44.entities.Student.filter({ class_name: selectedClass, school_year: ACTIVE_SCHOOL_YEAR })
      .then(all => setStudents(all));
  }, [selectedClass]);

  const reloadStudents = async () => {
    if (!selectedClass) return;
    const all = await base44.entities.Student.filter({ class_name: selectedClass, school_year: ACTIVE_SCHOOL_YEAR });
    setStudents(all);
  };

  const ensureAll = async () => {
    setGenerating(true);
    const existing = await base44.entities.Student.filter({ class_name: selectedClass, school_year: ACTIVE_SCHOOL_YEAR });
    const nums = new Set(existing.map(s => s.student_number));
    const missing = Array.from({ length: 30 }, (_, i) => i + 1).filter(n => !nums.has(n));
    if (missing.length) {
      await base44.entities.Student.bulkCreate(missing.map(n => ({
        student_number: n,
        class_name: selectedClass,
        school_year: ACTIVE_SCHOOL_YEAR,
        mode_progress: DEFAULT_PROGRESS,
        current_mode: 'letter_sounds'
      })));
    }
    await reloadStudents();
    setGenerating(false);
  };

  const createAndOpen = async (num) => {
    try {
      const created = await base44.entities.Student.create({
        student_number: num,
        class_name: selectedClass,
        school_year: ACTIVE_SCHOOL_YEAR,
        language: 'es',
      });
      setStudents(prev => [...prev, created]);
      setSelectedStudent(created);
    } catch (e) {
      console.error('Failed to create student', e);
    }
  };

  const handleUpdate = (updated) => {
    setStudents(prev => {
      if (updated.class_name !== selectedClass) return prev.filter(s => s.id !== updated.id);
      return prev.map(s => s.id === updated.id ? updated : s);
    });
    if (updated.class_name !== selectedClass) {
      setClasses(prev => prev.includes(updated.class_name) ? prev : [...prev, updated.class_name].sort());
    }
    setSelectedStudent(updated);
  };

  const handleImported = async () => {
    await loadClasses();
    await reloadStudents();
  };

  const byNumber = {};
  students.forEach(s => { byNumber[s.student_number] = s; });

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to="/Dashboard" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">🪪 Student Roster</h1>
              <p className="text-sm text-gray-500">Import from Google Sheets, manage photos, then print.</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-white border border-emerald-300 text-emerald-700 px-3 py-2 rounded-lg hover:bg-emerald-50 text-sm font-medium"
            >
              <Upload className="w-4 h-4" /> Import Sheet
            </button>
            <button
              onClick={() => setShowLinks(true)}
              className="flex items-center gap-2 bg-white border border-sky-300 text-sky-700 px-3 py-2 rounded-lg hover:bg-sky-50 text-sm font-medium"
            >
              <Link2 className="w-4 h-4" /> Sheet Links
            </button>
            {selectedClass && (
              <button
                onClick={() => setShowBulk(true)}
                disabled={students.length === 0}
                className="flex items-center gap-2 bg-white border border-purple-300 text-purple-700 px-3 py-2 rounded-lg hover:bg-purple-50 text-sm font-medium disabled:opacity-40"
              >
                <Images className="w-4 h-4" /> Bulk Photos
              </button>
            )}
            {selectedClass && (
              <button
                onClick={ensureAll}
                disabled={generating}
                className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-40"
              >
                <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
                {generating ? 'Creating…' : 'Ensure all 30'}
              </button>
            )}
            {selectedClass && (
              <Link
                to={`/StudentIdCards?class=${encodeURIComponent(selectedClass)}`}
                className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium"
              >
                <Printer className="w-4 h-4" /> Print Shop
              </Link>
            )}
            {selectedClass && (
              <Link
                to={`/SeatingChart?class=${encodeURIComponent(selectedClass)}`}
                className="flex items-center gap-2 bg-teal-600 text-white px-3 py-2 rounded-lg hover:bg-teal-700 text-sm font-medium"
              >
                <LayoutGrid className="w-4 h-4" /> Seating
              </Link>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          {loading ? (
            <div className="w-6 h-6 border-2 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
          ) : classes.length === 0 ? (
            <p className="text-gray-400">No classes yet. Import a sheet or create students in the Dashboard first.</p>
          ) : (
            classes.map(cls => (
              <button
                key={cls}
                onClick={() => setSelectedClass(cls)}
                className={`px-4 py-2 rounded-full font-medium text-sm transition ${selectedClass === cls ? 'bg-amber-600 text-white shadow' : 'bg-white text-gray-600 border hover:bg-amber-50'}`}
              >
                Class {cls}
              </button>
            ))
          )}
        </div>

        {selectedClass && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {Array.from({ length: 30 }, (_, i) => i + 1).map(num => {
              const s = byNumber[num];
              const hasPhoto = !!s?.photo_url;
              return (
                <div
                  key={num}
                  onClick={() => s ? setSelectedStudent(s) : createAndOpen(num)}
                  className={`relative aspect-[3/4] rounded-xl border-2 overflow-hidden flex flex-col items-center justify-center bg-white transition hover:scale-[1.03] active:scale-95 cursor-pointer ${s ? 'border-amber-200 hover:border-amber-400 shadow-sm' : 'border-dashed border-gray-200 text-gray-300'}`}
                >
                  {hasPhoto && <img src={s.photo_url} alt={String(num)} className="absolute inset-0 w-full h-full object-cover" />}
                  <div className="relative z-10 flex flex-col items-center" style={{ textShadow: hasPhoto ? '0 1px 4px rgba(0,0,0,0.7)' : 'none' }}>
                    <span className={`text-2xl font-black ${hasPhoto ? 'text-white' : 'text-gray-300'}`}>{num}</span>
                    {s?.name && <span className={`text-xs font-bold mt-0.5 ${hasPhoto ? 'text-white' : 'text-gray-400'}`}>{s.name}</span>}
                  </div>
                  {!s && <span className="absolute bottom-1.5 text-[10px] text-gray-300 font-bold">+ add</span>}
                  {s?.print_flag && <span className="absolute top-1 right-1 text-[9px] bg-amber-500 text-white font-bold rounded-full px-1.5 py-0.5 z-20">PRINT</span>}
                  {s && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setCaptureStudent(s); }}
                      className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-white/90 border border-gray-200 shadow flex items-center justify-center hover:bg-white z-20"
                      title="Take photo"
                    >
                      <Camera className="w-3.5 h-3.5 text-gray-600" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedStudent && (
        <RosterStudentModal
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
          onUpdate={handleUpdate}
        />
      )}

      <ImportSheetDialog open={showImport} onOpenChange={setShowImport} onImported={handleImported} />
      <SheetLinkManager open={showLinks} onOpenChange={setShowLinks} onSynced={reloadStudents} />
      {captureStudent && (
        <PhotoCaptureDialog
          student={captureStudent}
          open={!!captureStudent}
          onOpenChange={(o) => { if (!o) setCaptureStudent(null); }}
          onSaved={handleUpdate}
        />
      )}
      <BulkPhotoUploader
        students={students}
        open={showBulk}
        onOpenChange={setShowBulk}
        onDone={reloadStudents}
      />
    </div>
  );
}