import { useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Check, X, RefreshCw, Volume2, ImageOff, ArrowDownToLine } from 'lucide-react';
import { useSortSensors } from '@/hooks/useSortSensors';
import { playWordAudio } from '@/lib/lettersort/audio';

const AUDIO_OPTS = { bucket: 'audio', prefix: 'es/words' };
const BAD_MS = 600;
const NEXT_MS = 1100;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const KIND_HINT = {
  soundmatch: 'Escucha la palabra. Arrastra el dibujo que empieza con el mismo sonido.',
  syllableposition: 'Escucha. ¿El sonido está al principio o al final? Arrastra cada dibujo a su fila.',
  alliteration: 'Arrastra a la caja los 3 dibujos que empiezan con el mismo sonido.',
};

// Picture-only listening activities (soundmatch, syllableposition, alliteration).
// Each drop is evaluated (and recorded) exactly once. Correct cards lock in the
// slot; wrong cards flash and return to where they came from.
export default function ListeningSortView({ round, onAttempt, onRoundComplete }) {
  const sensors = useSortSensors();
  const kind = round.kind;
  const perRow = kind === 'soundmatch';
  const [order, setOrder] = useState([]);
  const [placed, setPlaced] = useState({}); // cardId -> rowId (locked correct)
  const [bad, setBad] = useState(null); // cardId flashing wrong
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [selected, setSelected] = useState(null);
  const [done, setDone] = useState(false);

  const timers = useRef([]);
  const busy = useRef(new Set()); // cardIds currently being evaluated / ejected
  const placedRef = useRef({});
  const doneRef = useRef(false);
  const attemptsRef = useRef([]);
  const scoreRef = useRef({ correct: 0, wrong: 0 });
  const cbRef = useRef({ onAttempt, onRoundComplete });
  cbRef.current = { onAttempt, onRoundComplete };

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); };

  const cardById = useMemo(() => Object.fromEntries((round.cards || []).map((c) => [c.id, c])), [round]);
  const rowById = useMemo(() => Object.fromEntries((round.rows || []).map((r) => [r.id, r])), [round]);
  const rowCapacity = (row) => Math.min(row.maxPerSlot || 1, (row.accepts || []).length || (row.maxPerSlot || 1));
  const totalNeeded = useMemo(() => kind === 'syllableposition' ? round.cards.length
    : (round.rows || []).reduce((s, r) => s + rowCapacity(r), 0), [round, kind]);

  function reset() {
    clearTimers();
    busy.current = new Set();
    placedRef.current = {};
    doneRef.current = false;
    attemptsRef.current = [];
    scoreRef.current = { correct: 0, wrong: 0 };
    setOrder(shuffle((round.cards || []).map((c) => c.id)));
    setPlaced({}); setBad(null); setSelected(null); setDone(false);
    setScore({ correct: 0, wrong: 0 });
  }

  useEffect(() => { reset(); return clearTimers; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [round]);

  function countInRow(rowId) {
    return Object.values(placedRef.current).filter((r) => r === rowId).length;
  }

  function attempt(cardId, rowId) {
    if (doneRef.current) return;
    const card = cardById[cardId];
    const row = rowById[rowId];
    if (!card || !row) return;
    if (placedRef.current[cardId] || busy.current.has(cardId)) return;
    if (perRow && card.rowId && card.rowId !== rowId) return; // choices belong to their own row
    if (countInRow(rowId) >= rowCapacity(row)) return; // full slot: ignore, not an attempt
    const correct = (row.accepts || []).includes(cardId);
    const rec = { word: card.coreRaw, target: round.target ?? row.prompt ?? null, row: row.prompt ?? rowId, rowId, correct, problemIndex: round.problemIndex ?? 0, at: new Date().toISOString() };
    attemptsRef.current.push(rec);
    cbRef.current.onAttempt?.(rec);
    setSelected(null);
    if (correct) {
      placedRef.current = { ...placedRef.current, [cardId]: rowId };
      setPlaced(placedRef.current);
      scoreRef.current = { ...scoreRef.current, correct: scoreRef.current.correct + 1 };
      setScore(scoreRef.current);
      if (Object.keys(placedRef.current).length >= totalNeeded) finish();
    } else {
      busy.current.add(cardId);
      scoreRef.current = { ...scoreRef.current, wrong: scoreRef.current.wrong + 1 };
      setScore(scoreRef.current);
      setBad(cardId);
      later(() => { busy.current.delete(cardId); setBad((b) => (b === cardId ? null : b)); }, BAD_MS);
    }
  }

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    const result = { mistakes: scoreRef.current.wrong, correct: scoreRef.current.correct, wrong: scoreRef.current.wrong, attempts: [...attemptsRef.current], problemIndex: round.problemIndex ?? 0 };
    later(() => cbRef.current.onRoundComplete?.(result), kind === 'alliteration' ? NEXT_MS : 300);
  }

  function onDragEnd(res) {
    const { destination, draggableId } = res;
    if (!destination || !destination.droppableId.startsWith('slot:')) return;
    attempt(draggableId, destination.droppableId.slice(5));
  }

  function tapCard(card) {
    playWordAudio(card.coreRaw, AUDIO_OPTS);
    if (placed[card.id] || done) return;
    setSelected((s) => (s === card.id ? null : card.id));
  }

  function tapSlot(rowId) {
    if (selected) attempt(selected, rowId);
  }

  const unplaced = (rowId) => order.filter((id) => !placed[id] && (!perRow || cardById[id]?.rowId === rowId)).map((id) => cardById[id]).filter(Boolean);
  const inRow = (rowId) => order.filter((id) => placed[id] === rowId).map((id) => cardById[id]);

  const renderDraggable = (card, i) => (
    <Draggable key={card.id} draggableId={card.id} index={i} isDragDisabled={!!placed[card.id] || done || bad === card.id}>
      {(p, snap) => (
        <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="w-24 sm:w-28 shrink-0">
          <PictureTile card={card} selected={selected === card.id} bad={bad === card.id} dragging={snap.isDragging} onTap={() => tapCard(card)} />
        </div>
      )}
    </Draggable>
  );

  const renderSlot = (row, big) => {
    const cards = inRow(row.id);
    const cap = rowCapacity(row);
    return (
      <Droppable droppableId={`slot:${row.id}`} direction="horizontal" isDropDisabled={done || cards.length >= cap}>
        {(prov, snap) => (
          <div
            ref={prov.innerRef}
            {...prov.droppableProps}
            onClick={() => tapSlot(row.id)}
            role="button"
            tabIndex={0}
            aria-label={`Destino ${row.prompt || ''}`}
            data-testid={`slot-${row.id}`}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapSlot(row.id); } }}
            className={`flex flex-wrap gap-2 items-center flex-1 rounded-lg border-2 border-dashed p-2 transition-colors ${big ? 'min-h-[140px] justify-center' : 'min-h-[104px]'} ${snap.isDraggingOver ? 'bg-indigo-100 border-indigo-500' : selected ? 'bg-white border-indigo-400 cursor-pointer' : 'bg-white/70 border-indigo-300'}`}
          >
            {cards.map((card) => (
              <div key={card.id} className="w-24 sm:w-28 shrink-0">
                <PictureTile card={card} locked onTap={() => playWordAudio(card.coreRaw, AUDIO_OPTS)} />
              </div>
            ))}
            {Array.from({ length: Math.max(0, cap - cards.length) }).map((_, k) => (
              <div key={`e${k}`} className="w-24 sm:w-28 h-[104px] rounded-xl border-2 border-dotted border-indigo-200 flex items-center justify-center text-indigo-200 pointer-events-none">
                <ArrowDownToLine className="w-5 h-5" />
              </div>
            ))}
            <div className="hidden">{prov.placeholder}</div>
          </div>
        )}
      </Droppable>
    );
  };

  const prompt = (row) => (
    <button
      type="button"
      onClick={() => row.prompt && playWordAudio(row.prompt, AUDIO_OPTS)}
      className="relative flex flex-col items-center justify-center w-24 sm:w-32 shrink-0 rounded-lg bg-white border border-indigo-200 p-1 active:scale-95 transition-transform"
      aria-label={`Escuchar ${row.prompt || ''}`}
      data-testid={`prompt-${row.id}`}
    >
      {row.promptImg
        ? <img src={row.promptImg} alt="" className="object-contain h-20 sm:h-24 w-full" draggable={false} />
        : <ImageOff className="w-8 h-8 text-slate-300 my-6" />}
      <Volume2 className="absolute bottom-1 right-1 w-4 h-4 text-indigo-400" />
    </button>
  );

  const progress = round.totalProblems > 1 ? `Problema ${(round.problemIndex ?? 0) + 1}/${round.totalProblems}` : null;

  return (
    <DragDropContext sensors={sensors} enableDefaultSensors={false} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-3 p-3 max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-2 flex-wrap">
          {done && <button onClick={reset} data-testid="button-listening-reset" className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm flex items-center gap-1.5 shadow-sm"><RefreshCw className="w-4 h-4" /> Nuevo</button>}
          <span className="text-sm font-bold text-green-700 flex items-center gap-1" data-testid="text-correct"><Check className="w-4 h-4" />{score.correct}</span>
          <span className="text-sm font-bold text-red-600 flex items-center gap-1" data-testid="text-wrong"><X className="w-4 h-4" />{score.wrong}</span>
          {kind === 'alliteration' && <span className="font-bold text-indigo-900" data-testid="text-target-sound">Sonido /{round.target}/</span>}
          {progress && <span className="ml-auto text-xs font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-1">{progress}</span>}
        </div>
        <p className="text-xs text-slate-500">{KIND_HINT[kind]} Toca un dibujo para escucharlo; toca otra vez una caja para colocarlo.</p>

        {perRow ? (
          <div className="flex flex-col gap-2">
            {round.rows.map((row) => (
              <div key={row.id} className="flex items-stretch gap-2 sm:gap-3 p-2 rounded-xl bg-indigo-50/60 border border-indigo-200 flex-wrap sm:flex-nowrap">
                {prompt(row)}
                {renderSlot(row)}
                <Droppable droppableId={`rack:${row.id}`} direction="horizontal" isDropDisabled>
                  {(prov) => (
                    <div ref={prov.innerRef} {...prov.droppableProps} className="flex gap-2 items-center p-2 rounded-lg bg-slate-100 border border-slate-200 min-h-[104px]">
                      {unplaced(row.id).map(renderDraggable)}
                      {prov.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        ) : (
          <>
            <Droppable droppableId="rack" direction="horizontal" isDropDisabled>
              {(prov) => (
                <div ref={prov.innerRef} {...prov.droppableProps} className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 min-h-[124px]">
                  {unplaced(null).map(renderDraggable)}
                  {prov.placeholder}
                </div>
              )}
            </Droppable>
            <div className="flex flex-col gap-2">
              {round.rows.map((row) => (
                <div key={row.id} className="flex items-stretch gap-2 sm:gap-3 p-2 rounded-xl bg-indigo-50/60 border border-indigo-200">
                  {kind !== 'alliteration' && prompt(row)}
                  {renderSlot(row, kind === 'alliteration')}
                </div>
              ))}
            </div>
          </>
        )}

        {done && (
          <div role="status" className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-800 font-bold text-sm flex items-center gap-2">
            <Check className="w-5 h-5" />
            {kind === 'alliteration' && (round.problemIndex ?? 0) + 1 < (round.totalProblems || 1) ? '¡Muy bien! Siguiente…' : '¡Completo!'}
          </div>
        )}
      </div>
    </DragDropContext>
  );
}

// Picture-only tile: no word text, ever (even after correct).
function PictureTile({ card, locked, bad, selected, dragging, onTap }) {
  const [broken, setBroken] = useState(false);
  const cls =
    'relative select-none rounded-xl bg-white shadow-sm transition-all flex items-center justify-center p-1.5 h-[104px] cursor-grab active:cursor-grabbing border-2 ' +
    (locked ? 'border-green-400 ring-2 ring-green-200 ' : bad ? 'border-red-400 ring-2 ring-red-200 animate-pulse ' : selected ? 'border-indigo-500 ring-2 ring-indigo-200 ' : 'border-slate-200 ') +
    (dragging ? 'shadow-lg scale-105 ' : '');
  return (
    <div
      className={cls}
      onClick={(e) => { e.stopPropagation(); onTap?.(); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onTap?.(); } }}
      role="button"
      tabIndex={0}
      aria-label="Escuchar dibujo"
      aria-pressed={!!selected}
      data-testid={`card-${card.id}`}
    >
      {card.url && !broken
        ? <img src={card.url} alt="" onError={() => setBroken(true)} className="object-contain w-full h-full" draggable={false} />
        : <ImageOff className="w-8 h-8 text-slate-300" />}
      {locked && <Check className="absolute top-1 right-1 w-4 h-4 text-green-600" />}
    </div>
  );
}
