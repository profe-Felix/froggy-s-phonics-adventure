import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

const DEFAULT_PROGRESS = {
  letter_sounds: { mastered_items: [], learning_items: ['o', 'i', 'a'], item_attempts: {}, total_correct: 0, total_attempts: 0, unlocked: true },
  sight_words_easy: { mastered_items: [], learning_items: ['el', 'la', 'un'], item_attempts: {}, total_correct: 0, total_attempts: 0, unlocked: true },
  sight_words_spelling: { mastered_items: [], learning_items: ['el', 'la', 'un'], item_attempts: {}, total_correct: 0, total_attempts: 0, unlocked: true },
  spelling: { mastered_items: [], learning_items: ['ala', 'ama', 'amo'], item_attempts: {}, total_correct: 0, total_attempts: 0, unlocked: true },
  case_matching: { mastered_items: [], learning_items: ['a', 'b', 'c'], item_attempts: {}, total_correct: 0, total_attempts: 0, unlocked: true }
};

export default function QRGenerator() {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]); // records for selected class
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const printRef = useRef();

  const baseUrl = `${window.location.origin}/LetterGame`;

  useEffect(() => {
    base44.entities.Student.list('-updated_date', 200).then(all => {
      const unique = [...new Set(all.map(s => s.class_name).filter(Boolean))].sort();
      setClasses(unique);
      if (unique.length > 0) setSelectedClass(unique[0]);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedClass) return;
    loadStudentsForClass(selectedClass);
  }, [selectedClass]);

  const loadStudentsForClass = async (cls) => {
    const all = await base44.entities.Student.filter({ class_name: cls });
    setStudents(all);
  };

  // Ensure all 30 students exist for this class, create missing ones
  const ensureStudents = async () => {
    setGenerating(true);
    const existing = await base44.entities.Student.filter({ class_name: selectedClass });
    const existingNums = new Set(existing.map(s => s.student_number));
    const missing = Array.from({ length: 30 }, (_, i) => i + 1).filter(n => !existingNums.has(n));
    if (missing.length > 0) {
      await base44.entities.Student.bulkCreate(missing.map(n => ({
        student_number: n,
        class_name: selectedClass,
        mode_progress: DEFAULT_PROGRESS,
        current_mode: 'letter_sounds'
      })));
    }
    await loadStudentsForClass(selectedClass);
    setGenerating(false);
  };

  const handlePrint = () => {
    const printContents = printRef.current.innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>QR Codes - Class ${selectedClass}</title>
      <style>
        body { font-family: sans-serif; margin: 0; padding: 16px; }
        .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
        .card { border: 1px solid #ddd; border-radius: 12px; padding: 12px; text-align: center; page-break-inside: avoid; }
        .label { font-size: 18px; font-weight: bold; margin-top: 8px; }
        @media print { body { padding: 8px; } }
      </style></head>
      <body>${printContents}</body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  // Build a map: student_number -> student record
  const studentMap = {};
  students.forEach(s => { studentMap[s.student_number] = s; });
  const allReady = Object.keys(studentMap).length >= 30;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to="/Dashboard" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">🔲 QR Code Generator</h1>
              <p className="text-sm text-gray-500">Stable QR codes — safe to rename classes anytime</p>
            </div>
          </div>
          <div className="flex gap-2">
            {selectedClass && !allReady && (
              <button
                onClick={ensureStudents}
                disabled={generating}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-40 text-sm font-medium"
              >
                <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
                {generating ? 'Creating...' : `Generate all 30 QR codes`}
              </button>
            )}
            {allReady && (
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                <Printer className="w-4 h-4" />
                Print Class {selectedClass}
              </button>
            )}
          </div>
        </div>

        {/* Class selector */}
        <div className="flex gap-2 flex-wrap mb-6">
          {loading ? (
            <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          ) : classes.length === 0 ? (
            <p className="text-gray-400">No classes found. Create students in the dashboard first.</p>
          ) : (
            classes.map(cls => (
              <button
                key={cls}
                onClick={() => setSelectedClass(cls)}
                className={`px-4 py-2 rounded-full font-medium text-sm transition ${
                  selectedClass === cls
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-white text-gray-600 border hover:bg-gray-50'
                }`}
              >
                Class {cls}
              </button>
            ))
          )}
        </div>

        {/* QR Grid */}
        {selectedClass && (
          <div ref={printRef} className="grid grid-cols-4 sm:grid-cols-5 gap-4">
            {Array.from({ length: 30 }, (_, i) => i + 1).map(num => {
              const s = studentMap[num];
              const url = s ? `${baseUrl}?studentId=${s.id}` : null;
              return (
                <div key={num} className={`bg-white border rounded-xl p-3 text-center shadow-sm ${!s ? 'opacity-30' : 'border-gray-200'}`}>
                  {url
                    ? <QRCodeSVG value={url} size={100} className="mx-auto" />
                    : <div className="w-[100px] h-[100px] mx-auto bg-gray-100 rounded flex items-center justify-center text-gray-300 text-xs">no record</div>
                  }
                  <div className="mt-2 font-bold text-gray-800 text-lg">{num}</div>
                  <div className="text-xs text-gray-400">Class {selectedClass}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}