import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ALL_PRIZES } from '@/components/game/PrizeWheel';

const CLASS_NAMES_DEFAULT = ['Felix', 'Valero', 'Campos'];
const CUSHION_LIMIT = 6;
const COINS_PER_SPIN = 100;

function PrizeBadge({ prize }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ background: prize.color + '44', border: `1.5px solid ${prize.color}` }}>
      {prize.emoji} {prize.label}
    </span>
  );
}

function StudentAvatar({ student, size = 40 }) {
  if (student.photo_url) {
    return (
      <img src={student.photo_url} alt={student.name || `Student ${student.student_number}`}
        className="rounded-full object-cover shrink-0 border-2 border-white shadow"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className="rounded-full bg-rose-500 text-white font-black flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {student.student_number}
    </div>
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

  // Mark one instance of a won prize as physically handed out, so the teacher
  // doesn't give the same prize twice.
  const markPrizeGiven = async (student, groupKey) => {
    const prizeHistory = student.prize_history || [];
    let marked = false;
    const updated = prizeHistory.map(e => {
      if (marked) return e;
      const key = e.id || e.label || 'prize';
      if (key === groupKey && !e.given) {
        marked = true;
        return { ...e, given: true, given_at: new Date().toISOString() };
      }
      return e;
    });
    if (!marked) return;
    await base44.entities.Student.update(student.id, { prize_history: updated });
    qc.invalidateQueries({ queryKey: ['students-prizes'] });
  };

  const undoPrizeGiven = async (student, groupKey) => {
    const prizeHistory = student.prize_history || [];
    let lastGivenIdx = -1;
    prizeHistory.forEach((e, idx) => {
      const key = e.id || e.label || 'prize';
      if (key === groupKey && e.given) lastGivenIdx = idx;
    });
    if (lastGivenIdx === -1) return;
    const updated = prizeHistory.map((e, idx) =>
      idx === lastGivenIdx ? { ...e, given: false } : e
    );
    await base44.entities.Student.update(student.id, { prize_history: updated });
    qc.invalidateQueries({ queryKey: ['students-prizes'] });
  };

  const giveEveryone80Coins = async () => {
    const ok = window.confirm(
      'Set ALL currently filtered students to 80 coins?'
    );

    if (!ok) return;

    for (const student of filtered) {
      await base44.entities.Student.update(student.id, {
        coins: 80
      });
    }

    qc.invalidateQueries({ queryKey: ['students-prizes'] });
    alert('Done. Students are now set to 80/100 coins.');
  };

  // Students who have pending prizes (won but not yet marked active)
  const studentsWithPrizes = filtered.filter(s =>
    (s.prize_history?.length > 0) ||
    (s.redeemed_prizes?.length > 0) ||
    (s.active_prizes?.length > 0) ||
    (s.coins || 0) > 0
  ).sort((a, b) => (b.coins || 0) - (a.coins || 0));

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link to="/Dashboard" className="text-blue-600 hover:underline font-bold text-sm">← Dashboard</Link>
          <h1 className="text-2xl font-black text-rose-700 flex-1">🎡 Prize Dashboard</h1>
          <span className="text-xs text-gray-500 font-bold bg-white rounded-full px-3 py-1 border">Every 100 coins = 1 spin</span>
        </div>
        <div className="mb-4">
          <button
            onClick={giveEveryone80Coins}
            className="px-4 py-2 rounded-xl bg-orange-500 text-white font-black shadow hover:bg-orange-600 active:scale-95"
          >
            🎁 Set filtered students to 80 coins
          </button>
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
                  <StudentAvatar student={s} size={32} />
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
                    <div className="flex flex-wrap gap-1.5">
                      {holders.map(s => (
                        <div key={s.id} className="flex items-center gap-1 bg-white rounded-full pl-0.5 pr-2 py-0.5 border">
                          <StudentAvatar student={s} size={22} />
                          <span className="text-xs font-bold text-gray-700">{s.name || `#${s.student_number}`}</span>
                        </div>
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
          <h2 className="text-lg font-black text-gray-800 mb-3">👩‍🎓 Students — Coins & Prizes</h2>
          {isLoading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin" /></div>
          ) : studentsWithPrizes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No prize activity yet for this class.</p>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {studentsWithPrizes.map(s => {
                const coins = Number(s.coins || 0);
                const progress = Math.min(coins, COINS_PER_SPIN);
                const activePrizes = s.active_prizes || [];
                const redeemedPrizes = s.redeemed_prizes || [];
                const prizeHistory = [...(s.prize_history || [])]
                  .sort((a, b) => new Date(b.claimed_at || 0) - new Date(a.claimed_at || 0));

                return (
                  <div key={s.id} className="py-3 flex flex-wrap items-center gap-3">
                    <StudentAvatar student={s} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800 text-sm">{s.name || `Student ${s.student_number}`}</span>
                        <span className="text-xs text-gray-400">({s.class_name})</span>
                        <span className="text-xs font-black text-rose-600">
                          🪙 {coins} coins
                        </span>
                        {prizeHistory.length > 0 && (
                          <span className="text-xs font-black text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 border border-amber-300">
                            🎁 {prizeHistory.length} prize{prizeHistory.length !== 1 ? 's' : ''} won
                          </span>
                        )}
                        {coins >= COINS_PER_SPIN && (
                          <span className="text-xs font-black text-green-600">
                            🎡 Spin ready!
                          </span>
                        )}
                      </div>
                      {/* Progress bar */}
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-2 rounded-full bg-rose-100 overflow-hidden max-w-32">
                          <div className="h-full bg-rose-400 rounded-full" style={{ width: `${(progress / COINS_PER_SPIN) * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{progress}/{COINS_PER_SPIN} coins</span>
                      </div>
                      {/* Prize history — grouped with counts + give-out tracking */}
                      {prizeHistory.length > 0 && (() => {
                        const groups = {};
                        prizeHistory.forEach(entry => {
                          const key = entry.id || entry.label || 'prize';
                          if (!groups[key]) groups[key] = { key, emoji: entry.emoji || '🎁', label: entry.label || entry.id, entries: [] };
                          groups[key].entries.push(entry);
                        });
                        return (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            <span className="text-xs text-gray-500 font-bold">Won:</span>
                            {Object.values(groups).map(g => {
                              const total = g.entries.length;
                              const givenCount = g.entries.filter(e => e.given).length;
                              const allGiven = givenCount >= total;
                              return (
                                <span key={g.key}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${allGiven ? 'bg-green-50 border-green-300 text-green-700' : 'bg-pink-50 border-pink-200 text-pink-700'}`}>
                                  {g.emoji} {g.label}
                                  {total > 1 && <span className="bg-amber-400 text-white rounded-full px-1.5 font-black text-[11px]">×{total}</span>}
                                  {givenCount > 0 && <span className="text-green-600 font-black">✓{givenCount}</span>}
                                  {!allGiven && (
                                    <button onClick={() => markPrizeGiven(s, g.key)}
                                      className="ml-0.5 px-1.5 rounded-full bg-green-500 text-white text-[10px] font-black hover:bg-green-600">✓ Given</button>
                                  )}
                                  {givenCount > 0 && (
                                    <button onClick={() => undoPrizeGiven(s, g.key)}
                                      className="ml-0.5 text-gray-400 hover:text-gray-600 text-[10px] font-bold">undo</button>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        );
                      })()}
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