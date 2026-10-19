import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import ColumnsView from './ColumnsView';
import RowView from './RowView';
import ContinuumView from './ContinuumView';
import GenerateView from './GenerateView';
import StressRevealView from './StressRevealView';
import RowsyllRowsView from './RowsyllRowsView';
import ListeningSortView from './ListeningSortView';
import { buildRound, cardWordsForConfig } from '@/lib/lettersort/rounds';
import { listAllImagesJpg, resolveImageForWord } from '@/lib/lettersort/storage';
import { summarizeListeningAttempts } from '@/lib/lettersort/listeningScore.mjs';

const IMG_BUCKET = 'lettersort-images';
const IMG_PREFIX = '';

// Resolve just the explicit words a mode needs; fall back to the whole bucket
// for modes that pick freely (letters/randinit without a word list).
function needsFullList(config) {
  if (config.mode === 'randinit' || config.mode === 'rowsyllauto') return true;
  const w = cardWordsForConfig(config);
  return !w || w.length === 0;
}

const LISTENING_MODES = new Set(['soundmatch', 'syllableposition', 'alliteration']);

export default function LetterSortActivity({ config, onRoundComplete, onAttempt, isTeacher = false }) {
  const [imageFiles, setImageFiles] = useState(null);
  const [err, setErr] = useState('');
  const [warn, setWarn] = useState('');

  useEffect(() => {
    let cancelled = false;
    setImageFiles(null);
    setErr('');
    setWarn('');
    if (config.mode === 'generate') {
      setImageFiles([]);
      return;
    }
    // rowsyllcols "rowsyll" form uses pre-rendered header images; the cards are
    // word tiles, so no image resolution is needed.
    if (config.mode === 'rowsyllcols' && config.rowsyll) {
      setImageFiles([]);
      return;
    }
    // manualsort with word cards and text headers never shows images, so
    // skip image resolution entirely (avoids 400s for words with no picture).
    if (config.mode === 'manualsort' && config.cardtype === 'word'
        && config.headertype !== 'image' && !(config.headerimages || []).length) {
      setImageFiles([]);
      return;
    }
    (async () => {
      try {
        if (needsFullList(config)) {
          const all = await listAllImagesJpg({ bucket: IMG_BUCKET, prefix: IMG_PREFIX });
          if (!cancelled) {
            setImageFiles(all);
            if (!all.length) setErr('No se encontraron imágenes en el almacenamiento.');
          }
        } else {
          const found = [];
          for (const w of cardWordsForConfig(config)) {
            const f = await resolveImageForWord(w, { bucket: IMG_BUCKET, prefix: IMG_PREFIX });
            if (f) found.push(f);
          }
          if (!cancelled) {
            if (found.length) {
              setImageFiles(found);
              setWarn('');
            } else {
              if (config.mode === 'familyany') {
                setImageFiles([]);
                setErr('No se encontraron las imágenes de esta actividad. Revisa la lista de palabras con tu maestra.');
                return;
              }
              // soft fallback: use the whole bucket so the activity still works
              const all = await listAllImagesJpg({ bucket: IMG_BUCKET, prefix: IMG_PREFIX });
              setImageFiles(all);
              setWarn(all.length ? 'No se encontraron imágenes para las palabras indicadas; usando todo el bucket.' : '');
              if (!all.length) setErr('No se encontraron imágenes en el almacenamiento.');
            }
          }
        }
      } catch (e) {
        if (!cancelled) setErr(`Error cargando imágenes: ${e?.message || e}`);
      }
    })();
    return () => { cancelled = true; };
  }, [config]);

  // roundNonce lets "Nuevo" force a fresh round (used by randinit to re-pick a
  // new random initial-letter category instead of merely reshuffling cards).
  const [roundNonce, setRoundNonce] = useState(0);
  const [roundIndex, setRoundIndex] = useState(0);
  const [cumScore, setCumScore] = useState({ completed: 0, mistakes: 0 });
  // Listening modes: aggregate across alliteration problems; complete once.
  const listenAgg = useRef({ correct: 0, wrong: 0, attempts: [], done: new Set(), completed: false });
  const [listenDone, setListenDone] = useState(null);
  const isListening = LISTENING_MODES.has(config.mode);

  // Reset sequencing when config changes
  useEffect(() => {
    setRoundIndex(0);
    setCumScore({ completed: 0, mistakes: 0 });
    listenAgg.current = { correct: 0, wrong: 0, attempts: [], done: new Set(), completed: false };
    setListenDone(null);
  }, [config]);

  const round = useMemo(() => buildRound({ ...config, roundIndex }, imageFiles || []), [config, imageFiles, roundNonce, roundIndex]);

  const handleRoundComplete = useCallback((result) => {
    if (config.mode === 'rowsyllauto') {
      setCumScore((s) => ({ completed: s.completed + 1, mistakes: s.mistakes + (result?.mistakes || 0) }));
      setRoundIndex((i) => i + 1);
    }
    onRoundComplete?.(result);
  }, [config.mode, onRoundComplete]);

  const handleListeningComplete = useCallback((result) => {
    const agg = listenAgg.current;
    const pi = result?.problemIndex ?? 0;
    if (agg.completed || agg.done.has(pi)) return;
    agg.done.add(pi);
    agg.correct += result?.correct || 0;
    agg.wrong += result?.wrong || 0;
    agg.attempts.push(...(result?.attempts || []));
    const total = config.mode === 'alliteration' ? Math.max(1, config.sounds?.length || 1) : 1;
    if (config.mode === 'alliteration' && pi + 1 < total) {
      setRoundIndex(pi + 1);
      return;
    }
    agg.completed = true;
    const final = { ...summarizeListeningAttempts(agg.attempts), attempts: [...agg.attempts], totalProblems: total };
    setListenDone(final);
    onRoundComplete?.(final);
  }, [config, onRoundComplete]);

  const restartListening = () => {
    listenAgg.current = { correct: 0, wrong: 0, attempts: [], done: new Set(), completed: false };
    setListenDone(null);
    setRoundIndex(0);
    setRoundNonce((n) => n + 1);
  };

  const isRowsyllauto = config.mode === 'rowsyllauto';
  const totalTargets = config.syllables?.length || 0;
  const allTargetsDone = isRowsyllauto && roundIndex >= totalTargets;

  if (allTargetsDone) {
    return (
      <div className="p-8 text-center">
        <div className="text-5xl mb-3">🎉</div>
        <div className="text-xl font-bold text-slate-800">¡Completo!</div>
        <div className="text-sm text-slate-500 mt-1">
          ✅ {cumScore.completed} completados · ❌ {cumScore.mistakes} errores
        </div>
        <button
          onClick={() => { setRoundIndex(0); setCumScore({ completed: 0, mistakes: 0 }); }}
          className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold"
        >
          Reiniciar
        </button>
      </div>
    );
  }

  if (isListening && listenDone && config.mode === 'alliteration') {
    return (
      <div className="p-8 text-center" role="status">
        <div className="text-xl font-bold text-slate-800">¡Completo!</div>
        <div className="text-sm text-slate-600 mt-1">Correctas {listenDone.correct} · Errores {listenDone.wrong}</div>
        <button onClick={restartListening} data-testid="button-listening-restart" className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold">Reiniciar</button>
      </div>
    );
  }

  if (err) return <div className="p-6 text-amber-700 bg-amber-50 rounded-lg mx-3 mt-3 text-sm">{err}</div>;
  if (!imageFiles && config.mode !== 'generate') {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (!round) return <div className="p-6 text-slate-500">Configuración no válida.</div>;
  if (round.error) return <div role="alert" className="p-6 text-amber-800 bg-amber-50 rounded-lg">
    {round.error}
    {isTeacher && round.missingWords?.length > 0 && <p className="mt-2">Sin imagen: {round.missingWords.join(', ')}</p>}
  </div>;

  const view = (() => {
    switch (round?.view) {
      case 'columns': return <ColumnsView config={config} round={round} onNewRound={() => setRoundNonce((n) => n + 1)} onRoundComplete={onRoundComplete} />;
      case 'rows': return <RowView round={round} config={config} onRoundComplete={isRowsyllauto ? handleRoundComplete : onRoundComplete} />;
      case 'continuum': return <ContinuumView round={round} config={config} onRoundComplete={onRoundComplete} />;
      case 'generate': return <GenerateView round={round} config={config} />;
      case 'stressreveal': return <StressRevealView round={round} config={config} onRoundComplete={onRoundComplete} />;
      case 'listening': return <ListeningSortView key={`${roundIndex}-${roundNonce}`} round={round} config={config} onAttempt={onAttempt} onRoundComplete={handleListeningComplete} />;
      case 'rowsyllrows': return <RowsyllRowsView round={round} config={config} onRoundComplete={onRoundComplete} />;
      default: return <div className="p-6 text-slate-500">Modo no soportado.</div>;
    }
  })();

  return (
    <div>
      {warn && <div className="mx-3 mt-3 p-3 text-amber-700 bg-amber-50 rounded-lg text-sm">{warn}</div>}
      {isRowsyllauto && round && (
        <div className="mx-3 mt-3 p-3 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-between">
          <span className="font-bold text-indigo-900 text-sm">
            Sílaba {roundIndex + 1}/{totalTargets}: {config.syllables[roundIndex]}
          </span>
          <div className="flex gap-3">
            <span className="text-sm font-bold text-green-700">✅ {cumScore.completed}</span>
            <span className="text-sm font-bold text-red-600">❌ {cumScore.mistakes}</span>
          </div>
        </div>
      )}
      {view}
    </div>
  );
}