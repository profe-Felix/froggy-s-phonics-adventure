import { useState } from 'react';
import useBookVocabulary from '@/hooks/useBookVocabulary';
import FluencyGrid from '@/components/workstations/FluencyGrid';

export default function BookVocabularyStep({ config, onComplete }) {
  const { preset, loading, error, retry } = useBookVocabulary(config);
  const [seed, setSeed] = useState(() => Date.now());
  const [cell, setCell] = useState(0);
  if (loading) return <p className="p-5">Cargando vocabulario…</p>;
  if (error) return <div role="alert" className="p-5">No se pudo cargar el vocabulario. <button onClick={retry}>Reintentar</button></div>;
  return <div className="p-3">
    <div className="mb-3 flex items-center justify-between gap-3"><strong>{preset?.title}</strong>
      <button className="rounded-lg border px-3 py-2" onClick={() => { setSeed(Date.now()); setCell(0); }}>Mezclar</button></div>
    {preset?.content?.length ? <FluencyGrid preset={preset} seed={seed} activeCell={cell} onSelectCell={setCell} /> :
      <p className="p-4">Todavía no hay vocabulario decodificable para esta lección. Tu maestro puede revisar los libros o editar esta lista.</p>}
    {onComplete && <button className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white" onClick={() => onComplete()}>Terminé</button>}
  </div>;
}
