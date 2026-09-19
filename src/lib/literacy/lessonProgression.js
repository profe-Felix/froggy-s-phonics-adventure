export const EMPTY_LITERACY = {
  graphemes: [],
  sightWords: [],
  pictureWords: [],
  sentencePatterns: [],
};

export function splitLiteracyList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  return String(value || '')
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getLessonLiteracy(lesson) {
  const direct = lesson?.literacy_progression;

  const stored = (lesson?.steps || []).find(
    (step) => step?.config?.lessonLiteracy
  )?.config?.lessonLiteracy;

  const raw = direct || stored || {};

  return {
    graphemes: splitLiteracyList(raw.graphemes),
    sightWords: splitLiteracyList(raw.sightWords),
    pictureWords: splitLiteracyList(raw.pictureWords),
    sentencePatterns: String(
      raw.sentencePatterns || ''
    )
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

export function normalizeSpanish(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/n\u0303/g, 'ñ')
    .replace(/u\u0308/g, 'ü')
    .replace(/[\u0300-\u036f]/g, '');
}

export function uniqueNormalized(items) {
  const seen = new Set();

  return (items || []).filter((item) => {
    const key = normalizeSpanish(item);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function canDecodeWord(word, graphemes) {
  const normalizedWord = normalizeSpanish(word)
    .replace(/[^a-zñü]/g, '');

  if (!normalizedWord) {
    return false;
  }

  const allowed = uniqueNormalized(graphemes)
    .map(normalizeSpanish)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (!allowed.length) {
    return false;
  }

  const memo = new Map();

  const canFinish = (index) => {
    if (index === normalizedWord.length) {
      return true;
    }

    if (memo.has(index)) {
      return memo.get(index);
    }

    const works = allowed.some(
      (grapheme) =>
        normalizedWord.startsWith(grapheme, index) &&
        canFinish(index + grapheme.length)
    );

    memo.set(index, works);
    return works;
  };

  return canFinish(0);
}

export function buildCumulativeLiteracy(lessons) {
  const cumulative = {
    ...EMPTY_LITERACY,
    graphemes: [],
    sightWords: [],
    pictureWords: [],
    sentencePatterns: [],
  };

  (lessons || []).forEach((lesson) => {
    const literacy = getLessonLiteracy(lesson);

    cumulative.graphemes.push(...literacy.graphemes);
    cumulative.sightWords.push(...literacy.sightWords);
    cumulative.pictureWords.push(...literacy.pictureWords);
    cumulative.sentencePatterns.push(
      ...literacy.sentencePatterns
    );
  });

  return {
    graphemes: uniqueNormalized(cumulative.graphemes),
    sightWords: uniqueNormalized(cumulative.sightWords),
    pictureWords: uniqueNormalized(
      cumulative.pictureWords
    ),
    sentencePatterns: [
      ...new Set(cumulative.sentencePatterns),
    ],
  };
}

export function normalizeLessonLiteracy(lesson) {
  const literacy = getLessonLiteracy(lesson);

  return {
    graphemes: uniqueNormalized(literacy.graphemes),
    sightWords: uniqueNormalized(literacy.sightWords),
    pictureWords: uniqueNormalized(
      literacy.pictureWords
    ),
    sentencePatterns: [
      ...new Set(literacy.sentencePatterns),
    ],
  };
}

export function buildStudentLiteracyContext({
  lessons,
  progresses,
  className,
  language = 'es',
}) {
  const pathLessons = (lessons || [])
    .filter(
      (lesson) =>
        lesson.assignment_type !== 'guided' &&
        lesson.assignment_type !== 'side_quest' &&
        (
          !lesson.class_name ||
          lesson.class_name === className
        ) &&
        (
          !lesson.language ||
          lesson.language === language
        ) &&
        Number(lesson.lesson_number) > 0
    )
    .sort(
      (a, b) =>
        Number(a.lesson_number || 0) -
        Number(b.lesson_number || 0)
    );

  if (!pathLessons.length) {
    return null;
  }

  const completedLessonIds = new Set(
    (progresses || [])
      .filter((progress) => progress.completed)
      .map((progress) => String(progress.lesson_id))
  );

  const currentLesson =
    pathLessons.find(
      (lesson) =>
        !completedLessonIds.has(String(lesson.id))
    ) ||
    pathLessons[pathLessons.length - 1];

  const currentLessonNumber = Number(
    currentLesson.lesson_number || 1
  );

  const availableLessons = pathLessons.filter(
    (lesson) =>
      Number(lesson.lesson_number || 0) <=
      currentLessonNumber
  );

  return {
    currentLesson,
    currentLessonNumber,
    cumulative:
      buildCumulativeLiteracy(availableLessons),
    current:
      normalizeLessonLiteracy(currentLesson),
  };
}
