import { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import RhymeWordSlider from '@/components/activities/RhymeWordSlider';
import { RefreshCw, Mic, Send, Check, X } from 'lucide-react';

// "Identificar rimas" (student). Flow: listen to each word (speaker) → slide and
// say each word (the slider; the word itself is hidden) → decide ✓/✗ if they
// rhyme. Voice is recorded for teacher replay.
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export default function RhymeActivity({ config, studentName }) {
  const items = useMemo(() => {
    const its = Array.isArray(config?.items) ? config.items : [];
    return its.filter((it) => it.word1 && it.word2);
  }, [config]);

  const [order, setOrder] = useState([]);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState('ready');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [choice, setChoice] = useState(null);

  const recorder = useAudioRecorder();
  const choiceRef = useRef(null);
  const decideTRef = useRef(0);
  const phaseRef = useRef('ready');
  const pendingRef = useRef(false);

  const hasItems = items.length > 0;
  const pair = hasItems ? items[order[pos]] || items[0] : null;

  useEffect(() => {
    if (!items.length) return;
    setOrder(shuffle(items.map((_, i) => i)));
    setPos(0);
    resetRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => { setChoice(null); choiceRef.current = null; }, [pair]);

  useEffect(() => {
    if (pendingRef.current && recorder.state === 'stopped') { pendingRef.current = false; doSubmit(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.state]);

  function resetRound() {
    setPhase('ready'); phaseRef.current = 'ready';
    setChoice(null); choiceRef.current = null; decideTRef.current = 0;
    setErr(null); pendingRef.current = false;
    recorder.reset();
  }
  function recT() { return Date.now() - (recorder.getRecordingStartTime() || Date.now()); }
  function startReady() {
    setErr(null);
    recorder.startRecording()
      .then(() => { setPhase('recording'); phaseRef.current = 'recording'; })
      .catch((e) => setErr('No se pudo acceder al micrófono: ' + (e?.message || e)));
  }
  function decide(c) {
    if (phaseRef.current !== 'recording') return;
    setChoice(c); choiceRef.current = c; decideTRef.current = recT();
  }
  function enviar() {
    if (phaseRef.current !== 'recording' || saving || choiceRef.current === null) return;
    pendingRef.current = true;
    recorder.stopRecording();
  }
  async function doSubmit() {
    setSaving(true); setErr(null);
    try {
      let audioUrl = '';
      const blob = recorder.getBlob();
      if (blob) {
        const f = new File([blob], `rhyme-${Date.now()}.webm`, { type: blob.type });
        const up = await base44.integrations.Core.UploadFile({ file: f });
        audioUrl = up?.file_url || '';
      }
      const c = choiceRef.current;
      const correct = c === pair.answer;
      await base44.entities.ActivityResponse.create({
        activity_mode: 'rhyme_identification',
        student_name: studentName || 'Estudiante',
        class_name: '',
        item_text: `${pair.word1} / ${pair.word2}`,
        item_index: order[pos],
        tile_count: 1,
        placed_count: correct ? 1 : 0,
        correct_count: 1,
        is_correct: correct,
        placements_data: JSON.stringify({
          word1: pair.word1, word2: pair.word2, answer: pair.answer, choice: c, correct, decideT: decideTRef.current,
        }),
        audio_url: audioUrl,
        duration_ms: recorder.durationMs || 0,
        submitted_at: new Date().toISOString(),
        reviewed: false,
        teacher_note: '',
      });
      setPhase('submitted'); phaseRef.current = 'submitted';
    } catch (e) {
      setErr('Error al guardar: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }
  function next() { const np = (pos + 1) % items.length; setPos(np); resetRound(); }

  if (!hasItems) return <div className="p-6 text-slate-500 text-center">Añade pares de palabras (palabra1, palabra2, sí/no).</div>;

  const decided = choice !== null;
  const correct = decided && choice === pair.answer;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="text-xs text-slate-400">Par {pos + 1} / {items.length}</span>
        <span className="ml-auto font-semibold text-slate-600">¿Riman estas dos palabras?</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <RhymeWordSlider word={pair.word1} label="Palabra 1" />
        <RhymeWordSlider word={pair.word2} label="Palabra 2" />
      </div>

      <div className="text-center text-xs text-slate-500 leading-relaxed">
        1) Escucha cada palabra &nbsp;·&nbsp; 2) Desliza y di cada palabra &nbsp;·&nbsp; 3) ¿Riman?
      </div>

      {phase === 'recording' && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={() => decide(true)}
            className={`px-6 py-3 rounded-xl font-bold text-lg flex items-center gap-2 transition-colors ${decided ? (choice ? (correct ? 'bg-green-600 text-white' : 'bg-red-600 text-white') : 'bg-slate-100 text-slate-400') : 'bg-green-100 text-green-700 active:bg-green-200'}`}
          >
            <Check className="w-6 h-6" /> Sí
          </button>
          <button
            onClick={() => decide(false)}
            className={`px-6 py-3 rounded-xl font-bold text-lg flex items-center gap-2 transition-colors ${decided ? (!choice ? (correct ? 'bg-green-600 text-white' : 'bg-red-600 text-white') : 'bg-slate-100 text-slate-400') : 'bg-red-100 text-red-700 active:bg-red-200'}`}
          >
            <X className="w-6 h-6" /> No
          </button>
        </div>
      )}

      {decided && phase === 'recording' && (
        <div className={`text-center font-bold text-lg ${correct ? 'text-green-600' : 'text-red-600'}`}>
          {correct ? '¡Correcto! 🎉' : `No — ${pair.answer ? 'sí riman' : 'no riman'}`}
        </div>
      )}

      <div className="flex items-center justify-center gap-3 min-h-[44px] flex-wrap">
        {phase === 'ready' && (
          <button onClick={startReady} className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-bold flex items-center gap-1.5">
            <Mic className="w-4 h-4" /> Listo
          </button>
        )}
        {phase === 'recording' && (
          <>
            <span className="inline-flex items-center gap-1.5 text-red-600 font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
              Grabando {recorder.formatTime(recorder.elapsed)}
            </span>
            <button onClick={enviar} disabled={saving || !decided} className="px-5 py-2 rounded-lg bg-green-600 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
              <Send className="w-4 h-4" /> {saving ? 'Guardando…' : 'Enviar'}
            </button>
          </>
        )}
        {phase === 'submitted' && (
          <>
            <span className="font-bold text-lg text-green-600">¡Enviado! 🎉</span>
            <button onClick={next} className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-bold">Siguiente</button>
          </>
        )}
      </div>

      {err && <div className="text-center text-sm text-red-600">{err}</div>}
      <div className="flex justify-center">
        <button onClick={resetRound} className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm flex items-center gap-1.5">
          <RefreshCw className="w-4 h-4" /> Reiniciar
        </button>
      </div>
    </div>
  );
}