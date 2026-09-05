import React, { useState } from 'react';
import { X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import StudentPhotoEditor from './StudentPhotoEditor';

// Lightweight roster editor — photo + name + class + language only.
// Intentionally simpler than StudentDetail (which is progress-heavy).
export default function RosterStudentModal({ student, onClose, onUpdate, classes = [] }) {
  const [name, setName] = useState(student.name || '');
  const [className, setClassName] = useState(student.class_name || '');
  const [customClass, setCustomClass] = useState('');
  const [lang, setLang] = useState(student.language || 'es');
  const [savingClass, setSavingClass] = useState(false);

  const saveName = async () => {
    const v = name.trim();
    await base44.entities.Student.update(student.id, { name: v });
    onUpdate({ ...student, name: v });
  };

  const saveClass = async () => {
    const v = (customClass.trim().toUpperCase() || className).trim();
    if (!v) return;
    setSavingClass(true);
    await base44.entities.Student.update(student.id, { class_name: v });
    onUpdate({ ...student, class_name: v });
    setSavingClass(false);
  };

  const saveLang = async (v) => {
    setLang(v);
    await base44.entities.Student.update(student.id, { language: v });
    onUpdate({ ...student, language: v });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Student {student.student_number}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <StudentPhotoEditor student={student} onUpdate={onUpdate} />

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Name</label>
            <div className="flex gap-2 mt-1">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Name or initials"
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
              />
              <button onClick={saveName} className="bg-blue-600 text-white rounded-lg px-3 text-sm font-bold hover:bg-blue-700">Save</button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Class</label>
            <div className="flex gap-2 mt-1">
              <select
                value={className}
                onChange={e => setClassName(e.target.value)}
                className="border rounded-lg px-2 py-2 text-sm"
              >
                <option value="">Select…</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                value={customClass}
                onChange={e => setCustomClass(e.target.value)}
                placeholder="or type"
                className="border rounded-lg px-2 py-2 text-sm w-24"
              />
              <button onClick={saveClass} disabled={savingClass} className="bg-blue-600 text-white rounded-lg px-3 text-sm font-bold hover:bg-blue-700 disabled:opacity-40">Save</button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Language</label>
            <select
              value={lang}
              onChange={e => saveLang(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm mt-1 w-full"
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}