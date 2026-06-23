import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const DAILY_GOAL = 20;

export default function RecordingsProgressBar({ studentNumber, className, refreshKey = 0 }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      if (!studentNumber || !className) return;
      const today = new Date().toISOString().slice(0, 10);
      try {
        const sessions = await base44.entities.SpanishReadingSession.filter({
          student_number: studentNumber,
          class_name: className,
          attempt_date: today,
        });
        setCount(sessions.length);
      } catch {
        setCount(0);
      }
    };
    fetchCount();
  }, [studentNumber, className, refreshKey]);

  const pct = Math.min(100, (count / DAILY_GOAL) * 100);
  const done = count >= DAILY_GOAL;

  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-2 rounded-full bg-white/15 overflow-hidden min-w-[40px]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: done ? '#fbbf24' : '#34d399' }}
        />
      </div>
      <span className={`text-[10px] sm:text-xs font-black whitespace-nowrap ${done ? 'text-amber-300' : 'text-white/70'}`}>
        {count}/{DAILY_GOAL}
      </span>
    </div>
  );
}