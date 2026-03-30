import React, { useState } from 'react';
import StrokeReplay from '../components/math/StrokeReplay';
import StruggleGroups from '../components/math/StruggleGroups';
import StudentAccuracyView from '../components/math/StudentAccuracyView';
import BingoStudentView from '../components/math/BingoStudentView';
import BingoStruggleGroups from '../components/math/BingoStruggleGroups';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';

const CLASSES = ['Felix', 'Valero', 'Campos'];
const TABS = ['✏️ Writing Samples', '👥 By Student', '🔴 Struggle Groups', '🎱 Bingo'];

export default function MathDashboard() {
  const [selectedClass, setSelectedClass] = useState(CLASSES[0]);
  const [activeTab, setActiveTab] = useState(0);
  const [filterNumber, setFilterNumber] = useState(null);
  const [lightbox, setLightbox] = useState(null); // { image_url, student_number, number }

  const { data: samples = [], isLoading } = useQuery({
    queryKey: ['writing-samples', selectedClass],
    queryFn: () => base44.entities.NumberWritingSample.filter({ class_name: selectedClass }, '-created_date', 300),
    refetchInterval: 10000,
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ['number-attempts', selectedClass],
    queryFn: () => base44.entities.NumberAttempt.filter({ class_name: selectedClass }, '-created_date', 1000),
    refetchInterval: 10000,
  });

  const { data: bingoResponses = [] } = useQuery({
    queryKey: ['bingo-responses', selectedClass],
    queryFn: () => base44.entities.MathBingoResponse.filter({ class_name: selectedClass }, '-created_date', 2000),
    refetchInterval: 10000,
  });

  const [bingoSubTab, setBingoSubTab] = useState(0);
  const [resetting, setResetting] = useState(false);
  const queryClient = useQueryClient();

  const handleResetBingo = async () => {
    if (!window.confirm(`Delete all Bingo data for ${selectedClass}? This cannot be undone.`)) return;
    setResetting(true);
    // Delete in batches of 5 to avoid rate limits
    const ids = bingoResponses.map(r => r.id);
    for (let i = 0; i < ids.length; i += 5) {
      await Promise.all(ids.slice(i, i + 5).map(id => base44.entities.MathBingoResponse.delete(id)));
    }
    await queryClient.invalidateQueries(['bingo-responses', selectedClass]);
    setResetting(false);
  };

  const numbers = [...new Set(samples.map(s => s.number))].sort((a, b) => a - b);
  const filtered = filterNumber !== null ? samples.filter(s => s.number === filterNumber) : samples;

  // Group by student for summary view
  const byStudent = {};
  samples.forEach(s => {
    if (!byStudent[s.student_number]) byStudent[s.student_number] = [];
    byStudent[s.student_number].push(s);
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-600 to-purple-700 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <a href="/MathGames?mode=teacher" className="text-white/70 hover:text-white text-sm">← Bingo Teacher</a>
          <h1 className="text-3xl font-bold text-white">🧮 Math Dashboard</h1>
        </div>

        {/* Class selector */}
        <div className="flex gap-2 mb-6">
          {CLASSES.map(cls => (
            <button
              key={cls}
              onClick={() => { setSelectedClass(cls); setFilterNumber(null); }}
              className={`px-5 py-2 rounded-xl font-bold transition-colors text-sm ${selectedClass === cls ? 'bg-white text-indigo-700' : 'bg-white/20 text-white hover:bg-white/30'}`}
            >
              {cls}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {TABS.map((tab, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`px-5 py-2 rounded-xl font-bold transition-colors ${activeTab === i ? 'bg-white text-indigo-700' : 'bg-white/20 text-white hover:bg-white/30'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── WRITING SAMPLES TAB ── */}
        {activeTab === 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-xl">
            {/* Number filter */}
            <div className="flex gap-2 mb-5 flex-wrap">
              <button
                onClick={() => setFilterNumber(null)}
                className={`px-3 py-1 rounded-lg text-sm font-bold ${filterNumber === null ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                All numbers
              </button>
              {numbers.map(n => (
                <button
                  key={n}
                  onClick={() => setFilterNumber(n === filterNumber ? null : n)}
                  className={`px-3 py-1 rounded-lg text-sm font-bold ${filterNumber === n ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {n}
                </button>
              ))}
            </div>

            {isLoading && <div className="text-gray-400 text-center py-12">Loading...</div>}
            {!isLoading && filtered.length === 0 && (
              <div className="text-gray-400 text-center py-12">
                No writing samples yet for {selectedClass}.<br />
                Students need to play Number Recognition first.
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filtered.map(sample => (
                <motion.div
                  key={sample.id}
                  whileHover={{ scale: 1.02 }}
                  className="bg-gray-50 rounded-xl p-3 border border-gray-200 cursor-pointer"
                  onClick={() => setLightbox(sample)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-indigo-600">Student #{sample.student_number}</span>
                    <span className="text-xl font-bold text-gray-800">{sample.number}</span>
                  </div>
                  {sample.image_url && (
                    <img
                      src={sample.image_url}
                      alt={`Student ${sample.student_number} wrote ${sample.number}`}
                      className="w-full rounded-lg border border-gray-200"
                    />
                  )}
                  <div className="mt-1 text-xs text-gray-400">
                    {sample.stroke_count} stroke{sample.stroke_count !== 1 ? 's' : ''}
                    {' · '}
                    {new Date(sample.created_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* ── BY STUDENT TAB ── */}
        {activeTab === 1 && (
          <div className="bg-white rounded-2xl p-6 shadow-xl">
            <StudentAccuracyView
              attempts={attempts}
              samples={samples}
              onViewSample={setLightbox}
            />
          </div>
        )}

        {/* ── STRUGGLE GROUPS TAB ── */}
        {activeTab === 2 && (
          <div className="bg-white rounded-2xl p-6 shadow-xl">
            <StruggleGroups attempts={attempts} />
          </div>
        )}

        {/* ── BINGO TAB ── */}
        {activeTab === 3 && (
          <div className="bg-white rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex gap-2">
                {['👥 By Student', '🔴 Struggle Groups'].map((t, i) => (
                  <button
                    key={i}
                    onClick={() => setBingoSubTab(i)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${bingoSubTab === i ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >{t}</button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleResetBingo}
                  disabled={resetting || bingoResponses.length === 0}
                  className="px-3 py-1.5 rounded-lg text-sm font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-40 transition-colors"
                >
                  {resetting ? 'Resetting…' : '🗑 Reset Data'}
                </button>
                <a href="/MathGames?mode=teacher" className="text-indigo-600 text-sm font-bold hover:underline">Open Bingo →</a>
              </div>
            </div>
            {bingoSubTab === 0 && <BingoStudentView responses={bingoResponses} />}
            {bingoSubTab === 1 && <BingoStruggleGroups responses={bingoResponses} />}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setLightbox(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xl font-bold text-indigo-700">Student #{lightbox.student_number}</span>
                <span className="ml-3 text-3xl font-bold text-gray-800">{lightbox.number}</span>
              </div>
              <button onClick={() => setLightbox(null)} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
            </div>
            {lightbox.strokes_data ? (
              <StrokeReplay strokesData={lightbox.strokes_data} />
            ) : lightbox.image_url ? (
              <img src={lightbox.image_url} alt="Writing sample" className="w-full rounded-xl border border-gray-200" />
            ) : null}
            <div className="mt-3 text-sm text-gray-500">
              {lightbox.stroke_count} stroke{lightbox.stroke_count !== 1 ? 's' : ''}
              {' · '}
              {new Date(lightbox.created_date).toLocaleString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}