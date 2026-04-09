import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion } from 'framer-motion';

function randomSeed() { return Math.floor(Math.random() * 1000000); }
function randomCount() { return Math.floor(Math.random() * 10) + 11; }

export default function CountingCollectionTeacherDash({ className: cls, onBack }) {
  const { data: lessons = [], refetch } = useQuery({
    queryKey: ['counting-lesson', cls],
    queryFn: () => base44.entities.CountingCollectionLesson.filter({ class_name: cls }),
    refetchInterval: 3000,
  });

  const lesson = lessons[0] || null;

  const createLesson = async (sameNumber) => {
    const count = randomCount();
    const seed = randomSeed();
    if (lesson) {
      await base44.entities.CountingCollectionLesson.update(lesson.id, {
        seed, target_count: count, same_number: sameNumber,
        status: 'active', round_number: (lesson.round_number || 1) + 1,
      });
    } else {
      await base44.entities.CountingCollectionLesson.create({
        class_name: cls, seed, target_count: count,
        same_number: sameNumber, status: 'active', round_number: 1,
      });
    }
    refetch();
  };

  const toggleSameNumber = async () => {
    if (!lesson) return;
    await base44.entities.CountingCollectionLesson.update(lesson.id, { same_number: !lesson.same_number });
    refetch();
  };

  const endLesson = async () => {
    if (!lesson) return;
    await base44.entities.CountingCollectionLesson.update(lesson.id, { status: 'waiting' });
    refetch();
  };

  return (
    <div className="max-w-md mx-auto flex flex-col gap-5">
      <button onClick={onBack} className="text-white/70 hover:text-white self-start text-sm">← Back</button>
      <h2 className="text-2xl font-bold text-white text-center">🔢 Count the Collection</h2>
      <p className="text-white/70 text-center">Class: {cls}</p>

      <div className="bg-white rounded-2xl p-5 shadow-xl flex flex-col gap-4">
        {lesson && lesson.status === 'active' ? (
          <>
            <div className="text-center">
              <p className="text-sm text-gray-500 uppercase font-bold mb-1">Current Collection</p>
              <p className="text-4xl font-black text-indigo-700">{lesson.target_count} objects</p>
              <p className="text-sm text-gray-400 mt-1">Round {lesson.round_number}</p>
            </div>

            <div className="flex items-center justify-between bg-indigo-50 rounded-xl p-3">
              <div>
                <p className="font-bold text-indigo-800 text-sm">Mode</p>
                <p className="text-gray-500 text-xs">{lesson.same_number ? 'Same number — share strategies' : 'Different numbers — apply strategies'}</p>
              </div>
              <button onClick={toggleSameNumber}
                className={`px-3 py-1 rounded-lg text-sm font-bold transition-all ${lesson.same_number ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                {lesson.same_number ? 'Same' : 'Different'}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => createLesson(lesson.same_number)}
                className="bg-indigo-600 text-white font-bold py-3 rounded-xl shadow text-base">
                🔄 New Collection (keep mode)
              </motion.button>
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => createLesson(!lesson.same_number)}
                className="bg-amber-500 text-white font-bold py-3 rounded-xl shadow text-base">
                🔀 New Collection ({lesson.same_number ? 'switch to Different' : 'switch to Same'})
              </motion.button>
              <button onClick={endLesson} className="text-red-400 hover:text-red-600 text-sm text-center mt-1">
                ■ End Lesson
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-center text-gray-500 text-sm">No active lesson. Start one:</p>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => createLesson(true)}
              className="bg-indigo-600 text-white font-bold py-4 rounded-xl shadow text-base flex flex-col items-center gap-1">
              🎯 Same Number for Everyone
              <span className="text-xs font-normal text-indigo-200">Share and compare strategies</span>
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => createLesson(false)}
              className="bg-amber-500 text-white font-bold py-4 rounded-xl shadow text-base flex flex-col items-center gap-1">
              🎲 Different Numbers
              <span className="text-xs font-normal text-amber-100">Apply strategies to new set</span>
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
}