import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
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

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Load active session(s) for this teacher. If sessionId is provided
  // explicitly, use just that one. Otherwise, discover all active sessions
  // for the student's teacher (class_name = teacher_name).
  useEffect(() => {
    if (!className || !studentNumber) {
      setLoading(false);
      setError('Missing class or number. Ask your teacher for the assessment link.');
      return;
    }

    let alive = true;
    const loadSessions = async () => {
      try {
        let activeSessions;
        if (sessionIdParam) {
          const s = await base44.entities.SmallGroupAssessment.get(sessionIdParam);
          activeSessions = s && s.status === 'active' ? [s] : [];
        } else {
          // Find all active sessions for this teacher (class_name = teacher_name)
          activeSessions = await base44.entities.SmallGroupAssessment.filter({
            teacher_name: className,
            status: 'active',
          });
        }
        if (alive) {
          setSessions(activeSessions || []);
          setLoading(false);
        }
      } catch {
        if (alive) {
          setError('Could not load the assessment session.');
          setLoading(false);
        }
      }
    };

    loadSessions();

    // Poll for active sessions every 5 seconds (in case the teacher starts
    // a new session after the student opens this page).
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') loadSessions();
    }, 5000);

    return () => {
      alive = false;
      clearInterval(pollInterval);
    };
  }, [className, studentNumber, sessionIdParam]);

  // Subscribe to all active sessions for realtime updates.
  useEffect(() => {
    if (sessions.length === 0) return;

    let alive = true;
    const unsubscribers = [];
    // Monotonic counter — stale GET responses (from rapid teacher marking)
    // are ignored so the student never sees an older state overwrite a newer
    // one.
    let latestRequestId = 0;

    const applyFresh = (fresh) => {
      if (!alive || !fresh || !fresh.id) return;
      setSessions((prev) =>
        prev.map((s) => (s.id === fresh.id ? fresh : s))
      );
    };

    for (const sess of sessions) {
      const unsub = base44.entities.SmallGroupAssessment.subscribe((event) => {
        if (!alive) return;
        const eventId = event.id || event.data?.id;
        if (eventId !== sess.id) return;
        // Use the event data directly if it has broadcast_state (no GET
        // latency). Fall back to a GET otherwise.
        if (event.data && event.data.broadcast_state !== undefined) {
          applyFresh(event.data);
        }
        // Also fire a GET to be safe, but ignore stale responses.
        const reqId = ++latestRequestId;
        base44.entities.SmallGroupAssessment.get(sess.id).then((fresh) => {
          if (reqId < latestRequestId) return; // stale
          applyFresh(fresh);
        }).catch(() => {});
      });
      unsubscribers.push(unsub);
    }

    // Also poll for session updates every 800ms as a safety net — fast enough
    // to keep up with rapid teacher marking without overwhelming the server.
    const pollInterval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      for (const sess of sessions) {
        const reqId = ++latestRequestId;
        base44.entities.SmallGroupAssessment.get(sess.id).then((fresh) => {
          if (reqId < latestRequestId) return; // stale
          applyFresh(fresh);
        }).catch(() => {});
      }
    }, 800);

    return () => {
      alive = false;
      unsubscribers.forEach((u) => u?.());
      clearInterval(pollInterval);
    };
  }, [sessions.map((s) => s.id).join(',')]);

  // Find the session whose broadcast matches this student.
  const mySession = useMemo(() => {
    return sessions.find((s) => {
      const b = s.broadcast_state || {};
      return (
        b.show_item &&
        b.student_number === studentNumber &&
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
    const isLetterSounds = broadcast.assessment_type === 'letter_sounds';
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center">
        <p className="text-white/60 text-xl mb-6">
          {isLetterSounds ? '¿Qué sonido hace?' : 'Lee la palabra:'}
        </p>
        <div
          key={broadcast.item_index}
          className="text-[200px] font-bold text-white leading-none assessment-fade-in"
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