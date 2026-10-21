import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { loadBookCatalog } from '@/lib/book/catalog';
import { introductionBooks } from '@/lib/literacy/pathwayCurriculum.mjs';
import StudentBookReader from '@/components/book/StudentBookReader';

export default function AutoDfReadingStep({ config, className, studentNumber, onBack, onComplete, onRecordingSaved, embedded }) {
  const [index, setIndex] = useState(0);
  const p = config.curriculumPosition || {};
  const catalog = useQuery({ queryKey: ['curriculum-book-catalog'], queryFn: loadBookCatalog, staleTime: 30000 });
  const assignments = useQuery({ queryKey: ['auto-df-assignments', className],
    queryFn: () => base44.entities.BookAssignment.list('-created_date', 1000), staleTime: 30000 });
  const books = introductionBooks(catalog.data || [], { moduleNumber: Number(p.module_number), lessonNumber: Number(p.curriculum_lesson_number) });
  if (catalog.isLoading || assignments.isLoading) return <p className="p-5">Cargando libros…</p>;
  if (catalog.error || assignments.error) return <div role="alert" className="p-5">No se pudieron cargar los libros.
    <button onClick={() => { catalog.refetch(); assignments.refetch(); }}>Reintentar</button></div>;
  if (!books.length) return <div className="p-5"><p>No se introduce un libro DF en esta lección. Los libros nuevos aparecerán aquí al etiquetarlos.</p>
    <button className="mt-3 rounded-lg border px-4 py-2" onClick={() => onComplete ? onComplete() : onBack?.()}>Continuar</button></div>;
  const current = books[Math.min(index, books.length - 1)];
  // An explicitly assigned lesson reader may use a closed shelf book, exactly
  // like BookReadingStep(bookId). Closing the shelf must not break its lesson.
  const assignment = (assignments.data || []).find(b => b.catalog_book_id === current.id && b.class_name === className) ||
    (assignments.data || []).find(b => b.catalog_book_id === current.id && b.shared_across_classes);
  const next = () => index < books.length - 1 ? setIndex(i => i + 1) : onComplete?.();
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex items-center justify-between gap-2 p-2 text-sm">
      <span>{current.title} · {index + 1}/{books.length}</span>
      <button className="rounded-lg border px-3 py-1" onClick={next}>{index < books.length - 1 ? 'Siguiente libro' : 'Terminé'}</button>
    </div>
    {assignment ? <div className="min-h-0 flex-1"><StudentBookReader key={assignment.id}
      book={{ ...assignment, pages: current.pages?.length ? current.pages : assignment.pages }}
      className={className} studentNumber={studentNumber} onBack={onBack} onRecordingSaved={onRecordingSaved}
      recordingPages={current.recording_pages || []} embedded={embedded} /></div> :
      <p role="status" className="p-5">Este libro aún no está asignado a tu clase. Tu maestro puede compartirlo desde Books.</p>}
  </div>;
}
