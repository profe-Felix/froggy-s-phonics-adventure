import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { base44 } from '@/api/base44Client';

import {
  LETTER_WAYPOINTS,
} from '@/components/data/letterWaypoints';

import confetti from 'canvas-confetti';
import {
  Loader2,
  Volume2,
} from 'lucide-react';

import WordTracingCanvas from '@/components/game/WordTracingCanvas';
import MissingLetterKeyboard from '@/components/missingletter/MissingLetterKeyboard';
import FreehandWriteCanvas from '@/components/literacy/FreehandWriteCanvas';

import {
  getDefaultVoice,
} from '@/lib/activities/ttsVoices';

const ROUND_SIZE = 10;
const PASSING_ACCURACY = 80;

const STAGES = [
  {
    key: 'freehand',
    number: 1,
    label: 'Intenta',
  },
  {
    key: 'build',
    number: 2,
    label: 'Construye',
  },
  {
    key: 'trace',
    number: 3,
    label: 'Traza',
  },
  {
    key: 'write',
    number: 4,
    label: 'Escribe',
  },
];

function shuffle(items) {
  const result = [
    ...(items || []),
  ];

  for (
    let index = result.length - 1;
    index > 0;
    index -= 1
  ) {
    const swapIndex =
      Math.floor(
        Math.random() * (index + 1)
      );

    [
      result[index],
      result[swapIndex],
    ] = [
      result[swapIndex],
      result[index],
    ];
  }

  return result;
}

function buildRound(
  source,
  count = ROUND_SIZE
) {
  if (!source?.length) {
    return [];
  }

  const round = [];
  let available = shuffle(source);

  while (round.length < count) {
    if (!available.length) {
      available = shuffle(source);
    }

    round.push(
      available.shift()
    );
  }

  return round;
}

function createLetterTiles(
  target,
  distractorPool
) {
  const targetLetters =
    [...String(target || '')];

  const correctTiles =
    targetLetters.map(
      (letter, index) => ({
        id:
          `correct-${letter}-${index}-${Math.random()
            .toString(36)
            .slice(2)}`,
        letter,
      })
    );

  // Prefer letters that are not already in the target.
  // All letters in distractorPool come from currently
  // available, curriculum-approved syllables and words.
  const preferredDistractors =
    shuffle(
      (distractorPool || []).filter(
        (letter) =>
          !targetLetters.includes(
            letter
          )
      )
    );

  const fallbackDistractors =
    shuffle(
      distractorPool || []
    );

  const distractorCount =
    Math.min(
      4,
      Math.max(
        2,
        targetLetters.length
      )
    );

  const selectedDistractors = [];

  for (
    const letter of preferredDistractors
  ) {
    if (
      selectedDistractors.length >=
      distractorCount
    ) {
      break;
    }

    if (
      !selectedDistractors.includes(
        letter
      )
    ) {
      selectedDistractors.push(
        letter
      );
    }
  }

  for (
    const letter of fallbackDistractors
  ) {
    if (
      selectedDistractors.length >=
      distractorCount
    ) {
      break;
    }

    if (
      !selectedDistractors.includes(
        letter
      )
    ) {
      selectedDistractors.push(
        letter
      );
    }
  }

  const distractorTiles =
    selectedDistractors.map(
      (letter, index) => ({
        id:
          `distractor-${letter}-${index}-${Math.random()
            .toString(36)
            .slice(2)}`,
        letter,
      })
    );

  return shuffle([
    ...correctTiles,
    ...distractorTiles,
  ]);
}

const ttsUrlCache = new Map();

async function getTtsUrl(
  text,
  voice
) {
  const cacheKey =
    `${voice || 'default'}:${text}`;

  if (
    ttsUrlCache.has(cacheKey)
  ) {
    return ttsUrlCache.get(
      cacheKey
    );
  }

  const response =
    await base44.functions.invoke(
      'generateTts',
      {
        text,
        lang: 'es',
        voice:
          voice || undefined,
      }
    );

  const url =
    response?.data?.url || '';

  if (url) {
    ttsUrlCache.set(
      cacheKey,
      url
    );
  }

  return url;
}

function playAudioUrl(
  url,
  audioRef
) {
  return new Promise(
    (resolve) => {
      if (!url) {
        resolve();
        return;
      }

      try {
        if (
          audioRef.current
        ) {
          audioRef.current.pause();
          audioRef.current.onended =
            null;
          audioRef.current.onerror =
            null;
        }

        const audio =
          new Audio(url);

        audioRef.current =
          audio;

        audio.onended =
          resolve;

        audio.onerror =
          resolve;

        audio
          .play()
          .catch(resolve);
      } catch {
        resolve();
      }
    }
  );
}

function isTraceable(
  target,
  waypoints
) {
  return [...String(target || '')]
    .every((letter) => {
      const strokes =
        waypoints[
          letter.toLowerCase()
        ]?.strokes;

      return (
        Array.isArray(strokes) &&
        strokes.length > 0
      );
    });
}

export default function AdaptiveWordPractice({
  syllables = [],
  words = [],
  onWordComplete,
}) {
  const [waypoints, setWaypoints] =
    useState(LETTER_WAYPOINTS);

  const [
    practiceLevel,
    setPracticeLevel,
  ] = useState('syllables');

  const [
    roundTargets,
    setRoundTargets,
  ] = useState([]);

  const [
    targetIndex,
    setTargetIndex,
  ] = useState(0);

  const [
    roundResults,
    setRoundResults,
  ] = useState([]);

  const [stage, setStage] =
    useState('build');

  const [
    availableTiles,
    setAvailableTiles,
  ] = useState([]);

  const [
    builtTiles,
    setBuiltTiles,
  ] = useState([]);

  const [
    buildError,
    setBuildError,
  ] = useState(false);

  const [
    buildCharResults,
    setBuildCharResults,
  ] = useState([]);

  const [
    buildCorrect,
    setBuildCorrect,
  ] = useState(false);

  const [
    attemptCount,
    setAttemptCount,
  ] = useState(1);

  const [
    firstAttemptCorrect,
    setFirstAttemptCorrect,
  ] = useState(true);

  const [typed, setTyped] = useState('');

  const [
    canvasKey,
    setCanvasKey,
  ] = useState(0);

  const [
    lastRoundSummary,
    setLastRoundSummary,
  ] = useState(null);

  const [
    playingPrompt,
    setPlayingPrompt,
  ] = useState(false);

  const audioRef =
    useRef(null);

  const promptRequestRef =
    useRef(0);

  // Merge teacher-authored waypoints over the bundled
  // fallback waypoint data.
  useEffect(() => {
    let cancelled = false;

    base44.entities.LetterWaypoint
      .list()
      .then((records) => {
        if (
          cancelled ||
          !Array.isArray(records) ||
          records.length === 0
        ) {
          return;
        }

        setWaypoints((previous) => {
          const merged = {
            ...previous,
          };

          records.forEach((record) => {
            if (
              !record?.letter ||
              !record?.strokes_data
            ) {
              return;
            }

            try {
              const strokes =
                JSON.parse(
                  record.strokes_data
                );

              if (
                Array.isArray(strokes) &&
                strokes.length > 0
              ) {
                const letter =
                  String(record.letter)
                    .trim()
                    .toLowerCase();

                merged[letter] = {
                  strokes,
                  hint:
                    record.hint ||
                    previous[letter]?.hint ||
                    '',
                };
              }
            } catch {
              // Keep the bundled fallback for malformed
              // teacher records.
            }
          });

          return merged;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const traceableSyllables =
    useMemo(
      () =>
        (syllables || []).filter(
          (syllable) =>
            isTraceable(
              syllable,
              waypoints
            )
        ),
      [
        syllables,
        waypoints,
      ]
    );

  const traceableWords =
    useMemo(
      () =>
        (words || []).filter(
          (word) =>
            isTraceable(
              word,
              waypoints
            )
        ),
      [
        words,
        waypoints,
      ]
    );

  // Distractors only come from characters that occur in
  // curriculum-approved, traceable syllables or words.
  const distractorLetters =
    useMemo(() => {
      const letters =
        [
          ...traceableSyllables,
          ...traceableWords,
        ].flatMap((target) =>
          [...String(target || '')]
        );

      return [
        ...new Set(letters),
      ].filter((letter) =>
        isTraceable(
          letter,
          waypoints
        )
      );
    }, [
      traceableSyllables,
      traceableWords,
      waypoints,
    ]);

  const introducedSet = useMemo(() => {
    const set = new Set();
    [...(syllables || []), ...(words || [])].forEach((target) => {
      [...String(target || '')].forEach((letter) =>
        set.add(letter.toLowerCase())
      );
    });
    return set;
  }, [syllables, words]);

  const resetTarget = (
    target,
    skipFreehand = false
  ) => {
    setStage(skipFreehand ? 'build' : 'freehand');

    setAvailableTiles(
      createLetterTiles(
        target,
        distractorLetters
      )
    );

    setBuiltTiles([]);
    setBuildError(false);
    setBuildCharResults([]);
    setBuildCorrect(false);
    setAttemptCount(1);

    setFirstAttemptCorrect(
      true
    );

    setTyped('');

    setCanvasKey(
      (previous) => previous + 1
    );
  };

  const beginRound = (
    level,
    pool
  ) => {
    const nextRound =
      buildRound(
        pool,
        ROUND_SIZE
      );

    setPracticeLevel(level);
    setRoundTargets(nextRound);
    setTargetIndex(0);
    setRoundResults([]);
    setLastRoundSummary(null);

    if (nextRound.length) {
      resetTarget(
        nextRound[0]
      );
    }
  };

  // Start with syllables. If no syllables can be traced,
  // fall back to available words.
  useEffect(() => {
    if (roundTargets.length) {
      return;
    }

    if (
      traceableSyllables.length
    ) {
      beginRound(
        'syllables',
        traceableSyllables
      );

      return;
    }

    if (traceableWords.length) {
      beginRound(
        'words',
        traceableWords
      );
    }
  }, [
    traceableSyllables,
    traceableWords,
    roundTargets.length,
  ]);

  const currentTarget =
    roundTargets[
      targetIndex
    ] || '';

  // Preload TTS for every target in the current round so the student
  // never waits for audio generation when they reach each word/syllable.
  // getTtsUrl caches the URL in ttsUrlCache — this just warms the cache.
  useEffect(() => {
    if (!roundTargets.length) return;
    let cancelled = false;
    (async () => {
      const voice = await getDefaultVoice();
      if (cancelled) return;
      roundTargets.forEach((target) => {
        if (target) getTtsUrl(target, voice);
      });
    })();
    return () => { cancelled = true; };
  }, [roundTargets]);

  const builtTarget =
    builtTiles
      .map((tile) => tile.letter)
      .join('');

  const playBuildPrompt =
    async () => {
      if (
        !currentTarget ||
        (stage !== 'build' &&
          stage !== 'freehand')
      ) {
        return;
      }

      const requestId =
        promptRequestRef.current + 1;

      promptRequestRef.current =
        requestId;

      setPlayingPrompt(true);

      try {
        const voice =
          await getDefaultVoice();

        const instruction =
          stage === 'freehand'
            ? practiceLevel ===
              'syllables'
              ? 'Escribe la sílaba'
              : 'Escribe la palabra'
            : practiceLevel ===
              'syllables'
              ? 'Construye la sílaba'
              : 'Construye la palabra';

        const [
          instructionUrl,
          targetUrl,
        ] = await Promise.all([
          getTtsUrl(
            instruction,
            voice
          ),

          getTtsUrl(
            currentTarget,
            voice
          ),
        ]);

        if (
          promptRequestRef.current !==
          requestId
        ) {
          return;
        }

        await playAudioUrl(
          instructionUrl,
          audioRef
        );

        if (
          promptRequestRef.current !==
          requestId
        ) {
          return;
        }

        await playAudioUrl(
          targetUrl,
          audioRef
        );
      } finally {
        if (
          promptRequestRef.current ===
          requestId
        ) {
          setPlayingPrompt(false);
        }
      }
    };

  // Attempt automatic playback for each new Build target.
  // If the browser blocks autoplay, the speaker button
  // remains available.
  useEffect(() => {
    if (
      !currentTarget ||
      (stage !== 'build' &&
        stage !== 'freehand')
    ) {
      return;
    }

    playBuildPrompt();
  }, [
    currentTarget,
    practiceLevel,
    stage,
  ]);

  useEffect(
    () => () => {
      promptRequestRef.current += 1;

      if (audioRef.current) {
        audioRef.current.pause();
      }
    },
    []
  );

  const chooseTile = (tile) => {
    setBuildError(false);

    setAvailableTiles(
      (previous) =>
        previous.filter(
          (item) =>
            item.id !== tile.id
        )
    );

    setBuiltTiles(
      (previous) => [
        ...previous,
        tile,
      ]
    );
  };

  const removeBuiltTile = (
    tile,
    index
  ) => {
    setBuildError(false);

    setBuiltTiles((previous) =>
      previous.filter(
        (_, tileIndex) =>
          tileIndex !== index
      )
    );

    setAvailableTiles(
      (previous) => [
        ...previous,
        tile,
      ]
    );
  };

  const finishFreehand = () => {
    setStage('build');

    setCanvasKey(
      (previous) => previous + 1
    );
  };

  const checkSubmission = (
    submission
  ) => {
    if (
      submission ===
      currentTarget
    ) {
      setBuildError(false);
      setBuildCharResults([]);
      setBuildCorrect(true);

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });

      setTimeout(() => {
        handleContinueToTrace();
      }, 1500);

      return;
    }

    const charResults =
      [...String(currentTarget || '')].map(
        (char, index) =>
          submission[index] ===
          char
      );

    setBuildError(true);
    setBuildCharResults(
      charResults
    );

    setFirstAttemptCorrect(
      false
    );

    setAttemptCount(
      (previous) =>
        previous + 1
    );

    setTimeout(() => {
      setTyped('');
      setBuildError(false);
      setBuildCharResults([]);
    }, 1500);
  };

  const handleKeyPress = (
    letter
  ) => {
    if (
      stage !== 'build'
    ) {
      return;
    }

    setBuildError(false);
    setBuildCharResults([]);

    const newTyped =
      typed + letter;

    setTyped(newTyped);
  };

  const handleSubmit = () => {
    if (
      stage !== 'build' ||
      !typed.length
    ) {
      return;
    }

    checkSubmission(typed);
  };

  const handleContinueToTrace = () => {
    setStage('trace');

    setCanvasKey(
      (previous) =>
        previous + 1
    );
  };

  const handleBackspace = () => {
    if (
      stage !== 'build'
    ) {
      return;
    }

    setTyped((prev) =>
      prev.slice(0, -1)
    );

    setBuildError(false);
    setBuildCharResults([]);
  };

  const finishTrace = () => {
    setStage('write');

    setCanvasKey(
      (previous) => previous + 1
    );
  };

  const advanceToNextTarget = (
    writingAccuracy = 0,
    skipFreehand = false
  ) => {
    const result = {
      target: currentTarget,
      type: practiceLevel === 'syllables' ? 'syllable' : 'word',
      buildCorrectFirstAttempt: firstAttemptCorrect,
      writingAccuracy,
    };

    const completedResults = [...roundResults, result];
    onWordComplete?.(result);

    const completedRound = targetIndex >= roundTargets.length - 1;

    if (!completedRound) {
      const nextIndex = targetIndex + 1;
      setRoundResults(completedResults);
      setTargetIndex(nextIndex);
      resetTarget(roundTargets[nextIndex], skipFreehand);
      return;
    }

    const correctCount = completedResults.filter((item) => item.buildCorrectFirstAttempt).length;
    const accuracy = Math.round((correctCount / completedResults.length) * 100);
    const passed = accuracy >= PASSING_ACCURACY;

    setLastRoundSummary({
      level: practiceLevel,
      correctCount,
      total: completedResults.length,
      accuracy,
      passed,
    });

    if (practiceLevel === 'syllables' && passed && traceableWords.length) {
      setTimeout(() => beginRound('words', traceableWords), 1800);
      return;
    }

    const nextPool = practiceLevel === 'syllables' ? traceableSyllables : traceableWords;
    setTimeout(() => beginRound(practiceLevel, nextPool), 1800);
  };

  const finishWrite = (writingAccuracy) => {
    advanceToNextTarget(writingAccuracy, false);
  };

  if (
    !currentTarget &&
    !roundTargets.length
  ) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center bg-blue-50 p-6">
        <div className="max-w-md rounded-3xl border border-blue-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-3 text-5xl">
            🔤
          </div>

          <h2 className="text-xl font-black text-slate-800">
            Todavía no hay práctica disponible
          </h2>

          <p className="mt-2 text-sm font-medium text-slate-500">
            El maestro debe establecer una posición curricular
            que incluya suficientes letras para formar sílabas.
          </p>
        </div>
      </div>
    );
  }

  if (lastRoundSummary) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center bg-gradient-to-b from-blue-50 to-white p-6">
        <div className="w-full max-w-md rounded-3xl border border-blue-100 bg-white p-8 text-center shadow-lg">
          <div className="text-5xl">
            {lastRoundSummary.passed
              ? '🎉'
              : '💪'}
          </div>

          <h2 className="mt-3 text-2xl font-black text-slate-800">
            {lastRoundSummary.passed
              ? '¡Muy bien!'
              : '¡Sigamos practicando!'}
          </h2>

          <p className="mt-3 text-lg font-bold text-slate-600">
            {
              lastRoundSummary
                .correctCount
            }{' '}
            de{' '}
            {
              lastRoundSummary
                .total
            }{' '}
            correctas en el primer intento
          </p>

          <div className="mx-auto mt-4 flex h-24 w-24 items-center justify-center rounded-full bg-blue-100 text-2xl font-black text-blue-700">
            {
              lastRoundSummary
                .accuracy
            }%
          </div>

          <p className="mt-4 text-sm font-semibold text-slate-500">
            {lastRoundSummary.level ===
              'syllables' &&
            lastRoundSummary.passed &&
            traceableWords.length
              ? 'Ahora practicarás palabras.'
              : 'La próxima ronda comenzará pronto.'}
          </p>
        </div>
      </div>
    );
  }

  const targetTypeLabel =
    practiceLevel ===
    'syllables'
      ? 'sílaba'
      : 'palabra';

  return (
    <div className="h-full min-h-[520px] bg-gradient-to-b from-blue-50 to-white p-4">
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-blue-100 bg-white px-5 py-4 shadow-sm">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-500">
              Práctica de {practiceLevel === 'syllables'
                ? 'sílabas'
                : 'palabras'}
            </p>

            {stage === 'build' ||
            stage === 'freehand' ? (
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={
                    playBuildPrompt
                  }
                  disabled={
                    playingPrompt
                  }
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-md transition hover:bg-blue-700 disabled:bg-blue-300"
                  title="Escuchar otra vez"
                  aria-label="Escuchar otra vez"
                >
                  {playingPrompt ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <Volume2 className="h-6 w-6" />
                  )}
                </button>

                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    {stage === 'freehand'
                      ? 'Escucha y escribe'
                      : 'Escucha y construye'}
                  </h2>

                  <p className="text-sm font-semibold text-slate-500">
                    Toca el altavoz para escuchar otra vez.
                  </p>
                </div>
              </div>
            ) : (
              <h2 className="mt-1 text-3xl font-black tracking-wide text-slate-800">
                {currentTarget}
              </h2>
            )}

            <p className="mt-1 text-xs font-bold text-slate-400">
              {targetIndex + 1} de {roundTargets.length}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {STAGES.map((item) => {
              const active =
                item.key === stage;

              const completed =
                STAGES.findIndex(
                  (candidate) =>
                    candidate.key === stage
                ) >
                STAGES.findIndex(
                  (candidate) =>
                    candidate.key === item.key
                );

              return (
                <div
                  key={item.key}
                  className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-black ${
                    active
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : completed
                        ? 'border-green-300 bg-green-50 text-green-700'
                        : 'border-slate-200 bg-slate-50 text-slate-400'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      active
                        ? 'bg-white text-blue-600'
                        : completed
                          ? 'bg-green-500 text-white'
                          : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {completed
                      ? '✓'
                      : item.number}
                  </span>

                  {item.label}
                </div>
              );
            })}
          </div>
        </div>

        {stage === 'freehand' && (
          <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-blue-100 bg-white p-6 shadow-sm gap-4">
            <div className="text-center">
              <h3 className="text-2xl font-black text-slate-800">
                Intenta escribir la {targetTypeLabel}
              </h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Escribe lo que escuchas en las líneas. No te preocupes si no sale bien.
              </p>
            </div>
            <FreehandWriteCanvas onNext={finishFreehand} />
          </div>
        )}

        {stage === 'build' && (
          <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-blue-100 bg-white p-6 shadow-sm gap-4">
            <h3 className="text-2xl font-black text-slate-800">
              Construye la {targetTypeLabel}
            </h3>

            <p className="text-sm font-semibold text-slate-500">
              Usa el teclado para escribir la {targetTypeLabel}.
            </p>

            <div
              className={`min-h-[72px] w-full max-w-md rounded-2xl border-4 flex items-center justify-center px-6 py-3 ${
                buildCorrect
                  ? 'border-green-400 bg-green-50'
                  : buildError
                    ? 'border-red-300 bg-red-50/30'
                    : 'border-blue-300 bg-blue-50/50'
              }`}
            >
              {typed.length === 0 && !buildError && !buildCorrect ? (
                <span className="text-3xl">✏️</span>
              ) : (
                <div className="flex items-center gap-1 flex-wrap justify-center">
                  {[...String(typed || '')].map((c, i) => {
                    const charCorrect = buildError ? buildCharResults[i] : null;
                    return (
                      <span
                        key={i}
                        className={`text-4xl md:text-5xl font-black lowercase ${
                          buildCorrect
                            ? 'text-green-600'
                            : buildError
                              ? charCorrect
                                ? 'text-green-600'
                                : 'text-red-500'
                              : 'text-blue-700'
                        }`}
                      >
                        {c}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {buildCorrect ? (
              <p className="font-black text-green-500">
                ¡Perfecto! 🎉
              </p>
            ) : buildError ? (
              <p className="font-black text-red-500">
                Mira las letras verdes — esas están bien. Corrige las rojas.
              </p>
            ) : attemptCount >= 2 ? (
              <p className="font-bold text-blue-500">
                💡 La {targetTypeLabel} tiene {currentTarget.length} letras
              </p>
            ) : null}

            {!buildCorrect && (
              <div className="flex items-center gap-4">
                {typed.length > 0 && !buildError && (
                  <button
                    type="button"
                    onClick={handleBackspace}
                    className="text-sm text-gray-500 hover:text-gray-700 font-bold inline-flex items-center gap-1"
                  >
                    ⌫ Borrar
                  </button>
                )}

                {typed.length > 0 && !buildError && (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold px-6 py-2 rounded-full shadow"
                  >
                    Listo ✓
                  </button>
                )}
              </div>
            )}

            {!buildCorrect && (
              <MissingLetterKeyboard
                introducedSet={introducedSet}
                onKeyPress={handleKeyPress}
                disabled={buildError}
              />
            )}
          </div>
        )}

        {stage === 'trace' && (
          <div className="flex flex-col rounded-3xl border border-violet-100 bg-white p-3 shadow-sm">
            <div className="shrink-0 py-2 text-center">
              <h3 className="text-2xl font-black text-slate-800">
                Traza la {targetTypeLabel} una vez
              </h3>
            </div>

            <div className="h-[300px] overflow-x-auto sm:h-[360px]">
              <WordTracingCanvas
                key={`trace-${canvasKey}`}
                word={currentTarget}
                waypoints={waypoints}
                lang="es"
                repetitions={1}
                fillHeight
                onComplete={finishTrace}
              />
            </div>
          </div>
        )}

        {stage === 'write' && (
          <div className="flex flex-col rounded-3xl border border-green-100 bg-white p-3 shadow-sm">
            <div className="shrink-0 py-2 text-center">
              <h3 className="text-2xl font-black text-slate-800">
                Ahora escribe la {targetTypeLabel}
              </h3>

              <p className="text-sm font-semibold text-slate-500">
                Comienza en cada punto. El resto es escritura libre.
              </p>
            </div>

            <div className="h-[300px] overflow-x-auto sm:h-[360px]">
              <WordTracingCanvas
                key={`write-${canvasKey}`}
                word={currentTarget}
                waypoints={waypoints}
                lang="es"
                repetitions={1}
                fillHeight
                startPointOnly
                onComplete={finishWrite}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}