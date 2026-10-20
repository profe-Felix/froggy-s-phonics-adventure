import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { loadBookCatalog } from '@/lib/book/catalog';
import { readFluencyBook } from '@/lib/book/fluencyText';
import { getIntroducedGraphemesThrough } from '@/lib/literacy/curriculumGraphemes';
import { buildSyllablePool } from '@/lib/literacy/curriculumContentBuilder';
import { knownSightWordsAt } from '@/lib/literacy/sightWordProgression.mjs';
import { boardWords, buildDailyPools, cleanPracticeWords, dailyPosition, matchingDfBooks, PRACTICE_DAYS } from '@/lib/literacy/dailyFluency.mjs';

async function allLessons() {
  const result = [];
  for (let skip = 0; ; skip += 200) {
    const rows = await base44.entities.Lesson.filter({ active: true }, 'lesson_number', 200, skip);
    result.push(...rows);
    if (rows.length < 200) break;
  }
  return result.filter(row => row.lesson_number > 0 && (!row.assignment_type || row.assignment_type === 'class'));
}
const builders = { letters: getIntroducedGraphemesThrough, syllables: buildSyllablePool, hfw: knownSightWordsAt };

export default function useDailyFluency() {
  const [params, setParams] = useSearchParams(), cache = useQueryClient();
  const teacher = params.get('role') === 'teacher';
  const lessonsQuery = useQuery({ queryKey: ['daily-fluency-lessons'], queryFn: allLessons, staleTime: 30000 });
  const catalogQuery = useQuery({ queryKey: ['daily-fluency-books'], queryFn: loadBookCatalog, staleTime: 30000 });
  const lessons = lessonsQuery.data || [];
  const lessonId = params.get('lesson') || lessons[0]?.id || '';
  const requested = useQuery({ queryKey: ['daily-fluency-lesson', lessonId],
    enabled: !!lessonId && !lessons.some(l => l.id === lessonId),
    queryFn: () => base44.entities.Lesson.get(lessonId) });
  const lesson = lessons.find(l => l.id === lessonId) || requested.data;
  const days = PRACTICE_DAYS.map(d => ({ ...d, active: lesson?.daily_lessons?.some(l => l.day === d.day && l.active !== false) || false }));
  const day = params.get('day') || days.find(d => d.active)?.day || 'monday';
  const type = ['letters', 'syllables', 'hfw', 'words'].includes(params.get('type')) ? params.get('type') : 'letters';
  const daily = lesson?.daily_lessons?.find(d => d.day === day);
  const position = dailyPosition(daily);
  const positionLabel = position?.label || '';
  const scopeKey = `${lessonId}:${day}`;
  const books = useMemo(() => matchingDfBooks(catalogQuery.data || [], daily), [catalogQuery.data, daily]);
  const sourceSignature = JSON.stringify([positionLabel, books.map(b => [b.id, b.updated_date, b.pdf_url, b.pages?.length, b.module, b.lessons, b.lesson])]);
  const recordKey = ['daily-fluency-record', scopeKey];
  const recordQuery = useQuery({ queryKey: recordKey, enabled: !!lessonId,
    queryFn: async () => (await base44.entities.DailyFluencyBoard.filter({ board_key: scopeKey }, '-saved_at', 20))[0] || null });
  const row = recordQuery.data;
  const extractBooks = async () => {
    const words = [], warnings = [];
    for (const book of books) {
      try { const result = await readFluencyBook(book); words.push(...result.words); if (result.warning) warnings.push(result.warning); }
      catch { warnings.push(`${book.title}: text could not be read. Retry or enter words manually.`); }
    }
    return { words: cleanPracticeWords(words), warnings };
  };
  const textQuery = useQuery({
    queryKey: ['daily-fluency-text', scopeKey, sourceSignature],
    enabled: !!daily && daily.active !== false && catalogQuery.isSuccess && recordQuery.isSuccess && (teacher || type === 'words'),
    queryFn: async () => {
      if (row?.source_signature === sourceSignature) return { words: row.generated_words || [], warnings: [] };
      return extractBooks();
    },
    staleTime: 60000, retry: false,
  });
  const pools = useMemo(() => buildDailyPools(daily, builders), [daily]);
  const generated = textQuery.data?.words || (row?.source_signature === sourceSignature ? row.generated_words : []);
  const words = boardWords(row, generated);
  const items = type === 'words' ? words : pools[type] || [];
  const [wordDraft, updateDraft] = useState(''), [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('');
  const draftScope = useRef(''), dirty = useRef(false), currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  useEffect(() => {
    if (draftScope.current !== scopeKey) { draftScope.current = scopeKey; dirty.current = false; setSaveError(''); }
    if (!dirty.current) updateDraft(words.join(', '));
  }, [scopeKey, words.join('\n')]);
  const setWordDraft = value => { dirty.current = true; updateDraft(value); };
  const persist = async (overridden, manualWords, { automatic = false, generatedWords = generated } = {}) => {
    if (!teacher || !lessonId || !daily || saving) return;
    setSaving(true); setSaveError('');
    try {
      const payload = { board_key: scopeKey, lesson_id: lessonId, day, position: positionLabel,
        source_signature: sourceSignature, book_ids: books.map(b => b.id), generated_words: generatedWords,
        words: manualWords, words_overridden: overridden, saved_at: new Date().toISOString() };
      const saved = row?.id ? await base44.entities.DailyFluencyBoard.update(row.id, payload) : await base44.entities.DailyFluencyBoard.create(payload);
      cache.setQueryData(recordKey, saved);
      if (currentScope.current === scopeKey && (!automatic || !dirty.current)) {
        dirty.current = false;
        updateDraft(boardWords(saved, generatedWords).join(', '));
      }
    } catch (error) { setSaveError('The word list did not save. Your edits remain here; retry before closing.'); throw error; }
    finally { setSaving(false); }
  };
  const autoSaved = useRef(new Set());
  useEffect(() => {
    // Cache successfully extracted book vocabulary for families, never overwrite
    // a teacher's edited list and never mark incomplete extraction as current.
    if (!teacher || !textQuery.isSuccess || textQuery.data.warnings.length || !generated.length
      || row?.source_signature === sourceSignature || !recordQuery.isSuccess || saving) return;
    const key = `${scopeKey}:${sourceSignature}`;
    if (autoSaved.current.has(key)) return;
    autoSaved.current.add(key);
    void persist(row?.words_overridden === true, row?.words || [], { automatic: true }).catch(() => autoSaved.current.delete(key));
  }, [teacher, textQuery.data, row?.source_signature, recordQuery.isSuccess, sourceSignature, scopeKey]);
  const change = (key, value) => setParams(previous => {
    const next = new URLSearchParams(previous);
    next.set(key, String(value));
    return next;
  });
  const loading = lessonsQuery.isLoading || catalogQuery.isLoading || (!!lessonId && recordQuery.isLoading) || (!lesson && requested.isFetching)
    || (type === 'words' && !row?.words_overridden && textQuery.isFetching);
  const failure = lessonsQuery.error || catalogQuery.error || recordQuery.error || requested.error;
  const wordStatus = !daily || daily.active === false ? 'No active lesson is configured for this day.'
    : !position ? 'Set the module and lesson for this day in Lesson Editor.'
    : !books.length ? 'No DF book is tagged for this module and lesson yet. Tag a DF book or enter a daily word list.'
    : textQuery.data?.warnings.join(' ') || (!words.length ? 'No readable book words yet. The teacher can enter the daily list.' : '');
  const share = new URL('/DailyFluency', window.location.origin);
  for (const [key, value] of Object.entries({ lesson: lessonId, day, type })) share.searchParams.set(key, value);
  return { lessons: lesson && !lessons.some(l => l.id === lesson.id) ? [...lessons, lesson] : lessons,
    lessonId, setLessonId: id => change('lesson', id), day, setDay: d => change('day', d), days,
    type, setType: t => change('type', t), items, positionLabel, books, wordStatus, loading,
    error: failure ? 'The daily fluency data could not load. Retry without changing the lesson.' : '',
    retry: () => { lessonsQuery.refetch(); catalogQuery.refetch(); recordQuery.refetch(); textQuery.refetch(); if (requested.isError) requested.refetch(); },
    teacher, wordDraft, setWordDraft, hasOverride: row?.words_overridden === true,
    saveWords: () => persist(true, cleanPracticeWords(wordDraft)),
    resetWords: async () => {
      if (saving) return;
      setSaving(true); setSaveError('');
      let result;
      try { result = await extractBooks(); }
      catch { setSaveError('The book words could not regenerate. Your saved list is unchanged.'); return; }
      finally { setSaving(false); }
      if (result.warnings.length || !result.words.length) {
        setSaveError((result.warnings.join(' ') || 'No readable words were found in tagged DF books.') + ' Your saved word list is unchanged.');
        return;
      }
      cache.setQueryData(['daily-fluency-text', scopeKey, sourceSignature], result);
      await persist(false, [], { generatedWords: result.words });
    },
    saving, saveError, shareUrl: lessonId ? share.href : '' };
}
