import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { ArrowLeft, Printer, RefreshCw, CheckCheck, Square, ZoomIn, ZoomOut } from 'lucide-react';
import { Link } from 'react-router-dom';

const CARDS_PER_SHEET = 30; // 5 cols × 6 rows

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
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [zoom, setZoom] = useState(1.4);

  const baseUrl = `${window.location.origin}/ID`;

  useEffect(() => {
    base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-updated_date', 200).then(all => {
      const unique = [...new Set(all.map(s => s.class_name).filter(Boolean))].sort();
      setClasses(unique);
      if (unique.length > 0) setSelectedClass(unique[0]);
      setLoading(false);
    });
  }, []);

  const loadStudents = async (cls) => {
    const all = await base44.entities.Student.filter({ class_name: cls, school_year: ACTIVE_SCHOOL_YEAR });
    setStudents(all);
    // Default: select all students that HAVE a barcode
    setSelected(new Set(all.filter(s => s.barcode_number).map(s => s.student_number)));
  };

  useEffect(() => {
    if (!selectedClass) return;
    loadStudents(selectedClass);
  }, [selectedClass]);

  const ensureStudents = async () => {
    setGenerating(true);
    const existing = await base44.entities.Student.filter({ class_name: selectedClass, school_year: ACTIVE_SCHOOL_YEAR });
    const existingNums = new Set(existing.map(s => s.student_number));
    const missing = Array.from({ length: 30 }, (_, i) => i + 1).filter(n => !existingNums.has(n));
    if (missing.length > 0) {
      await base44.entities.Student.bulkCreate(missing.map(n => ({
        student_number: n,
        class_name: selectedClass,
        school_year: ACTIVE_SCHOOL_YEAR,
        mode_progress: DEFAULT_PROGRESS,
        current_mode: 'letter_sounds'
      })));
    }
    await loadStudents(selectedClass);
    setGenerating(false);
  };

  const toggle = (num) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(num)) n.delete(num); else n.add(num);
      return n;
    });
  };
  const selectAll = () => setSelected(new Set(students.filter(s => s.barcode_number).map(s => s.student_number)));
  const clearAll = () => setSelected(new Set());

  // Only students with a barcode are eligible for printing
  const printableStudents = students
    .filter(s => s.barcode_number)
    .sort((a, b) => a.student_number - b.student_number);

  const selectedStudents = printableStudents.filter(s => selected.has(s.student_number));

  // Paginate into sheets of 30
  const sheets = [];
  for (let i = 0; i < selectedStudents.length; i += CARDS_PER_SHEET) {
    sheets.push(selectedStudents.slice(i, i + CARDS_PER_SHEET));
  }

  const byNumber = {};
  students.forEach(s => { byNumber[s.student_number] = s; });

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <header className="no-print border-b bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/Dashboard" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">🔲 QR Code Generator</h1>
              <p className="text-sm text-gray-500">
                {loading ? 'Loading…' : `${selectedStudents.length} cards · ${sheets.length} sheet${sheets.length > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={selectAll} className="flex items-center gap-1.5 text-sm bg-white border rounded-md px-3 py-2 hover:bg-gray-50 font-medium text-muted-foreground">
              <CheckCheck className="w-4 h-4" /> All
            </button>
            <button onClick={clearAll} className="flex items-center gap-1.5 text-sm bg-white border rounded-md px-3 py-2 hover:bg-gray-50 font-medium text-muted-foreground">
              <Square className="w-4 h-4" /> None
            </button>
            <div className="flex items-center border rounded-md overflow-hidden">
              <button className="px-2 py-1.5 hover:bg-gray-50" onClick={() => setZoom(z => Math.max(0.6, +(z - 0.2).toFixed(2)))}>
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button className="px-2 py-1.5 hover:bg-gray-50" onClick={() => setZoom(z => Math.min(2.2, +(z + 0.2).toFixed(2)))}>
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
            {selectedClass && students.length < 30 && (
              <button
                onClick={ensureStudents}
                disabled={generating}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-40 text-sm font-medium"
              >
                <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
                {generating ? 'Creating...' : 'Create missing'}
              </button>
            )}
            <button
              onClick={() => window.print()}
              disabled={selectedStudents.length === 0}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-40"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>
      </header>

      <main className="py-8 print:py-0">
        {/* Class picker + checkbox grid — no-print */}
        <div className="no-print flex flex-col items-center gap-4 w-full max-w-3xl mx-auto mb-8">
          <div className="flex gap-2 flex-wrap justify-center">
            {loading ? (
              <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            ) : classes.length === 0 ? (
              <p className="text-gray-400">No classes found. Create students in the dashboard first.</p>
            ) : (
              classes.map(cls => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={`px-4 py-2 rounded-full font-medium text-sm transition ${selectedClass === cls ? 'bg-blue-600 text-white shadow' : 'bg-white text-gray-600 border hover:bg-blue-50'}`}
                >
                  Class {cls}
                </button>
              ))
            )}
          </div>

          {selectedClass && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {Array.from({ length: 30 }, (_, i) => i + 1).map(num => {
                const s = byNumber[num];
                const hasBarcode = s && s.barcode_number;
                const checked = selected.has(num);
                if (!hasBarcode) return (
                  <div key={num} className="aspect-[3/4] rounded-xl border border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-gray-300">
                    <span className="text-lg font-bold">{num}</span>
                    <span className="text-[9px]">no barcode</span>
                  </div>
                );
                return (
                  <button
                    key={num}
                    onClick={() => toggle(num)}
                    className={`relative aspect-[3/4] rounded-xl border-2 overflow-hidden flex flex-col items-center justify-center transition ${checked ? 'border-blue-500 ring-2 ring-blue-300 bg-white' : 'border-gray-200 bg-white opacity-50'}`}
                  >
                    {s?.photo_url && <img src={s.photo_url} alt={String(num)} className="absolute inset-0 w-full h-full object-cover" />}
                    <div className="relative z-10 flex flex-col items-center" style={{ textShadow: s?.photo_url ? '0 1px 4px rgba(0,0,0,0.7)' : 'none' }}>
                      <span className={`text-xl font-black ${s?.photo_url ? 'text-white' : 'text-gray-700'}`}>{num}</span>
                      {s?.name && <span className={`text-[10px] font-bold ${s?.photo_url ? 'text-white' : 'text-gray-500'}`}>{s.name}</span>}
                    </div>
                    <div className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold z-20 ${checked ? 'bg-blue-600' : 'bg-gray-400/70'}`}>
                      {checked ? '✓' : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Print sheets */}
        {selectedStudents.length > 0 ? (
          <div className="flex flex-col items-center gap-6 print:gap-0">
            {sheets.map((sheetStudents, si) => (
              <div key={si} className="sheet-wrap" style={{ '--zoom': zoom }}>
                <div className="sheet">
                  <div className="qr-grid">
                    {Array.from({ length: CARDS_PER_SHEET }).map((_, ci) => {
                      const s = sheetStudents[ci];
                      if (!s) return <div key={ci} className="qr-card qr-card--empty" />;
                      const url = `${baseUrl}?barcode=${encodeURIComponent(s.barcode_number)}`;
                      return (
                        <div key={ci} className="qr-card">
                          <QRCodeSVG value={url} size={100} />
                          <div style={{ fontSize: '0.2in', fontWeight: 700, color: '#1e293b', marginTop: '0.03in', lineHeight: 1.1 }}>{s.student_number}</div>
                          <div style={{ fontSize: '0.11in', color: '#64748b', lineHeight: 1.1, marginTop: '0.02in' }}>{s.name || `Class ${selectedClass}`}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-print text-center text-muted-foreground py-20 max-w-sm mx-auto">
            No cards to print. Import the roster sheet to populate barcode numbers, or check students above.
          </div>
        )}
      </main>
    </div>
  );
}