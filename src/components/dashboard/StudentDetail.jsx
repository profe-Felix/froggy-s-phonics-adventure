import React, { useState } from 'react';
import { X, Volume2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const MODE_LABELS = {
  letter_sounds: 'Letter Sounds',
  sight_words_easy: 'Sight Words (Easy)',
  sight_words_spelling: 'Sight Words Spelling',
  spelling: 'Spelling',
  case_matching: 'Case Matching'
};

const CLASSES = ['F', 'V', 'C', 'S', 'B', 'M', 'R', 'T', 'G', 'L'];

function ItemBadge({ item, attempts }) {
  const stats = attempts?.[item] || { correct: 0, total: 0 };
  const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium bg-white border shadow-sm">
      <span className="font-bold">{item}</span>
      {pct !== null && <span className="text-xs text-gray-400">{pct}%</span>}
    </span>
  );
}

export default function StudentDetail({ student, onClose, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [className, setClassName] = useState(student.class_name || '');
  const [customClass, setCustomClass] = useState('');
  const [saving, setSaving] = useState(false);

  const mp = student.mode_progress || {};

  const handleSaveClass = async () => {
    setSaving(true);
    const val = customClass.trim().toUpperCase() || className;
    await base44.entities.Student.update(student.id, { class_name: val });
    onUpdate({ ...student, class_name: val });
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-xl font-bold">Student {student.student_number}</h2>
            {student.name && <p className="text-gray-500 text-sm">{student.name}</p>}
          </div>
          <div className="flex items-center gap-3">
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="text-sm text-blue-600 border border-blue-200 rounded-lg px-3 py-1 hover:bg-blue-50"
              >
                {student.class_name ? `Class ${student.class_name}` : 'Set Class'}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={className}
                  onChange={e => setClassName(e.target.value)}
                  className="border rounded-lg px-2 py-1 text-sm"
                >
                  <option value="">Select...</option>
                  {CLASSES.map(c => <option key={c} value={c}>Class {c}</option>)}
                </select>
                <input
                  placeholder="or type..."
                  value={customClass}
                  onChange={e => setCustomClass(e.target.value)}
                  className="border rounded-lg px-2 py-1 text-sm w-20"
                />
                <button
                  onClick={handleSaveClass}
                  disabled={saving}
                  className="bg-blue-600 text-white rounded-lg px-3 py-1 text-sm"
                >
                  Save
                </button>
                <button onClick={() => setEditing(false)} className="text-gray-400 text-sm">Cancel</button>
              </div>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {Object.entries(MODE_LABELS).map(([modeKey, modeLabel]) => {
            const data = mp[modeKey];
            if (!data?.unlocked) return (
              <div key={modeKey} className="opacity-40">
                <h3 className="font-semibold text-gray-500 text-sm mb-1">{modeLabel} — Locked</h3>
              </div>
            );
            const mastered = data.mastered_items || [];
            const learning = data.learning_items || [];
            const attempts = data.item_attempts || {};
            const accuracy = data.total_attempts > 0
              ? Math.round((data.total_correct / data.total_attempts) * 100)
              : 0;
            return (
              <div key={modeKey}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{modeLabel}</h3>
                  <span className="text-sm text-gray-500">{accuracy}% accuracy · {data.total_attempts || 0} attempts</span>
                </div>
                {mastered.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-green-600 font-medium mb-1">✓ Mastered ({mastered.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {mastered.map(item => <ItemBadge key={item} item={item} attempts={attempts} />)}
                    </div>
                  </div>
                )}
                {learning.length > 0 && (
                  <div>
                    <p className="text-xs text-yellow-600 font-medium mb-1">⟳ Learning ({learning.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {learning.map(item => <ItemBadge key={item} item={item} attempts={attempts} />)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}