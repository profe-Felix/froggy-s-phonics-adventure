import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import { base44 } from '@/api/base44Client';

import {
  LETTER_WAYPOINTS,
} from '@/components/data/letterWaypoints';

import WordTracingCanvas from '@/components/game/WordTracingCanvas';

const STAGES = [
  {
    key: 'build',
    number: 1,
    label: 'Construye',
  },
  {
    key: 'trace',
    number: 2,
    label: 'Traza',
  },
  {
    key: 'write',
    number: 3,
    label: 'Escribe',
  },
];

function shuffleTiles(word) {
  const tiles = [...String(word || '')].map(
    (letter, index) => ({
      id:
        `${letter}-${index}-${Math.random()
          .toString(36)
          .slice(2)}`,
      letter,
    })
  );

  // Fisher–Yates shuffle.
  for (
    let index = tiles.length - 1;
    index > 0;
    index -= 1
  ) {
    const swapIndex =
      Math.floor(
        Math.random() * (index + 1)
      );

    [
      tiles[index],
      tiles[swapIndex],
    ] = [
      tiles[swapIndex],
      tiles[index],
    ];
  }

  return tiles;
}

export default function AdaptiveWordPractice({
  words = [],
  onWordComplete,
}) {
  const [waypoints, setWaypoints] =
    useState(LETTER_WAYPOINTS);

  const [wordIndex, setWordIndex] =
    useState(0);

  const [stage, setStage] =
    useState('build');

  const [availableTiles, setAvailableTiles] =
    useState([]);

  const [builtTiles, setBuiltTiles] =
    useState([]);

  const [buildError, setBuildError] =
    useState(false);

  const [canvasKey, setCanvasKey] =
    useState(0);

  // Load teacher-edited waypoint records and merge them
  // over the bundled fallback waypoints.
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
                merged[
                  String(record.letter)
                    .toLowerCase()
                ] = {
                  strokes,
                  hint:
                    record.hint ||
                    previous[
                      record.letter
                    ]?.hint ||
                    '',
                };
              }
            } catch {
              // Ignore malformed teacher records and keep
              // the bundled fallback for that letter.
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

  // Do not offer a word unless every character has an
  // authored tracing pathway.
  const traceableWords = useMemo(
    () =>
      (words || []).filter((word) =>
        [...String(word || '')].every(
          (letter) =>
            Array.isArray(
              waypoints[
                letter.toLowerCase()
              ]?.strokes
            ) &&
            waypoints[
              letter.toLowerCase()
            ].strokes.length > 0
        )
      ),
    [
      words,
      waypoints,
    ]
  );

  const currentWord =
    traceableWords[
      wordIndex %
        Math.max(
          traceableWords.length,
          1
        )
    ] || '';

  const resetBuild = (word) => {
    setAvailableTiles(
      shuffleTiles(word)
    );

    setBuiltTiles([]);
    setBuildError(false);
  };

  // Reset the activity whenever the target word changes.
  useEffect(() => {
    if (!currentWord) {
      return;
    }

    setStage('build');
    resetBuild(currentWord);

    setCanvasKey(
      (previous) => previous + 1
    );
  }, [currentWord]);

  const builtWord =
    builtTiles
      .map((tile) => tile.letter)
      .join('');

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

  const checkBuild = () => {
    if (builtWord !== currentWord) {
      setBuildError(true);
      return;
    }

    setBuildError(false);
    setStage('trace');

    setCanvasKey(
      (previous) => previous + 1
    );
  };

  const finishTrace = () => {
    setStage('write');

    setCanvasKey(
      (previous) => previous + 1
    );
  };

  const finishWrite = (accuracy) => {
    onWordComplete?.({
      word: currentWord,
      accuracy,
    });

    if (
      traceableWords.length <= 1
    ) {
      setStage('build');
      resetBuild(currentWord);

      setCanvasKey(
        (previous) => previous + 1
      );

      return;
    }

    setWordIndex(
      (previous) =>
        (
          previous + 1
        ) %
        traceableWords.length
    );
  };

  if (!traceableWords.length) {
    return (
      <div className="h-full min-h-[420px] flex items-center justify-center bg-blue-50 p-6">
        <div className="max-w-md rounded-3xl border border-blue-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-3 text-5xl">
            🔤
          </div>

          <h2 className="text-xl font-black text-slate-800">
            Todavía no hay palabras disponibles
          </h2>

          <p className="mt-2 text-sm font-medium text-slate-500">
            La actividad aparecerá cuando las letras de una
            palabra estén disponibles en la progresión y tengan
            caminos de escritura.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[520px] bg-gradient-to-b from-blue-50 to-white p-4">
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-blue-100 bg-white px-5 py-4 shadow-sm">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-500">
              Práctica de palabras
            </p>

            <h2 className="mt-1 text-3xl font-black tracking-wide text-slate-800">
              {currentWord}
            </h2>
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

        {stage === 'build' && (
          <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
            <div className="mb-3 text-center">
              <h3 className="text-2xl font-black text-slate-800">
                Construye la palabra
              </h3>

              <p className="mt-1 text-sm font-semibold text-slate-500">
                Toca las letras en el orden correcto.
              </p>
            </div>

            <div
              className={`flex min-h-24 min-w-[280px] flex-wrap items-center justify-center gap-2 rounded-3xl border-4 border-dashed px-5 py-4 transition ${
                buildError
                  ? 'border-red-300 bg-red-50'
                  : 'border-blue-200 bg-blue-50'
              }`}
            >
              {builtTiles.length === 0 && (
                <span className="text-sm font-bold text-blue-300">
                  La palabra va aquí
                </span>
              )}

              {builtTiles.map(
                (tile, index) => (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() =>
                      removeBuiltTile(
                        tile,
                        index
                      )
                    }
                    className="flex h-16 min-w-14 items-center justify-center rounded-2xl border-2 border-blue-300 bg-white px-4 text-3xl font-black text-blue-700 shadow-sm transition hover:-translate-y-0.5"
                  >
                    {tile.letter}
                  </button>
                )
              )}
            </div>

            {buildError && (
              <p className="mt-3 font-black text-red-500">
                Inténtalo otra vez.
              </p>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {availableTiles.map(
                (tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() =>
                      chooseTile(tile)
                    }
                    className="flex h-16 min-w-14 items-center justify-center rounded-2xl bg-amber-300 px-4 text-3xl font-black text-amber-950 shadow-md transition hover:-translate-y-1 hover:bg-amber-200"
                  >
                    {tile.letter}
                  </button>
                )
              )}
            </div>

            <button
              type="button"
              onClick={checkBuild}
              disabled={
                builtTiles.length !==
                currentWord.length
              }
              className="mt-8 rounded-2xl bg-blue-600 px-8 py-3 text-lg font-black text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Revisar palabra
            </button>
          </div>
        )}

        {stage === 'trace' && (
          <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-violet-100 bg-white p-3 shadow-sm">
            <div className="shrink-0 py-2 text-center">
              <h3 className="text-2xl font-black text-slate-800">
                Traza la palabra una vez
              </h3>

              <p className="text-sm font-semibold text-slate-500">
                Sigue el camino y comienza en cada punto.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-x-auto">
              <WordTracingCanvas
                key={`trace-${canvasKey}`}
                word={currentWord}
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
          <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-green-100 bg-white p-3 shadow-sm">
            <div className="shrink-0 py-2 text-center">
              <h3 className="text-2xl font-black text-slate-800">
                Ahora escribe la palabra
              </h3>

              <p className="text-sm font-semibold text-slate-500">
                Comienza en cada punto. El resto es escritura libre.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-x-auto">
              <WordTracingCanvas
                key={`write-${canvasKey}`}
                word={currentWord}
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
