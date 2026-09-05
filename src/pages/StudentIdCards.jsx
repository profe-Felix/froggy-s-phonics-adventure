import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer, CheckCheck, Square } from 'lucide-react';

// ID card print page. Pulls students for a class, lets the teacher check
// exactly which cards to print (so a single replacement card doesn't force
// reprinting the whole class), and prints multiple cards per sheet with a
// QR login code on each card.
export default function StudentIdCards() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialClass = urlParams.get('class') || '';

  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(initialClass);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const printRef = useRef();

  const baseUrl = `${window.location.origin}/LetterGame`;

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
      // Default: all selected — print the whole class in one click.
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
    .sort((a, b) => a.student_number - b.student_number);

  const handlePrint = () => {
    if (!printRef.current || selectedStudents.length === 0) return;
    const printContents = printRef.current.innerHTML;
    const safeClass = String(selectedClass || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>ID Cards - Class ${safeClass}</title>
      <style>
        @page { size: letter portrait; margin: 0.5in; }
        body { font-family: 'Teachers', 'Andika', sans-serif; margin: 0; padding: 0; color: #1e293b; }
        .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.25in; }
        .card { border: 2px solid #1e293b; border-radius: 14px; padding: 10px; text-align: center; page-break-inside: avoid; display: flex; flex-direction: column; align-items: center; gap: 5px; }
        .card .photo { width: 100%; aspect-ratio: 1/1; object-fit: cover; border-radius: 10px; background: #f1f5f9; }
        .card .ph { width: 100%; aspect-ratio: 1/1; border-radius: 10px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 44px; font-weight: 900; }
        .card .name { font-size: 15px; font-weight: 800; line-height: 1.1; }
        .card .num { font-size: 22px; font-weight: 900; color: #0f766e; line-height: 1; }
        .card .meta { font-size: 11px; color: #64748b; }
        .card .qr { margin-top: 2px; }
        @media print { body { padding: 0; } }
      </style></head><body>${printContents}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to="/StudentRoster" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">🪪 ID Card Printer</h1>
              <p className="text-sm text-gray-500">Check the cards you need, then print — no need to reprint the whole class.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Class selector */}
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
                className={`px-4 py-2 rounded-full font-medium text-sm transition ${
                  selectedClass === cls ? 'bg-indigo-600 text-white shadow' : 'bg-white text-gray-600 border hover:bg-indigo-50'
                }`}
              >
                Class {cls}
              </button>
            ))
          )}
        </div>

        {/* Checkbox grid — pick which cards to print */}
        {selectedClass && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-6">
            {Array.from({ length: 30 }, (_, i) => i + 1).map(num => {
              const s = byNumber[num];
              const checked = selected.has(num);
              return (
                <button
                  key={num}
                  onClick={() => s && toggle(num)}
                  disabled={!s}
                  className={`relative aspect-[3/4] rounded-xl border-2 overflow-hidden flex flex-col items-center justify-center transition ${
                    !s ? 'border-dashed border-gray-200 bg-gray-50 text-gray-300' :
                    checked ? 'border-indigo-500 ring-2 ring-indigo-300 bg-white' : 'border-gray-200 bg-white opacity-50'
                  }`}
                >
                  {s?.photo_url && <img src={s.photo_url} alt={String(num)} className="absolute inset-0 w-full h-full object-cover" />}
                  <div className="relative z-10 flex flex-col items-center" style={{ textShadow: s?.photo_url ? '0 1px 4px rgba(0,0,0,0.7)' : 'none' }}>
                    <span className={`text-xl font-black ${s?.photo_url ? 'text-white' : 'text-gray-400'}`}>{num}</span>
                    {s?.name && <span className={`text-[11px] font-bold ${s?.photo_url ? 'text-white' : 'text-gray-500'}`}>{s.name}</span>}
                  </div>
                  {s && (
                    <div className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold ${checked ? 'bg-indigo-600' : 'bg-gray-400/70'}`}>
                      {checked ? '✓' : ''}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Print preview — only the checked cards render here, and this is what prints */}
        {selectedStudents.length > 0 && (
          <>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-2">Preview · {selectedStudents.length} card{selectedStudents.length === 1 ? '' : 's'}</p>
            <div ref={printRef} className="sheet grid grid-cols-3 gap-4 bg-white p-4 rounded-xl border">
              {selectedStudents.map(s => {
                const qrUrl = `${baseUrl}?class=${encodeURIComponent(s.class_name)}&number=${s.student_number}&year=${s.school_year || ACTIVE_SCHOOL_YEAR}`;
                return (
                  <div key={s.id} className="card border-2 border-slate-800 rounded-xl p-2.5 flex flex-col items-center gap-1">
                    {s.photo_url ? (
                      <img className="photo w-full aspect-square object-cover rounded-lg" src={s.photo_url} alt={s.name || String(s.student_number)} />
                    ) : (
                      <div className="ph w-full aspect-square rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-4xl font-black">{s.student_number}</div>
                    )}
                    <div className="name text-slate-800 font-extrabold text-sm leading-tight">{s.name || `Student ${s.student_number}`}</div>
                    <div className="num text-teal-700 font-black text-xl leading-none">#{s.student_number}</div>
                    <div className="meta text-slate-500 text-[11px]">Class {s.class_name} · {s.school_year || ACTIVE_SCHOOL_YEAR}</div>
                    <div className="qr"><QRCodeSVG value={qrUrl} size={72} /></div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}