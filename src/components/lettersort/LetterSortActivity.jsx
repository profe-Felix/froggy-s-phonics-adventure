import { useEffect, useMemo, useState } from 'react';
import ColumnsView from './ColumnsView';
import RowView from './RowView';
import ContinuumView from './ContinuumView';
import GenerateView from './GenerateView';
import StressRevealView from './StressRevealView';
import { buildRound, cardWordsForConfig } from '@/lib/lettersort/rounds';
import { listAllImagesJpg, resolveImageForWord } from '@/lib/lettersort/storage';

const IMG_BUCKET = 'lettersort-images';
const IMG_PREFIX = '';

// Resolve just the explicit words a mode needs; fall back to the whole bucket
// for modes that pick freely (letters/randinit without a word list).
function needsFullList(config) {
  if (config.mode === 'randinit') return true;
  const w = cardWordsForConfig(config);
  return !w || w.length === 0;
}

export default function LetterSortActivity({ config }) {
  const [imageFiles, setImageFiles] = useState(null);
  const [err, setErr] = useState('');
  const [warn, setWarn] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (config.mode === 'generate') {
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

  const round = useMemo(() => buildRound(config, imageFiles || []), [config, imageFiles]);

  if (err) return <div className="p-6 text-amber-700 bg-amber-50 rounded-lg mx-3 mt-3 text-sm">{err}</div>;
  if (!imageFiles && config.mode !== 'generate') {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (!round) return <div className="p-6 text-slate-500">Configuración no válida.</div>;

  const view = (() => {
    switch (round.view) {
      case 'columns': return <ColumnsView config={config} round={round} />;
      case 'rows': return <RowView round={round} config={config} />;
      case 'continuum': return <ContinuumView round={round} config={config} />;
      case 'generate': return <GenerateView round={round} config={config} />;
      case 'stressreveal': return <StressRevealView round={round} config={config} />;
      default: return <div className="p-6 text-slate-500">Modo no soportado.</div>;
    }
  })();

  return (
    <div>
      {warn && <div className="mx-3 mt-3 p-3 text-amber-700 bg-amber-50 rounded-lg text-sm">{warn}</div>}
      {view}
    </div>
  );
}