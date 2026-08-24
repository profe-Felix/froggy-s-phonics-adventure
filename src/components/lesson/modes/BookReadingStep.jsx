import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import StudentBookReader from '@/components/book/StudentBookReader';
import BookReading from '@/pages/BookReading';

// Renders a book_reading lesson step. If the step has a specific book assigned
// (step.config.bookId), open that book directly in the student reader. If no
// book is assigned, fall back to the full class bookshelf.
export default function BookReadingStep({ stepConfig, studentNumber, className, onBack }) {
  const bookId = stepConfig?.bookId;

  const { data: book, isLoading } = useQuery({
    queryKey: ['book-assignment', bookId],
    queryFn: () => base44.entities.BookAssignment.get(bookId),
    enabled: !!bookId,
  });

  // No specific book assigned → full class bookshelf.
  if (!bookId) {
    return (
      <BookReading
        prefillClass={className}
        prefillNumber={studentNumber}
        onBack={onBack}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ background: '#042f2e' }}>
        <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!book) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center"
        style={{ background: '#042f2e' }}
      >
        <div className="text-5xl">📚</div>
        <p className="text-white font-black text-lg">Book not found</p>
        <p className="text-teal-300 text-sm">Ask your teacher to assign a book.</p>
        <button
          onClick={onBack}
          className="mt-2 px-5 py-2 rounded-xl bg-teal-600 text-white font-bold"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <StudentBookReader
      book={book}
      studentNumber={studentNumber}
      className={className}
      onBack={onBack}
    />
  );
}