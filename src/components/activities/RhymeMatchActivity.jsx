import { useState, useEffect, useMemo, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { base44 } from '@/api/base44Client';
import { useSortSensors } from '@/hooks/useSortSensors';
import { resolveRhymeMatchItems, autoGenerateRhymeMatchItems } from '@/lib/activities/rhymeMatchItems';
import { Send, RefreshCw, Check, X, Shuffle, Volume2 } from 'lucide-react';

// Phonological awareness: students listen to the word (speaker button) and
// match by sound. No written words are shown — pure oral rhyming.
function speak(text) {
  try {
    window.speechSynthesis?.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES'; u.rate = 0.8;
    window.speechSynthesis?.speak(u);
  } catch { /* best-effort */ }
}

// "Emparejar rimas" (student). The teacher types word pairs; the app finds
// images. The student sees a target picture on the left, an empty drop box in
// the center, and image options on the right. They drag the rhyming picture
// into the box and press Enviar to submit (no auto-check — they can change
// their mind before submitting). Scores are saved so the teacher can see who
// is guessing. After the teacher-set rounds, a replay button generates fresh
// rhyme pairs from the image library.

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function PictureCard({ word, image, isPlaced, dragging }) {
  return (
    <div
      className={`relative rounded-2xl bg-white border-2 transition-all ${
        dragging ? 'shadow-lg scale-105' : 'shadow-sm'
      } ${isPlaced ? 'border-indigo-400' : 'border-slate-200'}`}
      style={{ width: '100%', aspectRatio: '1 / 1' }}
    >
      {image ? (
        <img
          src={image}
          alt={word}
          className="w-full h-full object-contain rounded-2xl"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-2">
          <span className="text-4xl">❓</span>
        </div>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); speak(word); }}
        className="absolute top-1 right-1 p-1.5 rounded-full bg-white/90 text-indigo-600 shadow-sm hover:bg-white active:scale-95"
        aria-label={`Escuchar ${word}`}
      >
        <Volume2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function RhymeMatchActivity({ config, studentName, onScoreUpdate }) {
  const rawItems = useMemo(
    () => (Array.isArray(config?.items) ? config.items : []),
    [config]
  );
  const isAuto = config?.auto === true;

  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState(0);
  const [placed, setPlaced] = useState(null); // word currently in the drop box
  const [phase, setPhase] = useState('playing'); // playing | submitted | finished
  const [saving, setSaving] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [autoMode, setAutoMode] = useState(false);

  const sensors = useSortSensors();
  const name = studentName || 'Estudiante';

  // Load + resolve images for the teacher-set items (or auto-generated set).
  const loadItems = useCallback(
    async (useAuto) => {
      setLoading(true);
      try {
        if (useAuto) {
          const auto = await autoGenerateRhymeMatchItems(rawItems.length || 5);
          setItems(auto);
          setAutoMode(true);
        } else {
          const resolved = await resolveRhymeMatchItems(rawItems);
          setItems(resolved);
          setAutoMode(false);
        }
        setPos(0);
        setPlaced(null);
        setPhase('playing');
        setScore({ correct: 0, total: 0 });
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [rawItems]
  );

  useEffect(() => {
    if (isAuto) {
      loadItems(true);
    } else if (rawItems.length > 0) {
      loadItems(false);
    } else {
      setItems([]);
      setLoading(false);
    }
  }, [isAuto, rawItems, loadItems]);

  // Report score up so the lesson router can gate mastery / award coins.
  useEffect(() => {
    if (onScoreUpdate) onScoreUpdate(score);
  }, [score, onScoreUpdate]);

  const item = items && items.length > 0 ? items[pos] : null;

  // Build the option list: answer + distractors, shuffled per problem.
  const options = useMemo(() => {
    if (!item) return [];
    const opts = [
      { word: item.answer, image: item.answerImage, isAnswer: true },
      ...(item.distractors || []).map((d) => ({ word: d.word, image: d.image, isAnswer: false })),
    ];
    return shuffle(opts);
  }, [item, pos]);

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const word = result.draggableId;
    if (result.destination.droppableId === 'dropzone') {
      setPlaced(word);
    } else if (result.destination.droppableId === 'rack') {
      if (placed === word) setPlaced(null);
    }
  };

  // Tap-to-place fallback (for touch reliability): tap an option to fill the
  // box, tap the box to clear.
  const tapOption = (word) => {
    if (phase !== 'playing') return;
    setPlaced(word);
  };
  const tapBox = () => {
    if (phase !== 'playing') return;
    setPlaced(null);
  };

  async function submit() {
    if (!item || !placed || saving) return;
    const correct = placed === item.answer;
    setSaving(true);
    try {
      await base44.entities.ActivityResponse.create({
        activity_mode: 'rhyme_matching',
        student_name: name,
        class_name: '',
        item_text: `${item.target} / ${item.answer}`,
        item_index: pos,
        tile_count: options.length,
        placed_count: 1,
        correct_count: correct ? 1 : 0,
        is_correct: correct,
        placements_data: JSON.stringify({
          target: item.target,
          answer: item.answer,
          choice: placed,
          correct,
          auto: autoMode,
        }),
        submitted_at: new Date().toISOString(),
        reviewed: false,
        teacher_note: '',
      });
      setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
      setPhase('submitted');
    } catch {
      setPhase('submitted');
    } finally {
      setSaving(false);
    }
  }

  function next() {
    const np = pos + 1;
    if (np >= items.length) {
      setPhase('finished');
      return;
    }
    setPos(np);
    setPlaced(null);
    setPhase('playing');
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Buscando imágenes…
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm text-center px-6">
        Escribe pares de palabras (objetivo, respuesta, distractores) para que
        la actividad busque las imágenes.
      </div>
    );
  }

  if (phase === 'finished') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-5xl">🎉</div>
        <div className="text-2xl font-black text-slate-700">
          ¡Listo! {score.correct} / {score.total} correctas
        </div>
        <p className="text-sm text-slate-500">
          {autoMode
            ? 'Rondas generadas automáticamente desde la biblioteca de imágenes.'
            : 'Completaste las rondas del maestro.'}
        </p>
        <div className="flex gap-3 flex-wrap justify-center">
          {!autoMode && (
            <button
              onClick={() => loadItems(true)}
              className="px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-2 hover:bg-indigo-700"
            >
              <Shuffle className="w-5 h-5" /> Repetir con rimas automáticas
            </button>
          )}
          <button
            onClick={() => loadItems(autoMode)}
            className="px-5 py-3 rounded-xl bg-white border-2 border-slate-200 text-slate-700 font-bold flex items-center gap-2 hover:bg-slate-50"
          >
            <RefreshCw className="w-5 h-5" /> Jugar de nuevo
          </button>
        </div>
      </div>
    );
  }

  const submittedCorrect = phase === 'submitted' && placed === item.answer;

  return (
    <div className="flex flex-col gap-3 p-4 max-w-4xl mx-auto h-full">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="text-xs text-slate-400 font-bold">
          Problema {pos + 1} / {items.length}
        </span>
        {autoMode && (
          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
            Auto-generado
          </span>
        )}
        <span className="ml-auto font-semibold text-slate-600">
          Arrastra la imagen que rima con el de la izquierda
        </span>
      </div>

      {/* Score badge */}
      <div className="flex justify-center">
        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
          Aciertos: {score.correct} / {score.total}
        </span>
      </div>

      {/* Main play area */}
      <DragDropContext sensors={sensors} enableDefaultSensors={false} onDragEnd={onDragEnd}>
        <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 flex-1 min-h-0">
          {/* Target (left) */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div style={{ width: '140px', height: '140px' }}>
              <PictureCard word={item.target} image={item.targetImage} />
            </div>
            <span className="text-xs font-bold text-slate-400">Objetivo</span>
          </div>

          {/* Drop zone (center) */}
          <div className="flex flex-col items-center gap-2 flex-1">
            <Droppable droppableId="dropzone">
              {(dropProv, snapshot) => (
                <div
                  ref={dropProv.innerRef}
                  {...dropProv.droppableProps}
                  onClick={tapBox}
                  className={`rounded-2xl border-4 border-dashed flex items-center justify-center cursor-pointer transition-colors ${
                    snapshot.isDraggingOver
                      ? 'border-indigo-400 bg-indigo-50'
                      : placed
                      ? 'border-slate-300 bg-slate-50'
                      : 'border-slate-300 bg-white'
                  }`}
                  style={{ width: '160px', height: '160px' }}
                >
                  {placed ? (
                    <div className="w-full h-full p-2">
                      <PictureCard
                        word={placed}
                        image={options.find((o) => o.word === placed)?.image || ''}
                        isPlaced
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-slate-300 font-bold text-center px-3">
                      Suelta aquí
                    </span>
                  )}
                  {dropProv.placeholder}
                </div>
              )}
            </Droppable>
            <span className="text-xs font-bold text-slate-400">Caja</span>
          </div>

          {/* Options (right) */}
          <Droppable droppableId="rack" direction="vertical">
            {(rackProv) => (
              <div
                ref={rackProv.innerRef}
                {...rackProv.droppableProps}
                className="flex flex-col gap-3 shrink-0"
              >
                {options.map((opt, i) => {
                  const inBox = placed === opt.word;
                  return (
                    <Draggable
                      key={opt.word}
                      draggableId={opt.word}
                      index={i}
                      isDragDisabled={!!inBox || phase !== 'playing'}
                    >
                      {(dragProv, snapshot) => (
                        <div
                          ref={dragProv.innerRef}
                          {...dragProv.draggableProps}
                          {...dragProv.dragHandleProps}
                          onClick={() => !inBox && tapOption(opt.word)}
                          style={{
                            ...dragProv.draggableProps.style,
                            width: '120px',
                            height: '120px',
                            opacity: inBox ? 0.25 : 1,
                          }}
                          className="cursor-grab active:cursor-grabbing"
                        >
                          <PictureCard
                            word={opt.word}
                            image={opt.image}
                            dragging={snapshot.isDragging}
                          />
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {rackProv.placeholder}
              </div>
            )}
          </Droppable>
        </div>
      </DragDropContext>

      {/* Feedback */}
      {phase === 'submitted' && (
        <div
          className={`text-center font-black text-xl flex items-center justify-center gap-2 ${
            submittedCorrect ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {submittedCorrect ? (
            <>
              <Check className="w-6 h-6" /> ¡Correcto!
            </>
          ) : (
            <>
              <X className="w-6 h-6" /> Escucha la respuesta
              <button
                type="button"
                onClick={() => speak(item.answer)}
                className="p-2 rounded-full bg-white/90 text-indigo-600 shadow-sm hover:bg-white active:scale-95"
                aria-label="Escuchar respuesta"
              >
                <Volume2 className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 min-h-[48px] flex-wrap">
        {phase === 'playing' && (
          <button
            onClick={submit}
            disabled={!placed || saving}
            className="px-6 py-3 rounded-xl bg-green-600 text-white font-black text-lg flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-700"
          >
            <Send className="w-5 h-5" /> {saving ? 'Guardando…' : 'Enviar'}
          </button>
        )}
        {phase === 'submitted' && (
          <button
            onClick={next}
            className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-black text-lg hover:bg-indigo-700"
          >
            {pos + 1 >= items.length ? 'Terminar' : 'Siguiente'}
          </button>
        )}
      </div>
    </div>
  );
}