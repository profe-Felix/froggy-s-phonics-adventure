import { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { getFluencyPreset } from '@/lib/presets';
import { buildFluencyPreset, parseCurriculumKey } from '@/lib/literacy/curriculumContentBuilder';
import { fluencyScope, matchingFluency, latestFluencyWriter } from '@/lib/literacy/fluencySync.mjs';
import { useLiveBroadcast } from '@/hooks/useLiveBroadcast';
import FluencyGrid from '@/components/workstations/FluencyGrid';
import useBookVocabulary from '@/hooks/useBookVocabulary';

function TeacherTable({ step, stepIndex, sessionId }) {
  const config = step.config || {};
  const vocabulary = useBookVocabulary(config);
  const preset = useMemo(() => {
    if (config.bookVocabulary) return vocabulary.preset;
    if (config.curriculumContentType) {
      const position = config.curriculumPositionOverride
        ? parseCurriculumKey(config.curriculumPositionOverride) : config.curriculumPosition;
      if (position?.module_number && position?.curriculum_lesson_number) {
        return buildFluencyPreset({ moduleNumber: Number(position.module_number),
          lessonNumber: Number(position.curriculum_lesson_end || position.curriculum_lesson_number),
          contentType: config.curriculumContentType });
      }
    }
    return getFluencyPreset(config.preset);
  }, [step, vocabulary.preset]);
  const [control, setControl] = useState({ seed: Date.now(), active_cell: 0, active_row: 0, sweep_start_at: '' });
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);
  const scope = fluencyScope(step, stepIndex);
  const writer = useMemo(() => latestFluencyWriter(
    state => base44.entities.LiveLessonSession.update(sessionId, { broadcast_state: state }), setError
  ), [sessionId]);
  const last = useRef(null);
  useEffect(() => {
    let alive = true;
    base44.entities.LiveLessonSession.get(sessionId).then(session => {
      if (!alive) return;
      const state = session.broadcast_state;
      if (matchingFluency(state, step, stepIndex)) setControl({
        seed: state.seed, active_cell: state.active_cell ?? 0,
        active_row: state.active_row ?? 0, sweep_start_at: state.sweep_start_at || '',
      });
      setReady(true); setError(null);
    }).catch(error => { if (alive) setError(error); });
    return () => { alive = false; };
  }, [sessionId, reload]);
  useEffect(() => {
    if (!ready || !sessionId || !preset?.content?.length) return;
    const state = { type: 'fluency', scope, step_index: stepIndex, preset, ...control };
    last.current = state;
    writer.enqueue(state);
  }, [ready, sessionId, preset, scope, stepIndex, control, writer]);
  if (!ready) return <div className="p-6 text-center text-slate-400">
    {error ? <><p>Could not load the shared table.</p><button onClick={() => setReload(n => n + 1)}>Retry sync</button></> : 'Loading shared fluency table…'}
  </div>;
  if (vocabulary.error) return <div role="alert" className="p-6">Could not load book vocabulary. <button onClick={vocabulary.retry}>Retry</button></div>;
  if (vocabulary.loading) return <p className="p-6">Loading book vocabulary…</p>;
  if (!preset?.content?.length) return <p className="p-6 text-center text-slate-400">No decodable content is available yet. Review book text or edit this step's vocabulary.</p>;
  return <div className="flex h-full min-h-0 w-full flex-col p-2">
    <div className="flex shrink-0 justify-between items-center gap-2 mb-1 text-white">
      <strong>{preset.title || 'Fluency Table'}</strong>
      <button className="rounded-lg border px-3 py-2" onClick={() => setControl({ seed: Date.now(), active_cell: 0, active_row: 0, sweep_start_at: '' })}>Shuffle</button>
    </div>
    {error && <div role="alert" className="mb-3 bg-amber-100 text-amber-950 rounded-lg p-2">
      Students have not confirmed the latest table controls.
      <button className="underline ml-2" onClick={() => last.current && writer.enqueue(last.current)}>Retry sync</button>
    </div>}
    <div className="min-h-0 flex-1"><FluencyGrid fit preset={preset} seed={control.seed} activeCell={control.active_cell}
      activeRow={control.active_row} sweepStartAt={control.sweep_start_at}
      onSelectCell={index => setControl(c => ({ ...c, active_cell: index, sweep_start_at: '' }))}
      onPlayRow={row => setControl(c => ({ ...c, active_cell: row * preset.cols, active_row: row, sweep_start_at: new Date().toISOString() }))} /></div>
  </div>;
}

export function FluencyLessonTeacher(props) {
  return <TeacherTable key={fluencyScope(props.step, props.stepIndex)} {...props} />;
}

export function FluencyLessonMirror({ step, stepIndex, broadcast }) {
  if (!matchingFluency(broadcast, step, stepIndex)) return <p className="p-6 text-center text-slate-400">Waiting for your teacher's fluency table…</p>;
  return <div className="h-full min-h-0 p-2"><FluencyGrid fit preset={broadcast.preset} seed={broadcast.seed}
    activeCell={broadcast.active_cell ?? 0} activeRow={broadcast.active_row ?? 0}
    sweepStartAt={broadcast.sweep_start_at} interactive={false} /></div>;
}

export function FluencyLessonStudent({ step, stepIndex, liveSession }) {
  const { broadcast } = useLiveBroadcast(liveSession.id, liveSession.broadcast_state);
  return <FluencyLessonMirror {...{ step, stepIndex, broadcast }} />;
}
