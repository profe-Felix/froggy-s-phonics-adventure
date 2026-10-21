import React, { useMemo, useRef, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import { getFluencyPreset } from '@/lib/presets';
import { buildFluencyPreset, parseCurriculumKey } from '@/lib/literacy/curriculumContentBuilder';
import FluencyInkCanvas from './FluencyInkCanvas';
import FluencyGrid from '@/components/workstations/FluencyGrid';
import { buildFluencyCells } from '@/lib/literacy/fluencyDisplay.mjs';
import { recordingFile } from '@/lib/literacy/recordingFile.mjs';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import StepDoneBar from './StepDoneBar';
import { Mic, Square, ArrowRight, RotateCcw, CheckCircle2, Loader2 } from 'lucide-react';

// Use the same full chart as FluencyTable. Optional row recordings use the
// established picture-login reading record path, without opening legacy
// account-only FluencyPracticeSession permissions.
export default function FluencyPracticeStep({ onComplete, presetId, curriculumPosition, curriculumPositionOverride, curriculumContentType, studentNumber, className }) {
  const [curriculumLessons, setCurriculumLessons] = useState([]);

  // Load lessons for sight-word curriculum building
  useEffect(() => {
    if (curriculumContentType !== 'sight_words') return;
    let cancelled = false;
    base44.entities.Lesson.list().then(lessons => {
      if (!cancelled) setCurriculumLessons(lessons);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [curriculumContentType]);

  const preset = useMemo(() => {
    // Curriculum-driven mode: build from M#.L# with weighted spiral decay
    if (curriculumContentType) {
      const pos = curriculumPositionOverride
        ? parseCurriculumKey(curriculumPositionOverride)
        : curriculumPosition;
      const moduleNumber = Number(pos?.module_number);
      const lessonNumber = Number(pos?.curriculum_lesson_end || pos?.curriculum_lesson_number);
      if (moduleNumber > 0 && lessonNumber > 0) {
        return buildFluencyPreset({
          moduleNumber,
          lessonNumber,
          contentType: curriculumContentType,
          lessons: curriculumLessons,
        });
      }
    }
    // Preset mode (existing behavior)
    return presetId ? getFluencyPreset(presetId) : null;
  }, [curriculumContentType, curriculumPosition, curriculumPositionOverride, presetId, curriculumLessons]);

  const [seed, setSeed] = useState(() => Date.now());
  const [cell, setCell] = useState(0);
  const [sweepStartAt, setSweepStartAt] = useState('');
  const practiceKey = preset?.id || presetId;
  const rows = useMemo(() => {
    if (!preset) return [];
    const cols = preset.cols || 8;
    const items = buildFluencyCells(preset, seed);
    const out = [];
    for (let i = 0; i < items.length; i += cols) out.push(items.slice(i, i + cols));
    return out;
  }, [preset, seed]);

  const [currentRow, setCurrentRow] = useState(0);
  const [recordings, setRecordings] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | recording | saving | recorded
  const [loadErr, setLoadErr] = useState('');
  const recorder = useAudioRecorder();
  const inkRef = useRef(null);
  const uploadingRef = useRef(false);

  // Load any in-progress session so the student can resume.
  useEffect(() => {
    setRecordings([]);
    setCurrentRow(0);
    setCell(0);
    setPhase('idle');
    if (!studentNumber || !className || !practiceKey) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await base44.entities.SpanishReadingSession.filter(
          { student_number: studentNumber, class_name: className, list_name: `Fluidez · ${practiceKey}`,
            school_year: ACTIVE_SCHOOL_YEAR, attempt_date: new Date().toISOString().slice(0, 10) },
          '-created_date', 100
        );
        if (cancelled) return;
        if (existing && existing.length) {
          try {
            const attempts = existing.map(record => {
              try { return { ...JSON.parse(record.fluency_row_data || '{}'), audio_url: record.recording_url }; }
              catch { return null; }
            }).filter(record => record && Number.isInteger(record.row) && record.seed && record.audio_url);
            const latestSeed = attempts[0]?.seed;
            const parsed = [];
            for (const record of attempts) if (record.seed === latestSeed && record.row >= 0 && record.row < rows.length && !parsed[record.row])
              parsed[record.row] = record;
            setRecordings(parsed);
            if (latestSeed) setSeed(latestSeed);
            const nextRow = Array.from({ length: rows.length }, (_, index) => index).find(index => !parsed[index]);
            setCurrentRow(nextRow ?? 0);
          } catch { /* ignore */ }
        }
      } catch (e) { setLoadErr('Could not load your progress.'); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentNumber, className, practiceKey]);

  const persist = async (recording) => {
    if (!studentNumber || !className || !practiceKey) return;
    const payload = {
      student_number: studentNumber,
      class_name: className,
      school_year: ACTIVE_SCHOOL_YEAR,
      list_name: `Fluidez · ${practiceKey}`,
      item_text: recording.items.join(' '),
      item_type: 'sentence',
      recording_url: recording.audio_url,
      fluency_row_data: JSON.stringify(recording),
      attempt_date: new Date().toISOString().slice(0, 10),
      student_self_grade: 'pending',
      teacher_grade: 'pending',
      reviewed: false,
      points_awarded: 0,
    };
    await base44.entities.SpanishReadingSession.create(payload);
  };

  const saveRecording = async () => {
    if (uploadingRef.current) return;
    const blob = recorder.getBlob();
    if (!blob) return;
    uploadingRef.current = true;
    setPhase('saving');
      try {
        const file = recordingFile(blob, `fluency-row-${currentRow + 1}-${Date.now()}`);
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (!file_url) throw new Error('Upload returned no audio URL');
        const rec = {
          row: currentRow,
          seed,
          items: rows[currentRow] || [],
          audio_url: file_url,
          strokes_data: JSON.stringify(inkRef.current?.getStrokes() || []),
          duration_ms: recorder.durationMs,
          recorded_at: new Date().toISOString(),
        };
        const newRecs = [...recordings];
        newRecs[currentRow] = rec;
        await persist(rec);
        setRecordings(newRecs);
        setLoadErr('');
        setPhase('recorded');
        recorder.reset();
      } catch (e) {
        setLoadErr('Could not save your recording. Your audio is still here—retry saving before leaving.');
        setPhase('failed');
      } finally {
        uploadingRef.current = false;
      }
  };
  // Keep the recorded blob on failure, and retry only when the student asks.
  useEffect(() => {
    if (recorder.state === 'stopped') void saveRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.state]);

  const handleStart = async () => {
    setLoadErr('');
    setPhase('starting');
    try {
      const started = await recorder.startRecording();
      if (!started) { setPhase('idle'); return; }
      inkRef.current?.clear();
      setSweepStartAt('');
      setPhase('recording');
    } catch {
      setLoadErr('The microphone could not start. Allow microphone access and try again.');
      setPhase('idle');
    }
  };
  const handleStop = () => {
    recorder.stopRecording();
    // the upload effect flips phase to 'saving' then 'recorded'
  };
  const handleNext = () => {
    setCurrentRow((r) => Math.min(r + 1, rows.length - 1));
    inkRef.current?.clear();
    setPhase('idle');
  };
  const handleRedo = () => {
    void handleStart();
  };

  if (!preset) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 p-6 text-center">
        No fluency preset assigned. Pick one in the Lesson Planner.
      </div>
    );
  }
  if (!rows.length) {
    return <div className="h-full flex items-center justify-center text-gray-400 p-6">This preset has no words.</div>;
  }

  const row = rows[currentRow] || [];
  const rowDone = !!recordings[currentRow];
  const allDone = recordings.filter(Boolean).length >= rows.length;

  return (
    <div className="relative h-full flex flex-col bg-indigo-50">
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b">
        <div>
          <h2 className="font-black text-indigo-900 text-lg leading-tight">{preset.title || 'Fluency Practice'}</h2>
          <p className="text-xs text-gray-500">Read the whole chart. Tap a row to follow along; recording is optional.</p>
          <p className="text-xs text-gray-500">Row recordings appear in the Spanish Reading Dashboard.</p>
        </div>
        <button disabled={recordings.some(Boolean) || ['recording', 'saving', 'starting', 'failed'].includes(phase)}
          className="rounded-lg border px-3 py-1 text-sm font-bold disabled:opacity-40"
          onClick={() => { setSeed(Date.now()); setCell(0); setSweepStartAt(''); }}>Shuffle</button>
        {recordings.filter(Boolean).length > 0 && (
          <span className="text-xs font-bold text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> {recordings.filter(Boolean).length}/{rows.length} done
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div className="relative max-w-5xl mx-auto">
          <FluencyGrid preset={preset} seed={seed} activeCell={cell} activeRow={currentRow} sweepStartAt={sweepStartAt}
            interactive={!['recording', 'saving', 'starting', 'failed'].includes(phase)}
            onSelectCell={index => { setCell(index); setCurrentRow(Math.floor(index / preset.cols)); setSweepStartAt(''); setPhase('idle'); }}
            onPlayRow={index => { setCurrentRow(index); setCell(index * preset.cols); setSweepStartAt(new Date().toISOString()); setPhase('idle'); }} />
          <FluencyInkCanvas ref={inkRef} active={phase === 'recording'} />
        </div>

        {recordings[currentRow]?.audio_url && phase !== 'recording' && (
          <div className="max-w-4xl mx-auto mt-3 flex items-center gap-3 text-sm text-gray-600">
            <span className="font-bold">Your row:</span>
            <audio src={recordings[currentRow].audio_url} controls className="h-8" />
            <span className="text-xs text-gray-400">{Math.round((recordings[currentRow].duration_ms || 0) / 1000)}s</span>
          </div>
        )}

        {loadErr && <p className="max-w-4xl mx-auto mt-3 text-sm text-red-500">{loadErr}</p>}
        {phase === 'failed' && recorder.audioUrl && <audio className="mx-auto mt-2" src={recorder.audioUrl} controls />}
      </div>

      <div className="flex items-center justify-center gap-3 p-4 bg-white border-t">
        {phase === 'starting' && <span role="status">Starting microphone…</span>}
        {phase === 'failed' && <>
          <button onClick={saveRecording} className="rounded-xl bg-indigo-600 p-3 font-bold text-white">Retry saving recording</button>
          <button onClick={() => { if (window.confirm('Discard the unsaved recording and record this row again?')) void handleStart(); }}
            className="rounded-xl border p-3 font-bold">Discard &amp; record again</button>
        </>}
        {(phase === 'idle' || phase === 'recorded') && !rowDone && (
          <button onClick={handleStart} className="px-6 py-3 rounded-2xl bg-indigo-500 text-white font-black text-lg shadow hover:bg-indigo-600 flex items-center gap-2">
            <Mic className="w-5 h-5" /> Record row {currentRow + 1}
          </button>
        )}
        {phase === 'recording' && (
          <button onClick={handleStop} className="px-6 py-3 rounded-2xl bg-red-500 text-white font-black text-lg shadow hover:bg-red-600 flex items-center gap-2">
            <Square className="w-5 h-5" /> Stop
          </button>
        )}
        {phase === 'saving' && (
          <span className="px-6 py-3 text-indigo-600 font-bold flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Saving…</span>
        )}
        {rowDone && (phase === 'recorded' || phase === 'idle') && (
          <>
            {currentRow < rows.length - 1 ? (
              <button onClick={handleNext} className="px-6 py-3 rounded-2xl bg-green-500 text-white font-black text-lg shadow hover:bg-green-600 flex items-center gap-2">
                <ArrowRight className="w-5 h-5" /> Next row
              </button>
            ) : (
              <span className="px-6 py-3 rounded-2xl bg-green-100 text-green-700 font-black text-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> All rows done!
              </span>
            )}
            <button onClick={handleRedo} className="px-4 py-3 rounded-2xl bg-gray-100 text-gray-600 font-bold flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> Redo
            </button>
          </>
        )}
      </div>

      {!['recording', 'saving', 'starting', 'failed'].includes(phase) && <StepDoneBar onDone={onComplete} />}
    </div>
  );
}