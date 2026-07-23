import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Check, RefreshCw } from 'lucide-react';
import SortCard from './SortCard';
import { classifyCard } from '@/lib/lettersort/rounds';
import { playWordAudio, preloadAudio } from '@/lib/lettersort/audio';

const AUDIO_OPTS = { bucket: 'lettersort-audio', prefix: '' };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Column-group view: a rack of cards + N drop columns. Drag a card into a
// column, hit "Verificar" to check; correct cards lock, wrong ones bounce back.
export default function ColumnsView({ config, round }) {
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
    if (toEject.length === 0 && newLocked.size === round.cards.length) celebrate();
  }

  function newRound() {
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

  return (
    <DragDropContext onDragEnd={onDragEnd}>
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

        {/* rack */}
        <Droppable droppableId="rack" direction="horizontal">
          {(prov) => (
            <div
              ref={prov.innerRef}
              {...prov.droppableProps}
              className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 min-h-[120px]"
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

        {/* columns */}
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${round.columns.length}, minmax(140px, 1fr))` }}>
          {round.columns.map((col) => (
            <div key={col.key} className="flex flex-col">
              <ColumnHeader col={col} config={config} />
              <Droppable droppableId={col.key}>
                {(prov) => (
                  <div
                    ref={prov.innerRef}
                    {...prov.droppableProps}
                    className="flex flex-col gap-2 p-2 rounded-xl bg-indigo-50/60 border-2 border-indigo-200 border-dashed min-h-[160px] flex-1"
                  >
                    {(colCards[col.key] || []).map((card, i) => (
                      <Draggable key={card.id} draggableId={card.id} index={i} isDragDisabled={locked.has(card.id)}>
                        {(p) => (
                          <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="w-full">
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
      </div>
    </DragDropContext>
  );
}

function ColumnHeader({ col, config }) {
  if (config.hideTitle) return <div className="h-10" />;
  // image header (manualsort with headertype=image)
  if (col.headerImg) {
    return (
      <div className="flex items-center justify-center mb-1 h-24">
        <img src={col.headerImg} alt={col.label} className="rounded-lg object-contain max-h-24 bg-slate-50" draggable={false} />
      </div>
    );
  }
  if (col.key.startsWith('stress:')) {
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
  return <h2 className="text-center font-bold text-base text-indigo-800 mb-1 px-1">{col.label}</h2>;
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