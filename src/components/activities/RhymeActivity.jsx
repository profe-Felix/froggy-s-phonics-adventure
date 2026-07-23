import { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import { syllabifyEs } from '@/lib/lettersort/phonics';
import { RefreshCw, Volume2, Mic, Send, Check, X } from 'lucide-react';

// "Identificar rimas" (student). Two words are shown; each has a speaker (TTS
// the whole word) and a syllable slider — dragging it speaks that syllable and
// highlights it, so the student can repeat each word and compare the endings.
// The last syllable is highlighted by default to draw attention to the ending.
// The student then taps ✓ (sí rima) or ✗ (no rima); we know the answer, so the
// decision gets instant feedback. Voice + the choice are recorded for replay.
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function speak(text) {
  try {
    window.speechSynthesis?.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES'; u.rate = 0.8;
    window.speechSynthesis?.speak(u);
  } catch { /* best-effort */ }
}

function WordCard({ word }) {
  const syls = useMemo(() => syllabifyEs(word), [word]);
  const [focus, setFocus] = useState(0);
  useEffect(() => { setFocus(Math.max(0, syls.length - 1)); }, [word, syls.length]);
  return (
    <div className="flex-1 min-w-[150px] rounded-2xl bg-white border-2 border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => speak(word)}
          className="shrink-0 p-2.5 rounded-xl bg-indigo-100 text-indigo-700 active:bg-indigo-200"
          aria-label={`Escuchar ${word}`}
        >
          <Volume2 className="w-5 h-5" />
        </button>
        <span className="text-2xl sm:text-3xl font-bold text-slate-800 flex flex-wrap leading-snug">
          {syls.map((s, i) => (
            <span key={i} className={`px-1 rounded transition-colors ${i === focus ? 'bg-indigo-200 text-indigo-800' : ''}`}>{s}</span>
          ))}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, syls.length - 1)}
        value={focus}
        onChange={(e) => { const v = +e.target.value; setFocus(v); speak(syls[v]); }}
        className="w-full touch-none"
      />
      <div className="text-center text-xs text-slate-400 mt-1">Desliza para escuchar cada sílaba</div>
    </div>
  );
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
  const [choice, setChoice] = useState(null); // true / false

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
        <WordCard word={pair.word1} />
        <WordCard word={pair.word2} />
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