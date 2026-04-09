import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import CollectionCanvas from './CollectionCanvas';
import CountingVerify from './CountingVerify';

function randomSeed(base, studentNum) {
  // Different seed per student if not same_number
  return (base * 31 + studentNum * 1337) & 0xfffffff;
}

export default function CountingCollectionStudentLesson({ studentNumber, className: cls, onBack }) {
  const [phase, setPhase] = useState('wait'); // 'wait' | 'count' | 'verify' | 'done'
  const [lastRound, setLastRound] = useState(null);

  const { data: lessons = [] } = useQuery({
    queryKey: ['counting-lesson', cls],
    queryFn: () => base44.entities.CountingCollectionLesson.filter({ class_name: cls }),
    refetchInterval: 2000,
    onSuccess: (data) => {
      const lesson = data[0];
      if (!lesson) return;
      if (lesson.status === 'active' && lesson.round_number !== lastRound) {
        setLastRound(lesson.round_number);
        setPhase('count');
      }
      if (lesson.status === 'waiting') setPhase('wait');
    }
  });

  const lesson = lessons[0] || null;
  const mySeed = lesson ? (lesson.same_number ? lesson.seed : randomSeed(lesson.seed, studentNumber)) : 0;
  const myCount = lesson ? lesson.target_count : 0;

  if (!lesson || phase === 'wait') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-teal-400 to-indigo-500 flex flex-col items-center justify-center gap-4 p-6">
        <button onClick={onBack} className="text-white/70 hover:text-white self-start text-sm">← Back</button>
        <div className="text-5xl animate-pulse">🔢</div>
        <p className="text-2xl font-bold text-white">Waiting for teacher…</p>
        <p className="text-white/60 text-sm">Your teacher will start the collection soon</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-200 to-teal-300 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onBack} className="text-teal-900/70 hover:text-teal-900 font-medium">← Back</button>
        <h1 className="text-lg font-black text-teal-900">🔢 Count the Collection</h1>
        <span className="text-teal-700 text-sm">Round {lesson.round_number}</span>
      </div>
      <div className="flex-1 flex flex-col px-3 pb-4 gap-3">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {phase === 'count' ? (
            <CollectionCanvas seed={mySeed} count={myCount} onDone={() => setPhase('verify')} />
          ) : phase === 'verify' ? (
            <div className="p-6">
              <CountingVerify targetCount={myCount} onVerified={() => setPhase('done')} />
            </div>
          ) : (
            <div className="p-6 flex flex-col items-center gap-3">
              <div className="text-5xl">⭐</div>
              <p className="text-2xl font-black text-green-700">Great job!</p>
              <p className="text-gray-500 text-sm">Waiting for the next collection…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}