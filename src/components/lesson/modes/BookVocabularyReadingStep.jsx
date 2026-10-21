import useBookVocabulary from '@/hooks/useBookVocabulary';
import SpanishReadingGame from '@/components/game/spanishReading/SpanishReadingGame';
import { useEffect, useState } from 'react';

// The bank supplies the list; the existing Spanish Reading activity supplies
// its familiar word-by-word reading, blending and recording experience.
export default function BookVocabularyReadingStep({ config, ...props }) {
  const { preset, loading, error, retry } = useBookVocabulary(config);
  const [round, setRound] = useState(null);
  const roundKey = JSON.stringify([config.curriculumPosition, config.curriculumPositionOverride,
    config.vocabularyOverride, config.vocabularyItems]);
  // Rescanning a book must not reset the current word or unmount a recording.
  // A newly started activity gets the refreshed list, not an ongoing round.
  useEffect(() => {
    if (preset?.content?.length && round?.key !== roundKey)
      setRound({ key: roundKey, items: [...preset.content] });
  }, [preset, roundKey, round?.key]);
  const items = round?.key === roundKey ? round.items : null;
  if (!items && (loading || preset?.content?.length)) return <p className="p-5">Cargando palabras…</p>;
  if (!items && error) return <div role="alert" className="p-5">No se pudieron cargar las palabras. <button onClick={retry}>Reintentar</button></div>;
  if (!items?.length) return <div className="p-5">
    <p>Todavía no hay palabras decodificables para esta lección. Tu maestro puede revisar los libros o editar esta lista.</p>
    <button className="mt-3 rounded-lg bg-indigo-600 p-3 text-white" onClick={props.onComplete}>Continuar</button>
  </div>;
  return <SpanishReadingGame {...props} inlineItemsText={items.join('\n')} inlineSection="Palabras"
    curriculumPosition={config.curriculumPosition} />;
}
