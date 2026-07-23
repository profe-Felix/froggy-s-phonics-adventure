import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Check, RefreshCw } from 'lucide-react';
import SortCard from './SortCard';
import { playWordAudio, preloadAudio } from '@/lib/lettersort/audio';

const AUDIO_OPTS = { bucket: 'lettersort-audio', prefix: '' };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// rowsyllcols "rowsyll" form: each syllable group is a ROW with a header image
// (photo + syllable grid) and a drop zone. Drag the word cards ("Cartas") into
// the row whose target syllables match the word.
export default function RowsyllRowsView({ config, round }) {
  const [rack, setRack] = useState([]);
  const [rowCards, setRowCards] = useState({});
  const [locked, setLocked] = useState(new Set());
  const [bad, setBad] = useState(new Set());
  const [score, setScore] = useState({ correct: 0, wrong: 0 });

  useEffect(() => {
    if (!round) return;
    setRack(shuffle(round.cards));
    const fresh = {};
    round.rows.forEach((r) => { fresh[r.key] = []; });
    setRowCards(fresh);
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
    const card = source.droppableId === 'rack' ? rack[source.index] : rowCards[source.droppableId][source.index];
    if (locked.has(card.id)) return;
    if (source.droppableId === 'rack') setRack((p) => removeCardFrom(p, card.id));
    else setRowCards((p) => ({ ...p, [source.droppableId]: removeCardFrom(p[source.droppableId], card.id) }));
    if (destination.droppableId === 'rack') setRack((p) => addCardTo(p, card, destination.index));
    else setRowCards((p) => ({ ...p, [destination.droppableId]: addCardTo(p[destination.droppableId], card, destination.index) }));
  }

  function verify() {
    let correct = 0, wrong = 0;
    const newLocked = new Set(locked);
    const toEject = [];
    for (const row of round.rows) {
      for (const card of rowCards[row.key] || []) {
        if (newLocked.has(card.id)) { correct++; continue; }
        if (row.match(card.coreRaw)) { newLocked.add(card.id); correct++; }
        else { wrong++; toEject.push({ rowKey: row.key, card }); }
      }
    }
    setLocked(newLocked);
    setScore((s) => ({ correct: s.correct + correct, wrong: s.wrong + wrong }));
    if (toEject.length) {
      const badIds = new Set(toEject.map((e) => e.card.id));
      setBad((b) => new Set([...b, ...badIds]));
      setTimeout(() => {
        setRowCards((prev) => {
          const next = { ...prev };
          toEject.forEach((e) => { next[e.rowKey] = removeCardFrom(next[e.rowKey] || [], e.card.id); });
          return next;
        });
        setRack((prev) => [...prev, ...toEject.map((e) => e.card)]);
        setBad((b) => { const n = new Set(b); toEject.forEach((e) => n.delete(e.card.id)); return n; });
      }, 350);
    }
    if (toEject.length === 0 && newLocked.size === round.cards.length) celebrate();
  }

  function newRound() {
    setRack(shuffle(round.cards));
    const fresh = {};
    round.rows.forEach((r) => { fresh[r.key] = []; });
    setRowCards(fresh);
    setLocked(new Set());
    setBad(new Set());
    setScore({ correct: 0, wrong: 0 });
  }

  const nothingPlaced = Object.values(rowCards).every((arr) => arr.length === 0);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={verify} disabled={nothingPlaced} className="px-4 py-2 rounded-lg bg-green-600 text-white font-bold text-sm flex items-center gap-1.5 disabled:opacity-40 shadow-sm">
            <Check className="w-4 h-4" /> Verificar
          </button>
          <button onClick={newRound} className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm flex items-center gap-1.5 shadow-sm">
            <RefreshCw className="w-4 h-4" /> Nuevo
          </button>
          <span className="text-sm font-semibold text-slate-600 ml-2">✅ {score.correct} · ❌ {score.wrong}</span>
        </div>

        {/* rows: header image + drop zone */}
        <div className="flex flex-col gap-3">
          {round.rows.map((row) => (
            <div key={row.key} className="flex gap-3 items-stretch">
              <div className="shrink-0 min-w-[220px] flex items-center justify-center">
                {row.headerImg
                  ? <img src={row.headerImg} alt={row.syllables.join(' ')} className="rounded-xl object-contain h-40 w-auto bg-white border border-slate-200" draggable={false} />
                  : <div className="grid grid-cols-2 gap-1 text-center font-bold text-slate-700 w-full">{row.syllables.map((s) => <span key={s} className="px-2 py-1 bg-slate-50 rounded">{s}</span>)}</div>}
              </div>
              <Droppable droppableId={row.key} direction="horizontal">
                {(prov) => (
                  <div ref={prov.innerRef} {...prov.droppableProps} className="flex flex-wrap gap-2 p-2 rounded-xl bg-blue-50/70 border-2 border-blue-300 border-dashed min-h-[140px] flex-1 content-start">
                    {(rowCards[row.key] || []).map((card, i) => (
                      <Draggable key={card.id} draggableId={card.id} index={i} isDragDisabled={locked.has(card.id)}>
                        {(p) => (
                          <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="w-32 shrink-0">
                            <SortCard card={card} tilesOnly hideWords={config.hideWords} locked={locked.has(card.id)} bad={bad.has(card.id)} onClick={() => playWordAudio(card.coreRaw, AUDIO_OPTS)} />
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
          <h2 className="font-bold text-slate-800 mb-1">Cartas</h2>
          <Droppable droppableId="rack" direction="horizontal">
            {(prov) => (
              <div ref={prov.innerRef} {...prov.droppableProps} className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 min-h-[110px]">
                {rack.map((card, i) => (
                  <Draggable key={card.id} draggableId={card.id} index={i} isDragDisabled={locked.has(card.id)}>
                    {(p) => (
                      <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="w-32 shrink-0">
                        <SortCard card={card} tilesOnly hideWords={config.hideWords} locked={locked.has(card.id)} bad={bad.has(card.id)} onClick={() => playWordAudio(card.coreRaw, AUDIO_OPTS)} />
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

// lightweight confetti burst
function celebrate() {
  const N = 120;
  const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
  const parts = [];
  for (let i = 0; i < N; i++) parts.push(document.createElement('div'));
  parts.forEach((el) => {
    el.style.position = 'fixed';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.top = '-20px';
    el.style.width = '8px';
    el.style.height = '12px';
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.zIndex = '9999';
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