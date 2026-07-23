import { useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Check, RefreshCw } from 'lucide-react';
import SortCard from './SortCard';
import { playWordAudio, preloadAudio } from '@/lib/lettersort/audio';
import { normalizeMarkers, markersToPretty } from '@/lib/lettersort/phonics';

const AUDIO_OPTS = { bucket: 'lettersort-audio', prefix: '' };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Generate mode: a riddle with hidden blanks; drag the answer cards into the
// blanks in order. Verify matches each blank's card to the answer at that spot.
export default function GenerateView({ round, config }) {
  const blanks = round.parts.filter((p) => p.type === 'hidden');
  const expected = blanks.map((p) => normalizeMarkers(p.text));

  const [rack, setRack] = useState([]);
  const [filled, setFilled] = useState({}); // blankIndex -> card
  const [locked, setLocked] = useState(new Set());
  const [bad, setBad] = useState(new Set());
  const [score, setScore] = useState({ correct: 0, wrong: 0 });

  useEffect(() => {
    setRack(shuffle(round.cards)); setFilled({}); setLocked(new Set()); setBad(new Set()); setScore({ correct: 0, wrong: 0 });
    preloadAudio(round.cards.map((c) => c.coreRaw), AUDIO_OPTS);
  }, [round]);

  function onDragEnd(res) {
    const { source, destination } = res;
    if (!destination) return;
    const fromRack = source.droppableId === 'rack';
    const destBlank = parseInt(destination.droppableId, 10);
    const card = fromRack ? rack[source.index] : filled[parseInt(source.droppableId, 10)];
    if (!card || locked.has(card.id)) return;
    const prev = filled[destBlank];
    if (fromRack) setRack((p) => p.filter((c) => c.id !== card.id));
    else setFilled((p) => { const n = { ...p }; delete n[parseInt(source.droppableId, 10)]; return n; });
    setFilled((p) => ({ ...p, [destBlank]: card }));
    if (prev) setRack((p) => [...p, prev]);
  }

  function verify() {
    let correct = 0, wrong = 0;
    const newLocked = new Set(locked);
    const toEject = [];
    blanks.forEach((b, i) => {
      const card = filled[i];
      if (!card) return;
      if (newLocked.has(card.id)) { correct++; return; }
      if (normalizeMarkers(card.coreRaw) === expected[i]) { newLocked.add(card.id); correct++; }
      else { wrong++; toEject.push(card); }
    });
    setLocked(newLocked);
    setScore((s) => ({ correct: s.correct + correct, wrong: s.wrong + wrong }));
    if (toEject.length) {
      setBad((b2) => new Set([...b2, ...toEject.map((c) => c.id)]));
      setTimeout(() => {
        setFilled((p) => { const n = { ...p }; toEject.forEach((c) => { for (const k of Object.keys(n)) if (n[k]?.id === c.id) delete n[k]; }); return n; });
        setRack((p) => [...p, ...toEject]);
        setBad((b2) => { const n = new Set(b2); toEject.forEach((c) => n.delete(c.id)); return n; });
      }, 350);
    }
    if (toEject.length === 0 && Object.keys(filled).length === blanks.length && newLocked.size === round.cards.length) celebrate();
  }

  function newRound() {
    setRack(shuffle(round.cards)); setFilled({}); setLocked(new Set()); setBad(new Set()); setScore({ correct: 0, wrong: 0 });
  }

  let blankCounter = -1;

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={verify} disabled={!Object.keys(filled).length} className="px-4 py-2 rounded-lg bg-green-600 text-white font-bold text-sm flex items-center gap-1.5 disabled:opacity-40 shadow-sm"><Check className="w-4 h-4" /> Verificar</button>
          <button onClick={newRound} className="px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-sm flex items-center gap-1.5 shadow-sm"><RefreshCw className="w-4 h-4" /> Nuevo</button>
          <span className="text-sm font-semibold text-slate-600 ml-2">✅ {score.correct} · ❌ {score.wrong}</span>
        </div>

        <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 leading-relaxed text-lg flex flex-wrap items-center gap-y-2">
          {round.parts.map((part, i) => {
            if (part.type === 'text') return <span key={i} className="text-slate-800">{part.text}</span>;
            blankCounter += 1;
            const bi = blankCounter;
            const card = filled[bi];
            return (
              <Droppable key={i} droppableId={String(bi)}>
                {(prov) => (
                  <span ref={prov.innerRef} {...prov.droppableProps} className="inline-flex align-middle min-w-[90px] min-h-[44px] mx-1 rounded-lg border-2 border-dashed border-indigo-400 bg-white items-center justify-center px-1">
                    {card ? (
                      <Draggable draggableId={card.id} index={0} isDragDisabled={locked.has(card.id)}>
                        {(p) => (
                          <span ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="inline-block">
                            <span className={`px-2 py-1 rounded-md font-bold ${locked.has(card.id) ? 'bg-green-100 text-green-800' : bad.has(card.id) ? 'bg-red-100 text-red-800 ring-2 ring-red-300' : 'bg-indigo-100 text-indigo-800'}`} onClick={() => playWordAudio(card.coreRaw, AUDIO_OPTS)}>
                              {markersToPretty(card.coreRaw)}
                            </span>
                          </span>
                        )}
                      </Draggable>
                    ) : <span className="text-indigo-300 px-2">____</span>}
                    {prov.placeholder}
                  </span>
                )}
              </Droppable>
            );
          })}
        </div>

        <Droppable droppableId="rack" direction="horizontal">
          {(prov) => (
            <div ref={prov.innerRef} {...prov.droppableProps} className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 min-h-[100px]">
              {rack.map((card, i) => (
                <Draggable key={card.id} draggableId={card.id} index={i} isDragDisabled={locked.has(card.id)}>
                  {(p) => (
                    <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className="w-28 shrink-0">
                      <SortCard card={card} splitCards={config.splitCards} hideWords={config.hideWords} locked={locked.has(card.id)} bad={bad.has(card.id)} onClick={() => playWordAudio(card.coreRaw, AUDIO_OPTS)} />
                    </div>
                  )}
                </Draggable>
              ))}
              {prov.placeholder}
            </div>
          )}
        </Droppable>
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