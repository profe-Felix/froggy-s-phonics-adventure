import React from 'react';
import { cn } from '@/lib/utils';
import { parseName } from '@/lib/nameNormalize';
import { X, TrendingDown } from 'lucide-react';

const TYPE_LABELS = {
  decoding: 'Decoding',
  upper_names: 'Uppercase Names',
  lower_names: 'Lowercase Names',
  upper_sounds: 'Uppercase Sounds',
  lower_sounds: 'Lowercase Sounds',
  sight_words: 'Sight Words',
};

export default function AssessmentHistory({ student, history, onClose }) {
  const sorted = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Find consistent errors — items incorrect in 2+ attempts across any type
  const errorCounts = {};
  for (const attempt of sorted) {
    for (const item of attempt.incorrect || []) {
      if (!errorCounts[item]) errorCounts[item] = { item, count: 0 };
      errorCounts[item].count++;
    }
  }
  const consistentErrors = Object.values(errorCounts)
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count);

  const { first } = parseName(student?.name);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-3">
            {student?.photo_url && <img src={student.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />}
            <div>
              <h2 className="font-bold text-slate-800">{first || student?.name} — Assessment History</h2>
              <p className="text-xs text-slate-500">{sorted.length} past attempt{sorted.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {consistentErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-amber-800 text-sm">Consistent Errors</h3>
                <span className="text-xs text-amber-600">({consistentErrors.length})</span>
              </div>
              <p className="text-xs text-amber-700 mb-2">Missed 2+ times across attempts — worth targeted intervention:</p>
              <div className="flex flex-wrap gap-1.5">
                {consistentErrors.map((e) => (
                  <span key={e.item} className="px-2 py-1 rounded-md bg-amber-100 border border-amber-300 text-amber-800 text-sm font-bold">
                    {e.item} <span className="text-xs font-normal">×{e.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {sorted.length === 0 ? (
            <p className="text-center text-slate-400 py-8">No past attempts yet.</p>
          ) : (
            sorted.map((attempt, i) => {
              const date = attempt.date ? new Date(attempt.date) : null;
              const dateStr = date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date';
              const total = (attempt.correct?.length || 0) + (attempt.incorrect?.length || 0);
              const accuracy = total > 0 ? Math.round((attempt.correct?.length || 0) / total * 100) : 0;

              return (
                <div key={i} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">{TYPE_LABELS[attempt.type] || attempt.type}</span>
                      <span className="text-xs text-slate-400">{dateStr}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-green-600 font-bold">{attempt.correct?.length || 0}✓</span>
                      <span className="text-red-600 font-bold">{attempt.incorrect?.length || 0}✗</span>
                      <span className="text-slate-400 text-xs">({accuracy}%)</span>
                    </div>
                  </div>
                  {attempt.incorrect?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-slate-500 mb-1">Errors:</p>
                      <div className="flex flex-wrap gap-1">
                        {attempt.incorrect.map((item, j) => {
                          const isConsistent = errorCounts[item]?.count >= 2;
                          return (
                            <span key={j} className={cn(
                              'px-2 py-0.5 rounded text-sm font-medium',
                              isConsistent ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-red-50 text-red-600'
                            )}>
                              {item}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {attempt.incorrect?.length === 0 && attempt.correct?.length > 0 && (
                    <p className="text-xs text-green-600 mt-1">All correct! 🎉</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}