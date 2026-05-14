import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ALL_PRIZES } from '@/components/game/PrizeWheel';

const CLASS_NAMES_DEFAULT = ['Felix', 'Valero', 'Campos'];
const CUSHION_LIMIT = 6;
const PTS_PER_SPIN = 100;

function PrizeBadge({ prize }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ background: prize.color + '44', border: `1.5px solid ${prize.color}` }}>
      {prize.emoji} {prize.label}
    </span>
  );
}

export default function PrizeDashboard() {
  const [selectedClass, setSelectedClass] = useState('All');
  const qc = useQueryClient();

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['students-prizes'],
    queryFn: () => base44.entities.Student.list('-updated_date', 200),
    refetchInterval: 20000,
  });

  const updateStudent = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Student.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students-prizes'] }),
  });

  const classes = ['All', ...Array.from(new Set(students.map(s => s.class_name).filter(Boolean))).sort()];

  const filtered = selectedClass === 'All'
    ? students
    : students.filter(s => s.class_name === selectedClass);

  // Active cushion holders (sorted by when they first got it — using cushion_since timestamp)
  const cushionHolders = filtered
    .filter(s => s.active_prizes?.includes('cushion'))
    .sort((a, b) => (a.cushion_since || 0) - (b.cushion_since || 0));

  // Give cushion to a student (and evict oldest if at limit)
  const giveCushion = async (student) => {
    const allCushionHolders = students
      .filter(s => s.active_prizes?.includes('cushion') && (selectedClass === 'All' || s.class_name === selectedClass))
      .sort((a, b) => (a.cushion_since || 0) - (b.cushion_since || 0));

    // Evict oldest if at limit
    if (allCushionHolders.length >= CUSHION_LIMIT) {
      const oldest = allCushionHolders[0];
      const newPrizes = (oldest.active_prizes || []).filter(p => p !== 'cushion');
      await base44.entities.Student.update(oldest.id, { active_prizes: newPrizes, cushion_since: null });
    }

    // Give cushion to this student
    const currentPrizes = student.active_prizes || [];
    if (!currentPrizes.includes('cushion')) {
      await base44.entities.Student.update(student.id, {
        active_prizes: [...currentPrizes, 'cushion'],
        cushion_since: Date.now(),
      });
    }
    qc.invalidateQueries({ queryKey: ['students-prizes'] });
  };

  const removePrize = async (student, prizeId) => {
    const newPrizes = (student.active_prizes || []).filter(p => p !== prizeId);
    const extra = prizeId === 'cushion' ? { cushion_since: null } : {};
    await base44.entities.Student.update(student.id, { active_prizes: newPrizes, ...extra });
    qc.invalidateQueries({ queryKey: ['students-prizes'] });
  };

  // Students who have pending prizes (won but not yet marked active)
  const studentsWithPrizes = filtered.filter(s =>
    (s.prize_history?.length > 0) ||
    (s.redeemed_prizes?.length > 0) ||
    (s.active_prizes?.length > 0) ||
    (s.sentences_total_points || 0) > 0
  ).sort((a, b) => (b.sentences_total_points || 0) - (a.sentences_total_points || 0));

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link to="/Dashboard" className="text-blue-600 hover:underline font-bold text-sm">← Dashboard</Link>
          <h1 className="text-2xl font-black text-rose-700 flex-1">🎡 Prize Dashboard</h1>
          <span className="text-xs text-gray-500 font-bold bg-white rounded-full px-3 py-1 border">Every 100 pts = 1 spin</span>
        </div>

        {/* Class filter */}
        <div className="flex gap-2 flex-wrap mb-6">
          {classes.map(cls => (
            <button key={cls} onClick={() => setSelectedClass(cls)}
              className={`px-4 py-2 rounded-full font-bold text-sm transition-all ${selectedClass === cls ? 'bg-rose-500 text-white shadow' : 'bg-white text-gray-600 border hover:bg-rose-50'}`}>
              {cls === 'All' ? 'All Classes' : `Class ${cls}`}
            </button>
          ))}
        </div>

        {/* Cushion queue */}
        <div className="bg-white rounded-2xl shadow border border-rose-100 p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🪑</span>
            <h2 className="text-lg font-black text-gray-800">Cushion Queue</h2>
            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${cushionHolders.length >= CUSHION_LIMIT ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
              {cushionHolders.length}/{CUSHION_LIMIT} seats taken
            </span>
          </div>
          {cushionHolders.length === 0 ? (
            <p className="text-sm text-gray-400 font-bold">No cushion holders yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {cushionHolders.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 bg-amber-50 border-2 border-amber-300 rounded-xl px-3 py-2">
                  <span className="text-xs font-black text-amber-600">#{i + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-amber-500 text-white font-black text-sm flex items-center justify-center">{s.student_number}</div>
                  <span className="text-xs font-bold text-gray-700">
                    {s.name || `Student ${s.student_number}`}
                    <span className="text-gray-400 ml-1">({s.class_name})</span>
                  </span>
                  {i === 0 && <span className="text-xs text-amber-500 font-bold">← gives up first</span>}
                  <button onClick={() => removePrize(s, 'cushion')}
                    className="text-red-400 hover:text-red-600 font-black text-xs ml-1">✕</button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2 font-bold">When a 7th student gets the cushion prize, student #{(cushionHolders[0]?.student_number) || '?'} loses theirs automatically.</p>
        </div>

        {/* All prizes */}
        <div className="bg-white rounded-2xl shadow border border-rose-100 p-5 mb-6">
          <h2 className="text-lg font-black text-gray-800 mb-3">🏆 Prize Summary (by prize type)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ALL_PRIZES.map(prize => {
              const holders = filtered.filter(s => s.active_prizes?.includes(prize.id));
              return (
                <div key={prize.id} className="rounded-xl p-3 border-2" style={{ borderColor: prize.color, background: prize.color + '22' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">{prize.emoji}</span>
                    <div>
                      <p className="text-xs font-black text-gray-800 leading-tight">{prize.label}</p>
                      {prize.oneTime && <span className="text-xs text-purple-600 font-bold">one-time</span>}
                    </div>
                  </div>
                  {holders.length === 0 ? (
                    <p className="text-xs text-gray-400">No current holders</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {holders.map(s => (
                        <span key={s.id} className="text-xs bg-white rounded-full px-2 py-0.5 border font-bold text-gray-700">
                          #{s.student_number}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-student list */}
        <div className="bg-white rounded-2xl shadow border border-rose-100 p-5">
          <h2 className="text-lg font-black text-gray-800 mb-3">👩‍🎓 Students — Points & Prizes</h2>
          {isLoading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin" /></div>
          ) : studentsWithPrizes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No prize activity yet for this class.</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {studentsWithPrizes.map(s => {
                const pts = s.sentences_total_points || 0;
                const spins = Math.floor(pts / PTS_PER_SPIN);
                const progress = pts % PTS_PER_SPIN;
                const activePrizes = s.active_prizes || [];
                const redeemedPrizes = s.redeemed_prizes || [];

                return (
                  <div key={s.id} className="py-3 flex flex-wrap items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-rose-500 text-white font-black text-lg flex items-center justify-center shrink-0">
                      {s.student_number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800 text-sm">{s.name || `Student ${s.student_number}`}</span>
                        <span className="text-xs text-gray-400">({s.class_name})</span>
                        <span className="text-xs font-black text-rose-600">⭐ {pts} pts</span>
                        <span className="text-xs text-gray-400">{spins} spin{spins !== 1 ? 's' : ''} used</span>
                      </div>
                      {/* Progress bar */}
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-2 rounded-full bg-rose-100 overflow-hidden max-w-32">
                          <div className="h-full bg-rose-400 rounded-full" style={{ width: `${(progress / PTS_PER_SPIN) * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{progress}/100</span>
                      </div>
                      {/* Active prizes */}
                      {activePrizes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          <span className="text-xs text-gray-500 font-bold">Active:</span>
                          {activePrizes.map(pid => {
                            const prize = ALL_PRIZES.find(p => p.id === pid);
                            if (!prize) return null;
                            return (
                              <span key={pid} className="inline-flex items-center gap-1">
                                <PrizeBadge prize={prize} />
                                <button onClick={() => removePrize(s, pid)} className="text-red-400 hover:text-red-600 text-xs font-black leading-none">✕</button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {/* Redeemed (one-time) */}
                      {redeemedPrizes.includes('ring') && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-xs text-purple-500 font-bold">💍 Ring claimed (lifetime)</span>
                        </div>
                      )}
                    </div>
                    {/* Action: give cushion */}
                    <button
                      onClick={() => giveCushion(s)}
                      disabled={activePrizes.includes('cushion')}
                      className="text-xs px-3 py-1.5 rounded-xl font-bold border-2 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                      🪑 {activePrizes.includes('cushion') ? 'Has cushion' : 'Give cushion'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}