import React, { useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lock, Unlock, ChevronLeft, ChevronRight, X, Radio, Users, PenLine, Footprints, LayoutGrid, MonitorPlay } from 'lucide-react';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useLiveBroadcast } from '@/hooks/useLiveBroadcast';
import TeacherModelPanel from '@/components/live/TeacherModelPanel';
import TryDashboard from '@/components/live/TryDashboard';
import LiveNotebookAssessmentPanel from '@/components/live/LiveNotebookAssessmentPanel';
import ActiveSessionsPanel from '@/components/live/ActiveSessionsPanel';
import { useClassNames } from '@/hooks/useClassNames';
import { getHomeroomForClass, ROTATION_TEACHERS } from '@/lib/classRotation';
import { cn } from '@/lib/utils';
import { COLOR_GROUPS } from '@/lib/smallGroupColors';
import { syncExternalNotebookControls } from '@/lib/external-notebook/client';
import ExternalNotebookSlot from '@/components/external-notebook/ExternalNotebookSlot';
import { lessonStepPages, liveNotebookLink } from '@/lib/external-notebook/lesson-pages';
import { lessonNotebookTargets } from '@/lib/liveLessonLifecycle.mjs';

// Teacher lesson context for external notebook control sync.
// Built from the saved live session; only called for notebook steps.
function teacherLessonContext(session, step, stepIndex = session.current_step) {
  if (!session?.id) return null;

  const phase = session.phase || "watch";
  const releaseMode = session.release_mode || "stay";

  return {
    kind: "lesson", role: "teacher",
    sourceId: session.id,
    active: session.active === true,
    assignmentId: step?.config?.assignmentId,
    className: session.class_name,
    schoolYear: session.school_year,
    stepId: String(stepIndex ?? 0),
    targetStudents: session.target_students,
    phase,
    releaseMode,
    paused: releaseMode !== "lesson" && phase !== "try",
    // Same page semantics as the student lesson step (config.pageSelection).
    ...lessonStepPages(step?.config),
  };
}

const LIVE_WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const LIVE_DAY_OPTIONS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
];

const BLOCKS = ['A', 'B', 'C'];

export function getLiveLessonSteps(lesson, selectedDay = '') {
  if (!lesson) {
    return [];
  }

  if (Array.isArray(lesson.daily_lessons)) {
    const usableDailyLessons = lesson.daily_lessons.filter(
      (dailyLesson) =>
        dailyLesson.active !== false &&
        Array.isArray(dailyLesson.steps) &&
        dailyLesson.steps.length > 0
    );

    if (selectedDay) {
      const selectedDailyLesson = usableDailyLessons.find(
        (dailyLesson) => dailyLesson.day === selectedDay
      );

      if (selectedDailyLesson) {
        return selectedDailyLesson.steps;
      }
    }

    const today = LIVE_WEEKDAYS[new Date().getDay()];

    const todayLesson = usableDailyLessons.find(
      (dailyLesson) => dailyLesson.day === today
    );

    if (todayLesson) {
      return todayLesson.steps;
    }

    return usableDailyLessons[0]?.steps || [];
  }

  return lesson.steps || [];
}

function NotebookLinkButton({ url }) {
  const [state, setState] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setState('Copied'); }
    catch { setState('Copy failed'); }
    setTimeout(() => setState(''), 2000);
  };
  return (
    <button type="button" onClick={copy} title={url}
      className="absolute left-3 top-3 z-20 rounded-lg border border-slate-600 bg-slate-800/90 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700">
      {state || 'Copy notebook link'}
    </button>
  );
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(
    { length: 4 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

export default function LiveLesson() {
  const [session, setSession] = useState(null);
  // Always-current session snapshot so the heartbeat interval reads live
  // step/phase values instead of the stale ones captured at setup.
  const sessionRef = useRef(session);
  const controlsQueueRef = useRef(new Map());
  const visitedNotebooksRef = useRef(new Map());
  const endedSessionsRef = useRef(new Set());
  const [pendingNotebookEnd, setPendingNotebookEnd] = useState(null);
  const notebookCleanupRunning = useRef(false);
  const [controlError, setControlError] = useState("");
  const [controlsSaving, setControlsSaving] = useState(false);
  const { classList: CLASSES } = useClassNames();
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [selectedSGLessonId, setSelectedSGLessonId] = useState('');
  const [selectedLessonDay, setSelectedLessonDay] = useState('');
  const [className, setClassName] = useState('');
  const [targetMode, setTargetMode] = useState('class');
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [groupTeacher, setGroupTeacher] = useState('Felix');
  const [groupBlock, setGroupBlock] = useState('A');
  const [starting, setStarting] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  // Setup-screen tab: 'lesson' (pick a Lesson + class) or 'assessment'
  // (pick a DigitalNotebookAssignment + start page). The assessment tab
  // delegates to LiveNotebookAssessmentPanel and owns its own session.
  const [setupMode, setSetupMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('notebook_assessment') || params.has('notebook_setup') ? 'assessment' : 'lesson';
  });

  // Deep-link from the TeacherView launcher: ?session=<id> loads an existing
  // session straight into the control screen (pre-filling lesson/day/class)
  // instead of showing the setup form.
  const sessionParam = new URLSearchParams(window.location.search).get('session');

  const { data: lessons = [] } = useQuery({
    queryKey: ['lessons-all-live'],
    queryFn: () => base44.entities.Lesson.filter({ active: true }),
  });

  const { data: sgLessons = [] } = useQuery({
    queryKey: ['small-group-lessons-live', ACTIVE_SCHOOL_YEAR],
    queryFn: () => base44.entities.SmallGroupLesson.filter({ active: true, school_year: ACTIVE_SCHOOL_YEAR }),
    enabled: targetMode === 'group',
  });

  const selectedLesson = targetMode === 'group'
    ? sgLessons.find(l => l.id === selectedSGLessonId)
    : lessons.find(l => l.id === selectedLessonId);

  // When a small group plan is picked, auto-fill the color group. The homeroom
  // (className) is already derived from the teacher's groupTeacher+groupBlock
  // selection below, so we don't override it here.
  useEffect(() => {
    if (targetMode !== 'group' || !selectedSGLessonId) return;
    const sg = sgLessons.find(l => l.id === selectedSGLessonId);
    if (!sg) return;
    setSelectedGroups([sg.color_group]);
  }, [targetMode, selectedSGLessonId, sgLessons]);

  const selectableDailyLessons =
    Array.isArray(selectedLesson?.daily_lessons)
      ? LIVE_DAY_OPTIONS.map((dayOption) => {
          const dailyLesson = selectedLesson.daily_lessons.find(
            (item) => item.day === dayOption.value
          );

          return {
            ...dayOption,
            dailyLesson,
          };
        }).filter(
          ({ dailyLesson }) =>
            dailyLesson?.active !== false &&
            Array.isArray(dailyLesson?.steps) &&
            dailyLesson.steps.length > 0
        )
      : [];

  useEffect(() => {
    if (!selectableDailyLessons.length) {
      setSelectedLessonDay('');
      return;
    }

    const today = LIVE_WEEKDAYS[new Date().getDay()];

    setSelectedLessonDay((currentDay) => {
      const currentDayStillExists = selectableDailyLessons.some(
        ({ value }) => value === currentDay
      );

      if (currentDayStillExists) {
        return currentDay;
      }

      const todayExists = selectableDailyLessons.some(
        ({ value }) => value === today
      );

      return todayExists
        ? today
        : selectableDailyLessons[0].value;
    });
  }, [selectedLessonId, selectedSGLessonId]);

  // Auto-load a session deep-linked from the TeacherView launcher.
  useEffect(() => {
    if (!sessionParam || session) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await base44.entities.LiveLessonSession.get(sessionParam);
        if (cancelled || !s || !s.active || endedSessionsRef.current.has(s.id)) return;
        sessionRef.current = s;
        setSession(s);
        if (s.lesson_source === 'small_group') {
          setSelectedSGLessonId(s.lesson_id);
          setTargetMode('group');
        } else {
          setSelectedLessonId(s.lesson_id);
          setTargetMode('class');
        }
        setSelectedLessonDay(s.lesson_day || '');
        setClassName(s.class_name || '');
      } catch {
        /* ignore — fall back to the setup screen */
      }
    })();
    return () => { cancelled = true; };
  }, [sessionParam, session]);

  // Small-group assignments for the selected teacher+block (from Small Group
  // Manager). When "Small group" is selected, the teacher picks color groups
  // here instead of tapping individual student numbers.
  const { data: groupAssignments = [] } = useQuery({
    queryKey: ['small-group-assignments-live', groupTeacher, groupBlock],
    queryFn: () =>
      base44.entities.SmallGroupAssignment.filter({
        teacher_name: groupTeacher,
        block: groupBlock,
        school_year: ACTIVE_SCHOOL_YEAR,
      }),
    enabled: !!groupTeacher && !!groupBlock,
  });

  // Whole-class mode: default the teacher+block to the selected class's
  // homeroom so the relevant groups show without the teacher having to switch.
  useEffect(() => {
    if (targetMode === 'group') return;
    if (!className) return;
    setGroupTeacher(ROTATION_TEACHERS.includes(className) ? className : 'Felix');
    setGroupBlock('A');
    setSelectedGroups([]);
  }, [targetMode, className]);

  // Small-group mode: the teacher picks their name + block, and the homeroom
  // (className) is derived from the rotation. Felix Block B → Gutierrez
  // homeroom, Valero Block C → Gutierrez homeroom, etc. Each teacher gets
  // their own tailored SmallGroupLesson for the same homeroom.
  useEffect(() => {
    if (targetMode !== 'group') return;
    const homeroom = getHomeroomForClass(groupTeacher, groupBlock);
    if (homeroom && homeroom !== className) {
      setClassName(homeroom);
      setSelectedSGLessonId('');
    }
    setSelectedGroups([]);
  }, [targetMode, groupTeacher, groupBlock]);

  const groupStudentsByColor = useMemo(() => {
    const map = {};
    for (const cg of COLOR_GROUPS) map[cg.id] = [];
    for (const a of groupAssignments || []) {
      if (map[a.color_group]) map[a.color_group].push(a);
    }
    return map;
  }, [groupAssignments]);

  // Students in the selected color groups → the lesson's target_students.
  const pickedStudents = useMemo(() => {
    if (targetMode !== 'group') return [];
    const ids = new Set(selectedGroups);
    const out = [];
    const seen = new Set();
    for (const a of groupAssignments || []) {
      if (!ids.has(a.color_group)) continue;
      const key = `${a.class_name}:${a.student_number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ class_name: a.class_name, student_number: a.student_number });
    }
    out.sort((a, b) => a.student_number - b.student_number);
    return out;
  }, [targetMode, selectedGroups, groupAssignments]);

  // Real-time subscription to the active session.
  //
  // IMPORTANT: the teacher tab is authoritative for current_step and phase.
  // Student joins, heartbeats, and delayed realtime events are allowed to
  // refresh the rest of the session, but they must NEVER move the teacher
  // backward to an older activity.
  useEffect(() => {
    if (!session?.id) return;

    const unsub = base44.entities.LiveLessonSession.subscribe((event) => {
      const eventId =
        event.id ||
        event.data?.id;

      if (eventId !== session.id) return;

      const current = sessionRef.current;
      if (!current || current.id !== session.id) return;

      if (event.type === 'delete') {
        leaveEndedSession(current.id);
        return;
      }

      if (event.data?.active === false) {
        // Our own End action closes the screen only after synchronization.
        if (current.active === false) return;

        const ended = { ...current, active: false };
        sessionRef.current = ended;
        setSession(ended);
        void endSession();
        return;
      }

      // Partial or delayed events must not overwrite local teacher controls
      // or reopen a lesson while its End action is being confirmed.
      const merged = {
        ...current,
        ...event.data,
        id: current.id,
        current_step: current.current_step,
        phase: current.phase,
        release_mode: current.release_mode,
        active: current.active,
      };
      sessionRef.current = merged;
      setSession(merged);
    });

    return unsub;
  }, [session?.id]);

  const { send, clear: clearBroadcast } = useLiveBroadcast(session?.id);

  // Keep the ref in sync with the latest session state so the heartbeat
  // interval always reads the current step/phase.
  useEffect(() => { sessionRef.current = session; }, [session]);

  // ------------------------------------------------------------
  // LIVE LESSON HEARTBEAT
  //
  // While this page is still open, touch the session every
  // 15 seconds. This refreshes Base44's built-in updated_date.
  //
  // IMPORTANT:
  // Switching tabs or putting Chrome in the background does NOT
  // intentionally end the session.
  //
  // When the teacher returns to this tab, we immediately send
  // another heartbeat in case the browser throttled background
  // timers.
  //
  // Student devices will use a longer timeout (90 seconds), so
  // ordinary background-tab throttling will not end the lesson.
  // ------------------------------------------------------------
  useEffect(() => {
    if (!session?.id || !session?.active) return;

    let cancelled = false;

    const heartbeat = async () => {
      if (cancelled) return;

      try {
        const s = sessionRef.current;
        if (!s?.id || s.active !== true) return;
        await base44.entities.LiveLessonSession.update(
          s.id,
          {
            teacher_heartbeat_at: new Date().toISOString(),
          }
        );
      } catch {
        // Best effort only. A temporary network failure should
        // not interrupt the teacher's lesson.
      }
    };

    // Send one immediately.
    heartbeat();

    // Then every 15 seconds.
    const interval = setInterval(heartbeat, 15000);

    // If the browser throttled the background tab, immediately
    // refresh the heartbeat when the teacher returns.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        heartbeat();
      }
    };

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    );

    return () => {
      cancelled = true;
      clearInterval(interval);

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );
    };
  }, [session?.id, session?.active]);

  const startSession = async () => {
    const hasLesson = targetMode === 'group' ? !!selectedSGLessonId : !!selectedLessonId;
    if (!hasLesson || !selectedLesson || !className || starting) return;

    if (targetMode === 'group' && !pickedStudents.length) {
      window.alert('Select a group with at least one student before starting. An empty group must not start a whole-class lesson.');
      return;
    }

    setStarting(true);
    setControlError('');

    try {
      let code = null;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = genCode();
        const existing = await base44.entities.LiveLessonSession.filter({
          code: candidate,
          active: true,
        });
        if (!existing?.length) {
          code = candidate;
          break;
        }
      }

      if (!code) {
        window.alert('Could not get an unused lesson code. Please try starting again.');
        return;
      }

      const target = targetMode === 'group' ? pickedStudents : [];

      const stale = await base44.entities.LiveLessonSession.filter({
        active: true,
        class_name: className,
      });
      await Promise.all(
        (stale || []).map(s =>
          base44.entities.LiveLessonSession.update(s.id, { active: false })
        )
      );

      const created = await base44.entities.LiveLessonSession.create({
        code,
        lesson_id: targetMode === 'group' ? selectedSGLessonId : selectedLessonId,
        lesson_source: targetMode === 'group' ? 'small_group' : 'lesson',
        lesson_title: selectedLesson.title || '',
        lesson_day: selectedLessonDay || '',
        class_name: className,
        school_year: ACTIVE_SCHOOL_YEAR,
        target_students: target,
        current_step: 0,
        phase: 'watch',
        release_mode: 'stay',
        active: true,
        started_at: new Date().toISOString(),
        joined_students: [],
      });

      sessionRef.current = created;
      setSession(created);

      // Use the same confirmed synchronization and retry path as later controls.
      // If synchronization fails, that handler keeps its error visible here.
      await updateSession({ active: true });
    } catch {
      window.alert('Could not finish starting the live lesson. Check your connection and try again.');
    } finally {
      setStarting(false);
    }
  };

  const updateSession = async (patch) => {
    const current = sessionRef.current;
    if (!current?.id) return false;

    const id = current.id;
    let channel = controlsQueueRef.current.get(id);

    if (!channel) {
      channel = { pending: null, running: null, confirmed: current };
      controlsQueueRef.current.set(id, channel);
    }

    channel.pending = { ...channel.pending, ...patch };
    sessionRef.current = { ...current, ...patch };
    setSession(sessionRef.current);

    if (channel.running) return channel.running;

    setControlsSaving(true);
    setControlError('');

    channel.running = (async () => {
      while (channel.pending) {
        const next = channel.pending;
        channel.pending = null;

        try {
          await base44.entities.LiveLessonSession.update(id, next);
          channel.confirmed = { ...channel.confirmed, ...next };
        } catch {
          channel.pending = { ...next, ...channel.pending };
          setControlError('Teacher controls have NOT reached Base44. Students may still be on the previous activity. Use Retry controls.');
          return false;
        }

        if (channel.pending) continue;

        try {
          const confirmed = channel.confirmed;
          const steps = getLiveLessonSteps(
            selectedLesson,
            confirmed.lesson_day || selectedLessonDay
          );
          let visited = visitedNotebooksRef.current.get(id);
          if (!visited) visitedNotebooksRef.current.set(id, visited = new Set());
          const targets = lessonNotebookTargets(confirmed, steps, visited);
          for (const { index } of targets) visited.add(index);

          // The backend must read the saved lesson to authorize and apply
          // its current state. This context only selects the integration.
          // Disabled integrations skip without making a backend request.
          for (const { step: notebookStep, index } of targets) {
            await syncExternalNotebookControls(
              teacherLessonContext(confirmed, notebookStep, index)
            );
          }
        } catch {
          setControlError('Lesson controls saved to Base44, but the external notebook has NOT confirmed them. Use Retry controls.');
          return false;
        }

        // Process any controls queued while synchronization was in progress.
      }

      setControlError('');
      return true;
    })().finally(() => {
      channel.running = null;
      setControlsSaving(false);
    });

    return channel.running;
  };

  // End any active dictation for this class. Called when the teacher advances
  // past a dictation step or ends the lesson so the dictation doesn't linger
  // and students follow the lesson to the next activity.
  const endClassDictation = async () => {
    if (!session?.class_name) return;
    try {
      const active = await base44.entities.LiveDictationSession.filter({
        class_name: session.class_name,
        school_year: ACTIVE_SCHOOL_YEAR,
        active: true,
      });
      await Promise.all(
        (active || []).map(s =>
          base44.entities.LiveDictationSession
            .update(s.id, { active: false, broadcast_state: {} })
            .catch(() => {})
        )
      );
    } catch {}
  };

  const advance = (dir) => {
    const steps = getLiveLessonSteps(
      selectedLesson,
      session?.lesson_day || selectedLessonDay
    );

    if (!steps.length) return;

    const next = Math.max(
      0,
      Math.min(
        steps.length - 1,
        (session.current_step || 0) +
          dir
      )
    );

    if (steps[next]?.mode !== 'dictation') endClassDictation();

    clearBroadcast(false);

    updateSession({
      current_step: next,
      phase: 'watch',
      broadcast_state: {},
    });
  };

  const goToStep = (i) => {
    const allSteps = getLiveLessonSteps(
      selectedLesson,
      session?.lesson_day || selectedLessonDay
    );
    if (allSteps[i]?.mode !== 'dictation') endClassDictation();
    clearBroadcast(false);

    updateSession({
      current_step: i,
      phase: 'watch',
      broadcast_state: {},
    });
  };

  const setPhase = (nextPhase) => {
    // Releasing students does not reset the teacher's model. Keep its latest
    // snapshot available when students return to Watch on the same step.
    updateSession({
      phase: nextPhase === 'try' ? 'try' : 'watch',
    });
  };

  const setReleaseMode = (
    nextMode
  ) => {
    if (nextMode === 'lesson') {
      updateSession({
        release_mode: 'lesson',
      });

      return;
    }

    updateSession({
      release_mode: 'stay',
      phase: 'watch',
    });
  };

  function leaveEndedSession(id) {
    if (sessionRef.current?.id !== id) return;
    endedSessionsRef.current.add(id);
    controlsQueueRef.current.delete(id);
    visitedNotebooksRef.current.delete(id);
    sessionRef.current = null;
    const params = new URLSearchParams(window.location.search);
    params.delete('session');
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
    setSession(null);
    setControlError('');
    setSelectedLessonId('');
    setSelectedSGLessonId('');
    setSelectedGroups([]);
    setTargetMode('class');
    setShowQR(false);
    setShowDashboard(false);
  }

  const retryNotebookEnd = async () => {
    const pending = pendingNotebookEnd;
    if (!pending || notebookCleanupRunning.current) return;
    notebookCleanupRunning.current = true;
    try {
      for (const context of pending.contexts) await syncExternalNotebookControls(context);
      const completed = new Set(pending.contexts.map(context => `${context.sourceId}:${context.assignmentId}`));
      setPendingNotebookEnd(value => {
        const contexts = (value?.contexts || []).filter(context => !completed.has(`${context.sourceId}:${context.assignmentId}`));
        return contexts.length ? { contexts } : null;
      });
    } catch {
      // The Base44 lesson is already ended. Retain this explicit retry without
      // trapping the teacher in the old activity or reactivating students.
      setPendingNotebookEnd(value => value === pending ? { ...value } : value);
    } finally {
      notebookCleanupRunning.current = false;
    }
  };

  const endSession = async () => {
    const current = sessionRef.current;
    if (!current?.id) return;
    clearBroadcast(false);
    const steps = getLiveLessonSteps(selectedLesson, current.lesson_day || selectedLessonDay);
    const contexts = lessonNotebookTargets(current, steps, visitedNotebooksRef.current.get(current.id))
      .map(({ step, index }) => teacherLessonContext({ ...current, active: false }, step, index));

    // Keep the existing parallel dictation shutdown.
    const [saved] = await Promise.all([
      updateSession({ active: false, broadcast_state: {} }),
      endClassDictation(),
    ]);

    // A failed Base44 save must stay visible. Once inactive is acknowledged,
    // notebook cleanup can be retried from setup without trapping the class.
    const confirmed = controlsQueueRef.current.get(current.id)?.confirmed;
    if (saved !== true && confirmed?.active !== false) return;
    if (sessionRef.current?.id !== current.id) return;
    if (saved !== true && contexts.length) setPendingNotebookEnd(previous => ({
      contexts: [...(previous?.contexts || []), ...contexts],
    }));
    leaveEndedSession(current.id);
  };

  useEffect(() => {
    if (!pendingNotebookEnd) return;
    const timer = setTimeout(() => { void retryNotebookEnd(); }, 10000);
    return () => clearTimeout(timer);
  }, [pendingNotebookEnd]);

  // ---------- SETUP SCREEN ----------
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-50 p-6">
        <div className="max-w-2xl mx-auto">
          {pendingNotebookEnd && (
            <div role="status" className="mb-4 rounded-lg bg-amber-100 p-3 text-sm">
              The lesson has ended. Notebook connection cleanup is still pending; student work was not cleared.
              <button type="button" className="ml-2 underline font-bold" onClick={retryNotebookEnd}>
                Retry notebook cleanup
              </button>
            </div>
          )}

          <div className="flex items-center gap-3 mb-6">
            <Link
              to="/TeacherView"
              className="text-rose-600 hover:underline font-bold text-sm"
            >
              <ArrowLeft className="w-4 h-4 inline mr-1" />
              Teacher View
            </Link>

            <h1 className="text-3xl font-black text-gray-800 flex items-center gap-2">
              <Radio className="w-7 h-7 text-rose-500" />
              Live Lesson
            </h1>

            <Link
              to="/LiveTracing"
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100"
            >
              <PenLine className="w-4 h-4" />
              Standalone Tracing
            </Link>
          </div>

          {/* Setup tab toggle: Lesson vs Notebook Assessment */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setSetupMode('lesson')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition ${
                setupMode === 'lesson'
                  ? 'bg-rose-500 text-white border-rose-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300'
              }`}
            >
              📖 Lesson
            </button>
            <button
              onClick={() => setSetupMode('assessment')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition ${
                setupMode === 'assessment'
                  ? 'bg-rose-500 text-white border-rose-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300'
              }`}
            >
              📓 Notebook Assessment
            </button>
            <button
              onClick={() => setSetupMode('sessions')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition ${
                setupMode === 'sessions'
                  ? 'bg-rose-500 text-white border-rose-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300'
              }`}
            >
              ⚡ Active Sessions
            </button>
          </div>

          {setupMode === 'sessions' ? (
            <ActiveSessionsPanel />
          ) : setupMode === 'assessment' ? (
            <LiveNotebookAssessmentPanel />
          ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-rose-100 p-6 space-y-5">

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                1. {targetMode === 'group' ? 'Pick a small group plan' : 'Pick a lesson'}
              </label>

              {targetMode === 'group' ? (
                <select
                  value={selectedSGLessonId}
                  onChange={(e) => {
                    setSelectedSGLessonId(e.target.value);
                    setSelectedLessonDay('');
                  }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium"
                >
                  <option value="">
                    Select a small group plan…
                  </option>
                  {sgLessons.filter(sg => sg.class_name === className).map((sg) => (
                    <option key={sg.id} value={sg.id}>
                      {sg.class_name} · {sg.title}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={selectedLessonId}
                  onChange={(e) => {
                    setSelectedLessonId(e.target.value);
                    setSelectedLessonDay('');
                  }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium"
                >
                  <option value="">
                    Select a lesson…
                  </option>
                  {lessons.map((lesson) => (
                    <option
                      key={lesson.id}
                      value={lesson.id}
                    >
                      {lesson.title} · {lesson.assignment_type === 'guided'
                        ? 'Guided'
                        : lesson.assignment_type === 'side_quest'
                          ? 'Small group'
                          : 'Path'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectableDailyLessons.length > 0 && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  2. Pick a day
                </label>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {selectableDailyLessons.map(
                    ({ value, label, dailyLesson }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSelectedLessonDay(value)}
                        className={`shrink-0 rounded-xl border-2 px-4 py-3 text-sm font-bold transition ${
                          selectedLessonDay === value
                            ? 'bg-rose-500 text-white border-rose-500'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-rose-300'
                        }`}
                      >
                        <span className="block">{label}</span>
                        <span
                          className={`block text-xs mt-1 ${
                            selectedLessonDay === value
                              ? 'text-rose-100'
                              : 'text-indigo-600'
                          }`}
                        >
                          M{dailyLesson.module_number || 1}.L
                          {dailyLesson.curriculum_lesson_number || 1}
                        </span>
                      </button>
                    )
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                {selectableDailyLessons.length > 0
                  ? '3. Pick a class'
                  : '2. Pick a class'}
              </label>

              <div className="grid grid-cols-4 gap-2">
                {CLASSES.map(c => (
                  <button
                    key={c}
                    onClick={() => setClassName(c)}
                    className={`px-3 py-2 rounded-lg text-sm font-bold border-2 transition ${
                      className === c
                        ? 'bg-rose-500 text-white border-rose-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                {selectableDailyLessons.length > 0
                  ? '4. Who joins?'
                  : '3. Who joins?'}
              </label>

              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => {
                    setTargetMode('class');
                    setSelectedSGLessonId('');
                    setSelectedGroups([]);
                  }}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold border-2 transition ${
                    targetMode === 'class'
                      ? 'bg-rose-500 text-white border-rose-500'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  Whole class
                </button>

                <button
                  onClick={() => {
                    setTargetMode('group');
                    setSelectedLessonId('');
                  }}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold border-2 transition ${
                    targetMode === 'group'
                      ? 'bg-rose-500 text-white border-rose-500'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  Small group
                </button>
              </div>

              {targetMode === 'group' && className && (
                <div className="border-2 border-gray-100 rounded-xl p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-gray-500">Groups from:</span>
                    <div className="flex gap-1">
                      {ROTATION_TEACHERS.map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setGroupTeacher(t); setSelectedGroups([]); }}
                          className={`px-2 py-1 rounded text-xs font-bold border transition ${
                            groupTeacher === t
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-slate-400'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      {BLOCKS.map(b => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => { setGroupBlock(b); setSelectedGroups([]); }}
                          className={`px-2 py-1 rounded text-xs font-bold border transition ${
                            groupBlock === b
                              ? 'bg-rose-500 text-white border-rose-500'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300'
                          }`}
                        >
                          Block {b}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-gray-400">
                      → {getHomeroomForClass(groupTeacher, groupBlock)} homeroom
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {COLOR_GROUPS.map(cg => {
                      const count = (groupStudentsByColor[cg.id] || []).length;
                      const selected = selectedGroups.includes(cg.id);
                      return (
                        <button
                          key={cg.id}
                          type="button"
                          onClick={() =>
                            setSelectedGroups(prev =>
                              selected ? prev.filter(g => g !== cg.id) : [...prev, cg.id]
                            )
                          }
                          className={`rounded-lg border-2 p-2 text-center transition ${
                            selected
                              ? `${cg.header} text-white border-transparent`
                              : `${cg.bg} ${cg.border} text-gray-700 hover:shadow-sm`
                          }`}
                        >
                          <div className="text-xs font-bold">{cg.label}</div>
                          <div className="text-lg font-black leading-tight">{count}</div>
                        </button>
                      );
                    })}
                  </div>

                  {selectedGroups.length === 0 && (groupAssignments || []).length === 0 && (
                    <p className="text-xs text-gray-400">
                      No groups set up for {groupTeacher} Block {groupBlock}.{' '}
                      <Link to="/SmallGroupManager" className="text-rose-500 underline">Set up groups</Link>.
                    </p>
                  )}

                  <p className="text-xs text-gray-500">
                    {pickedStudents.length} student(s) selected
                    {selectedGroups.length > 0 && ` from ${selectedGroups.length} group(s)`}
                  </p>
                </div>
              )}
            </div>

            <Button
              onClick={startSession}
              disabled={
                !(targetMode === 'group' ? selectedSGLessonId : selectedLessonId) ||
                !className ||
                starting ||
                (
                  selectableDailyLessons.length > 0 &&
                  !selectedLessonDay
                )
              }
              className="w-full bg-rose-500 hover:bg-rose-600 text-white font-black text-lg py-3"
            >
              <Radio className="w-5 h-5 mr-2" />
              {starting
                ? 'Starting…'
                : 'Start Live Lesson'}
            </Button>

          </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- LIVE CONTROL SCREEN ----------
  const steps = getLiveLessonSteps(
    selectedLesson,
    session?.lesson_day || selectedLessonDay
  );

  const currentStep =
    steps[session.current_step || 0];

  const phase =
    session.phase || 'watch';

  const joinUrl =
    `${window.location.origin}/?live=${session.code}&class=${encodeURIComponent(session.class_name)}`;

  const isLocked =
    phase === 'watch';

  const legacyTeacherPanel = showDashboard ? (
    <TryDashboard
      session={session}
    />
  ) : (
    <TeacherModelPanel
      step={currentStep}
      stepIndex={session.current_step || 0}
      send={send}
      className={session.class_name}
      lesson={selectedLesson}
    />
  );

  const releaseMode =
    session.release_mode || 'stay';

  return (
    <div className="relative h-screen bg-slate-900 text-white overflow-hidden">

      {(controlsSaving || controlError) && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-3 right-3 top-16 z-[10002] max-w-lg rounded-xl bg-amber-100 text-amber-950 p-3 text-sm shadow-lg"
        >
          {controlsSaving
            ? "Sending teacher controls — not confirmed yet."
            : controlError}
          {controlError && !controlsSaving && (
            <button
              type="button"
              onClick={() => { void updateSession({}); }}
              className="ml-3 font-bold underline"
            >
              Retry controls
            </button>
          )}
        </div>
      )}

      {/* Top bar */}
      <div className="fixed top-0 inset-x-0 z-[10000] h-14 flex items-center justify-between gap-3 px-4 bg-slate-950 border-b border-slate-700 shadow-xl overflow-x-auto">

        <div className="flex items-center gap-3 min-w-0">

          <span className="flex items-center gap-2 text-rose-400 font-black shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            LIVE
          </span>

          <h1 className="text-base font-bold truncate">
            {session.lesson_title || 'Live Lesson'}
          </h1>

          <span className="text-xs text-slate-500 hidden sm:inline">
            · {session.class_name}
          </span>

        </div>

        <div className="flex items-center gap-2 shrink-0">

          <button
            onClick={() =>
              setShowQR(v => !v)
            }
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700"
          >
            <Users className="w-4 h-4" />
            Join
          </button>

          {/* Release mode: Together (everyone on my step) vs Own pace (students
              work through steps in order, my step is a floor). */}
          <button
            onClick={() =>
              setReleaseMode(
                releaseMode === 'lesson'
                  ? 'stay'
                  : 'lesson'
              )
            }
            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold border transition ${
              releaseMode === 'lesson'
                ? 'bg-violet-500/20 text-violet-300 border-violet-500/40 hover:bg-violet-500/30'
                : 'bg-sky-500/20 text-sky-300 border-sky-500/40 hover:bg-sky-500/30'
            }`}
            title={
              releaseMode === 'lesson'
                ? 'Students work at their own pace — tap to bring everyone together'
                : 'Everyone stays on your step — tap to release to their own pace'
            }
          >
            {releaseMode === 'lesson'
              ? <Footprints className="w-4 h-4" />
              : <Users className="w-4 h-4" />
            }

            {releaseMode === 'lesson'
              ? 'Own pace'
              : 'Together'}
          </button>

          {/* Lock/unlock only applies in Together mode — in Own pace students
              are always working independently. */}
          {releaseMode === 'stay' && (
            <button
              onClick={() =>
                setPhase(
                  isLocked
                    ? 'try'
                    : 'watch'
                )
              }
              className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold border transition ${
                isLocked
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-green-500/20 text-green-300 border-green-500/40 hover:bg-green-500/30'
              }`}
              title={
                isLocked
                  ? 'Students locked — tap to release'
                  : 'Students released — tap to lock'
              }
            >
              {isLocked
                ? <Lock className="w-4 h-4" />
                : <Unlock className="w-4 h-4" />
              }

              {isLocked
                ? 'Locked'
                : 'Released'}
            </button>
          )}

          {/* Toggle between the model (student 30 / broadcast) and the live
              class dashboard so the teacher can monitor student work. */}
          <button
            onClick={() =>
              setShowDashboard(v => !v)
            }
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700"
            title={showDashboard ? 'Show the model' : 'Show class dashboard'}
          >
            {showDashboard
              ? <MonitorPlay className="w-4 h-4" />
              : <LayoutGrid className="w-4 h-4" />
            }
            {showDashboard
              ? 'Model'
              : 'Dashboard'}
          </button>

          <button
            onClick={endSession}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold bg-red-500/90 hover:bg-red-500 text-white"
          >
            <X className="w-4 h-4" />
            End
          </button>

        </div>
      </div>

      {/* Main modeling area */}
      <div
        className="fixed inset-x-0 top-14 bottom-14 z-0 overflow-auto bg-slate-900"
        data-live-lesson-stage
      >

        <div
          className={`fixed right-3 top-[4.25rem] z-[10001] pointer-events-none rounded-full px-3 py-1.5 text-xs font-black shadow-lg border ${
            releaseMode === 'lesson'
              ? 'bg-violet-600 text-white border-violet-300'
              : isLocked
                ? 'bg-amber-500 text-slate-950 border-amber-200'
                : 'bg-green-500 text-slate-950 border-green-200'
          }`}
        >
          {releaseMode === 'lesson'
            ? 'STUDENTS: OWN PACE'
            : isLocked
              ? 'STUDENTS: WATCHING'
              : 'STUDENTS: RELEASED'}
        </div>

        {currentStep?.mode === 'digital_notebook' ? (
          <>
            <NotebookLinkButton
              url={liveNotebookLink(window.location.origin, {
                lessonSessionId: session.id,
                stepIndex: session.current_step || 0,
                className: session.class_name,
              })}
            />
            {/* Native monitor when enabled; otherwise the existing legacy panel unchanged. */}
            <ExternalNotebookSlot context={teacherLessonContext(session, currentStep)}>
              {legacyTeacherPanel}
            </ExternalNotebookSlot>
          </>
        ) : legacyTeacherPanel}

      </div>

      {/* Bottom step toolbar */}
      <div className="fixed bottom-0 inset-x-0 z-[10000] h-14 flex items-center gap-2 px-3 bg-slate-950 border-t border-slate-700 shadow-xl">

        <button
          onClick={() => advance(-1)}
          disabled={
            (session.current_step || 0) === 0
          }
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-40 shrink-0"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 flex items-center gap-1.5 overflow-x-auto justify-center">

          {steps.map((s, i) => {
            const active =
              i ===
              (session.current_step || 0);

            return (
              <button
                key={i}
                onClick={() =>
                  goToStep(i)
                }
                className={`h-9 px-3 rounded-lg flex items-center gap-1.5 text-xs font-bold whitespace-nowrap transition ${
                  active
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
                title={s.title}
              >
                <span className="text-base leading-none">
                  {s.emoji || '▶'}
                </span>

                <span>
                  {i + 1}
                </span>
              </button>
            );
          })}

        </div>

        <button
          onClick={() => advance(1)}
          disabled={
            (session.current_step || 0) >=
            steps.length - 1
          }
          className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-40 shrink-0"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

      </div>

      {/* QR + join code popover */}
      {showQR && (
        <div
          className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/60"
          onClick={() =>
            setShowQR(false)
          }
        >

          <div
            className="bg-white rounded-2xl p-6 flex flex-col items-center gap-3"
            onClick={e =>
              e.stopPropagation()
            }
          >

            <div className="text-gray-800 font-bold text-sm flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              Students join
            </div>

            <div className="bg-white p-1 rounded-xl">
              <QRCodeSVG
                value={joinUrl}
                size={180}
              />
            </div>

            <div className="text-center">

              <div className="text-xs text-gray-400 font-bold">
                OR enter code
              </div>

              <div className="text-3xl font-black text-gray-800 tracking-widest">
                {session.code}
              </div>

            </div>

            <div className="text-xs text-gray-400 text-center">
              {targetMode === 'group'
                ? `Small group: ${session.target_students?.length || 0} students`
                : `Whole class: ${session.class_name}`
              }
            </div>

            <button
              onClick={() =>
                setShowQR(false)
              }
              className="mt-1 px-4 h-9 rounded-lg bg-slate-800 text-white text-xs font-bold"
            >
              Close
            </button>

          </div>
        </div>
      )}

    </div>
  );
}