import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';

export async function invokeBuilding(body) {
  try {
    const response = await base44.functions.invoke('buildingPractice', body);
    if (response.data?.error) throw Error(response.data.error);
    if (!response.data || typeof response.data !== 'object') throw Error('The practice response was incomplete.');
    return response.data;
  } catch (error) {
    throw Error(error.response?.data?.error || error.message || 'Practice could not save. Please retry.');
  }
}
export function buildingIdentity(studentData, number, className) {
  return studentData?.id ? { studentId: studentData.id } : {
    studentNumber: Number(number), className, schoolYear: studentData?.school_year || ACTIVE_SCHOOL_YEAR,
  };
}
export function useBuildingCatalog(lessonId, studentData, number, className, enabled = true) {
  const identity = buildingIdentity(studentData, number, className);
  const key = identity.studentId || `${identity.className}:${identity.studentNumber}:${identity.schoolYear}`;
  return useQuery({ queryKey: ['building-catalog', key, lessonId],
    queryFn: async () => ({ ...await invokeBuilding({ action: 'catalog', lessonId, ...identity }),
      studentId: studentData?.id }), enabled: !!lessonId && enabled, staleTime: 15000, retry: false });
}
export function useBuildingStatuses(studentData, number, className, enabled = true) {
  const identity = buildingIdentity(studentData, number, className);
  return useQuery({ queryKey: ['building-level-status', identity.studentId || className, number],
    queryFn: () => invokeBuilding({ action: 'status', ...identity }),
    enabled: !!number && !!className && enabled, staleTime: 15000, retry: false, refetchOnWindowFocus: true });
}
export function useBuildingRound({ studentData, studentNumber, className, lessonId, kind }) {
  const identity = buildingIdentity(studentData, studentNumber, className);
  const scope = JSON.stringify([identity, lessonId, kind]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const generation = useRef(0), locked = useRef(false), pending = useRef(null), retryRequest = useRef(null);
  const [data, setData] = useState({}), [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const cache = useQueryClient();
  const load = useCallback(async (restart = false) => {
    const turn = ++generation.current;
    locked.current = true; pending.current = null; retryRequest.current = null;
    setLoading(true); setBusy(true); setError(''); setData({}); setFeedback(null);
    try {
      const next = await invokeBuilding({ action: 'session', ...JSON.parse(scope)[0], lessonId, kind, restart });
      if (currentScope.current === scope && generation.current === turn) setData(next);
    } catch (e) { if (currentScope.current === scope && generation.current === turn) setError(e.message); }
    finally { if (currentScope.current === scope && generation.current === turn) {
      locked.current = false; setLoading(false); setBusy(false);
    } }
  }, [scope, lessonId, kind]);
  useEffect(() => { load(); return () => { generation.current++; }; }, [load]);
  const act = async (action, tileIds = []) => {
    if (locked.current || !data.item || !data.round || pending.current) return;
    locked.current = true; setBusy(true); setError('');
    const origin = scope, turn = generation.current;
    const fingerprint = JSON.stringify([data.round.id, data.item.index, action, tileIds]);
    if (retryRequest.current?.fingerprint !== fingerprint)
      retryRequest.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const next = await invokeBuilding({ action, ...identity, lessonId, kind, runId: data.round.id,
        itemIndex: data.item.index, tileIds, requestId: retryRequest.current.id,
        receiptIds: data.receiptIds || [] });
      if (currentScope.current !== origin || generation.current !== turn) return;
      retryRequest.current = null; setFeedback(next.feedback || null);
      if (next.feedback?.correct) {
        pending.current = next;
        setData(previous => ({ ...previous, round: next.round, mastered: next.mastered }));
        cache.invalidateQueries({ queryKey: ['building-catalog'] });
        cache.invalidateQueries({ queryKey: ['building-level-status'] });
      } else {
        setData(next);
        if (next.feedback?.hintText)
          setData(previous => ({ ...previous, item: previous.item && { ...previous.item, hintText: next.feedback.hintText } }));
      }
      return next;
    } catch (e) { if (currentScope.current === origin && generation.current === turn) setError(e.message); throw e; }
    finally { if (currentScope.current === origin && generation.current === turn) { locked.current = false; setBusy(false); } }
  };
  return { ...data, feedback, error, loading, busy, submit: ids => act('answer', ids),
    requestHint: () => act('hint'), reload: () => load(false), startRound: () => load(true),
    advance: () => { if (pending.current && !locked.current) { setData(pending.current); pending.current = null; setFeedback(null); } } };
}
export function useBuildingSetup(lessonId) {
  const cache = useQueryClient(), [busy, setBusy] = useState(false), [saveError, setSaveError] = useState('');
  const saving = useRef(false);
  const lessons = useQuery({ queryKey: ['building-setup-lessons'],
    queryFn: async () => (await invokeBuilding({ action: 'lessons' })).lessons, retry: false });
  const setup = useQuery({ queryKey: ['building-setup', lessonId],
    queryFn: () => invokeBuilding({ action: 'setup', lessonId }), enabled: !!lessonId, retry: false });
  const save = async config => {
    if (saving.current || !setup.data || !lessonId) return false;
    saving.current = true; setBusy(true); setSaveError('');
    try {
      const result = await invokeBuilding({ action: 'saveConfig', lessonId, config, configHash: setup.data.configHash });
      cache.setQueryData(['building-setup', lessonId], result);
      cache.invalidateQueries({ queryKey: ['building-catalog'] });
      return true;
    } catch (e) { setSaveError(e.message); throw e; }
    finally { saving.current = false; setBusy(false); }
  };
  return { ...setup.data, lessons: lessons.data || [], loading: lessons.isLoading || !!lessonId && setup.isLoading,
    busy, error: saveError || setup.error?.message || lessons.error?.message || '', save };
}
