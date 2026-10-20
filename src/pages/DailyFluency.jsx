import { useState, useEffect, useRef } from 'react';
import useDailyFluency from '@/hooks/useDailyFluency';

const TYPES = [
  { value: 'letters', label: 'Letras' },
  { value: 'syllables', label: 'Sílabas' },
  { value: 'hfw', label: 'Palabras frecuentes' },
  { value: 'words', label: 'Palabras' },
];

export default function DailyFluency() {
  const {
    lessons = [], lessonId, setLessonId, day, setDay, days = [], type, setType,
    items = [], positionLabel, books = [], wordStatus, loading, error, retry,
    teacher, wordDraft, setWordDraft, hasOverride, saveWords, resetWords,
    saving, saveError, shareUrl,
  } = useDailyFluency();

  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState('');
  const cellRefs = useRef([]);
  const total = items.length;
  const itemsKey = `${lessonId}|${day}|${type}|${items.join('\u0001')}`;

  useEffect(() => { document.title = 'Fluidez diaria · Edu Aventura'; }, []);
  useEffect(() => { setIndex(0); }, [itemsKey]);

  useEffect(() => {
    const el = cellRefs.current[index];
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [index, itemsKey]);

  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(total - 1, i + 1));

  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      if (e.altKey || e.ctrlKey || e.metaKey || !total) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(total - 1, i + 1)); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied('Enlace copiado.');
    } catch {
      setCopied('No se pudo copiar automáticamente. Copie el enlace de abajo.');
    }
  };

  const onSave = async () => { try { await saveWords?.(); } catch { /* surfaced via saveError */ } };
  const onReset = async () => { try { await resetWords?.(); } catch { /* surfaced via saveError */ } };

  const selectCls = 'px-3 py-2 rounded-lg border border-slate-300 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const current = items[index];

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: '#fafbff', fontFamily: "'Andika', system-ui, sans-serif" }}>
      <header className="flex items-center gap-3 p-3 bg-white border-b sticky top-0 z-20 flex-wrap">
        <a href="/Workstations" className="px-3 py-2 rounded-lg border font-bold text-slate-700 hover:bg-slate-50">← Volver</a>
        <h1 className="font-bold text-lg mr-auto">Fluidez diaria</h1>
        <span className={`px-3 py-1 rounded-lg text-sm font-bold ${teacher ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {teacher ? 'Maestra' : 'Familia'}
        </span>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto p-4 flex flex-col gap-4">
        <section className="bg-white border rounded-2xl p-4 flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-sm font-bold text-slate-600 min-w-[12rem] flex-1">
            Lección
            <select className={selectCls} value={lessonId ?? ''} onChange={(e) => setLessonId(e.target.value)} disabled={!lessons.length}>
              {!lessons.length && <option value="">Sin lecciones</option>}
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>Lección {l.lesson_number}{l.title ? ` · ${l.title}` : ''}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold text-slate-600">
            Día
            <select className={selectCls} value={day ?? ''} onChange={(e) => setDay(Number.isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))}>
              {days.map((d) => (
                <option key={d.day} value={d.day}>{d.label}{d.active ? '' : ' (sin contenido)'}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-sm font-bold text-slate-600">
            Practicar
            <div className="flex flex-wrap gap-1" role="group" aria-label="Tipo de práctica">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={type === t.value}
                  onClick={() => setType(t.value)}
                  className={`px-3 py-2 rounded-lg font-bold text-sm transition ${type === t.value ? 'bg-emerald-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {!teacher && (
          <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-slate-700 leading-relaxed">
            <p className="font-bold text-emerald-800 mb-1">Instrucciones para la familia</p>
            <p>Señale cada recuadro y pida a su hijo que lo lea solo, sin ayuda ni audio primero. Si se equivoca, léanlo juntos y vuelvan a intentarlo. Practiquen unos minutos al día; la meta es leer con calma y confianza, no rapidez.</p>
          </section>
        )}

        {loading ? (
          <section className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2" aria-busy="true" aria-label="Cargando">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-slate-200 animate-pulse" style={{ aspectRatio: '3 / 2' }} />
            ))}
          </section>
        ) : error ? (
          <section className="bg-white border border-rose-200 rounded-2xl p-6 text-center">
            <p className="font-bold text-rose-700 mb-1">No se pudo cargar la práctica.</p>
            <p className="text-sm text-slate-600 mb-4">{String(error?.message || error)}</p>
            <button type="button" onClick={retry} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">Reintentar</button>
          </section>
        ) : !total ? (
          <section className="bg-white border rounded-2xl p-8 text-center">
            <p className="font-bold text-slate-800 mb-1">No hay contenido para esta selección.</p>
            <p className="text-sm text-slate-600">{wordStatus || 'Pruebe otro día, lección o tipo de práctica.'}</p>
          </section>
        ) : (
          <section className="bg-white border rounded-2xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button type="button" onClick={prev} disabled={index === 0} aria-label="Anterior"
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed">← Anterior</button>
              <div className="text-center">
                <p className="text-sm text-slate-500 font-bold" aria-live="polite">{index + 1} / {total}</p>
                {positionLabel && <p className="text-xs text-slate-500">{positionLabel}</p>}
              </div>
              <button type="button" onClick={next} disabled={index >= total - 1} aria-label="Siguiente"
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed">Siguiente →</button>
            </div>
            <p className="text-center font-bold text-slate-900 py-2" style={{ fontSize: 'clamp(2.5rem,9vw,5rem)' }} aria-label={`Elemento actual: ${current}`}>{current}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {items.map((text, i) => (
                <button
                  key={`${i}-${text}`}
                  ref={(el) => { cellRefs.current[i] = el; }}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={i === index ? 'true' : undefined}
                  aria-label={`${i + 1}: ${text}`}
                  className={`rounded-xl border flex items-center justify-center px-2 transition font-bold ${i === index ? 'bg-emerald-100 border-emerald-500 ring-2 ring-emerald-500 text-slate-900' : 'bg-white text-slate-800 hover:bg-slate-50'}`}
                  style={{ aspectRatio: '3 / 2', fontSize: 'clamp(1.1rem,2.2vw,1.9rem)' }}
                >
                  {text}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 text-center">Use las flechas del teclado o toque un recuadro.</p>
          </section>
        )}

        {wordStatus && total > 0 && <p className="text-sm text-slate-500">{wordStatus}</p>}

        {books.length > 0 && (
          <section className="bg-white border rounded-2xl p-4">
            <p className="font-bold text-slate-700 mb-2">Libros de esta lección</p>
            <ul className="list-disc pl-5 text-slate-700">
              {books.map((b) => <li key={b.id}>{b.title}</li>)}
            </ul>
          </section>
        )}

        {teacher && (
          <section className="bg-white border rounded-2xl p-4 flex flex-col gap-2">
            <label htmlFor="df-words" className="font-bold text-slate-700">
              Palabras del día {hasOverride && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">Editadas</span>}
            </label>
            <p className="text-xs text-slate-500">Separe con comas o en líneas nuevas.</p>
            <textarea id="df-words" rows={4} value={wordDraft ?? ''} onChange={(e) => setWordDraft(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-3 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            {saveError && <p className="text-sm text-rose-700" role="alert">{String(saveError?.message || saveError)}</p>}
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={onSave} disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" onClick={onReset} disabled={saving} className="px-4 py-2 rounded-xl border font-bold text-slate-700 disabled:opacity-50">
                Regenerar
              </button>
            </div>
          </section>
        )}

        {shareUrl && (
          <section className="bg-white border rounded-2xl p-4 flex flex-col gap-2">
            <p className="font-bold text-slate-700">Compartir con familias</p>
            <div className="flex gap-2 flex-wrap items-center">
              <button type="button" onClick={copyLink} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold">Copiar enlace</button>
              {copied && <span className="text-sm text-slate-600" role="status">{copied}</span>}
            </div>
            <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label="Enlace para compartir"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600" />
          </section>
        )}
      </main>
    </div>
  );
}
