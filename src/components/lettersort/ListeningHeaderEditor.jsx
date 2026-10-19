import { useEffect, useRef, useState } from 'react';
import { ImageOff, Upload, X, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { resolveImageForWord } from '@/lib/lettersort/storage';

const DEFAULTS = ['tigre', 'zapato'];
const LABELS = ['Principio', 'Final'];
const IMG = { bucket: 'lettersort-images', prefix: '' };

const toList = (v, sep) => (Array.isArray(v) ? v : String(v || '').split(sep)).map((s) => String(s).trim());

// Header editor for syllableposition: two header words (spoken word always
// required) + optional uploaded image override per header. Emits strings
// compatible with FIELDS serialization: headers "a,b", headerimages "u1|u2".
export default function ListeningHeaderEditor({ headers, headerimages, onChange }) {
  const words = [0, 1].map((i) => toList(headers ?? DEFAULTS, ',')[i] || '');
  const imgs = [0, 1].map((i) => toList(headerimages, '|')[i] || '');
  const latest = useRef({ words, imgs });
  latest.current = { words, imgs };

  const emit = (w, im) => onChange?.({
    headers: w.map((s) => s.trim()).join(','),
    headerimages: im.some(Boolean) ? im.join('|') : '',
  });

  const setWord = (i, v) => {
    const w = [...latest.current.words]; w[i] = v;
    const im = [...latest.current.imgs]; im[i] = ''; // stale override cleared on word change
    emit(w, im);
  };
  const setImg = (i, url) => {
    const im = [...latest.current.imgs]; im[i] = url;
    emit(latest.current.words, im);
  };

  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-xs font-bold text-gray-600">Encabezados (palabra hablada + dibujo)</label>
      <div className="flex flex-wrap gap-3">
        {[0, 1].map((i) => (
          <HeaderBox key={i} index={i} word={words[i]} img={imgs[i]} onWord={(v) => setWord(i, v)} onImg={(u) => setImg(i, u)} />
        ))}
      </div>
    </div>
  );
}

function HeaderBox({ index, word, img, onWord, onImg }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);
  const effective = (word || '').trim() || DEFAULTS[index];

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    if (img) return undefined;
    const t = setTimeout(async () => {
      try {
        const f = await resolveImageForWord(effective, IMG);
        if (!cancelled) setPreview(f?.url || '');
      } catch { if (!cancelled) setPreview(''); }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [effective, img]);

  async function upload(file) {
    setErr('');
    if (!file) return;
    if (!file.type?.startsWith('image/')) { setErr('El archivo debe ser una imagen.'); return; }
    if (file.size > 5 * 1024 * 1024) { setErr('Imagen demasiado grande (máx. 5 MB).'); return; }
    setBusy(true);
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      const url = up?.file_url;
      if (!url || !/^https?:\/\//.test(url)) throw new Error('No se recibió una URL pública.');
      onImg(url);
    } catch (e) {
      setErr(`Error al subir: ${e?.message || e}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const shown = img || preview;
  const missingWord = !(word || '').trim();

  return (
    <div className="flex flex-col gap-1 w-44">
      <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wide">{LABELS[index]}</span>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files?.[0]); }}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        data-testid={`dropzone-header-${index}`}
        className={`relative h-28 rounded-lg border-2 border-dashed flex items-center justify-center bg-white cursor-pointer ${over ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300'}`}
      >
        {busy ? <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          : shown ? <img src={shown} alt="" className="object-contain h-full w-full p-1" draggable={false} />
          : preview === null ? <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          : <div className="flex flex-col items-center text-slate-400 text-xs"><ImageOff className="w-6 h-6" />Sin imagen</div>}
        <span className="absolute bottom-1 left-1 text-[10px] bg-white/90 rounded px-1 text-slate-500 flex items-center gap-0.5"><Upload className="w-3 h-3" />{img ? 'personalizada' : 'subir'}</span>
        {img && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onImg(''); }} className="absolute top-1 right-1 bg-white rounded-full border p-0.5" aria-label="Quitar imagen" data-testid={`button-clear-header-${index}`}>
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      <input
        value={word}
        disabled={busy}
        onChange={(e) => onWord(e.target.value)}
        placeholder={DEFAULTS[index]}
        data-testid={`input-header-${index}`}
        className={`px-2 py-1.5 rounded-lg border bg-white text-sm ${missingWord && img ? 'border-amber-400' : ''}`}
      />
      {missingWord && img && <span className="text-[11px] text-amber-700">Escribe la palabra hablada.</span>}
      {err && <span className="text-[11px] text-red-600">{err}</span>}
    </div>
  );
}
