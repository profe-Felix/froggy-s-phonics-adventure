// New questions use a stable book ID and a book-local page. Legacy questions
// retain the old concatenated slide numbering until explicitly edited.
export function bookPageCount(book) {
  return Math.max(1, Number(book?.pdf_page_count) || book?.pages?.length || 1);
}

export function resolveQuestionTarget(question, books = []) {
  const q = question || {};
  const page = Math.max(0, Math.trunc(Number(q.page_number) || 0));
  if (q.question_scope === 'general') return { kind: 'general', pageNumber: 0 };
  if (q.question_scope === 'extra') return {
    kind: 'extra', extraPage: Math.max(1, Number(q.extra_page) || 1), pageNumber: 0,
  };
  const explicitId = q.book_id || q.mark?.book_id;
  if (explicitId) {
    const index = books.findIndex(b => b.id === explicitId);
    if (index >= 0 && page > 0) return {
      kind: 'book', bookId: explicitId, bookIndex: index, pageNumber: page,
    };
    // Do not silently attach an orphaned explicit question to a different book.
    if (q.question_scope === 'book' || q.book_id) return {
      kind: 'book', bookId: explicitId, bookIndex: -1, pageNumber: Math.max(1, page),
    };
  }
  if (page === 0) return { kind: 'general', pageNumber: 0 };
  let offset = 0;
  for (let i = 0; i < books.length; i++) {
    const count = bookPageCount(books[i]);
    if (page <= offset + count) return {
      kind: 'book', bookId: books[i].id, bookIndex: i, pageNumber: page - offset,
    };
    offset += count;
  }
  return { kind: 'extra', extraPage: Math.max(1, page - offset), pageNumber: 0 };
}

export function questionTargetFields(target, books = []) {
  if (target.kind === 'book') {
    const book = books.find(b => b.id === target.bookId);
    const page = Math.trunc(Number(target.pageNumber));
    if (!book || !Number.isFinite(page) || page < 1 || page > bookPageCount(book)) {
      throw new Error('Choose a book and a page within that book.');
    }
    return { question_scope: 'book', book_id: book.id, page_number: page, extra_page: 0 };
  }
  if (target.kind === 'extra') {
    const extra = Math.trunc(Number(target.extraPage));
    if (!Number.isFinite(extra) || extra < 1) throw new Error('Choose an extra slide number of 1 or more.');
    return { question_scope: 'extra', book_id: '', page_number: 0, extra_page: extra };
  }
  return { question_scope: 'general', book_id: '', page_number: 0, extra_page: 0 };
}

export function questionLabel(q, books = []) {
  const target = resolveQuestionTarget(q, books);
  if (target.kind === 'general') return 'General';
  if (target.kind === 'extra') return `Comparison · slide ${target.extraPage}`;
  return `Book ${target.bookIndex < 0 ? '(unavailable)' : String.fromCharCode(65 + target.bookIndex)} · p${target.pageNumber}`;
}

export function buildReadingPages(books = [], questions = []) {
  const resolved = questions.filter(Boolean).map(q => ({ q, target: resolveQuestionTarget(q, books) }));
  const ordered = rows => rows.sort((a, b) => (a.order || 0) - (b.order || 0));
  const pages = [];
  books.forEach((book, bookIndex) => {
    for (let pageNumber = 1; pageNumber <= bookPageCount(book); pageNumber++) {
      pages.push({ type: 'book', bookIndex, pageNumber, book,
        questions: ordered(resolved.filter(({ target }) =>
          target.kind === 'book' && target.bookId === book.id && target.pageNumber === pageNumber
        ).map(({ q }) => q)) });
    }
  });
  const extra = resolved.filter(({ target }) => target.kind !== 'book').sort((a, b) =>
    (a.target.kind === 'general' ? 0 : a.target.extraPage) -
    (b.target.kind === 'general' ? 0 : b.target.extraPage) || (a.q.order || 0) - (b.q.order || 0));
  const groups = new Map();
  for (const { q, target } of extra) {
    // General questions each get a slide; explicitly shared extra numbers group.
    const key = target.kind === 'general' ? `general:${q.id || groups.size}` : `extra:${target.extraPage}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }
  for (const rows of groups.values()) pages.push({
    type: 'question', qIdx: pages.filter(p => p.type === 'question').length,
    question: rows[0], questions: rows,
  });
  return pages;
}
