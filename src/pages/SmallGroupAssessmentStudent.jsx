import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useAssessmentSessions } from '@/hooks/useAssessmentSessions';
import { assessmentItemStyle } from '@/lib/classroomSync';
import { Loader2, CheckCircle2, Clock } from 'lucide-react';

// Student view for the quick assessment. Students access this page via their
// normal class+number URL params (e.g. ?class=Felix&number=2). The page
// auto-discovers the active assessment session for their teacher and shows
// the current item when it's their turn. While waiting, the screen is locked
// to this page (no navigation away) so the teacher knows the student is ready.
export default function SmallGroupAssessmentStudent() {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionIdParam = urlParams.get('sessionId');
  // Standard student identity params (same as the rest of the app)
  const classFromUrl = urlParams.get('class') || urlParams.get('className');
  const numberFromUrl = urlParams.get('number') || urlParams.get('studentNumber');

  const studentNumber = numberFromUrl ? parseInt(numberFromUrl) : null;
  const className = classFromUrl || '';

  const validIdentity =
    !!className &&
    Number.isInteger(studentNumber) &&
    studentNumber > 0;

  const error = validIdentity
    ? ''
    : 'Missing class or number. Ask your teacher for the assessment link.';

  const { sessions, loading, syncMessage } = useAssessmentSessions({
    enabled: validIdentity,
    sessionId: sessionIdParam,
    className,
    studentNumber,
  });

  // Find the session whose broadcast matches this student.
  const mySession = useMemo(() => {
    return sessions.find((s) => {
      const b = s.broadcast_state || {};

      return (
        s.status === 'active' &&
        b.show_item &&
        Number(b.student_number) === Number(studentNumber) &&
        (b.class_name || '').toLowerCase() === className.toLowerCase()
      );
    });
  }, [sessions, studentNumber, className]);

  // Check if any session is completed (teacher ended it).
  const allCompleted = sessions.length > 0 && sessions.every((s) => s.status === 'completed');

  // ── Error / missing identity ──────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-center px-8">{error}</p>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // ── No active session ─────────────────────────────────────────────────
  if (sessions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Clock className="w-16 h-16 mx-auto text-slate-500 mb-4" />
          <p className="text-white text-xl font-bold">Waiting for your teacher</p>
          <p className="text-slate-400 mt-2">Your teacher hasn't started yet.</p>
        </div>
      </div>
    );
  }

  // ── Session ended ─────────────────────────────────────────────────────
  if (allCompleted) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto text-green-400 mb-4" />
          <p className="text-white text-xl font-bold">All done! 🎉</p>
          <p className="text-slate-400 mt-2">Your teacher has finished the assessment.</p>
        </div>
      </div>
    );
  }

  // ── My turn — show the item ───────────────────────────────────────────
  if (mySession) {
    const broadcast = mySession.broadcast_state || {};
    const at = broadcast.assessment_type || '';
    const isLetter = ['upper_names', 'lower_names', 'upper_sounds', 'lower_sounds'].includes(at);
    const isSound = at === 'upper_sounds' || at === 'lower_sounds';
    const isDecoding = at === 'decoding';
    const prompt = isDecoding ? 'Lee esto:'
      : at === 'sight_words' ? 'Lee la palabra:'
      : isSound ? '¿Qué sonido hace?'
      : '¿Cómo se llama esta letra?';
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center">
        <p className="text-white/60 text-xl mb-6">
          {prompt}
        </p>
        {isDecoding && broadcast.decoding_level && (
          <p className="text-indigo-400/60 text-sm font-medium mb-2 uppercase tracking-wider">
            {broadcast.decoding_level}
          </p>
        )}
        <div
          key={broadcast.item_index}
          className="text-[200px] font-bold text-white leading-none assessment-fade-in"
          style={{ fontFamily: isLetter ? "'Teachers', sans-serif" : "'Andika', sans-serif" }}
        >
          {broadcast.current_item}
        </div>
        <p className="text-white/30 mt-8 text-sm">
          {broadcast.item_index + 1} of {broadcast.total_items}
        </p>

        <p className="text-white/30 mt-3 text-xs">
          {syncMessage}
        </p>
      </div>
    );
  }

  // ── Waiting for my turn ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <Clock className="w-16 h-16 mx-auto text-slate-500 mb-4 animate-pulse" />
        <p className="text-white text-xl font-bold">Waiting for your turn</p>
        <p className="text-slate-400 mt-2">Stay here — your teacher will call you soon.</p>
      </div>
    </div>
  );
}