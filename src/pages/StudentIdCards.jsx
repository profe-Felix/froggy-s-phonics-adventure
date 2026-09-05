import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer, CheckCheck, Square, ZoomIn, ZoomOut, PenLine } from 'lucide-react';
import TableTag from '@/components/print/TableTag';
import MailboxLabel from '@/components/print/MailboxLabel';
import IdCard from '@/components/print/IdCard';

// Unified print shop — exact replica of original PrintSheet print mechanism:
// native window.print() with .sheet-wrap / .sheet CSS + @media print rules.
// The grid uses gap: 0 and justify-content: center so cards touch edge-to-edge.
const FORMATS = {
  id: { label: 'ID Card', width: '2.3in', cols: 3 },
  tabletag: { label: 'Table Tag', width: '3in', cols: 2 },
  mailbox: { label: 'Mailbox Label', width: '0.9in', cols: 8 },
};

export default function StudentIdCards() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialClass = urlParams.get('class') || '';

  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(initialClass);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [format, setFormat] = useState('id');
  const [printOnlyMarked, setPrintOnlyMarked] = useState(false);
  const [showPicture, setShowPicture] = useState(true);
  const [zoom, setZoom] = useState(1.4);

  useEffect(() => {
    base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-updated_date', 200).then(all => {
      const unique = [...new Set(all.map(s => s.class_name).filter(Boolean))].sort();
      setClasses(unique);
      if (!selectedClass && unique.length) setSelectedClass(unique[0]);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedClass) return;
    base44.entities.Student.filter({ class_name: selectedClass, school_year: ACTIVE_SCHOOL_YEAR }).then(all => {
      setStudents(all);
      setSelected(new Set(all.map(s => s.student_number)));
    });
  }, [selectedClass]);

  const toggle = (num) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(num)) n.delete(num); else n.add(num);
      return n;
    });
  };
  const selectAll = () => setSelected(new Set(students.map(s => s.student_number)));
  const clearAll = () => setSelected(new Set());

  const byNumber = {};
  students.forEach(s => { byNumber[s.student_number] = s; });

  const selectedStudents = students
    .filter(s => selected.has(s.student_number))
    .filter(s => !printOnlyMarked || s.print_flag)
    .sort((a, b) => a.student_number - b.student_number);

  const fmt = FORMATS[format];

  const renderCard = (s) => {
    if (format === 'tabletag') return <TableTag student={s} />;
    if (format === 'mailbox') return <MailboxLabel student={s} showPicture={showPicture} />;
    return <IdCard student={s} />;
  };

  return (
    <div className="min-h-screen bg-slate-200 print:bg-white">
      <header className="no-print border-b bg-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/StudentRoster" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
            <div>
              <h1 className="text-lg font-semibold leading-tight">🖨️ Print Shop</h1>
              <p className="text-xs text-muted-foreground">
                {loading ? 'Loading…' : `${selectedStudents.length} · ${fmt.label}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select value={format} onChange={e => setFormat(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              {Object.entries(FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={printOnlyMarked} onChange={e => setPrintOnlyMarked(e.target.checked)} />
              Only marked
            </label>
            {format === 'mailbox' && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={showPicture} onChange={e => setShowPicture(e.target.checked)} />
                Pictures
              </label>
            )}
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
            <Link
              to={`/NamePractice${selectedClass ? `?class=${encodeURIComponent(selectedClass)}` : ''}`}
              className="flex items-center gap-2 bg-white border rounded-md px-3 py-2 hover:bg-gray-50 text-sm font-medium text-muted-foreground"
            >
              <PenLine className="w-4 h-4" /> Name Practice
            </Link>
            <button
              onClick={() => window.print()}
              disabled={selectedStudents.length === 0}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm font-medium disabled:opacity-40"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>
      </header>

      <main className="py-8 flex justify-center print:block print:py-0">
        {loading ? (
          <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        ) : (
          <div className="flex flex-col items-center gap-6">
            {/* Class picker + checkbox grid — no-print so they don't appear on paper */}
            <div className="no-print flex flex-col items-center gap-4 w-full max-w-3xl">
              <div className="flex gap-2 flex-wrap justify-center">
                {classes.map(cls => (
                  <button
                    key={cls}
                    onClick={() => setSelectedClass(cls)}
                    className={`px-4 py-2 rounded-full font-medium text-sm transition ${selectedClass === cls ? 'bg-indigo-600 text-white shadow' : 'bg-white text-gray-600 border hover:bg-indigo-50'}`}
                  >
                    Class {cls}
                  </button>
                ))}
              </div>

              {printOnlyMarked && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Showing only students marked “Print” in the Google Sheet.
                </p>
              )}

              {selectedClass && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {Array.from({ length: 30 }, (_, i) => i + 1).map(num => {
                    const s = byNumber[num];
                    const checked = selected.has(num);
                    const inGrid = !printOnlyMarked || (s && s.print_flag);
                    if (!inGrid) return <div key={num} className="aspect-[3/4] rounded-xl border border-dashed border-gray-100 bg-gray-50/50" />;
                    return (
                      <button
                        key={num}
                        onClick={() => s && toggle(num)}
                        disabled={!s}
                        className={`relative aspect-[3/4] rounded-xl border-2 overflow-hidden flex flex-col items-center justify-center transition ${!s ? 'border-dashed border-gray-200 bg-gray-50 text-gray-300' : checked ? 'border-indigo-500 ring-2 ring-indigo-300 bg-white' : 'border-gray-200 bg-white opacity-50'}`}
                      >
                        {s?.photo_url && <img src={s.photo_url} alt={String(num)} className="absolute inset-0 w-full h-full object-cover" />}
                        <div className="relative z-10 flex flex-col items-center" style={{ textShadow: s?.photo_url ? '0 1px 4px rgba(0,0,0,0.7)' : 'none' }}>
                          <span className={`text-xl font-black ${s?.photo_url ? 'text-white' : 'text-gray-400'}`}>{num}</span>
                          {s?.name && <span className={`text-[11px] font-bold ${s?.photo_url ? 'text-white' : 'text-gray-500'}`}>{s.name}</span>}
                        </div>
                        {s?.print_flag && <span className="absolute top-1 right-1 text-[9px] bg-amber-500 text-white font-bold rounded-full px-1.5 py-0.5 z-20">PRINT</span>}
                        {s && (
                          <div className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold z-20 ${checked ? 'bg-indigo-600' : 'bg-gray-400/70'}`}>
                            {checked ? '✓' : ''}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Print sheet — exact replica of original .sheet-wrap / .sheet */}
            {selectedStudents.length > 0 ? (
              <div className="sheet-wrap" style={{ '--zoom': zoom }}>
                <div className="sheet">
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${fmt.cols}, ${fmt.width})`,
                      gap: 0,
                      justifyContent: 'center',
                    }}
                  >
                    {selectedStudents.map((s, i) => (
                      <div key={s.id || i} style={format === 'namepractice' && i < selectedStudents.length - 1 ? { breakAfter: 'page', pageBreakAfter: 'always' } : undefined}>
                        {renderCard(s)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-print text-center text-muted-foreground py-20 max-w-sm">
                No students selected. Check some above or turn off “Only marked”.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}