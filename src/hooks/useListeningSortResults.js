import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { LISTENING_MODES } from '@/lib/lettersort/listeningSort.mjs';
import { summarizeListeningAttempts } from '@/lib/lettersort/listeningScore.mjs';

// One batched record per run, not a network request per drag. Unsynced results
// stay on this device and retry automatically. Existing class/picture identity
// is supplied by the lesson; standalone links may supply class and number.
export function useListeningSortResults({ config, studentClass, studentNumber, isTeacher = false }) {
  const [status, setStatus] = useState('');
  const active = useRef(null);
  const timer = useRef(null);
  const className = String(studentClass || '').trim();
  const number = Number(studentNumber);
  const signature = JSON.stringify(config);
  const enabled = !isTeacher && LISTENING_MODES.includes(config?.mode) && className && Number.isInteger(number) && number > 0;

  useEffect(() => {
    clearTimeout(timer.current);
    if (!enabled) { active.current = null; setStatus(''); return; }
    const key = `lettersort-listening:${className}:${number}:${signature}`;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
    const state = saved && (!saved.completed || saved.savedVersion !== saved.version) ? saved : {
      run_id: crypto.randomUUID(), class_name: className, student_number: number,
      mode: config.mode, targets: (config.sounds || [config.consonant]).join(','),
      attempts: [], completed: false, version: 0, savedVersion: -1,
    };
    let disposed = false, inFlight = false;
    const persist = () => {
      try { localStorage.setItem(key, JSON.stringify(state)); return true; }
      catch { setStatus('No se pudo guardar en este dispositivo. Mantén la actividad abierta.'); return false; }
    };
    const flush = async () => {
      if (inFlight || !state.attempts.length || state.savedVersion === state.version) return;
      inFlight = true;
      const version = state.version;
      const score = summarizeListeningAttempts(state.attempts);
      const payload = {
        run_id: state.run_id, class_name: state.class_name, student_number: state.student_number,
        mode: state.mode, targets: state.targets, attempts_data: JSON.stringify(state.attempts),
        correct: score.correct, wrong: score.wrong, first_try_correct: score.firstTryCorrect,
        completed: state.completed, submitted_at: new Date().toISOString(),
      };
      try {
        if (!state.recordId) {
          const existing = await base44.entities.LetterSortResult.filter({ run_id: state.run_id });
          if (existing[0]) state.recordId = existing[0].id;
        }
        const record = state.recordId
          ? await base44.entities.LetterSortResult.update(state.recordId, payload)
          : await base44.entities.LetterSortResult.create(payload);
        state.recordId = record.id;
        state.savedVersion = version;
        persist();
        if (!disposed) setStatus(version === state.version ? 'Resultados guardados' : 'Guardando resultados…');
      } catch {
        persist();
        if (!disposed) setStatus('Resultados pendientes. Se reintentará automáticamente.');
      } finally {
        inFlight = false;
        if (!disposed && state.savedVersion !== state.version) timer.current = setTimeout(() => {
          timer.current = null; flush();
        }, 8000 + Math.random() * 3000);
      }
    };
    active.current = {
      append: attempt => {
        state.completed = false;
        state.attempts.push(attempt); state.version++; persist();
        setStatus('Guardando resultados…');
        if (!timer.current) timer.current = setTimeout(() => { timer.current = null; flush(); }, 5000 + Math.random() * 2000);
      },
      complete: () => {
        state.completed = true; state.version++; persist();
        clearTimeout(timer.current); timer.current = null; flush();
      },
    };
    const online = () => { clearTimeout(timer.current); timer.current = null; flush(); };
    window.addEventListener('online', online);
    if (state.attempts.length && state.savedVersion !== state.version) online();
    return () => {
      disposed = true; clearTimeout(timer.current); timer.current = null;
      window.removeEventListener('online', online);
      if (state.attempts.length && state.savedVersion !== state.version) flush();
      active.current = null;
    };
  }, [signature, className, number, enabled]);
  const onAttempt = useCallback(attempt => active.current?.append(attempt), []);
  const onComplete = useCallback(() => active.current?.complete(), []);
  return { onAttempt, onComplete, status, enabled: !!enabled };
}
