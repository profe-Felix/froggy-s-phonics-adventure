export const PRACTICE_DAYS = [
  ['monday', 'Lunes'], ['tuesday', 'Martes'], ['wednesday', 'Miércoles'],
  ['thursday', 'Jueves'], ['friday', 'Viernes'],
].map(([day, label]) => ({ day, label }));

export function parseLessonRange(value) {
  const match = /^([1-9]\d*)(?:\s*[-–]\s*([1-9]\d*))?$/.exec(String(value).trim());
  if (!match) return null;
  const start = Number(match[1]), end = match[2] ? Number(match[2]) : start;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end > 100) return null;
  return { curriculum_lesson_number: start, curriculum_lesson_end: end > start ? end : null };
}

export function dailyPosition(daily) {
  const moduleNumber = Number(daily?.module_number);
  const start = Number(daily?.curriculum_lesson_number);
  const end = Number(daily?.curriculum_lesson_end) || start;
  if (![moduleNumber, start, end].every(n => Number.isInteger(n) && n > 0) || end < start) return null;
  return { moduleNumber, lessonNumber: end, start, end,
    label: `M${moduleNumber}.L${start}${end > start ? `–${end}` : ''}` };
}

export function cleanPracticeWords(value) {
  const text = Array.isArray(value) ? value.join('\n') : String(value || '');
  return [...new Set((text.normalize('NFC').toLocaleLowerCase('es')
    .match(/[a-záéíóúüñ]+(?:-[a-záéíóúüñ]+)*/gu) || []).filter(word => word.length < 40))];
}

export function matchingDfBooks(catalog, daily) {
  const position = dailyPosition(daily);
  if (!position) return [];
  return catalog.filter(book => {
    if (book.subject !== 'df' || book.module !== `M${position.moduleNumber}`) return false;
    const lessons = Array.isArray(book.lessons) && book.lessons.length ? book.lessons : [book.lesson];
    return lessons.some(tag => {
      const match = /^L(\d+)$/.exec(tag || '');
      return match && Number(match[1]) >= position.start && Number(match[1]) <= position.end;
    });
  });
}

export function bookBodyText(book) {
  // Prefer OCR coordinates / authored page text. Covers and explicit credit
  // pages are not reading vocabulary. Teachers can still edit any candidate.
  return (book.pages || []).filter((page, i) => {
    const number = Number(page.page_number ?? i + 1);
    return number > 1 && !['cover', 'credits', 'copyright'].includes(page.kind || page.role);
  }).map(page => {
    if (Array.isArray(page.words) && page.words.length) return page.words.map(w => typeof w === 'string' ? w : w.text || '').join(' ');
    return page.text || page.page_text || '';
  }).filter(text => !/(?:copyright|derechos reservados|isbn|ilustrado por|escrito por)/i.test(text)).join('\n');
}

export function boardWords(row, generated) {
  return row?.words_overridden === true ? cleanPracticeWords(row.words || [])
    : cleanPracticeWords(generated || row?.generated_words || []);
}

export function buildDailyPools(daily, builders) {
  const position = dailyPosition(daily);
  if (!position || daily?.active === false) return { letters: [], syllables: [], hfw: [] };
  const unique = values => [...new Set(values)];
  return {
    letters: unique(builders.letters(position).map(g => g.replace(/-.+$/, '').replace(/^g$/, 'g'))),
    syllables: unique(builders.syllables(position)),
    hfw: unique(builders.hfw(position)),
  };
}
