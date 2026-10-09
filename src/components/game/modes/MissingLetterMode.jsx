import { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { LETTER_WAYPOINTS } from '../../data/letterWaypoints';
import { NUMBER_WAYPOINTS } from '../../data/numberWaypoints';
import MissingLetterWordCanvas from '../MissingLetterWordCanvas';
import MissingLetterKeyboard from '@/components/missingletter/MissingLetterKeyboard';
import { resolveImageForWord } from '@/lib/lettersort/storage';
import { AUDIO_BASE, toAudioName } from '@/lib/audio';
import { getLanguage } from '@/lib/language';
import { useCoinAward } from '@/hooks/useCoinAward';
import {
  getIntroducedLetters,
  determineMode,
  generateLetterItems,
  generateSyllableItems,
} from '@/lib/missingLetterProgression';
import { Volume2, RotateCcw, Trophy, Delete } from 'lucide-react';

const IMG_BUCKET = 'lettersort-images';

export default function MissingLetterMode({
  classConfig,
  studentData,
  onUpdateProgress,
  onStudentPatch,
  onComplete,
  silent = false,
}) {
  const introducedSet = useMemo(() => getIntroducedLetters(classConfig), [classConfig]);
  const mode = useMemo(() => determineMode(classConfig), [classConfig]);

  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState('choose'); // choose | tracing | done
  const [itemMistakes, setItemMistakes] = useState(0);
  const [placed, setPlaced] = useState(null);       // letter mode: letter in the blank
  const [typed, setTyped] = useState('');            // syllable mode: letters typed so far
  const [wrong, setWrong] = useState(false);
  const [wrongLetter, setWrongLetter] = useState(null);
  const [imageCache, setImageCache] = useState({});
  const [completed, setCompleted] = useState(0);
  const [firstTryCount, setFirstTryCount] = useState(0);
  const [waypoints, setWaypoints] = useState({ ...LETTER_WAYPOINTS, ...NUMBER_WAYPOINTS });
  const [traceAccuracy, setTraceAccuracy] = useState(null);
  const [loading, setLoading] = useState(true);

  const lang = getLanguage(studentData);
  const awardCoins = useCoinAward(studentData, onStudentPatch);

  // Generate items based on the progression mode.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        let its;
        if (mode === 'syllable') {
          its = generateSyllableItems(classConfig);
        } else {
          its = await generateLetterItems(classConfig);
        }
        if (cancelled || !its || !its.length) { if (!cancelled) setLoading(false); return; }
        // Shuffle
        const shuffled = its.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        if (!cancelled) {
          setItems(shuffled);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, classConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load waypoints from DB.
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

  // Reset per-item state when the item changes.
  useEffect(() => {
    setItemMistakes(0);
    setPlaced(null);
    setTyped('');
    setWrong(false);
    setWrongLetter(null);
    setPhase('choose');
    setTraceAccuracy(null);
  }, [idx]);

  // Resolve random images for letter-mode items.
  useEffect(() => {
    let cancelled = false;
    if (!items.length || mode !== 'letter') return;
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
  }, [items, mode]);

  // ---- letter mode helpers ----
  const correctLetter = useMemo(() => {
    if (!item || mode !== 'letter') return '';
    return item.position === 'final' ? item.word[item.word.length - 1] : item.word[0];
  }, [item, mode]);

  const displayLetters = useMemo(() => {
    if (!item || mode !== 'letter') return [];
    const rest = item.position === 'final' ? item.word.slice(0, -1) : item.word.slice(1);
    return rest.split('');
  }, [item, mode]);

  const playWord = useCallback(() => {
    if (!item || mode !== 'letter') return;
    try {
      const a = new Audio(`${AUDIO_BASE}/${lang}/words/${toAudioName(item.word)}.mp3`);
      a.play().catch(() => {});
    } catch {}
  }, [item, lang, mode]);

  // ---- syllable mode helpers ----
  const correctSyllable = useMemo(() => {
    if (!item || mode !== 'syllable') return '';
    return item.missingSyllable || '';
  }, [item, mode]);

  const playSyllableWord = useCallback(() => {
    if (!item || mode !== 'syllable') return;
    try {
      const a = new Audio(`${AUDIO_BASE}/${lang}/words/${toAudioName(item.word)}.mp3`);
      a.play().catch(() => {});
    } catch {}
  }, [item, lang, mode]);

  // ---- keyboard handler ----
  const handleKeyPress = useCallback((letter) => {
    if (phase !== 'choose') return;

    if (mode === 'letter') {
      if (letter === correctLetter) {
        setPlaced(letter);
        setWrong(false);
        setWrongLetter(null);
        setTimeout(() => setPhase('tracing'), 450);
      } else {
        setWrong(true);
        setWrongLetter(letter);
        setItemMistakes((m) => m + 1);
        setPlaced(letter);
        setTimeout(() => { setWrong(false); setWrongLetter(null); setPlaced(null); }, 700);
      }
    } else {
      // syllable mode — build the syllable letter by letter
      const newTyped = typed + letter;
      if (correctSyllable.startsWith(newTyped)) {
        setTyped(newTyped);
        setWrong(false);
        setWrongLetter(null);
        if (newTyped === correctSyllable) {
          // Syllable complete — celebrate and advance
          setTimeout(() => handleSyllableComplete(), 500);
        }
      } else {
        setWrong(true);
        setWrongLetter(letter);
        setItemMistakes((m) => m + 1);
        setTimeout(() => { setWrong(false); setWrongLetter(null); }, 700);
      }
    }
  }, [phase, mode, correctLetter, correctSyllable, typed]);

  // Delete last typed letter (syllable mode backspace).
  const handleBackspace = useCallback(() => {
    if (phase !== 'choose' || mode !== 'syllable') return;
    setTyped((t) => t.slice(0, -1));
    setWrong(false);
    setWrongLetter(null);
  }, [phase, mode]);

  const handleSyllableComplete = useCallback(() => {
    const isFirstTry = itemMistakes === 0;
    if (isFirstTry) {
      setFirstTryCount((c) => c + 1);
      awardCoins(4);
    }
    setCompleted((c) => c + 1);
    onUpdateProgress?.('missing_letter', {
      total_attempts: completed + 1,
      total_correct: completed + 1,
      mastered_items: [],
      learning_items: [],
    });
    if (idx + 1 >= items.length) {
      setPhase('done');
      onComplete?.({});
    } else {
      setIdx(idx + 1);
    }
  }, [itemMistakes, awardCoins, completed, idx, items.length, onUpdateProgress, onComplete]);

  const handleTraced = useCallback(() => {
    const isFirstTry = itemMistakes === 0;
    if (isFirstTry) {
      setFirstTryCount((c) => c + 1);
      const isGreen = traceAccuracy == null || traceAccuracy >= 80;
      awardCoins(isGreen ? 4 : 2);
    }
    setCompleted((c) => c + 1);
    setTraceAccuracy(null);
    onUpdateProgress?.('missing_letter', {
      total_attempts: completed + 1,
      total_correct: completed + 1,
      mastered_items: [],
      learning_items: [],
    });
    if (idx + 1 >= items.length) {
      setPhase('done');
      onComplete?.({});
    } else {
      setIdx(idx + 1);
    }
  }, [itemMistakes, awardCoins, traceAccuracy, completed, idx, items.length, onUpdateProgress, onComplete]);

  const restart = () => {
    setIdx(0);
    setCompleted(0);
    setFirstTryCount(0);
    setPhase('choose');
    setPlaced(null);
    setTyped('');
    setWrong(false);
    setItemMistakes(0);
  };

  // ---- render: loading ----
  if (loading) {
    return (
      <div className="relative h-full flex flex-col items-center justify-center bg-gradient-to-b from-sky-50 to-indigo-50 p-6">
        <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-500 rounded-full animate-spin" />
        <p className="text-sm text-gray-400 mt-3">Loading words…</p>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="relative h-full flex flex-col items-center justify-center bg-gradient-to-b from-sky-50 to-indigo-50 p-6 text-center">
        <div className="text-5xl mb-3">🔤</div>
        <p className="text-gray-500 font-bold">No words available yet.</p>
        <p className="text-gray-400 text-sm mt-1">Your teacher needs to advance the lesson to unlock words.</p>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="relative h-full flex flex-col items-center justify-center bg-gradient-to-b from-green-50 to-emerald-100 p-6 text-center gap-4">
        <Trophy className="w-16 h-16 text-amber-400" />
        <h2 className="text-3xl font-black text-gray-800">All done! 🎉</h2>
        <p className="text-gray-500 font-bold">
          You wrote {completed} word{completed !== 1 ? 's' : ''}.
        </p>
        <p className="text-green-600 font-bold text-sm">
          ⭐ {firstTryCount} correct on the first try!
        </p>
        <button onClick={restart} className="mt-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold px-6 py-2.5 rounded-full inline-flex items-center gap-2">
          <RotateCcw className="w-5 h-5" /> Play again
        </button>
      </div>
    );
  }

  // ---- letter mode: picture helper ----
  const picture = (() => {
    if (mode !== 'letter' || !item) return null;
    if (item.image_source === 'emoji') return <span className="text-6xl leading-none select-none">{item.emoji || '❓'}</span>;
    if (item.image_source === 'upload' && item.image_url) return <img src={item.image_url} alt={item.word} className="max-h-32 max-w-full rounded-2xl object-contain" />;
    if (item.image_source === 'random') {
      const url = imageCache[idx];
      return url ? <img src={url} alt={item.word} className="max-h-32 max-w-full rounded-2xl object-contain" /> : <div className="h-32 w-32 rounded-2xl bg-indigo-100 animate-pulse" />;
    }
    return <span className="text-4xl">❓</span>;
  })();

  const compactPicture = (() => {
    if (mode !== 'letter' || !item) return null;
    if (item.image_source === 'emoji') return <span className="text-3xl leading-none select-none">{item.emoji || '❓'}</span>;
    if (item.image_source === 'upload' && item.image_url) return <img src={item.image_url} alt={item.word} className="max-h-16 max-w-16 rounded-xl object-contain" />;
    if (item.image_source === 'random') {
      const url = imageCache[idx];
      return url ? <img src={url} alt={item.word} className="max-h-16 max-w-16 rounded-xl object-contain" /> : <div className="h-16 w-16 rounded-xl bg-indigo-100 animate-pulse" />;
    }
    return <span className="text-2xl">❓</span>;
  })();

  const wp = mode === 'letter' ? waypoints[correctLetter] : null;
  const hasWaypoints = !!wp && Array.isArray(wp.strokes) && wp.strokes.length;

  return (
    <div
      className="relative h-full flex flex-col bg-gradient-to-b from-sky-50 to-indigo-50 select-none"
      style={{ touchAction: 'none' }}
    >
      {/* progress bar */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <span className="text-xs font-black text-indigo-500 bg-white/70 rounded-full px-3 py-1">
          {mode === 'syllable' ? 'Sílabas' : 'Letter'} {idx + 1} of {items.length}
        </span>
        <div className="flex items-center gap-2">
          {itemMistakes > 0 && (
            <span className="text-xs font-bold text-amber-500 bg-amber-50 rounded-full px-2 py-0.5">
              No bonus ⚠️
            </span>
          )}
          <span className="text-xs font-bold text-gray-400">⭐ {firstTryCount}</span>
          <span className="text-xs font-bold text-gray-400">✅ {completed}</span>
        </div>
      </div>

      <div className={`flex-1 flex flex-col gap-3 px-4 pb-2 min-h-0 ${phase === 'tracing' && hasWaypoints ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {mode === 'letter' && phase === 'tracing' && hasWaypoints ? (
          /* ---- letter mode: tracing phase ---- */
          <div className="flex flex-col items-center gap-2 w-full flex-1 self-stretch max-w-4xl min-h-0">
            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-white rounded-2xl shadow-md border-2 border-indigo-100 px-3 py-2 flex items-center justify-center">
                {compactPicture}
              </div>
              <button
                onClick={playWord}
                className="bg-white/80 hover:bg-white text-indigo-600 font-bold text-sm px-4 py-1.5 rounded-full shadow inline-flex items-center gap-1.5"
              >
                <Volume2 className="w-4 h-4" /> Hear it
              </button>
            </div>
            <div className="flex-1 min-h-0 w-full">
              <MissingLetterWordCanvas
                key={`${correctLetter}-${idx}`}
                word={item.word}
                targetIndex={item.position === 'final' ? item.word.length - 1 : 0}
                waypoints={waypoints}
                onComplete={handleTraced}
                onAccuracy={setTraceAccuracy}
                lang={lang}
                silent={silent}
                fillHeight
              />
            </div>
          </div>
        ) : mode === 'letter' ? (
          /* ---- letter mode: choose phase ---- */
          <div className="flex flex-col items-center justify-center gap-3 w-full max-w-2xl mx-auto flex-1">
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div className="bg-white rounded-3xl shadow-md border-2 border-indigo-100 flex items-center justify-center px-4 py-3 min-h-32 min-w-32">
                {picture}
              </div>
              <button
                onClick={playWord}
                className="bg-white/80 hover:bg-white text-indigo-600 font-bold text-sm px-4 py-1.5 rounded-full shadow inline-flex items-center gap-1.5"
              >
                <Volume2 className="w-4 h-4" /> Hear it
              </button>
            </div>
            {/* word with blank */}
            <div className="flex items-center gap-1 flex-wrap justify-center">
              {item.position === 'initial' && (
                <BlankSlot placed={placed} wrong={wrong} correctLetter={correctLetter} />
              )}
              {displayLetters.map((c, i) => (
                <span key={i} className="font-black text-gray-700 lowercase text-5xl md:text-6xl">{c}</span>
              ))}
              {item.position === 'final' && (
                <BlankSlot placed={placed} wrong={wrong} correctLetter={correctLetter} />
              )}
            </div>
          </div>
        ) : (
          /* ---- syllable mode ---- */
          <div className="flex flex-col items-center justify-center gap-4 w-full max-w-2xl mx-auto flex-1">
            <button
              onClick={playSyllableWord}
              className="bg-white/80 hover:bg-white text-indigo-600 font-bold text-sm px-4 py-1.5 rounded-full shadow inline-flex items-center gap-1.5"
            >
              <Volume2 className="w-4 h-4" /> Hear the word
            </button>
            {/* syllable boxes */}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {item.syllables.map((syl, si) => {
                const isMissing = si === item.missingIdx;
                if (isMissing) {
                  return (
                    <div
                      key={si}
                      className={`min-w-20 h-16 rounded-2xl border-4 border-dashed flex items-center justify-center text-4xl md:text-5xl font-black lowercase transition-colors ${
                        wrong
                          ? 'border-red-400 bg-red-50 text-red-500'
                          : typed.length === correctSyllable.length
                            ? 'border-green-400 bg-green-50 text-green-600'
                            : 'border-indigo-300 bg-indigo-50/50 text-indigo-700'
                      }`}
                    >
                      {typed || ''}
                    </div>
                  );
                }
                return (
                  <div
                    key={si}
                    className="px-3 h-16 rounded-2xl border-2 border-green-200 bg-green-50 flex items-center justify-center text-4xl md:text-5xl font-black lowercase text-green-600"
                  >
                    {syl}
                  </div>
                );
              })}
            </div>
            {/* position hint */}
            <p className="text-sm text-gray-400 font-bold">
              {item.position === 'initial' && '👆 Type the first syllable'}
              {item.position === 'middle' && '👆 Type the middle syllable'}
              {item.position === 'final' && '👆 Type the last syllable'}
            </p>
          </div>
        )}

        {/* keyboard — only during choose phase */}
        {phase === 'choose' && (
          <div className="flex flex-col items-center gap-2 shrink-0 pb-2">
            <MissingLetterKeyboard
              introducedSet={introducedSet}
              onKeyPress={handleKeyPress}
              disabled={phase !== 'choose'}
              wrongLetter={wrongLetter}
            />
            {mode === 'syllable' && typed.length > 0 && (
              <button
                onClick={handleBackspace}
                className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
              >
                <Delete className="w-4 h-4" /> Delete
              </button>
            )}
            {mode === 'letter' && (
              <p className="text-xs text-gray-400">Tap the green letters to fill the box</p>
            )}
          </div>
        )}

        {/* no waypoints fallback — letter mode only */}
        {mode === 'letter' && phase === 'tracing' && !hasWaypoints && (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-sm text-gray-500">No tracing path found for "{correctLetter}".</p>
            <button onClick={handleTraced} className="bg-indigo-500 text-white font-bold px-5 py-2 rounded-full">Skip →</button>
          </div>
        )}
      </div>
    </div>
  );
}

// The empty box for letter mode — shows the placed letter (green when correct,
// red when wrong) and pulses while empty.
function BlankSlot({ placed, wrong }) {
  return (
    <div
      className={`w-12 h-14 md:w-14 md:h-16 rounded-2xl border-4 border-dashed flex items-center justify-center text-5xl md:text-6xl font-black lowercase transition-colors ${
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
}