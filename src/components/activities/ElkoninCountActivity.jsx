import { useState, useEffect, useMemo, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { RefreshCw, Volume2, Mic, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import { buildActivity } from '@/lib/activities/engine';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Recordable Elkonin counting activity.
// Flow per item: hear it → "Listo" (starts voice recording + unlocks dragging)
// → drag one tile per unit (word or phoneme) into the Elkonin row → "Enviar"
// uploads the audio + placement timeline and saves an ActivityResponse the
// teacher can review. The number-tile version (CountingActivity) is kept for later.
export default function ElkoninCountActivity({ config, studentName }) {
  const activity = useMemo(() => buildActivity(config), [config]);
  const recorder = useAudioRecorder();
  const [order, setOrder] = useState([]);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState('ready'); // ready | recording | submitted
  const [row, setRow] = useState([]);          // placed tile ids (ordered)
  const [tray, setTray] = useState([]);        // remaining tile ids
  const [events, setEvents] = useState([]);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const pendingSubmitRef = useRef(false);

  const hasItems = activity.items.length > 0;
  const current = hasItems ? activity.items[order[pos]] || activity.items[0] : null;
  const { modeDef } = activity;
  const correct = current ? current.answer : 0;
  const unitWord = modeDef.what === 'palabras' ? 'palabra' : 'sonido';

  // (re)build when the activity changes
  useEffect(() => {
    if (!activity.items.length) return;
    setOrder(shuffle(activity.items.map((_, i) => i)));
    setPos(0);
    resetItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity]);

  // When the recorder finishes (state -> stopped) after "Enviar", upload + save.
  useEffect(() => {
    if (pendingSubmitRef.current && recorder.state === 'stopped') {
      pendingSubmitRef.current = false;
      doSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.state]);

  function resetItem() {
    setPhase('ready');
    setRow([]);
    setTray(Array.from({ length: activity.choices }, (_, i) => i));
    setEvents([]);
    setSubmitError(null);
    pendingSubmitRef.current = false;
    recorder.reset();
  }

  if (!hasItems) {
    return <div className="p-6 text-slate-500 text-center">Añade elementos para empezar.</div>;
  }

  function startReady() {
    setSubmitError(null);
    recorder
      .startRecording()
      .then(() => setPhase('recording'))
      .catch((e) => setSubmitError('No se pudo acceder al micrófono: ' + (e?.message || e)));
  }

  function onDragEnd(res) {
    const { source, destination } = res;
    if (!destination || phase !== 'recording') return;
    if (source.droppableId === destination.droppableId) return;
    const t0 = recorder.getRecordingStartTime() || Date.now();
    const t = Date.now() - t0;
    if (source.droppableId === 'tray' && destination.droppableId === 'row') {
      const tile = tray[source.index];
      setTray((prev) => prev.filter((_, i) => i !== source.index));
      setRow((prev) => {
        const n = [...prev];
        n.splice(destination.index, 0, tile);
        return n;
      });
      setEvents((ev) => [...ev, { t, type: 'place', tile, boxIndex: destination.index }]);
    } else if (source.droppableId === 'row' && destination.droppableId === 'tray') {
      const tile = row[source.index];
      setRow((prev) => prev.filter((_, i) => i !== source.index));
      setTray((prev) => {
        const n = [...prev];
        n.splice(destination.index, 0, tile);
        return n;
      });
      setEvents((ev) => [...ev, { t, type: 'remove', tile, boxIndex: source.index }]);
    }
  }

  function enviar() {
    if (phase !== 'recording' || saving) return;
    pendingSubmitRef.current = true;
    recorder.stopRecording();
  }

  async function doSubmit() {
    setSaving(true);
    setSubmitError(null);
    try {
      let audioUrl = '';
      const blob = recorder.getBlob();
      if (blob) {
        const file = new File([blob], `actividad-${Date.now()}.webm`, { type: blob.type });
        const up = await base44.integrations.Core.UploadFile({ file });
        audioUrl = up?.file_url || '';
      }
      await base44.entities.ActivityResponse.create({
        activity_mode: activity.mode,
        student_name: studentName || 'Estudiante',
        class_name: '',
        item_text: current.text,
        item_index: order[pos],
        placed_count: row.length,
        correct_count: correct,
        is_correct: row.length === correct,
        placements_data: JSON.stringify(events),
        audio_url: audioUrl,
        duration_ms: recorder.durationMs || 0,
        submitted_at: new Date().toISOString(),
        reviewed: false,
        teacher_note: '',
      });
      setPhase('submitted');
    } catch (e) {
      setSubmitError('Error al guardar: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  function next() {
    setPos((p) => (p + 1) % activity.items.length);
    resetItem();
  }

  function speak() {
    try {
      const u = new SpeechSynthesisUtterance(current.text);
      u.lang = 'es-ES';
      u.rate = 0.85;
      window.speechSynthesis?.speak(u);
    } catch { /* best-effort */ }
  }

  const dragDisabled = phase !== 'recording';

  return (
    <div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400">Elemento {pos + 1} / {activity.items.length}</span>
        <span className="ml-auto text-sm font-semibold text-slate-600">
          Fichas colocadas: <b className="text-indigo-600">{row.length}</b>
          {phase === 'submitted' && (
            <> · Correcto: <b className={row.length === correct ? 'text-green-600' : 'text-amber-600'}>{correct}</b></>
          )}
        </span>
      </div>

      {/* prompt */}
      <div className="rounded-2xl bg-white border-2 border-slate-200 p-6 text-center shadow-sm">
        <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2">{modeDef.in}</div>
        <div className="text-3xl font-bold text-slate-800 leading-snug">{current.text}</div>
        <button
          onClick={speak}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-bold"
        >
          <Volume2 className="w-4 h-4" /> Escuchar
        </button>
      </div>

      {/* status / actions */}
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
            <button
              onClick={enviar}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-green-600 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> {saving ? 'Guardando…' : 'Enviar'}
            </button>
          </>
        )}
        {phase === 'submitted' && (
          <>
            <span className={`font-bold text-lg ${row.length === correct ? 'text-green-600' : 'text-amber-600'}`}>
              {row.length === correct ? '¡Correcto! 🎉' : `Colocaste ${row.length} · era ${correct}`}
            </span>
            <button onClick={next} className="px-5 py-2 rounded-lg bg-indigo-600 text-white font-bold">Siguiente</button>
          </>
        )}
      </div>

      {submitError && <div className="text-center text-sm text-red-600">{submitError}</div>}

      {/* Elkonin row + tile tray */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div>
          <div className="font-bold text-slate-700 text-sm mb-1">
            Cajas Elkonin — arrastra una ficha por {unitWord}
          </div>
          <Droppable droppableId="row" direction="horizontal">
            {(prov) => (
              <div
                ref={prov.innerRef}
                {...prov.droppableProps}
                className="flex flex-wrap gap-2 p-3 rounded-xl bg-indigo-50/70 border-2 border-indigo-200 border-dashed min-h-[110px]"
              >
                {row.map((tile, i) => (
                  <Draggable key={`tile-${tile}`} draggableId={`tile-${tile}`} index={i} isDragDisabled={dragDisabled}>
                    {(p) => (
                      <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="w-14 h-14">
                        <Tile placed />
                      </div>
                    )}
                  </Draggable>
                ))}
                {row.length === 0 && !dragDisabled && (
                  <div className="text-slate-400 text-sm self-center">Arrastra las fichas aquí ↑</div>
                )}
                {prov.placeholder}
              </div>
            )}
          </Droppable>
        </div>

        <div>
          <div className="font-bold text-slate-700 text-sm mb-1">Fichas</div>
          <Droppable droppableId="tray" direction="horizontal">
            {(prov) => (
              <div
                ref={prov.innerRef}
                {...prov.droppableProps}
                className="flex flex-wrap gap-2 p-3 rounded-xl bg-white border-2 border-dashed border-slate-300 min-h-[80px]"
              >
                {tray.map((tile, i) => (
                  <Draggable key={`tile-${tile}`} draggableId={`tile-${tile}`} index={i} isDragDisabled={dragDisabled}>
                    {(p) => (
                      <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="w-14 h-14">
                        <Tile dimmed={dragDisabled} />
                      </div>
                    )}
                  </Draggable>
                ))}
                {tray.length === 0 && <div className="text-slate-400 text-sm self-center">Todas colocadas</div>}
                {prov.placeholder}
              </div>
            )}
          </Droppable>
        </div>
      </DragDropContext>

      <div className="flex justify-center">
        <button
          onClick={resetItem}
          className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm flex items-center gap-1.5"
        >
          <RefreshCw className="w-4 h-4" /> Reiniciar
        </button>
      </div>
    </div>
  );
}

function Tile({ placed, dimmed }) {
  return (
    <div
      className={`w-full h-full rounded-xl border-2 flex items-center justify-center shadow-sm ${
        placed
          ? 'border-indigo-400 bg-indigo-500 text-white'
          : dimmed
          ? 'border-slate-200 bg-slate-100 text-slate-300'
          : 'border-indigo-300 bg-indigo-400 text-white'
      }`}
    >
      <span className="text-2xl leading-none">●</span>
    </div>
  );
}