import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Check, RefreshCw } from 'lucide-react';
import SortCard from './SortCard';
import { playWordAudio, preloadAudio } from '@/lib/lettersort/audio';

const AUDIO_OPTS = { bucket: 'audio', prefix: 'es/words' };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Row modes (row, rowsyll): each row shows a prompt + a drop slot (1 card for
// `row`, many for `rowsyll`). Drag cards from the rack into the matching row.
export default function RowView({ round, config, onRoundComplete }) {
  const [rack, setRack] = useState([]);
  const [slots, setSlots] = useState({}); // rowIndex -> [card]
  const [locked, setLocked] = useState(new Set());
  const [bad, setBad] = useState(new Set());
  const [score, setScore] = useState({ correct: 0, wrong: 0 });

  useEffect(() => {
    setRack(shuffle(round.cards));
    setSlots(Object.fromEntries(round.rows.map((_, i) => [i, []])));
    setLocked(new Set()); setBad(new Set()); setScore({ correct: 0, wrong: 0 });
    preloadAudio(round.cards.map((c) => c.coreRaw), AUDIO_OPTS);
  }, [round]);

  // Auto-verify when all cards have been placed into rows, so the round
  // completes without requiring the student to tap "Verificar" — this ensures
  // onRoundComplete fires (and coins are awarded) before they tap "Done".
  useEffect(() => {
    if (!round) return;
    const placedCount = Object.values(slots).flat().length;
    if (rack.length === 0 && placedCount > 0 && locked.size < round.cards.length) {
      verify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rack.length]);

  function onDragEnd(res) {
    const { source, destination } = res;
    if (!destination) return;
    const fromRack = source.droppableId === 'rack';
    const toRack = destination.droppableId === 'rack';
    const card = fromRack ? rack[source.index] : slots[parseInt(source.droppableId, 10)][source.index];
    if (locked.has(card.id)) return;
    // enforce maxPerSlot for the destination row
    if (!toRack) {
      const ri = parseInt(destination.droppableId, 10);
      const max = round.rows[ri]?.maxPerSlot ?? 1;
      const cur = slots[ri] || [];
      if (fromRack && cur.length >= max) return;
    }
    if (fromRack) setRack((p) => p.filter((c) => c.id !== card.id));
    else setSlots((p) => ({ ...p, [parseInt(source.droppableId, 10)]: (p[parseInt(source.droppableId, 10)] || []).filter((c) => c.id !== card.id) }));
    if (toRack) setRack((p) => { const n = [...p]; n.splice(destination.index, 0, card); return n; });
    else setSlots((p) => { const ri = parseInt(destination.droppableId, 10); const n = [...(p[ri] || [])]; n.splice(destination.index, 0, card); return { ...p, [ri]: n }; });
  }

  function verify() {
    let correct = 0, wrong = 0;
    const newLocked = new Set(locked);
    const toEject = [];
    round.rows.forEach((row, i) => {
      for (const card of slots[i] || []) {
        if (newLocked.has(card.id)) { correct++; continue; }
        if (row.match(card.coreRaw)) { newLocked.add(card.id); correct++; }
        else { wrong++; toEject.push({ ri: i, card }); }
      }
    });
    setLocked(newLocked);
    setScore((s) => ({ correct: s.correct + correct, wrong: s.wrong + wrong }));
    if (toEject.length) {
      setBad((b) => new Set([...b, ...toEject.map((e) => e.card.id)]));
      setTimeout(() => {
        setSlots((p) => { const n = { ...p }; toEject.forEach((e) => { n[e.ri] = (n[e.ri] || []).filter((c) => c.id !== e.card.id); }); return n; });
        setRack((p) => [...p, ...toEject.map((e) => e.card)]);
        setBad((b) => { const n = new Set(b); toEject.forEach((e) => n.delete(e.card.id)); return n; });
      }, 350);
    }
    if (toEject.length === 0 && newLocked.size === round.cards.length) {
      celebrate();
      onRoundComplete?.({ mistakes: score.wrong + wrong });
    }
  }

  function newRound() {
    setRack(shuffle(round.cards));
    setSlots(Object.fromEntries(round.rows.map((_, i) => [i, []])));
    setLocked(new Set()); setBad(new Set()); setScore({ correct: 0, wrong: 0 });
  }

  const nothingPlaced = Object.values(slots).every((a) => !a.length);

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={verify} disabled={nothingPlaced} className="px-4 py-2 rounded-lg bg-green-600 text-white font-bold text-sm flex items-center gap-1.5 disabled:opacity-40 shadow-sm"><Check className="w-4 h-4" /> Verificar</button>
          <button onClick={newRound} className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm flex items-center gap-1.5 shadow-sm"><RefreshCw className="w-4 h-4" /> Nuevo</button>
          <span className="text-sm font-semibold text-slate-600 ml-2">✅ {score.correct} · ❌ {score.wrong}</span>
        </div>

        <Droppable droppableId="rack" direction="horizontal">
          {(prov) => (
            <div ref={prov.innerRef} {...prov.droppableProps} className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 min-h-[120px]">
              {rack.map((card, i) => (
                <Draggable key={card.id} draggableId={card.id} index={i} isDragDisabled={locked.has(card.id)}>
                  {(p) => (
                    <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="w-28 shrink-0">
                      <SortCard card={card} splitCards={config.splitCards} hideWords={config.hideWords} showCaption={config.rowtitle} locked={locked.has(card.id)} bad={bad.has(card.id)} onClick={() => playWordAudio(card.coreRaw, AUDIO_OPTS)} />
                    </div>
                  )}
                </Draggable>
              ))}
              {prov.placeholder}
            </div>
          )}
        </Droppable>

        <div className="flex flex-col gap-3">
          {round.rows.map((row, i) => (
            <div key={i} className="flex items-stretch gap-3 p-2 rounded-xl bg-indigo-50/60 border border-indigo-200">
              <div className="flex flex-col items-center justify-center min-w-[120px] w-32 shrink-0">
                {row.promptImg
                  ? <img src={row.promptImg} alt={row.prompt} className="rounded-lg object-contain max-h-24 bg-white" draggable={false} />
                  : <span className="font-bold text-xl text-indigo-900 text-center">{row.prompt}</span>}
              </div>
              <Droppable droppableId={String(i)} direction="horizontal">
                {(prov) => (
                  <div ref={prov.innerRef} {...prov.droppableProps} className="flex flex-wrap gap-2 items-center flex-1 min-h-[96px] rounded-lg bg-white/70 border-2 border-dashed border-indigo-300 p-2">
                    {(slots[i] || []).map((card, j) => (
                      <Draggable key={card.id} draggableId={card.id} index={j} isDragDisabled={locked.has(card.id)}>
                        {(p) => (
                          <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="w-28 shrink-0">
                            <SortCard card={card} splitCards={config.splitCards} hideWords={config.hideWords} showCaption={config.rowtitle} locked={locked.has(card.id)} bad={bad.has(card.id)} onClick={() => playWordAudio(card.coreRaw, AUDIO_OPTS)} />
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

function celebrate() {
  const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
  for (let i = 0; i < 120; i++) {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;left:${Math.random() * 100}vw;top:-20px;width:8px;height:12px;background:${colors[i % colors.length]};z-index:9999;pointer-events:none;border-radius:2px;transform:rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(el);
    const dur = 2000 + Math.random() * 1500;
    el.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 200}px,100vh) rotate(${Math.random() * 720}deg)`, opacity: 0 }], { duration: dur, easing: 'cubic-bezier(0.2,0.6,0.4,1)' });
    setTimeout(() => el.remove(), dur);
  }
}