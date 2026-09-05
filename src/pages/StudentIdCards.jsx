import React, { useState, useEffect, useRef } from 'react';
import Barcode from '@/components/Barcode';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer, CheckCheck, Square } from 'lucide-react';
import TableTag from '@/components/print/TableTag';
import MailboxLabel from '@/components/print/MailboxLabel';
import NamePracticeSheet from '@/components/print/NamePracticeSheet';

// Unified print shop: pull a class's students, pick a format, check exactly
// which cards to print (or filter to the sheet's "Print" checkmarks), and
// print multiple per sheet.
// Each format has fixed physical dimensions so cards print at the right size
// and the grid packs as many per page as the letter sheet allows.
// ID card = standard CR80 badge-holder size (2.125" × 3.375").
const FORMATS = {
  id: { label: 'ID Card', cols: 3, cardW: '2.3in', cardH: 'auto' },
  tabletag: { label: 'Table Tag', cols: 2, cardW: '3in', cardH: '0.9in' },
  mailbox: { label: 'Mailbox Label', cols: 7, cardW: '0.9in', cardH: '2in' },
  namepractice: { label: 'Name Practice', cols: 1, cardW: '8.5in', cardH: '11in' },
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
  const printRef = useRef();

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

  // The list we show in the checkbox grid: optionally filtered to print_flag.
  const gridStudents = printOnlyMarked ? students.filter(s => s.print_flag) : students;

  // The list we actually print: selected ∩ (marked filter if on).
  const selectedStudents = students
    .filter(s => selected.has(s.student_number))
    .filter(s => !printOnlyMarked || s.print_flag)
    .sort((a, b) => a.student_number - b.student_number);

  const fmt = FORMATS[format];

  const renderCard = (s) => {
    if (format === 'tabletag') return <TableTag student={s} />;
    if (format === 'mailbox') return <MailboxLabel student={s} showPicture={showPicture} />;
    if (format === 'namepractice') return <NamePracticeSheet student={s} />;
    // ID card — original design with barcode (CODE39)
    const name = s.name || '—';
    const number = s.barcode_number || String(s.student_number).padStart(6, '0');
    const initials = name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    return (
      <div
        className="w-full relative flex flex-col bg-white border border-slate-300 rounded-md overflow-hidden shadow-sm"
        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
      >
        <div className="flex justify-center pt-2">
          <div className="w-[0.65in] h-[0.65in] rounded overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
            {s.photo_url ? (
              <img src={s.photo_url} alt={name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-bold text-slate-400">{initials || '?'}</span>
            )}
          </div>
        </div>
        <div className="px-2 mt-2 text-center">
          <div className="text-[15px] font-extrabold text-slate-900 leading-tight break-words">{name}</div>
        </div>
        <div className="px-2 mt-2 space-y-1.5">
          {s.grade && (
            <div className="flex items-baseline justify-between gap-1 border-b border-slate-100 pb-1">
              <span className="text-[8px] uppercase tracking-wider text-slate-400">Grade</span>
              <span className="text-[13px] font-bold text-slate-900">{s.grade}</span>
            </div>
          )}
          {s.homeroom && (
            <div className="flex items-baseline justify-between gap-1 border-b border-slate-100 pb-1">
              <span className="text-[8px] uppercase tracking-wider text-slate-400">Homeroom</span>
              <span className="text-[13px] font-bold text-slate-900">{s.homeroom}</span>
            </div>
          )}
        </div>
        {(s.teacher_name || s.site) && (
          <div className="px-2 mt-1.5 space-y-0.5">
            {s.teacher_name && (
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[7px] uppercase tracking-wider text-slate-400">Teacher</span>
                <span className="text-[9px] font-medium text-slate-700 text-right truncate">{s.teacher_name}</span>
              </div>
            )}
            {s.site && (
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[7px] uppercase tracking-wider text-slate-400">Site</span>
                <span className="text-[9px] font-medium text-slate-700 text-right truncate">{s.site}</span>
              </div>
            )}
          </div>
        )}
        <div className="flex-1" />
        <div className="w-full px-1.5 pb-1.5 flex flex-col items-center">
          <Barcode value={number} />
          <span className="text-[10px] font-mono tracking-widest text-slate-800 mt-0.5">{number}</span>
        </div>
      </div>
    );
  };

  const handlePrint = () => {
    if (!printRef.current || selectedStudents.length === 0) return;
    const printContents = printRef.current.innerHTML;
    const safeClass = String(selectedClass || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cols = fmt.cols;
    const pageBreak = format === 'namepractice' ? '.card { page-break-after: always; } .card:last-child { page-break-after: auto; }' : '';
    // Copy all stylesheets from the current document so Tailwind classes
    // (borders, flex, colors, etc.) render correctly in the print window.
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(el => el.outerHTML).join('\n');
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { alert('Please allow popups to print.'); return; }
    win.document.open();
    win.document.write(`<!DOCTYPE html><html><head><title>${fmt.label} - Class ${safeClass}</title>
      ${styles}
      <style>
        @page { size: letter portrait; margin: 0.25in; }
        body { font-family: 'Teachers', 'Andika', sans-serif; margin: 0; padding: 0; color: #1e293b; }
        .sheet { display: grid; grid-template-columns: repeat(${cols}, ${fmt.cardW}); gap: 0.15in; justify-content: center; }
        .card { page-break-inside: avoid; break-inside: avoid; display: flex; align-items: center; justify-content: center; }
        ${pageBreak}
      </style></head><body>${printContents}</body></html>`);
    win.document.close();
    win.focus();
    // Wait for stylesheets + images to load before printing, otherwise the
    // print renders unstyled / without photos.
    const doPrint = () => {
      try {
        win.focus();
        win.print();
        win.close();
      } catch (e) { /* browser blocked the print */ }
    };
    if (win.document.readyState === 'complete') {
      // Give images a tick to decode.
      setTimeout(doPrint, 300);
    } else {
      win.onload = () => setTimeout(doPrint, 300);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to="/StudentRoster" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">🖨️ Print Shop</h1>
              <p className="text-sm text-gray-500">Check the cards you need, then print — no need to reprint the whole class.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={format} onChange={e => setFormat(e.target.value)} className="h-9 rounded-lg border bg-white px-2 text-sm font-medium">
              {Object.entries(FORMATS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={printOnlyMarked} onChange={e => setPrintOnlyMarked(e.target.checked)} />
              Only marked
            </label>
            {format === 'mailbox' && (
              <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
                <input type="checkbox" checked={showPicture} onChange={e => setShowPicture(e.target.checked)} />
                Pictures
              </label>
            )}
            <button onClick={selectAll} className="flex items-center gap-1.5 text-sm bg-white border rounded-lg px-3 py-2 hover:bg-gray-50 font-medium text-gray-600">
              <CheckCheck className="w-4 h-4" /> All
            </button>
            <button onClick={clearAll} className="flex items-center gap-1.5 text-sm bg-white border rounded-lg px-3 py-2 hover:bg-gray-50 font-medium text-gray-600">
              <Square className="w-4 h-4" /> None
            </button>
            <button
              onClick={handlePrint}
              disabled={selectedStudents.length === 0}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-40"
            >
              <Printer className="w-4 h-4" /> Print {selectedStudents.length} card{selectedStudents.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          {loading ? (
            <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          ) : classes.length === 0 ? (
            <p className="text-gray-400">No classes found.</p>
          ) : (
            classes.map(cls => (
              <button
                key={cls}
                onClick={() => setSelectedClass(cls)}
                className={`px-4 py-2 rounded-full font-medium text-sm transition ${selectedClass === cls ? 'bg-indigo-600 text-white shadow' : 'bg-white text-gray-600 border hover:bg-indigo-50'}`}
              >
                Class {cls}
              </button>
            ))
          )}
        </div>

        {printOnlyMarked && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            Showing only students marked “Print” in the Google Sheet. Uncheck “Only marked” to see the whole class.
          </p>
        )}

        {/* Checkbox grid */}
        {selectedClass && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-6">
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

        {/* Print preview */}
        {selectedStudents.length > 0 ? (
          <>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-2">
              Preview · {selectedStudents.length} {fmt.label}{selectedStudents.length === 1 ? '' : 's'}
            </p>
            <div
              ref={printRef}
              className="sheet grid bg-white p-4 rounded-xl border"
              style={{ gridTemplateColumns: `repeat(${fmt.cols}, ${fmt.cardW})`, gap: '0.15in', justifyContent: 'center' }}
            >
              {selectedStudents.map(s => (
                <div key={s.id} className="card flex items-center justify-center">{renderCard(s)}</div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-center py-10 text-gray-400">No students selected. Check some above or turn off “Only marked”.</p>
        )}
      </div>
    </div>
  );
}