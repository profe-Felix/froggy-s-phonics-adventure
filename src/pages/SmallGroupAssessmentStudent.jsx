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

  const [syncMessage, setSyncMessage] = useState(
    'Checking for updates…'
  );

  useEffect(() => {
    if (!className || !studentNumber) {
      setLoading(false);
      setError(
        'Missing class or number. Ask your teacher for the assessment link.'
      );
      return;
    }

    let alive = true;
    let discovering = false;

    // These maps belong to this subscription lifecycle.
    const records = new Map();
    const eventVersions = new Map();
    const fetching = new Set();
    const lastDisplayEvents = new Map();

    const publish = () => {
      if (alive) {
        setSessions(Array.from(records.values()));
      }
    };

    const mergeRecord = (incoming) => {
      if (!incoming?.id) return;

      if (
        sessionIdParam &&
        incoming.id !== sessionIdParam
      ) {
        return;
      }

      const previous = records.get(incoming.id);

      // Store only the fields needed by the student display.
      // Do not keep downloading/replacing the growing results object.
      const next = {
        id: incoming.id,
        status:
          previous?.status === 'completed'
            ? 'completed'
            : incoming.status ??
              previous?.status ??
              'active',
        broadcast_state:
          previous?.broadcast_state || {},
      };

      if (incoming.broadcast_state !== undefined) {
        const previousSequence =
          Number(previous?.broadcast_state?.sync_seq) || 0;

        const incomingSequence =
          Number(incoming.broadcast_state?.sync_seq) || 0;

        // Older display updates cannot replace newer ones.
        if (
          !previous ||
          incomingSequence >= previousSequence
        ) {
          next.broadcast_state =
            incoming.broadcast_state || {};
        }
      }

      records.set(incoming.id, next);
      publish();
    };

    const refreshOne = async (id) => {
      if (!alive || fetching.has(id)) return;

      fetching.add(id);

      // Guard this specific session, not all sessions together.
      const version = eventVersions.get(id) || 0;

      try {
        const fresh =
          await base44.entities.SmallGroupAssessment.get(id);

        if (!alive) return;

        // A realtime event received during this GET is newer.
        // Do not let the old GET response overwrite it.
        if (
          (eventVersions.get(id) || 0) === version
        ) {
          mergeRecord(fresh);
        }

        setError('');
        setLoading(false);
      } catch (error) {
        if (!alive) return;

        console.error(
          'Assessment recovery fetch failed',
          error
        );

        setSyncMessage(
          'Sync check failed — retrying…'
        );

        setLoading(false);
      } finally {
        fetching.delete(id);
      }
    };

    const discover = async () => {
      if (!alive || discovering) return;

      if (sessionIdParam) {
        await refreshOne(sessionIdParam);
        return;
      }

      discovering = true;

      const versionsAtStart =
        new Map(eventVersions);

      try {
        // Keep support for students assessed by a different teacher
        // from their homeroom teacher.
        const active =
          await base44.entities.SmallGroupAssessment.filter({
            status: 'active',
          });

        if (!alive) return;

        for (const fresh of active || []) {
          const currentVersion =
            eventVersions.get(fresh.id) || 0;

          const startingVersion =
            versionsAtStart.get(fresh.id) || 0;

          if (currentVersion === startingVersion) {
            mergeRecord(fresh);
          }
        }

        setError('');
        setLoading(false);
      } catch (error) {
        if (!alive) return;

        console.error(
          'Assessment discovery failed',
          error
        );

        setSyncMessage(
          'Sync check failed — retrying…'
        );

        setLoading(false);
      } finally {
        discovering = false;
      }
    };

    // One entity subscription, rather than one subscription
    // for every active assessment.
    const unsubscribe =
      base44.entities.SmallGroupAssessment.subscribe((event) => {
        if (!alive) return;

        const id =
          event.id ||
          event.data?.id;

        if (
          !id ||
          (
            sessionIdParam &&
            id !== sessionIdParam
          )
        ) {
          return;
        }

        eventVersions.set(
          id,
          (eventVersions.get(id) || 0) + 1
        );

        if (event.type === 'delete') {
          records.delete(id);
          publish();
          return;
        }

        const data = event.data || {};

        if (
          data.broadcast_state !== undefined ||
          data.status !== undefined
        ) {
          // Base44 may put the ID only at event.id.
          // Include it explicitly when applying the payload.
          mergeRecord({
            ...data,
            id,
          });

          setLoading(false);
        }

        if (data.broadcast_state !== undefined) {
          lastDisplayEvents.set(id, Date.now());

          setSyncMessage(
            'Last update: realtime'
          );

          // The display state is already here.
          // Do NOT fetch the whole assessment again.
          return;
        }

        // Saving scores does not require a display fetch.
        if (data.results !== undefined) return;

        // Fetch only when the event lacks usable display data.
        void refreshOne(id);
      });

    // Subscribe before loading to avoid a startup update gap.
    void discover();

    // Keep existing discovery timing during initial testing.
    const discoveryTimer = setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        !sessionIdParam
      ) {
        void discover();
      }
    }, 5000);

    // Recovery remains available if realtime misses an update.
    // Avoid a GET immediately after a display event arrived.
    const recoveryTimer = setInterval(() => {
      if (
        document.visibilityState !== 'visible'
      ) {
        return;
      }

      if (
        sessionIdParam &&
        !records.has(sessionIdParam)
      ) {
        void refreshOne(sessionIdParam);
      }

      for (const record of records.values()) {
        if (record.status !== 'active') continue;

        const lastDisplayEvent =
          lastDisplayEvents.get(record.id) || 0;

        if (
          Date.now() - lastDisplayEvent < 1500
        ) {
          continue;
        }

        void refreshOne(record.id);
      }
    }, 1500);

    const recoverWhenVisible = () => {
      if (
        document.visibilityState !== 'visible'
      ) {
        return;
      }

      void discover();

      for (const record of records.values()) {
        if (record.status === 'active') {
          void refreshOne(record.id);
        }
      }
    };

    document.addEventListener(
      'visibilitychange',
      recoverWhenVisible
    );

    window.addEventListener(
      'online',
      recoverWhenVisible
    );

    return () => {
      alive = false;

      unsubscribe?.();

      clearInterval(discoveryTimer);
      clearInterval(recoveryTimer);

      document.removeEventListener(
        'visibilitychange',
        recoverWhenVisible
      );

      window.removeEventListener(
        'online',
        recoverWhenVisible
      );
    };
  }, [className, studentNumber, sessionIdParam]);

  // Find the session whose broadcast matches this student.
  const mySession = useMemo(() => {
    return sessions.find((s) => {
      const b = s.broadcast_state || {};
      return (
        s.status === 'active' &&
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