import { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';

const KNOWN_CLASSES = ['Schwarz', 'Felix', 'Valero', 'Gutierrez'];

// Quick teacher tool: pick a class from a dropdown, get a downloadable QR
// code that opens the app pre-filtered to that class (?class=Name).
export default function ClassQR() {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [loading, setLoading] = useState(true);
  const qrRef = useRef(null);

  useEffect(() => {
    base44.entities.Student
      .filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-updated_date', 200)
      .then((all) => {
        const unique = [...new Set(all.map((s) => s.class_name).filter(Boolean))].sort();
        const merged = [...new Set([...unique, ...KNOWN_CLASSES])].sort();
        setClasses(merged);
        if (merged.length > 0) setSelectedClass(merged[0]);
      })
      .catch(() => {
        setClasses(KNOWN_CLASSES);
        setSelectedClass(KNOWN_CLASSES[0]);
      })
      .finally(() => setLoading(false));
  }, []);

  const url = selectedClass
    ? `${window.location.origin}/?class=${encodeURIComponent(selectedClass)}`
    : '';

  const handleDownload = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `QR_${selectedClass || 'class'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/Dashboard" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold text-gray-800">🔲 Class QR Code</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 flex flex-col items-center gap-6">
        <div className="w-full flex flex-col items-center gap-2">
          <label className="text-sm font-bold text-slate-600">Select your class</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-base font-bold text-slate-800 bg-white min-w-[200px]"
          >
            {loading && <option>Loading…</option>}
            {classes.map((cls) => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
        </div>

        {url && (
          <>
            <div ref={qrRef} className="bg-white rounded-2xl p-6 shadow-lg">
              <QRCodeCanvas value={url} size={300} level="M" marginSize={4} />
            </div>

            <p className="text-xs text-slate-400 break-all text-center max-w-xs">{url}</p>

            <div className="flex gap-3">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold shadow-lg hover:bg-indigo-700"
              >
                <Download className="w-5 h-5" />
                Download
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white border border-slate-300 text-slate-700 font-bold shadow hover:bg-slate-50"
              >
                <Printer className="w-5 h-5" />
                Print
              </button>
            </div>

            <p className="text-sm text-slate-500 text-center max-w-md">
              Students scan this QR code to open the app directly in your class.
            </p>
          </>
        )}
      </main>
    </div>
  );
}