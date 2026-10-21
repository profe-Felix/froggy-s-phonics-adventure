import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { levelState } from '@/lib/adventure/model.mjs';

const demoState = { completedCount: 6, completedLevels: [1, 2, 3, 4, 5, 6], currentLevel: 7 };
const emptyState = { completedCount: 0, completedLevels: [], currentLevel: 1 };
function bindDestinations(map, student) {
  const values = student && { studentId: student.id, className: student.className,
    number: student.number, schoolYear: student.schoolYear };
  return { ...map, levels: map.levels.map(level => ({ ...level,
    destination: level.destination && /\{[a-zA-Z]+\}/.test(level.destination)
      ? values ? level.destination.replace(/\{(studentId|className|number|schoolYear)\}/g,
        (_, key) => encodeURIComponent(values[key])) : null : level.destination,
  })) };
}
async function request(body) {
  try {
    const response = await base44.functions.invoke('adventureMap', body);
    if (response.data?.error) throw new Error(response.data.error);
    return response.data;
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.message || 'The trail could not connect. Try again.');
  }
}
export default function useAdventureMap() {
  const [params, setParams] = useSearchParams();
  const studentId = params.get('studentId') || '';
  const [map, setMap] = useState(null), [student, setStudent] = useState(null);
  const [progress, setProgress] = useState(demoState);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const generation = useRef(0), busyRef = useRef(false);
  const identity = useRef(studentId);
  identity.current = studentId;
  const isDemo = !studentId;
  useEffect(() => {
    const turn = ++generation.current;
    setBusy(true); setError(''); setSelectedLevel(null); setStudent(null);
    // Never display one student's unlocked map under a different identity,
    // including when the next identity fails to load.
    setMap(null); setProgress(studentId ? emptyState : demoState);
    request(studentId ? { action: 'read', studentId } : { action: 'catalog' })
      .then(data => {
        if (turn !== generation.current) return;
        setMap(bindDestinations(data.map, data.student)); setStudent(data.student || null);
        setProgress(data.progress || demoState);
      }).catch(err => { if (turn === generation.current) setError(err.message); })
      .finally(() => { if (turn === generation.current) setBusy(false); });
    return () => { generation.current++; };
  }, [studentId, reload]);
  const run = async work => {
    if (busyRef.current) return;
    busyRef.current = true;
    const origin = identity.current, turn = generation.current;
    setBusy(true); setError('');
    try { await work(() => identity.current === origin && generation.current === turn); }
    catch (err) { if (identity.current === origin && generation.current === turn) setError(err.message); }
    finally {
      busyRef.current = false;
      if (identity.current === origin && generation.current === turn) setBusy(false);
    }
  };
  return { map, student, progress, isDemo, busy, error, selectedLevel, schoolYear: ACTIVE_SCHOOL_YEAR,
    retry: () => setReload(n => n + 1),
    closeLevel: () => { if (!busyRef.current) { setSelectedLevel(null); setError(''); } },
    chooseStudent: identity => run(async same => {
      const data = await request({ action: 'read', identity: {
        className: identity.className, number: Number(identity.number),
        schoolYear: identity.schoolYear || ACTIVE_SCHOOL_YEAR } });
      if (same()) setParams({ studentId: data.student.id });
    }),
    useDemo: () => { if (!busyRef.current) setParams({}); },
    openLevel: number => run(async same => {
      if (!map || levelState(number, progress) === 'locked') return;
      if (isDemo || levelState(number, progress) === 'completed') {
        if (same()) setSelectedLevel({ level: map.levels[number - 1], attemptId: null,
          completed: number <= progress.completedCount });
        return;
      }
      const data = await request({ action: 'begin', studentId, level: number });
      if (same()) {
        setProgress(data.progress);
        setSelectedLevel({ level: data.level, attemptId: data.attemptId,
          completed: number <= data.progress.completedCount });
      }
    }),
    completeSelected: () => run(async same => {
      if (!selectedLevel || selectedLevel.completed) return;
      if (isDemo) {
        if (same()) { const n = progress.completedCount + 1;
          setProgress({ completedCount: n, completedLevels: Array.from({ length: n }, (_, i) => i + 1),
            currentLevel: n < 200 ? n + 1 : null }); setSelectedLevel(null); }
        return;
      }
      const data = await request({ action: 'complete', studentId, level: selectedLevel.level.number,
        attemptId: selectedLevel.attemptId, confirmed: true });
      if (same()) { setProgress(data.progress); setSelectedLevel(null); }
    }),
  };
}
