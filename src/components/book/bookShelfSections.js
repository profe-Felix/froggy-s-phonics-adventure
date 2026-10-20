// Pure helpers that split a bookshelf into curriculum sections using the
// BookAssignment.subject field ('df' | 'lv' | 'library'). Records without a
// recognised subject are reported as 'unclassified' — difficulty is never
// inferred from titles, and records are never modified.
export const SHELF_SECTIONS = [
  { id: 'df', short: 'DF', label: 'Destrezas Fundamentales', hint: 'Decodable practice' },
  { id: 'lv', short: 'LV', label: 'Lectura y Vocabulario', hint: 'Harder, not fully decodable' },
  { id: 'library', short: 'Library', label: 'Classroom Library', hint: 'Free reading' },
  { id: 'unclassified', short: 'Other', label: 'Unclassified', hint: 'No curriculum tag set' },
];

export function bookSection(book) {
  const s = String(book?.subject || '').trim().toLowerCase();
  return s === 'df' || s === 'lv' || s === 'library' ? s : 'unclassified';
}

// Returns non-empty sections in fixed order (DF, LV, Library, Unclassified),
// each with its books in their original order.
export function groupBooksBySection(books) {
  const buckets = new Map(SHELF_SECTIONS.map((s) => [s.id, []]));
  for (const b of books || []) buckets.get(bookSection(b)).push(b);
  return SHELF_SECTIONS
    .map((s) => ({ ...s, books: buckets.get(s.id) }))
    .filter((s) => s.books.length > 0);
}

// DF is the default; if the requested section is empty fall back to DF, then
// to the first non-empty section.
export function resolveSection(sections, requested) {
  if (!sections.length) return null;
  if (requested && sections.some((s) => s.id === requested)) return requested;
  if (sections.some((s) => s.id === 'df')) return 'df';
  return sections[0].id;
}
