import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useClassNames } from '@/hooks/useClassNames';

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

  // Prefer a book that students in this class
  // can already access.
  if (
    lessonClass &&
    Array.isArray(book.available_to_classes) &&
    book.available_to_classes.includes(
      lessonClass
    )
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

// Displays books matching the lesson class's
// language and grade. Class assignment controls
// student access but does not limit teacher access.
export default function BookPicker({
  value,
  onChange,
  lessonClass,
}) {
  const {
    configs: CLASS_CONFIGS,
  } = useClassNames();

  const lessonClassConfig =
    CLASS_CONFIGS.find(
      config =>
        config.class_name === lessonClass
    );

  const classLanguage =
    lessonClassConfig?.language || 'es';

  const classGrade =
    lessonClassConfig?.grade || 'kinder';

  const {
    data: books = [],
    isLoading,
  } = useQuery({
    queryKey: ['book-picker-books'],
    queryFn: () =>
      base44.entities.BookAssignment.list(
        '-created_date',
        1000
      ),
  });

  const matchingBooks = useMemo(() => {
    return books.filter(book => {
      // Preserve a book already saved in an
      // existing lesson, even if its metadata
      // has not been updated yet.
      if (book.id === value) {
        return true;
      }

      // Without a selected class, allow the
      // complete teacher library.
      if (!lessonClass) {
        return true;
      }

      const bookLanguage =
        book.language || 'es';

      const bookGrade =
        book.grade || 'kinder';

      const languageMatches =
        bookLanguage === classLanguage ||
        bookLanguage === 'bilingual';

      return (
        languageMatches &&
        bookGrade === classGrade
      );
    });
  }, [
    books,
    value,
    lessonClass,
    classLanguage,
    classGrade,
  ]);

  const uniqueBooks = useMemo(() => {
    const byTitle = new Map();

    for (const book of matchingBooks) {
      const titleKey = normalizedTitle(book);

      // The catalog ID is the permanent identity.
      // Title is only a fallback for older books.
      const key =
        book.catalog_book_id ||
        titleKey ||
        `untitled:${book.id}`;

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
  }, [matchingBooks, lessonClass, value]);

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
          </option>
        ))}
      </select>

      {lessonClass && (
        <p className="text-[10px] text-gray-400">
          Showing books matching the language
          and grade for <b>{lessonClass}</b>.
        </p>
      )}
    </div>
  );
}