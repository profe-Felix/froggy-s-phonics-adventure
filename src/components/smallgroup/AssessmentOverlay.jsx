import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Clock, CheckCircle2 } from 'lucide-react';

// Full-screen overlay that takes over the student's iPad when the teacher
// is assessing them in a Small Group Assessment session. Returns null when
// no assessment is active for this student, so the normal app shows through.
//
// Mounted inside LetterGame so it overlays whatever the student was doing
// (Level Path, games, lessons) the moment the teacher broadcasts to them.
// When the broadcast clears or the session ends, the overlay disappears
// and the student returns to where they were.
export default function AssessmentOverlay({ className, studentNumber }) {
  const [sessions, setSessions] = useState([]);
  const [mySession, setMySession] = useState(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    if (!className || !studentNumber) return;
    aliveRef.current = true;

    const check = async () => {
      if (!aliveRef.current) return;
      try {
        const active = await base44.entities.SmallGroupAssessment.filter({
          teacher_name: className,
          status: 'active',
        });
        if (!aliveRef.current) return;
        setSessions(active || []);
      } catch {
        // ignore — will retry on next poll
      }
    };

    check();
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') check();
    }, 3000);

    // Realtime: re-check when any assessment session changes
    const unsub = base44.entities.SmallGroupAssessment.subscribe(() => {
      check();
    });

    return () => {
      aliveRef.current = false;
      clearInterval(pollInterval);
      unsub?.();
    };
  }, [className, studentNumber]);

  // Find the session whose broadcast matches this student.
  useEffect(() => {
    const match = sessions.find((s) => {
      const b = s.broadcast_state || {};
      return (
        b.show_item &&
        b.student_number === studentNumber &&
        (b.class_name || '').toLowerCase() === (className || '').toLowerCase()
      );
    });
    setMySession(match || null);
  }, [sessions, studentNumber, className]);

  // No active broadcast for this student — render nothing.
  if (!mySession) return null;

  const broadcast = mySession.broadcast_state || {};
  const type = broadcast.assessment_type || '';
  const isLetterType = type === 'upper_names' || type === 'lower_names';
  const isSoundType = type === 'upper_sounds' || type === 'lower_sounds';
  const isDecoding = type === 'decoding';

  const prompt = isSoundType
    ? '¿Qué sonido hace?'
    : isLetterType
      ? '¿Cómo se llama esta letra?'
      : isDecoding
        ? 'Lee esto:'
        : 'Lee la palabra:';

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col items-center justify-center">
      <p className="text-white/60 text-xl mb-6">
        {prompt}
      </p>
      <div
        className="text-[200px] font-bold text-white leading-none"
        style={{
          fontFamily: isLetterType ? "'Teachers', sans-serif" : "'Andika', sans-serif",
        }}
      >
        {broadcast.current_item}
      </div>
      <p className="text-white/30 mt-8 text-sm">
        {broadcast.item_index + 1} of {broadcast.total_items}
      </p>
    </div>
  );
}