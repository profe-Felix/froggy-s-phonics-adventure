import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// Live student-work channel for the "try" phase of a Live Lesson.
//
// Teacher side (useLiveWorkDashboard): subscribes to LiveStudentWork records for
// the session and returns a live array — one per student who has reported.
//
// Student side (useLiveStudentReporter): while `active` is true (the teacher
// released students to try), reports a heartbeat + a compact, mode-aware
// progress snapshot every few seconds, so the teacher dashboard reflects who is
// working and how they're doing. Marks itself idle when the try phase ends or the
// student leaves.

const HEARTBEAT_MS = 5000;

// Build a small, render-ready snapshot from the student's mode_progress.
function buildProgressSnapshot(mode, studentData) {
  const mp = studentData?.mode_progress?.[mode];
  if (mp) {
    const mastered = mp.mastered_items?.length || 0;
    const attempts = mp.total_attempts || 0;
    const correct = mp.total_correct || 0;
    return {
      mastered,
      attempts,
      correct,
      label: `Mastered ${mastered} · ${attempts} tries`,
    };
  }
  return { label: mode === 'video' ? 'Watching' : 'Working…' };
}

// ---- Teacher: live dashboard data for a session ----
export function useLiveWorkDashboard(sessionId) {
  const [works, setWorks] = useState([]);

  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    base44.entities.LiveStudentWork
      .filter({ session_id: sessionId })
      .then((list) => { if (alive) setWorks(list || []); })
      .catch(() => {});
    const unsub = base44.entities.LiveStudentWork.subscribe((event) => {
      const w = event.data;
      if (!w || w.session_id !== sessionId) return;
      setWorks((prev) => {
        if (event.type === 'delete') return prev.filter((x) => x.id !== w.id);
        const idx = prev.findIndex((x) => x.id === w.id);
        if (idx === -1) return [...prev, w];
        const next = [...prev];
        next[idx] = w;
        return next;
      });
    });
    return () => { alive = false; unsub?.(); };
  }, [sessionId]);

  return works;
}

// ---- Student: report work to the dashboard ----
export function useLiveStudentReporter(sessionId, student, step, stepIndex, studentData, active) {
  const recordIdRef = useRef(null);
  const ctxRef = useRef({ step, stepIndex, studentData });
  ctxRef.current = { step, stepIndex, studentData };
  const studentKey = student ? `${student.class_name}:${student.number}` : null;

  const report = useCallback(
    async (status, extra) => {
      if (!sessionId || !studentKey) return;
      const { step: s, stepIndex: si, studentData: sd } = ctxRef.current;
      const snap = buildProgressSnapshot(s?.mode, sd);
      const payload = {
        step_index: si,
        mode: s?.mode || '',
        status,
        progress_data: snap,
        updated_at: new Date().toISOString(),
        ...(extra || {}),
      };
      try {
        if (recordIdRef.current) {
          await base44.entities.LiveStudentWork.update(recordIdRef.current, payload);
        } else {
          const existing = await base44.entities.LiveStudentWork.filter({
            session_id: sessionId,
            student_key: studentKey,
          });
          if (existing?.length) {
            recordIdRef.current = existing[0].id;
            await base44.entities.LiveStudentWork.update(existing[0].id, payload);
          } else {
            const created = await base44.entities.LiveStudentWork.create({
              session_id: sessionId,
              student_key: studentKey,
              class_name: student.class_name,
              student_number: student.number,
              ...payload,
            });
            recordIdRef.current = created.id;
          }
        }
      } catch { /* best-effort */ }
    },
    [sessionId, studentKey, student]
  );

  // Heartbeat while active in the try phase; mark idle when it ends.
  useEffect(() => {
    if (!active) {
      report('idle');
      return;
    }
    report('working');
    const iv = setInterval(() => report('working'), HEARTBEAT_MS);
    return () => clearInterval(iv);
  }, [active, report]);

  // Mark idle on unmount (student leaves the live session).
  useEffect(() => {
    return () => {
      report('idle');
    };
  }, [report]);

  return { report };
}