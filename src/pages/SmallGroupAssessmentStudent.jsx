import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, Clock } from 'lucide-react';

// Student view for the quick assessment. Subscribes to the SmallGroupAssessment
// session and shows the current item (letter/word) when it's this student's
// turn. Shows "waiting" when it's not their turn.
export default function SmallGroupAssessmentStudent() {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('sessionId');
  const studentNumberParam = urlParams.get('studentNumber');
  const classNameParam = urlParams.get('className');

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState(null);

  // Try to auto-detect student identity from auth
  useEffect(() => {
    if (studentNumberParam && classNameParam) {
      // Manual override for testing
      setStudent({
        student_number: parseInt(studentNumberParam),
        class_name: classNameParam,
      });
      return;
    }
    // Try auth
    base44.auth.me().then((u) => {
      if (u?.student_number && u?.class_name) {
        setStudent({ student_number: u.student_number, class_name: u.class_name });
      }
    }).catch(() => {});
  }, [studentNumberParam, classNameParam]);

  // Subscribe to session
  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    let alive = true;
    base44.entities.SmallGroupAssessment.get(sessionId)
      .then((s) => { if (alive) { setSession(s); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    const unsub = base44.entities.SmallGroupAssessment.subscribe((event) => {
      if (event.data?.id === sessionId && alive) {
        setSession(event.data);
      }
    });
    return () => { alive = false; unsub?.(); };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!sessionId || !session) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">No active assessment session.</p>
      </div>
    );
  }

  if (session.status === 'completed') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto text-green-400 mb-4" />
          <p className="text-white text-xl font-bold">Session ended</p>
          <p className="text-slate-400 mt-2">Your teacher has finished this assessment.</p>
        </div>
      </div>
    );
  }

  const broadcast = session.broadcast_state || {};
  const isMyTurn = student &&
    broadcast.student_number === student.student_number &&
    (broadcast.class_name || '').toLowerCase() === (student.class_name || '').toLowerCase();

  if (!isMyTurn || !broadcast.show_item) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Clock className="w-16 h-16 mx-auto text-slate-500 mb-4" />
          <p className="text-white text-xl font-bold">Waiting for your turn</p>
          <p className="text-slate-400 mt-2">Practice your activity while you wait.</p>
        </div>
      </div>
    );
  }

  // Show the current item
  const isLetterSounds = broadcast.assessment_type === 'letter_sounds';
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center">
      <p className="text-white/60 text-xl mb-6">
        {isLetterSounds ? '¿Qué sonido hace?' : 'Lee la palabra:'}
      </p>
      <div
        className="text-[200px] font-bold text-white leading-none"
        style={{ fontFamily: isLetterSounds ? "'Teachers', sans-serif" : "'Andika', sans-serif" }}
      >
        {broadcast.current_item}
      </div>
      <p className="text-white/30 mt-8 text-sm">
        {broadcast.item_index + 1} of {broadcast.total_items}
      </p>
    </div>
  );
}