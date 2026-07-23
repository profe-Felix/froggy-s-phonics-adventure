import { useEffect, useState } from 'react';
import ColumnsView from './ColumnsView';
import { isClassic } from '@/lib/lettersort/rounds';
import { listAllImagesJpg, resolveImageForWord } from '@/lib/lettersort/storage';

const IMG_BUCKET = 'lettersort-images';
const IMG_PREFIX = '';

// Decide which images to load for a given config (mirrors legacy ensureStorageLoaded
// for the classic modes): if a word list is given, resolve each word; otherwise
// list the whole bucket so columns can pick by initial/syllable/count/etc.
function needsFullList(config) {
  const m = config.mode;
  if (m === 'randinit') return true; // picks a random initial, needs the bucket
  if (config.words && config.words.length) return false; // resolve per word
  return true;
}

export default function LetterSortActivity({ config, query, isTeacher }) {
  const classic = isClassic(config.mode);
  const [imageFiles, setImageFiles] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!classic) return;
    let cancelled = false;
    (async () => {
      try {
        if (needsFullList(config)) {
          const all = await listAllImagesJpg({ bucket: IMG_BUCKET, prefix: IMG_PREFIX });
          if (!cancelled) { setImageFiles(all); if (!all.length) setErr('No se encontraron imágenes en el almacenamiento.'); }
        } else {
          const found = [];
          for (const w of config.words) {
            const f = await resolveImageForWord(w, { bucket: IMG_BUCKET, prefix: IMG_PREFIX });
            if (f) found.push(f);
          }
          if (!cancelled) {
            setImageFiles(found.length ? found : await listAllImagesJpg({ bucket: IMG_BUCKET, prefix: IMG_PREFIX }));
            if (!found.length) setErr('No se encontraron imágenes para las palabras indicadas; usando todo el bucket.');
          }
        }
      } catch (e) {
        if (!cancelled) setErr(`Error cargando imágenes: ${e?.message || e}`);
      }
    })();
    return () => { cancelled = true; };
  }, [classic, config]);

  // Non-classic modes: keep the legacy iframe (ported later).
  if (!classic) {
    const src = `/lettersort/index.html?${query || ''}`;
    return <iframe key={src} src={src} title="Clasificador de letras" className="flex-1 w-full border-0" style={{ minHeight: '70vh' }} />;
  }

  if (err) {
    return <div className="p-6 text-amber-700 bg-amber-50 rounded-lg mx-3 mt-3 text-sm">{err}</div>;
  }
  if (!imageFiles) {
    return (
      <div className="flex items-center justify-center p-10">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return <ColumnsView config={config} imageFiles={imageFiles} />;
}