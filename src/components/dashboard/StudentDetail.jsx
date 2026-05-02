import React, { useState } from 'react';
import { X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { LETTER_SOUNDS } from '../data/letterSounds';

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

function CaseBadge({ letter, attempts }) {
  const lo = attempts?.[`${letter}_lower`] || { correct: 0, total: 0 };
  const hi = attempts?.[`${letter}_upper`] || { correct: 0, total: 0 };
  const loPct = lo.total > 0 ? Math.round(lo.correct / lo.total * 100) : null;
  const hiPct = hi.total > 0 ? Math.round(hi.correct / hi.total * 100) : null;
  const loColor = loPct === null ? 'text-gray-300' : loPct >= 80 ? 'text-green-600' : loPct >= 50 ? 'text-yellow-600' : 'text-red-500';
  const hiColor = hiPct === null ? 'text-gray-300' : hiPct >= 80 ? 'text-green-600' : hiPct >= 50 ? 'text-yellow-600' : 'text-red-500';
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm bg-white border shadow-sm">
      <span className="font-bold">{letter}</span>
      <span className={`text-xs font-medium ${loColor}`}>{letter.toLowerCase()} {loPct !== null ? `${loPct}%` : '–'}</span>
      <span className="text-gray-300">|</span>
      <span className={`text-xs font-medium ${hiColor}`}>{letter.toUpperCase()} {hiPct !== null ? `${hiPct}%` : '–'}</span>
    </span>
  );
}

function LetterSoundsEditor({ student, onUpdate }) {
  const mp = student.mode_progress || {};
  const ls = mp.letter_sounds || { mastered_items: [], learning_items: [], item_attempts: {}, total_correct: 0, total_attempts: 0, unlocked: true };
  const mastered = new Set(ls.mastered_items || []);
  const learning = new Set(ls.learning_items || []);
  const [saving, setSaving] = useState(false);

  const getStatus = (letter) => {
    if (mastered.has(letter)) return 'mastered';
    if (learning.has(letter)) return 'learning';
    return 'none';
  };

  const cycleStatus = async (letter) => {
    const current = getStatus(letter);
    let newMastered = [...mastered];
    let newLearning = [...learning];

    if (current === 'none') {
      newLearning.push(letter);
    } else if (current === 'learning') {
      newLearning = newLearning.filter(l => l !== letter);
      newMastered.push(letter);
    } else {
      newMastered = newMastered.filter(l => l !== letter);
    }

    setSaving(true);
    const updated = {
      ...student,
      mode_progress: {
        ...mp,
        letter_sounds: { ...ls, mastered_items: newMastered, learning_items: newLearning }
      }
    };
    await base44.entities.Student.update(student.id, { mode_progress: updated.mode_progress });
    onUpdate(updated);
    setSaving(false);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-semibold">Letter Sounds</h3>
        {saving && <span className="text-xs text-blue-500 animate-pulse">Saving…</span>}
        <span className="ml-auto text-xs text-gray-400">Tap to cycle: none → learning → mastered → none</span>
      </div>
      <div className="flex gap-2 mb-2 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 inline-block border border-green-400"></span> Mastered</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 inline-block border border-yellow-400"></span> Learning</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 inline-block border border-gray-300"></span> Not started</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {LETTER_SOUNDS.map(letter => {
          const status = getStatus(letter);
          const stats = ls.item_attempts?.[letter] || { correct: 0, total: 0 };
          const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null;
          return (
            <button
              key={letter}
              onClick={() => cycleStatus(letter)}
              className={`flex flex-col items-center px-3 py-2 rounded-xl border-2 font-bold text-sm transition hover:scale-105 active:scale-95
                ${status === 'mastered' ? 'bg-green-100 border-green-400 text-green-800' :
                  status === 'learning' ? 'bg-yellow-50 border-yellow-400 text-yellow-800' :
                  'bg-gray-50 border-gray-200 text-gray-400'}`}
            >
              <span className="text-base">{letter}</span>
              {pct !== null && <span className="text-xs opacity-70">{pct}%</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function StudentDetail({ student, onClose, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(student.name || '');
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

  const handleSaveName = async () => {
    await base44.entities.Student.update(student.id, { name: nameInput.trim() });
    onUpdate({ ...student, name: nameInput.trim() });
    setEditingName(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-xl font-bold">Student {student.student_number} {student.class_name ? `· Class ${student.class_name}` : ''}</h2>
            {editingName ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Enter name or initials"
                  className="border rounded-lg px-2 py-1 text-sm"
                  autoFocus
                />
                <button onClick={handleSaveName} className="text-sm text-blue-600">Save</button>
                <button onClick={() => setEditingName(false)} className="text-sm text-gray-400">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setEditingName(true)} className="text-sm text-gray-400 hover:text-blue-600 mt-0.5">
                {student.name ? student.name : '+ Add name/initials'}
              </button>
            )}
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
          {/* Letter Sounds interactive editor */}
          <LetterSoundsEditor student={student} onUpdate={onUpdate} />

          {Object.entries(MODE_LABELS).filter(([k]) => k !== 'letter_sounds').map(([modeKey, modeLabel]) => {
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

                {modeKey === 'case_matching' && (mastered.length > 0 || learning.length > 0) && (
                  <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Upper vs Lower breakdown (color = accuracy):</p>
                    <div className="flex flex-wrap gap-1">
                      {[...mastered, ...learning].map(letter => (
                        <CaseBadge key={letter} letter={letter} attempts={attempts} />
                      ))}
                    </div>
                  </div>
                )}

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