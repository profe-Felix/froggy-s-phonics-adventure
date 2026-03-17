import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function QRGenerator() {
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [loading, setLoading] = useState(true);
  const printRef = useRef();

  const baseUrl = `${window.location.origin}/LetterGame`;

  useEffect(() => {
    base44.entities.Student.list('-updated_date', 200).then(students => {
      const unique = [...new Set(students.map(s => s.class_name).filter(Boolean))].sort();
      setClasses(unique);
      if (unique.length > 0) setSelectedClass(unique[0]);
      setLoading(false);
    });
  }, []);

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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link to="/Dashboard" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">🔲 QR Code Generator</h1>
              <p className="text-sm text-gray-500">Print QR codes for students to use at home</p>
            </div>
          </div>
          <button
            onClick={handlePrint}
            disabled={!selectedClass}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 text-sm font-medium"
          >
            <Printer className="w-4 h-4" />
            Print Class {selectedClass}
          </button>
        </div>

        {/* Class selector */}
        <div className="flex gap-2 flex-wrap mb-6">
          {loading ? (
            <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          ) : classes.length === 0 ? (
            <p className="text-gray-400">No classes found. Students need to log in first.</p>
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
              const url = `${baseUrl}?class=${encodeURIComponent(selectedClass)}&number=${num}`;
              return (
                <div key={num} className="bg-white border border-gray-200 rounded-xl p-3 text-center shadow-sm">
                  <QRCodeSVG value={url} size={100} className="mx-auto" />
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