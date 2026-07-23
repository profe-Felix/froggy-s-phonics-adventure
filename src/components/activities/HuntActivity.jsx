import { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import { buildHunt } from '@/lib/activities/hunt';
import { RefreshCw, Volume2, Mic, Send, CheckCircle2 } from 'lucide-react';

// "Caza en el texto" (student). Renders a passage as tappable ranges; each tap
// gets instant feedback (green = a correct target, red = a wrong tap). "Verificar"
// reveals any correct targets the student missed in amber and locks the round.
// Voice + the tap timeline are recorded for teacher replay, same as the other
// activities.
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export default function HuntActivity({ config, studentName }) {
  const items = useMemo(() => {
    const its = Array.isArray(config?.items) ? config.items : [];
    return its.map((it) => (typeof it === 'string' ? { text: it } : it)).filter((it) => it.text);
  }, [config]);

  const [order, setOrder] = useState([]);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState('ready');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [marks, setMarks] = useState({}); // index -> 'correct' | 'wrong' | 'missed'
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState({ found: 0, missed: 0 });

  const recorder = useAudioRecorder();
  const marksRef = useRef({});
  const tapsRef = useRef([]);
  const checkedRef = useRef(false);
  const phaseRef = useRef('ready');
  const pendingRef = useRef(false);

  const huntType = config?.huntType || 'phoneme';
  const hasItems = items.length > 0;
  const current = hasItems ? items[order[pos]] || items[0] : null;
  const hunt = useMemo(() => buildHunt(config, current?.text || ''), [config, current]);
  const segments = hunt.segments;
  const correctCount = hunt.correctCount;

  useEffect(() => {
    if (!items.length) return;
    setOrder(shuffle(items.map((_, i) => i)));
    setPos(0);
    resetRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // reset marks/taps/score when the target text or hunt type changes
  useEffect(() => {
    setMarks({}); marksRef.current = {};
    tapsRef.current = [];
    setChecked(false); checkedRef.current = false;
    setScore({ found: 0, missed: 0 });
  }, [huntType, config?.target, current?.text]);

  useEffect(() => {
    if (pendingRef.current && recorder.state === 'stopped') { pendingRef.current = false; doSubmit(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.state]);

  function resetRound() {
    setPhase('ready'); phaseRef.current = 'ready';
    setMarks({}); marksRef.current = {};
    tapsRef.current = [];
    setChecked(false); checkedRef.current = false;
    setScore({ found: 0, missed: 0 });
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

  function tap(seg) {
    if (phaseRef.current !== 'recording' || checkedRef.current) return;
    if (!seg || !seg.tap) return;
    if (marksRef.current[seg.index]) return;
    const correct = !!seg.correct;
    marksRef.current = { ...marksRef.current, [seg.index]: correct ? 'correct' : 'wrong' };
    setMarks(marksRef.current);
    tapsRef.current.push({ index: seg.index, t: recT(), correct });
    if (correct) setScore((s) => ({ ...s, found: s.found + 1 }));
  }

  function verificar() {
    if (phaseRef.current !== 'recording' || checkedRef.current) return;
    let missed = 0;
    const m = { ...marksRef.current };
    for (const seg of segments) {
      if (seg.tap && seg.correct && !m[seg.index]) { m[seg.index] = 'missed'; missed++; }
    }
    marksRef.current = m; setMarks(m);
    setChecked(true); checkedRef.current = true;
    setScore((s) => ({ ...s, missed }));
  }

  function enviar() {
    if (phaseRef.current !== 'recording' || saving) return;
    pendingRef.current = true;
    recorder.stopRecording();
  }

  async function doSubmit() {
    setSaving(true); setErr(null);
    try {
      let audioUrl = '';
      const blob = recorder.getBlob();
      if (blob) {
        const f = new File([blob], `hunt-${Date.now()}.webm`, { type: blob.type });
        const up = await base44.integrations.Core.UploadFile({ file: f });
        audioUrl = up?.file_url || '';
      }
      const missedIdx = segments.filter((s) => s.tap && s.correct && !marksRef.current[s.index]).map((s) => s.index);
      await base44.entities.ActivityResponse.create({
        activity_mode: 'text_hunt',
        student_name: studentName || 'Estudiante',
        class_name: '',
        item_text: current.text,
        item_index: order[pos],
        tile_count: correctCount,
        placed_count: score.found,
        correct_count: correctCount,
        is_correct: score.found === correctCount,
        placements_data: JSON.stringify({
          huntType,
          target: config?.target || '',
          segments: segments.map((s) => ({ text: s.text, tap: s.tap, index: s.index, correct: s.correct })),
          taps: tapsRef.current,
          missed: missedIdx,
          correctCount,
          foundCount: score.found,
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

  function next() {
    const np = (pos + 1) % items.length;
    setPos(np);
    resetRound();
  }

  function speak() {
    try {
      const u = new SpeechSynthesisUtterance(current.text);
      u.lang = 'es-ES'; u.rate = 0.85;
      window.speechSynthesis?.speak(u);
    } catch { /* best-effort */ }
  }

  if (!hasItems) return <div className="p-6 text-slate-500 text-center">Añade un texto para cazar.</div>;

  const statusClass = (st) => st === 'correct' ? 'bg-green-200 text-green-800'
    : st === 'wrong' ? 'bg-red-200 text-red-700'
    : st === 'missed' ? 'bg-amber-200 text-amber-800' : 'hover:bg-slate-100';

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="text-xs text-slate-400">Texto {pos + 1} / {items.length}</span>
        <span className="ml-auto font-semibold text-slate-600">
          Encontrados: <b className="text-green-600">{score.found}</b> / {correctCount}
          {checked && <span className="ml-2 text-amber-600">· Perdiste {score.missed}</span>}
        </span>
      </div>

      <div className="rounded-2xl bg-white border-2 border-slate-200 p-4 sm:p-6 shadow-sm">
        <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2">
          {hunt.typeDef.label}{hunt.typeDef.needsTarget ? ` · "${config?.target || ''}"` : ''}
        </div>
        <p className="text-xl sm:text-2xl font-bold text-slate-800 leading-relaxed flex flex-wrap">
          {segments.map((seg, i) => {
            if (!seg.tap) return <span key={i}>{seg.text}</span>;
            const st = marks[seg.index];
            if (seg.text === ' ') {
              return (
                <span
                  key={i}
                  onClick={() => tap(seg)}
                  className={`inline-block min-w-[0.6em] cursor-pointer rounded ${st ? 'border-2 ' + statusClass(st) : 'border-b-2 border-dashed border-slate-300 hover:bg-slate-200 active:bg-slate-300'}`}
                >&nbsp;</span>
              );
            }
            return (
              <span
                key={i}
                onClick={() => tap(seg)}
                className={`cursor-pointer rounded px-0.5 leading-relaxed border-b border-dotted border-slate-300 ${st ? statusClass(st) : 'hover:bg-slate-200 active:bg-slate-300'}`}
              >{seg.text}</span>
            );
          })}
        </p>
        <button onClick={speak} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-bold">
          <Volume2 className="w-4 h-4" /> Escuchar
        </button>
      </div>

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
            <button onClick={verificar} className="px-4 py-2 rounded-lg bg-amber-500 text-white font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Verificar
            </button>
            <button onClick={enviar} disabled={saving} className="px-5 py-2 rounded-lg bg-green-600 text-white font-bold flex items-center gap-1.5 disabled:opacity-50">
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

      <div className="flex flex-wrap gap-3 text-xs text-slate-500 justify-center">
        <span><span className="inline-block w-3 h-3 rounded bg-green-200 align-middle mr-1" />correcto</span>
        <span><span className="inline-block w-3 h-3 rounded bg-red-200 align-middle mr-1" />error</span>
        <span><span className="inline-block w-3 h-3 rounded bg-amber-200 align-middle mr-1" />perdido</span>
      </div>
    </div>
  );
}