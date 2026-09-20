import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

function normalizedTitle(book) {
  return String(book?.title || '')
    .trim()
    .toLocaleLowerCase();
}

function bookScore(
  book,
  lessonClass,
  selectedId
) {
  let score = 0;

  // Preserve the exact record already saved on an
  // existing lesson activity.
  if (book.id === selectedId) {
    score += 1000;
  }

  // Prefer the copy assigned to this lesson's class.
  if (
    lessonClass &&
    book.class_name === lessonClass
  ) {
    score += 100;
  }

  // Prefer books students can currently use.
  if (
    String(book.status || '')
      .toLocaleLowerCase() === 'active'
  ) {
    score += 10;
  }

  return score;
}

// Displays one option per title. BookAssignment
// records are class-scoped, so duplicate class
// copies of the same title are consolidated.
export default function BookPicker({
  value,
  onChange,
  lessonClass,
}) {
  const {
    data: books = [],
    isLoading,
  } = useQuery({
    queryKey: ['book-picker-books'],
    queryFn: () =>
      base44.entities.BookAssignment.list(
        '-created_date',
        200
      ),
  });

  const uniqueBooks = useMemo(() => {
    const byTitle = new Map();

    for (const book of books) {
      const titleKey = normalizedTitle(book);

      // Keep untitled records separate instead of
      // merging all of them into one blank option.
      const key =
        titleKey || `untitled:${book.id}`;

      const current = byTitle.get(key);

      if (
        !current ||
        bookScore(
          book,
          lessonClass,
          value
        ) >
          bookScore(
            current,
            lessonClass,
            value
          )
      ) {
        byTitle.set(key, book);
      }
    }

    return Array.from(
      byTitle.values()
    ).sort((a, b) =>
      String(a.title || '').localeCompare(
        String(b.title || '')
      )
    );
  }, [books, lessonClass, value]);

  return (
    <div className="flex flex-col gap-1">
      <select
        value={value || ''}
        onChange={e => {
          const selectedBook =
            books.find(
              book =>
                book.id === e.target.value
            );

          onChange(
            e.target.value,
            selectedBook?.title || ''
          );
        }}
        disabled={isLoading}
        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white disabled:opacity-50"
      >
        <option value="">
          {isLoading
            ? 'Loading books…'
            : '— whole bookshelf (student picks) —'}
        </option>

        {uniqueBooks.map(book => (
          <option
            key={book.id}
            value={book.id}
          >
            {book.title}
            {book.class_name
              ? ` · ${book.class_name}`
              : ''}
          </option>
        ))}
      </select>

      {lessonClass && (
        <p className="text-[10px] text-gray-400">
          The picker automatically
          prefers the copy assigned to{' '}
          <b>{lessonClass}</b>.
        </p>
      )}
    </div>
  );
}