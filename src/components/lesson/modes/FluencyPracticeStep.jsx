import React, { useMemo, useRef, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import { getFluencyPreset } from '@/lib/presets';
import FluencyInkCanvas from './FluencyInkCanvas';
import StepDoneBar from './StepDoneBar';
import { Mic, Square, ArrowRight, RotateCcw, CheckCircle2, Loader2 } from 'lucide-react';

// Solo, assignable fluency practice. Each row is read start→stop while the app
// records voice + ink. Recordings are saved per row to a FluencyPracticeSession
// so the teacher can review how the student read.
export default function FluencyPracticeStep({ onComplete, presetId, studentNumber, className }) {
  const preset = presetId ? getFluencyPreset(presetId) : null;
  const rows = useMemo(() => {
    if (!preset) return [];
    const cols = preset.cols || 8;
    const items = preset.content || [];
    const out = [];
    for (let i = 0; i < items.length; i += cols) out.push(items.slice(i, i + cols));
    return out;
  }, [preset]);

  const [currentRow, setCurrentRow] = useState(0);
  const [recordings, setRecordings] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | recording | saving | recorded
  const [loadErr, setLoadErr] = useState('');
  const recorder = useAudioRecorder();
  const inkRef = useRef(null);
  const sessionIdRef = useRef(null);
  const uploadingRef = useRef(false);

  // Load any in-progress session so the student can resume.
  useEffect(() => {
    if (!studentNumber || !className || !presetId) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await base44.entities.FluencyPracticeSession.filter(
          { student_number: studentNumber, class_name: className, preset_id: presetId },
          '-created_date', 1
        );
        if (cancelled) return;
        if (existing && existing.length) {
          sessionIdRef.current = existing[0].id;
          try {
            const parsed = JSON.parse(existing[0].rows_data || '[]');
            setRecordings(parsed);
            setCurrentRow(Math.min(parsed.length, rows.length));
          } catch { /* ignore */ }
        }
      } catch (e) { setLoadErr('Could not load your progress.'); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentNumber, className, presetId]);

  const persist = async (newRecs) => {
    if (!studentNumber || !className || !presetId) return;
    const payload = {
      student_number: studentNumber,
      class_name: className,
      preset_id: presetId,
      preset_label: preset?.title || '',
      rows_data: JSON.stringify(newRecs),
      last_active: new Date().toISOString(),
    };
    if (sessionIdRef.current) {
      await base44.entities.FluencyPracticeSession.update(sessionIdRef.current, payload);
    } else {
      const created = await base44.entities.FluencyPracticeSession.create(payload);
      sessionIdRef.current = created.id;
    }
  };

  // When recording stops, upload the audio + ink and save the row.
  useEffect(() => {
    if (recorder.state !== 'stopped' || uploadingRef.current) return;
    const blob = recorder.getBlob();
    if (!blob) return;
    uploadingRef.current = true;
    setPhase('saving');
    (async () => {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: blob });
        const rec = {
          row: currentRow,
          audio_url: file_url,
          strokes_data: JSON.stringify(inkRef.current?.getStrokes() || []),
          duration_ms: recorder.durationMs,
          recorded_at: new Date().toISOString(),
        };
        const newRecs = [...recordings];
        newRecs[currentRow] = rec;
        setRecordings(newRecs);
        await persist(newRecs);
        setPhase('recorded');
        recorder.reset();
      } catch (e) {
        setLoadErr('Could not save your recording.');
        setPhase('recorded');
      } finally {
        uploadingRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.state]);

  const handleStart = async () => {
    setLoadErr('');
    inkRef.current?.clear();
    await recorder.startRecording();
    setPhase('recording');
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
    inkRef.current?.clear();
    setPhase('idle');
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
          <p className="text-xs text-gray-500">Row {currentRow + 1} of {rows.length} · read aloud, start → stop</p>
        </div>
        {recordings.filter(Boolean).length > 0 && (
          <span className="text-xs font-bold text-green-600 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> {recordings.filter(Boolean).length}/{rows.length} done
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div className="relative max-w-4xl mx-auto bg-white rounded-2xl shadow p-6 min-h-[260px]">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.min(row.length, 6)}, 1fr)` }}
          >
            {row.map((w, i) => (
              <div key={i} className="flex items-center justify-center rounded-xl border-2 border-indigo-100 bg-indigo-50/40 py-4"
                style={{ fontSize: 'clamp(1.6rem, 3vw, 2.8rem)', fontWeight: 800, color: '#3730a3' }}>
                {w}
              </div>
            ))}
          </div>
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
      </div>

      <div className="flex items-center justify-center gap-3 p-4 bg-white border-t">
        {(phase === 'idle' || phase === 'recorded') && !rowDone && (
          <button onClick={handleStart} className="px-6 py-3 rounded-2xl bg-indigo-500 text-white font-black text-lg shadow hover:bg-indigo-600 flex items-center gap-2">
            <Mic className="w-5 h-5" /> Start row
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
        {rowDone && phase === 'recorded' && (
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

      <StepDoneBar onDone={onComplete} />
    </div>
  );
}