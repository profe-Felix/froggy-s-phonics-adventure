import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Check, RefreshCw } from 'lucide-react';
import SortCard from './SortCard';
import { useSortSensors } from '@/hooks/useSortSensors';
import { classifyCard } from '@/lib/lettersort/rounds';
import { playWordAudio, preloadAudio } from '@/lib/lettersort/audio';

const AUDIO_OPTS = { bucket: 'audio', prefix: 'es/words' };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Column-group view: a rack of cards + N drop columns. Drag a card into a
// column, hit "Verificar" to check; correct cards lock, wrong ones bounce back.
export default function ColumnsView({ config, round, onNewRound, onRoundComplete }) {
  const sensors = useSortSensors();
  const [rack, setRack] = useState([]);
  const [colCards, setColCards] = useState({});
  const [locked, setLocked] = useState(new Set());
  const [bad, setBad] = useState(new Set());
  const [score, setScore] = useState({ correct: 0, wrong: 0 });

  // (re)build when a new round is produced
  useEffect(() => {
    if (!round) return;
    setRack(shuffle(round.cards));
    const fresh = {};
    round.columns.forEach((c) => { fresh[c.key] = []; });
    setColCards(fresh);
    setLocked(new Set());
    setBad(new Set());
    setScore({ correct: 0, wrong: 0 });
    preloadAudio(round.cards.map((c) => c.coreRaw), AUDIO_OPTS);
  }, [round]);

  // Auto-verify when all cards have been placed into columns, so the round
  // completes without requiring the student to tap "Verificar" — this ensures
  // onRoundComplete fires (and coins are awarded) before they tap "Done".
  useEffect(() => {
    if (!round) return;
    const placedCount = Object.values(colCards).flat().length;
    if (rack.length === 0 && placedCount > 0 && locked.size < round.cards.length) {
      verify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rack.length]);

  if (!round) return <div className="p-6 text-slate-500">Configuración no válida.</div>;

  function removeCardFrom(container, id) { return container.filter((c) => c.id !== id); }
  function addCardTo(container, card, index) {
    const next = [...container];
    if (index == null || index > next.length) next.push(card); else next.splice(index, 0, card);
    return next;
  }

  function onDragEnd(res) {
    const { source, destination } = res;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const card = source.droppableId === 'rack'
      ? rack[source.index]
      : colCards[source.droppableId][source.index];
    if (locked.has(card.id)) return;

    if (source.droppableId === 'rack') {
      setRack((prev) => removeCardFrom(prev, card.id));
    } else {
      setColCards((prev) => ({ ...prev, [source.droppableId]: removeCardFrom(prev[source.droppableId], card.id) }));
    }
    if (destination.droppableId === 'rack') {
      setRack((prev) => addCardTo(prev, card, destination.index));
    } else {
      setColCards((prev) => ({ ...prev, [destination.droppableId]: addCardTo(prev[destination.droppableId], card, destination.index) }));
    }
  }

  function verify() {
    let correct = 0, wrong = 0;
    const newLocked = new Set(locked);
    const toEject = []; // {colKey, card}
    for (const col of round.columns) {
      for (const card of colCards[col.key] || []) {
        if (newLocked.has(card.id)) { correct++; continue; }
        if (classifyCard(card, col)) {
          newLocked.add(card.id); correct++;
        } else {
          wrong++; toEject.push({ colKey: col.key, card });
        }
      }
    }
    setLocked(newLocked);
    setScore((s) => ({ correct: s.correct + correct, wrong: s.wrong + wrong }));
    // flash bad, then bounce back to rack
    if (toEject.length) {
      const badIds = new Set(toEject.map((e) => e.card.id));
      setBad((b) => new Set([...b, ...badIds]));
      setTimeout(() => {
        setColCards((prev) => {
          const next = { ...prev };
          toEject.forEach((e) => { next[e.colKey] = removeCardFrom(next[e.colKey] || [], e.card.id); });
          return next;
        });
        setRack((prev) => [...prev, ...toEject.map((e) => e.card)]);
        setBad((b) => { const n = new Set(b); toEject.forEach((e) => n.delete(e.card.id)); return n; });
      }, 350);
    }
    // celebrate when every card is locked
    if (toEject.length === 0 && newLocked.size === round.cards.length) {
      celebrate();
      onRoundComplete?.({ mistakes: score.wrong + wrong });
    }
  }

  function newRound() {
    // For "letra inicial al azar" (randinit), Nuevo rebuilds the round so a new
    // random initial-letter category is chosen. The parent swaps in a new
    // `round`, which the effect below re-initializes from. Other modes keep the
    // existing behavior (reshuffle the current cards).
    if (config.mode === 'randinit' && onNewRound) { onNewRound(); return; }
    setRack(shuffle(round.cards));
    const fresh = {};
    round.columns.forEach((c) => { fresh[c.key] = []; });
    setColCards(fresh);
    setLocked(new Set());
    setBad(new Set());
    setScore({ correct: 0, wrong: 0 });
  }

  const allPlaced = Object.values(colCards).flat().length + rack.length === round.cards.length;
  const nothingPlaced = Object.values(colCards).every((arr) => arr.length === 0);
  // is/not pair (randinit or single-letter mode): one "contains /L/" column +
  // one "does not contain /L/" column. Detected by a `not-` sibling key.
  const isNotPair = round.columns.length === 2 && round.columns.some((c) => c.key.startsWith('not-'));
  const targetLetter = isNotPair ? (round.columns.find((c) => !c.key.startsWith('not-'))?.key || '') : '';

  return (
    <DragDropContext sensors={sensors} enableDefaultSensors={false} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-3 p-3">
        {/* toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={verify}
            disabled={nothingPlaced}
            className="px-4 py-2 rounded-lg bg-green-600 text-white font-bold text-sm flex items-center gap-1.5 disabled:opacity-40 shadow-sm"
          >
            <Check className="w-4 h-4" /> Verificar
          </button>
          <button onClick={newRound} className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm flex items-center gap-1.5 shadow-sm">
            <RefreshCw className="w-4 h-4" /> Nuevo
          </button>
          <span className="text-sm font-semibold text-slate-600 ml-2">
            ✅ {score.correct} · ❌ {score.wrong}
          </span>
        </div>

        {/* columns */}
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${round.columns.length}, minmax(140px, 1fr))` }}>
          {round.columns.map((col) => (
            <div key={col.key} className="flex flex-col">
              <ColumnHeader col={col} config={config} isNotPair={isNotPair} targetLetter={targetLetter} />
              <Droppable droppableId={col.key} direction="horizontal">
                {(prov) => (
                  <div
                    ref={prov.innerRef}
                    {...prov.droppableProps}
                    className="flex flex-wrap gap-2 content-start p-2 rounded-xl bg-indigo-50/60 border-2 border-indigo-200 border-dashed min-h-[160px] flex-1"
                  >
                    {(colCards[col.key] || []).map((card, i) => (
                      <Draggable key={card.id} draggableId={card.id} index={i} isDragDisabled={locked.has(card.id)}>
                        {(p) => (
                          <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="w-28 shrink-0">
                            <SortCard
                              card={card}
                              tilesOnly={config.tilesOnly}
                              splitCards={config.splitCards}
                              hideWords={config.hideWords}
                              showCaption={config.rowtitle}
                              locked={locked.has(card.id)}
                              bad={bad.has(card.id)}
                              onClick={() => playWordAudio(card.coreRaw, AUDIO_OPTS)}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {prov.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>

        {/* Cartas rack */}
        <div>
          <div className="font-bold text-slate-800 text-sm mb-1">Cartas</div>
          <Droppable droppableId="rack" direction="horizontal">
            {(prov) => (
              <div
                ref={prov.innerRef}
                {...prov.droppableProps}
                className="flex flex-wrap gap-2 p-3 rounded-xl bg-white border-2 border-dashed border-slate-300 min-h-[120px]"
              >
                {rack.map((card, i) => (
                  <Draggable key={card.id} draggableId={card.id} index={i} isDragDisabled={locked.has(card.id)}>
                    {(p) => (
                      <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="w-28 shrink-0">
                        <SortCard
                          card={card}
                          tilesOnly={config.tilesOnly}
                          splitCards={config.splitCards}
                          hideWords={config.hideWords}
                          showCaption={config.rowtitle}
                          locked={locked.has(card.id)}
                          bad={bad.has(card.id)}
                          onClick={() => playWordAudio(card.coreRaw, AUDIO_OPTS)}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {prov.placeholder}
              </div>
            )}
          </Droppable>
        </div>
      </div>
    </DragDropContext>
  );
}

function ColumnHeader({ col, config, isNotPair, targetLetter }) {
  // image header (manualsort image / syllgroups headerimages) — always shown
  if (col.headerImg) {
    return (
      <div className="flex items-center justify-center mb-1 h-24">
        <img src={col.headerImg} alt={col.label} className="rounded-lg object-contain max-h-24 bg-slate-50" draggable={false} />
      </div>
    );
  }
  // is/not letter pair shown as Elkonin boxes: the target sound's box is filled
  // (green = the sound is at the start, red = the sound is NOT at the start),
  // with empty boxes for the other sounds in the word.
  if (isNotPair && targetLetter) {
    const isNot = col.key.startsWith('not-');
    const soundIdx = isNot ? 1 : 0; // is -> first box; not -> a later box
    const filled = isNot ? 'bg-red-100 text-red-700 border-red-300' : 'bg-green-100 text-green-700 border-green-300';
    const empty = 'border-slate-300 bg-slate-50';
    return (
      <div className="flex justify-center mb-2">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-9 min-w-[2.25rem] px-1 rounded-md border-2 flex items-center justify-center font-bold text-lg ${i === soundIdx ? filled : empty}`}
            >
              {i === soundIdx ? `/${targetLetter}/` : ''}
            </div>
          ))}
        </div>
      </div>
    );
  }
  // stress dots respect hideTitle
  if (col.key.startsWith('stress:')) {
    if (config.hideTitle) return <div className="h-10" />;
    const pos = parseInt(col.display || col.key.slice(7), 10);
    const total = 3;
    const targetIdx = Math.min(total - 1, Math.max(0, total - pos));
    return (
      <div className="flex items-center justify-center gap-1 mb-1 h-10">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`w-3 h-3 rounded-full ${i === targetIdx ? 'bg-indigo-600' : 'bg-indigo-200'}`} />
        ))}
      </div>
    );
  }
  // syllable & count tiles respect hideTitle; everything else (letters,
  // manualsort text, syllgroups, rowsyllcols groups, phonemes) always shows
  if (config.hideTitle && (col.key.startsWith('syll:') || col.key.startsWith('count:'))) {
    return <div className="h-10" />;
  }
  return (
    <div className="flex justify-center mb-2">
      <div className="px-5 py-1.5 rounded-lg bg-indigo-100 text-indigo-800 font-bold text-lg text-center min-w-[3rem]">
        {col.display || col.label}
      </div>
    </div>
  );
}

// lightweight confetti burst
function celebrate() {
  const N = 120;
  const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
  const parts = [];
  for (let i = 0; i < N; i++) {
    parts.push(document.createElement('div'));
  }
  parts.forEach((el) => {
    el.style.position = 'fixed';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.top = '-20px';
    el.style.width = '8px';
    el.style.height = '12px';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.zIndex = 9999;
    el.style.pointerEvents = 'none';
    el.style.borderRadius = '2px';
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(el);
    const dur = 2000 + Math.random() * 1500;
    const drift = (Math.random() - 0.5) * 200;
    el.animate(
      [
        { transform: `translate(0,0) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${drift}px, 100vh) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: dur, easing: 'cubic-bezier(0.2,0.6,0.4,1)' }
    );
    setTimeout(() => el.remove(), dur);
  });
}