import { useState, useEffect, useMemo, useRef, useCallback, forwardRef } from 'react';
import { base44 } from '@/api/base44Client';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import { NUMBER_WAYPOINTS } from '../../data/numberWaypoints';
import MissingLetterWordCanvas from '../MissingLetterWordCanvas';
import { resolveImageForWord } from '@/lib/lettersort/storage';
import { AUDIO_BASE, toAudioName } from '@/lib/audio';
import { getLanguage } from '@/lib/language';
import { useCoinAward } from '@/hooks/useCoinAward';
import { Volume2, RotateCcw, Check, Trophy } from 'lucide-react';

const IMG_BUCKET = 'lettersort-images';

// Build the letter bank for an item: explicit per-word bank, else the preset
// default bank, else the correct letter + the remaining vowels. The correct
// letter is always present; the bank is shuffled once per item.
function buildBank(item, defaultBank) {
  const correct = item.position === 'final'
    ? item.word[item.word.length - 1]
    : item.word[0];
  let base = (item.bank && item.bank.length) ? item.bank.slice() : (defaultBank && defaultBank.length ? defaultBank.slice() : ['a', 'e', 'i', 'o', 'u']);
  base = base.filter((l) => l && l.length === 1);
  if (!base.includes(correct)) base.push(correct);
  // dedupe + shuffle
  const uniq = Array.from(new Set(base));
  for (let i = uniq.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniq[i], uniq[j]] = [uniq[j], uniq[i]];
  }
  return uniq;
}

export default function MissingLetterMode({
  presetId,
  studentData,
  onUpdateProgress,
  onStudentPatch,
  onComplete,
  silent = false,
}) {
  const [items, setItems] = useState([]);
  const [defaultBank, setDefaultBank] = useState(['a', 'e', 'i', 'o', 'u']);
  const [idx, setIdx] = useState(0);
  const [placed, setPlaced] = useState(null);     // letter sitting in the blank
  const [phase, setPhase] = useState('choose');   // choose | tracing | done
  const [wrong, setWrong] = useState(false);
  const [imageCache, setImageCache] = useState({}); // idx -> resolved url (random source)
  const [bank, setBank] = useState([]);
  const [drag, setDrag] = useState(null);         // { letter, x, y } floating ghost
  const [mistakes, setMistakes] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [waypoints, setWaypoints] = useState({ ...LETTER_WAYPOINTS, ...NUMBER_WAYPOINTS });

  const dragRef = useRef(null);
  const blankRef = useRef(null);
  const lang = getLanguage(studentData);
  const awardCoins = useCoinAward(studentData, onStudentPatch);

  // Load preset. Standalone (no presetId) falls back to the first preset found.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let recs = [];
        if (presetId) recs = await base44.entities.MissingLetterPreset.filter({ key: presetId });
        else recs = await base44.entities.MissingLetterPreset.list('-updated_date', 50);
        if (cancelled || !recs.length) return;
        const r = recs[0];
        let its = [];
        try { its = JSON.parse(r.items_data || '[]'); } catch {}
        let db = ['a', 'e', 'i', 'o', 'u'];
        try { const p = JSON.parse(r.default_bank || '[]'); if (Array.isArray(p) && p.length) db = p; } catch {}
        if (!cancelled) {
          // Shuffle the items so the word order isn't predictable on replay.
          const shuffled = its.slice();
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          setItems(shuffled);
          setDefaultBank(db);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [presetId]);

  // Load waypoints from DB (merge over static fallback) so tracing uses the
  // exact strokes the teacher authored.
  useEffect(() => {
    let cancelled = false;
    base44.entities.LetterWaypoint.list()
      .then((records) => {
        if (cancelled || !Array.isArray(records) || !records.length) return;
        setWaypoints((prev) => {
          const merged = { ...prev };
          for (const r of records) {
            if (!r.letter || !r.strokes_data) continue;
            try {
              const strokes = JSON.parse(r.strokes_data);
              if (Array.isArray(strokes) && strokes.length) {
                merged[r.letter] = { strokes, hint: r.hint || merged[r.letter]?.hint || '' };
              }
            } catch {}
          }
          return merged;
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const item = items[idx];

  // Build + shuffle the bank whenever the item changes.
  useEffect(() => {
    if (!item) { setBank([]); return; }
    setBank(buildBank(item, defaultBank));
    setPlaced(null);
    setWrong(false);
    setPhase('choose');
  }, [item, defaultBank]);

  // Resolve random images (Letter Sort bucket) for items that request one.
  useEffect(() => {
    let cancelled = false;
    if (!items.length) return;
    (async () => {
      const next = {};
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.image_source === 'random' && !imageCache[i] && it.word) {
          const f = await resolveImageForWord(it.word, { bucket: IMG_BUCKET });
          if (f) next[i] = f.url;
        }
      }
      if (cancelled || !Object.keys(next).length) return;
      setImageCache((prev) => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [items]);

  const correctLetter = useMemo(() => {
    if (!item) return '';
    return item.position === 'final' ? item.word[item.word.length - 1] : item.word[0];
  }, [item]);

  const displayLetters = useMemo(() => {
    if (!item) return [];
    const rest = item.position === 'final' ? item.word.slice(0, -1) : item.word.slice(1);
    return rest.split('');
  }, [item]);

  const playWord = useCallback(() => {
    if (!item) return;
    try {
      const a = new Audio(`${AUDIO_BASE}/${lang}/words/${toAudioName(item.word)}.mp3`);
      a.play().catch(() => {});
    } catch {}
  }, [item, lang]);

  const attemptPlace = useCallback((letter) => {
    if (phase !== 'choose') return;
    if (letter === correctLetter) {
      setPlaced(letter);
      setWrong(false);
      // brief beat so the student sees the letter land before tracing starts
      setTimeout(() => setPhase('tracing'), 450);
    } else {
      setWrong(true);
      setMistakes((m) => m + 1);
      setPlaced(letter);
      setTimeout(() => { setWrong(false); setPlaced(null); }, 700);
    }
  }, [phase, correctLetter]);

  // ---- pointer drag for letter tiles (works with mouse + touch + pen) ----
  const onTileDown = (e, letter) => {
    if (phase !== 'choose') return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    dragRef.current = { letter, startX: e.clientX, startY: e.clientY, moved: false, pointerId: e.pointerId };
    setDrag({ letter, x: e.clientX, y: e.clientY });
  };
  const onTileMove = (e) => {
    if (!dragRef.current) return;
    const s = dragRef.current;
    if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) > 6) s.moved = true;
    setDrag({ letter: s.letter, x: e.clientX, y: e.clientY });
  };
  const onTileUp = (e) => {
    if (!dragRef.current) return;
    const s = dragRef.current;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    const blank = blankRef.current;
    let onBlank = false;
    if (blank) {
      const r = blank.getBoundingClientRect();
      onBlank = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    }
    const letter = s.letter;
    dragRef.current = null;
    setDrag(null);
    if (onBlank || !s.moved) attemptPlace(letter);
  };

  const handleTraced = useCallback(() => {
    // One item completed.
    const newCompleted = completed + 1;
    setCompleted(newCompleted);
    awardCoins(2, 'missing_letter');
    onUpdateProgress?.('missing_letter', {
      total_attempts: newCompleted,
      total_correct: newCompleted,
      mastered_items: [],
      learning_items: [],
    });
    if (idx + 1 >= items.length) {
      setPhase('done');
      onComplete?.({ mistakes });
    } else {
      setIdx(idx + 1);
    }
  }, [completed, idx, items.length, mistakes, awardCoins, onUpdateProgress, onComplete]);

  const restart = () => {
    setIdx(0);
    setCompleted(0);
    setMistakes(0);
    setPhase('choose');
    setPlaced(null);
    setWrong(false);
  };

  // ---- render ----
  if (!items.length) {
    return (
      <div className="relative h-full flex flex-col items-center justify-center bg-gradient-to-b from-sky-50 to-indigo-50 p-6 text-center">
        <div className="text-5xl mb-3">🔤</div>
        <p className="text-gray-500 font-bold">No Missing Letter preset assigned yet.</p>
        <p className="text-gray-400 text-sm mt-1">Ask your teacher to add words to this activity.</p>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="relative h-full flex flex-col items-center justify-center bg-gradient-to-b from-green-50 to-emerald-100 p-6 text-center gap-4">
        <Trophy className="w-16 h-16 text-amber-400" />
        <h2 className="text-3xl font-black text-gray-800">All done! 🎉</h2>
        <p className="text-gray-500 font-bold">You wrote {completed} word{completed !== 1 ? 's' : ''}.</p>
        <button onClick={restart} className="mt-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold px-6 py-2.5 rounded-full inline-flex items-center gap-2">
          <RotateCcw className="w-5 h-5" /> Play again
        </button>
      </div>
    );
  }

  const wp = waypoints[correctLetter];
  const hasWaypoints = !!wp && Array.isArray(wp.strokes) && wp.strokes.length;

  // The picture element for the current item.
  const picture = (() => {
    if (!item) return null;
    if (item.image_source === 'emoji') {
      return <span className="text-[7rem] leading-none select-none">{item.emoji || '❓'}</span>;
    }
    if (item.image_source === 'upload' && item.image_url) {
      return <img src={item.image_url} alt={item.word} className="max-h-44 max-w-full rounded-2xl object-contain" />;
    }
    if (item.image_source === 'random') {
      const url = imageCache[idx];
      return url
        ? <img src={url} alt={item.word} className="max-h-44 max-w-full rounded-2xl object-contain" />
        : <div className="h-44 w-44 rounded-2xl bg-indigo-100 animate-pulse" />;
    }
    return <span className="text-5xl">❓</span>;
  })();

  return (
    <div
      className="relative h-full flex flex-col bg-gradient-to-b from-sky-50 to-indigo-50 select-none"
      style={{ touchAction: 'none' }}
    >
      {/* progress */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs font-black text-indigo-500 bg-white/70 rounded-full px-3 py-1">
          Word {idx + 1} of {items.length}
        </span>
        <span className="text-xs font-bold text-gray-400">✅ {completed}</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 pb-4 overflow-y-auto">
        {/* picture + word — always visible; the blank becomes the tracing canvas */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 w-full max-w-3xl">
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div className={`bg-white rounded-3xl shadow-md border-2 border-indigo-100 flex items-center justify-center ${phase === 'tracing' ? 'px-4 py-3 min-h-32 min-w-32' : 'px-6 py-4 min-h-44 min-w-44'}`}>
              {picture}
            </div>
            <button
              onClick={playWord}
              className="bg-white/80 hover:bg-white text-indigo-600 font-bold text-sm px-4 py-1.5 rounded-full shadow inline-flex items-center gap-1.5"
            >
              <Volume2 className="w-4 h-4" /> Hear it
            </button>
          </div>

          <div className="flex items-center gap-1 flex-wrap justify-center">
            {phase === 'tracing' && hasWaypoints ? (
              <MissingLetterWordCanvas
                key={`${correctLetter}-${idx}`}
                word={item.word}
                targetIndex={item.position === 'final' ? item.word.length - 1 : 0}
                waypoints={waypoints}
                onComplete={handleTraced}
                lang={lang}
                silent={silent}
                renderWidth={500}
              />
            ) : (
              <>
                {item.position === 'initial' && (
                  <BlankSlot
                    ref={blankRef}
                    placed={placed}
                    wrong={wrong}
                    correctLetter={correctLetter}
                  />
                )}
                {displayLetters.map((c, i) => (
                  <span key={i} className="font-black text-gray-700 lowercase text-6xl md:text-7xl">{c}</span>
                ))}
                {item.position === 'final' && (
                  <BlankSlot
                    ref={blankRef}
                    placed={placed}
                    wrong={wrong}
                    correctLetter={correctLetter}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* letter bank — only during choose */}
        {phase === 'choose' && (
          <>
            <div className="flex flex-wrap gap-3 justify-center mt-2 max-w-xl">
              {bank.map((letter, i) => (
                <button
                  key={`${letter}-${i}`}
                  onPointerDown={(e) => onTileDown(e, letter)}
                  onPointerMove={onTileMove}
                  onPointerUp={onTileUp}
                  onPointerCancel={onTileUp}
                  disabled={phase !== 'choose'}
                  className="w-14 h-14 rounded-2xl bg-white shadow-md border-2 border-indigo-100 text-3xl font-black text-indigo-600 lowercase flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-40"
                  style={{ touchAction: 'none' }}
                >
                  {letter}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">Drag a letter to the empty box — or tap it.</p>
          </>
        )}

        {/* no waypoints fallback — show skip button below */}
        {phase === 'tracing' && !hasWaypoints && (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-sm text-gray-500">No tracing path found for “{correctLetter}”.</p>
            <button onClick={handleTraced} className="bg-indigo-500 text-white font-bold px-5 py-2 rounded-full">Skip →</button>
          </div>
        )}
      </div>

      {/* floating drag ghost */}
      {drag && (
        <div
          className="fixed pointer-events-none z-50 w-14 h-14 rounded-2xl bg-indigo-500 text-white text-3xl font-black lowercase flex items-center justify-center shadow-2xl -translate-x-1/2 -translate-y-1/2"
          style={{ left: drag.x, top: drag.y }}
        >
          {drag.letter}
        </div>
      )}
    </div>
  );
}

// The empty box the student drops the letter into. Shows the placed letter
// (green when correct, red when wrong) and pulses while empty.
const BlankSlot = forwardRef(function BlankSlot({ placed, wrong, correctLetter }, ref) {
  return (
    <div
      ref={ref}
      className={`w-14 h-16 md:w-16 md:h-20 rounded-2xl border-4 border-dashed flex items-center justify-center text-6xl md:text-7xl font-black lowercase transition-colors ${
        wrong
          ? 'border-red-400 bg-red-50 text-red-500'
          : placed
            ? 'border-green-400 bg-green-50 text-green-600'
            : 'border-indigo-300 bg-indigo-50/50 text-indigo-200 animate-pulse'
      }`}
    >
      {placed || ''}
    </div>
  );
});