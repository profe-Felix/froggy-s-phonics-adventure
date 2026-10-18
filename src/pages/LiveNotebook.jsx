// Direct student notebook link:
//   /LiveNotebook?assessment=SOURCE_ID&class=Felix[&number=4]
//   /LiveNotebook?lesson=SESSION_ID&step=0&class=Felix[&number=4]
// URLs carry source identifiers only. Never tokens or credentials.
// This page only OPENS an existing source; it never creates, targets or pauses.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useClassNames } from '@/hooks/useClassNames';
import { StudentLogin, parseClassParam } from '@/pages/DigitalNotebook';
import { getLiveLessonSteps } from '@/pages/LiveLesson';
import ExternalNotebookSlot from '@/components/external-notebook/ExternalNotebookSlot';
import { EXTERNAL_NOTEBOOK_CONFIG } from '@/lib/external-notebook/config';
import { decideLiveNotebook, slotContextAfterMount } from '@/lib/external-notebook/live-notebook-route';

const CONFIG = EXTERNAL_NOTEBOOK_CONFIG;

function readLink() {
  const p = new URLSearchParams(window.location.search);
  const assessment = p.get('assessment');
  const lesson = p.get('lesson');
  const step = Number(p.get('step') ?? 0);
  const number = Number(p.get('number'));
  return {
    kind: assessment ? 'assessment' : lesson ? 'lesson' : null,
    sourceId: assessment || lesson || '',
    stepIndex: Number.isInteger(step) && step >= 0 ? step : NaN,
    rawClass: p.get('class'),
    number: Number.isInteger(number) && number >= 1 && number <= 100 ? number : null,
  };
}

function Notice({ title, children, onRetry }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[hsl(44_40%_96%)] p-6">
      <div className="max-w-md w-full rounded-2xl border border-[hsl(200_18%_84%)] bg-white/80 p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-[hsl(198_45%_16%)]">{title}</h1>
        {children && <p className="mt-2 text-sm text-[hsl(198_20%_35%)]">{children}</p>}
        {onRetry && (
          <button type="button" onClick={onRetry}
            className="mt-4 rounded-lg bg-[hsl(192_62%_30%)] px-4 py-2 text-sm font-semibold text-white">Try again</button>
        )}
      </div>
    </div>
  );
}

// One shared query per source and a subscription to that exact entity.
function useLiveSource(kind, sourceId) {
  const queryClient = useQueryClient();
  const entity = kind === 'assessment' ? 'LiveNotebookAssessment' : kind === 'lesson' ? 'LiveLessonSession' : null;
  const key = useMemo(() => ['live-notebook-source', kind, sourceId], [kind, sourceId]);
  const query = useQuery({
    queryKey: key,
    queryFn: () => base44.entities[entity].get(sourceId),
    enabled: !!entity && !!sourceId,
    retry: 2,
    retryDelay: attempt => Math.min(4000, 800 * 2 ** attempt),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (!entity || !sourceId) return undefined;
    const unsubscribe = base44.entities[entity].subscribe(event => {
      if ((event.id || event.data?.id) !== sourceId) return;
      if (event.type === 'delete') {
        queryClient.setQueryData(key, old => old ? { ...old, active: false } : old);
      } else if (event.data) {
        queryClient.setQueryData(key, old => ({ ...(old || {}), ...event.data }));
      } else {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    });
    return () => unsubscribe?.();
  }, [entity, sourceId, key, queryClient]);
  return query;
}

export default function LiveNotebook() {
  const link = useMemo(readLink, []);
  const { classList } = useClassNames();
  const className = parseClassParam(link.rawClass, classList || []);
  const [number, setNumber] = useState(link.number);
  const lastContext = useRef(null);

  // Keep the chosen seat in the URL (class and number only) so refresh stays put.
  useEffect(() => {
    if (!number || !className) return;
    const sp = new URLSearchParams(window.location.search);
    sp.set('class', className); sp.set('number', String(number));
    window.history.replaceState(null, '', `${window.location.pathname}?${sp}`);
  }, [number, className]);

  const source = useLiveSource(link.kind, link.sourceId);
  const src = source.data;

  // Same key as StudentLogin: one bounded class query, shared cache.
  const students = useQuery({
    queryKey: ['notebook-login-students', className],
    queryFn: () => base44.entities.Student.filter({ class_name: className, school_year: ACTIVE_SCHOOL_YEAR }),
    enabled: !!className && !!number,
    retry: 2,
  });
  const lessonEntity = src?.lesson_source === 'small_group' ? 'SmallGroupLesson' : 'Lesson';
  const lesson = useQuery({
    queryKey: ['live-notebook-lesson', lessonEntity, src?.lesson_id],
    queryFn: () => base44.entities[lessonEntity].get(src.lesson_id),
    enabled: link.kind === 'lesson' && !!src?.lesson_id,
    retry: 2,
    staleTime: Infinity,
  });

  const decision = decideLiveNotebook({
    link, className, number, config: CONFIG, activeYear: ACTIVE_SCHOOL_YEAR,
    source: { data: src, error: source.isError, loading: source.isLoading },
    students: { data: students.data, error: students.isError, loading: students.isLoading },
    lesson: { data: lesson.data, error: lesson.isError, loading: lesson.isLoading },
    getSteps: getLiveLessonSteps,
  });
  const retryFor = { source: () => source.refetch(), students: () => students.refetch(), lesson: () => lesson.refetch() };
  const shown = decision.notice && (
    <Notice title={decision.notice.title} onRetry={retryFor[decision.notice.retry]}>
      {decision.notice.body}
      {decision.rechoose && !lastContext.current && (
        <button type="button" className="ml-1 underline" onClick={() => setNumber(null)}>Choose again</button>)}
    </Notice>
  );

  // Save guard: after the Slot first renders, never unmount it. Inactive,
  // released, ended, changed-scope or error states pass through the SAME Slot
  // as the last context with active:false, so its pinned owner finishes the
  // gesture, persists and closes before the fallback children appear.
  if (decision.screen === 'slot') lastContext.current = decision.context;
  const slotContext = slotContextAfterMount(decision, lastContext.current);
  if (!slotContext) {
    if (decision.screen === 'chooser') {
      return <StudentLogin preselectedClass={className} classList={classList || []}
        onEnter={(_cls, num) => setNumber(Number(num))} />;
    }
    return shown;
  }
  return (
    <div className="min-h-[100dvh] bg-[hsl(44_40%_96%)]">
      <ExternalNotebookSlot context={slotContext}>
        {/* Deliberately no legacy writer fallback for direct links. */}
        {shown || (
          <Notice title="The live notebook is not available yet">
            Your teacher has not turned on this notebook for direct links. Your saved work is safe.
          </Notice>
        )}
      </ExternalNotebookSlot>
    </div>
  );
}
