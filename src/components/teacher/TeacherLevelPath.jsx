import { useEffect, useMemo, useRef, useState } from 'react';
import { pathwayLabel, pathwayRangeLabel } from '@/lib/literacy/pathwayCurriculum.mjs';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fetchLessons } from '@/lib/lessonsLoader';

// Teacher version of the student level path: same background image + puck
// positions (reads the saved LevelPathLayout for the class so pucks match what
// students see), but every placed level with a lesson is clickable and tapping
// one opens the live-lesson launcher instead of the student stepper. No
// completion gating, no character dock, no edit mode.
const BG_URL =
  'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/images/Backgrounds/Level_Path.png';
const TOTAL_LEVELS = 120;
const Y_TOP = 8;
const Y_BOT = 92;
const AMP = 0.24;
const FREQ = 0.85;

function defaultPos(i) {
  const x = 50 + AMP * 100 * Math.sin((i - 1) * FREQ);
  const y = Y_BOT - ((Y_BOT - Y_TOP) * (i - 1)) / (TOTAL_LEVELS - 1);
  return { x, y };
}

export default function TeacherLevelPath({ className, onOpenLesson, activeModule = 0, activeLesson = 0 }) {
  const { data: lessons = [] } = useQuery({
    queryKey: ['lessons', className],
    queryFn: fetchLessons,
  });

  const myLessons = useMemo(
    () =>
      lessons
        .filter(
          (l) =>
            l.assignment_type !== 'side_quest' &&
            l.assignment_type !== 'guided' &&
            (!l.class_name || l.class_name === className)
        )
        .sort((a, b) => (a.lesson_number || 0) - (b.lesson_number || 0)),
    [lessons, className]
  );

  const byNumber = useMemo(() => {
    const m = new Map();
    for (const l of myLessons) if (l.lesson_number) m.set(l.lesson_number, l);
    return m;
  }, [myLessons]);

  const { data: layoutRec } = useQuery({
    queryKey: ['level-path-layout', className],
    queryFn: async () => {
      const rows = await base44.entities.LevelPathLayout.filter({
        class_name: className,
      });
      return rows[0] || null;
    },
    enabled: !!className,
  });

  const savedPositions = useMemo(() => {
    if (!layoutRec?.positions_data) return {};
    try {
      return JSON.parse(layoutRec.positions_data) || {};
    } catch {
      return {};
    }
  }, [layoutRec]);

  const hasSavedLayout = Object.keys(savedPositions).length > 0;
  const slots = hasSavedLayout
    ? Object.keys(savedPositions)
        .map(Number)
        .filter((n) => n >= 1 && n <= TOTAL_LEVELS)
        .sort((a, b) => a - b)
    : Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1);

  const posFor = (n) => savedPositions[String(n)] || defaultPos(n);

  // Active slot = the path lesson covering the class's active curriculum
  // position (set on the Class Manager). Each path lesson is a week of daily
  // lessons; we find the week whose curriculum range reaches the active
  // module/lesson. Falls back to the first placed lesson.
  const activeSlot = useMemo(() => {
    const sorted = [...myLessons].sort(
      (a, b) => (a.lesson_number || 0) - (b.lesson_number || 0)
    );
    if (activeModule > 0 && activeLesson > 0) {
      // Exact match: a day whose module/lesson equals the active position.
      const exact = sorted.find((l) =>
        (l.daily_lessons || []).some(
          (d) =>
            Number(d.module_number) === activeModule &&
            Number(d.curriculum_lesson_number) === activeLesson
        )
      );
      if (exact?.lesson_number) return exact.lesson_number;
      // Otherwise: first week whose highest curriculum position reaches the
      // active one (each module = 20 lessons).
      const activeCum = (activeModule - 1) * 20 + activeLesson;
      const reach = sorted.find((l) => {
        const maxCum = Math.max(
          0,
          ...(l.daily_lessons || []).map(
            (d) =>
              (Number(d.module_number) - 1) * 20 +
              Number(d.curriculum_lesson_number)
          )
        );
        return maxCum >= activeCum;
      });
      if (reach?.lesson_number) return reach.lesson_number;
    }
    return sorted[0]?.lesson_number || null;
  }, [myLessons, activeModule, activeLesson]);

  // Background image aspect + container width (same approach as LevelPath).
  const wrapRef = useRef(null);
  const [aspect, setAspect] = useState(0);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const im = new Image();
    im.onload = () =>
      setAspect(
        im.naturalHeight && im.naturalWidth
          ? im.naturalHeight / im.naturalWidth
          : 0
      );
    im.src = BG_URL;
  }, []);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width)
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ready = aspect > 0 && width > 0;
  const containerH = ready ? Math.round(width * aspect) : 0;

  const dotSize = Math.min(56, Math.max(34, width * 0.047));
  const dotFont = Math.round(dotSize * 0.32);

  // Auto-scroll the active puck into view on load. Pucks only render once
  // `ready` is true, so the effect re-runs when ready flips — otherwise the
  // scroll is missed and the page sits at the top.
  const activeRef = useRef(null);
  useEffect(() => {
    if (!ready || !activeRef.current) return;
    activeRef.current.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [ready, activeSlot]);

  return (
    <div className="relative h-screen overflow-y-auto bg-[#a932d5]">
      <div
        ref={wrapRef}
        className="relative w-full"
        style={{
          height: ready ? containerH : '100vh',
          backgroundImage: `url(${BG_URL})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'top center',
        }}
      >
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-white/40 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {ready &&
          slots.map((n) => {
            const lesson = byNumber.get(n);
            const pos = posFor(n);
            const clickable = !!lesson;
            return (
              <button
                key={n}
                ref={n === activeSlot ? activeRef : null}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onOpenLesson(lesson)}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full shadow-lg select-none"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  width: dotSize,
                  height: dotSize,
                  background: clickable ? '#ffffff' : '#e5e7eb',
                  border: n === activeSlot ? '4px solid #F48FB1' : '3px solid #ffffff',
                  opacity: clickable ? 1 : 0.5,
                  cursor: clickable ? 'pointer' : 'default',
                  zIndex: 10,
                }}
              >
                <span
                  className="font-black"
                  style={{
                    color: clickable ? '#311B92' : '#9ca3af',
                    fontSize: lesson?.language === 'es' ? Math.min(dotFont, dotSize * .21) : dotFont,
                  }}
                >
                  {lesson?.language === 'es' ? pathwayLabel(n) : n}
                  {pathwayRangeLabel(lesson) && <small style={{ display: 'block', fontSize: Math.max(6.5, dotSize * .15), lineHeight: 1.15, fontWeight: 600 }}>{pathwayRangeLabel(lesson)}</small>}
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}