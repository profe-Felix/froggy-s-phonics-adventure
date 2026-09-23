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

export function canDecodeWord(
  word,
  graphemes
) {
  const normalizedWord =
    normalizeSpanish(word)
      .replace(
        /[^a-zñü]/g,
        ''
      );

  if (!normalizedWord) {
    return false;
  }

  const introduced =
    new Set(
      uniqueNormalized(graphemes)
        .map(normalizeSpanish)
        .filter(Boolean)
    );

  if (!introduced.size) {
    return false;
  }

  const has = (token) =>
    introduced.has(
      normalizeSpanish(token)
    );

  // ---------------------------------------------------------
  // MULTI-LETTER SPELLING UNITS
  //
  // These patterns cannot be unlocked merely because their
  // individual letters were introduced. The curriculum must
  // explicitly introduce the complete spelling unit.
  // ---------------------------------------------------------

  const requiredLiteralPatterns = [
    'ch',
    'll',
    'qu',
    'tr',
    'br',
    'gr',
    'pr',
    'fr',
    'cr',
    'dr',
    'cl',
    'bl',
    'pl',
    'fl',
    'gl',
  ];

  for (
    const pattern of
      requiredLiteralPatterns
  ) {
    if (
      normalizedWord.includes(
        pattern
      ) &&
      !has(pattern)
    ) {
      return false;
    }
  }

  // ---------------------------------------------------------
  // CONTEXTUAL C
  //
  // c-fuerte: ca, co, cu
  // c-suave:  ce, ci
  //
  // "ch" is handled as its own spelling unit above.
  // ---------------------------------------------------------

  for (
    let index = 0;
    index < normalizedWord.length;
    index += 1
  ) {
    if (
      normalizedWord[index] !== 'c'
    ) {
      continue;
    }

    const following =
      normalizedWord[index + 1] ||
      '';

    if (following === 'h') {
      // The complete "ch" pattern was checked above.
      continue;
    }

    if (
      following === 'e' ||
      following === 'i'
    ) {
      if (!has('c-suave')) {
        return false;
      }
    } else if (!has('c-fuerte')) {
      return false;
    }
  }

  // ---------------------------------------------------------
  // CONTEXTUAL G
  //
  // g-fuerte:   ga, go, gu, gue, gui
  // g-suave:    ge, gi
  // g-diéresis: güe, güi
  //
  // normalizeSpanish removes the accent from the instructional
  // ID "g-diéresis", so its normalized ID is "g-dieresis".
  // The ü in actual words remains ü.
  // ---------------------------------------------------------

  for (
    let index = 0;
    index < normalizedWord.length;
    index += 1
  ) {
    if (
      normalizedWord[index] !== 'g'
    ) {
      continue;
    }

    const nextTwo =
      normalizedWord.slice(
        index,
        index + 3
      );

    const following =
      normalizedWord[index + 1] ||
      '';

    if (
      nextTwo === 'güe' ||
      nextTwo === 'güi'
    ) {
      if (!has('g-diéresis')) {
        return false;
      }

      continue;
    }

    if (
      nextTwo === 'gue' ||
      nextTwo === 'gui'
    ) {
      if (!has('g-fuerte')) {
        return false;
      }

      continue;
    }

    if (
      following === 'e' ||
      following === 'i'
    ) {
      if (!has('g-suave')) {
        return false;
      }
    } else if (!has('g-fuerte')) {
      return false;
    }
  }

  // ---------------------------------------------------------
  // CONTEXTUAL R
  //
  // r-inicial: strong r at the beginning
  // rr-medial: medial double r
  // r-medial:  medial single/tapped r
  // r-final:   r at the end
  // ---------------------------------------------------------

  for (
    let index = 0;
    index < normalizedWord.length;
    index += 1
  ) {
    if (
      normalizedWord[index] !== 'r'
    ) {
      continue;
    }

    const isDouble =
      normalizedWord[index + 1] ===
      'r';

    if (isDouble) {
      if (!has('rr-medial')) {
        return false;
      }

      // Skip the second r because the pair is one
      // curriculum spelling pattern.
      index += 1;
      continue;
    }

    if (index === 0) {
      if (!has('r-inicial')) {
        return false;
      }

      continue;
    }

    if (
      index ===
      normalizedWord.length - 1
    ) {
      if (!has('r-final')) {
        return false;
      }

      continue;
    }

    if (!has('r-medial')) {
      return false;
    }
  }

  // Initial consonantal y is tracked separately.
  if (
    normalizedWord.startsWith('y') &&
    !has('y-inicial')
  ) {
    return false;
  }

  // ---------------------------------------------------------
  // BUILD THE LITERAL DECODING INVENTORY
  //
  // Contextual curriculum IDs are converted into the literal
  // letters or spelling chunks they make available. The checks
  // above still control where those letters may appear.
  // ---------------------------------------------------------

  const contextualIds =
    new Set([
      'r-inicial',
      'rr-medial',
      'r-medial',
      'r-final',
      'c-fuerte',
      'c-suave',
      'g-fuerte',
      'g-suave',
      'g-dieresis',
      'y-inicial',
    ]);

  const allowed = [];

  introduced.forEach((item) => {
    if (!contextualIds.has(item)) {
      allowed.push(item);
      return;
    }

    switch (item) {
      case 'r-inicial':
      case 'r-medial':
      case 'r-final':
        allowed.push('r');
        break;

      case 'rr-medial':
        allowed.push('rr');
        break;

      case 'c-fuerte':
      case 'c-suave':
        allowed.push('c');
        break;

      case 'g-fuerte':
      case 'g-suave':
        allowed.push('g');
        break;

      case 'g-dieresis':
        allowed.push('gü');
        break;

      case 'y-inicial':
        allowed.push('y');
        break;

      default:
        break;
    }
  });

  const decodingUnits =
    uniqueNormalized(allowed)
      .map(normalizeSpanish)
      .filter(Boolean)
      .sort(
        (first, second) =>
          second.length -
          first.length
      );

  if (!decodingUnits.length) {
    return false;
  }

  // Verify that the entire word can be built from introduced
  // letters and spelling units.
  const memo = new Map();

  const canFinish = (index) => {
    if (
      index ===
      normalizedWord.length
    ) {
      return true;
    }

    if (memo.has(index)) {
      return memo.get(index);
    }

    const works =
      decodingUnits.some(
        (unit) =>
          normalizedWord.startsWith(
            unit,
            index
          ) &&
          canFinish(
            index + unit.length
          )
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
