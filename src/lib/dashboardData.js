// Letter/period data + createEmptyData for the Student Dashboard

export const EN_LETTERS_ROW1 = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
export const EN_LETTERS_ROW2 = ['N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

// Full curriculum sequence — ordered list of all Spanish letters with module numbers.
// The última letra setting for each period determines where the sequence is cut.
// {d: display, k: unique data key, m: module number, p?: phoneme, bl?: black out, tl?: thin left}
export const FULL_SEQUENCE = [
  // Módulo 1
  {d:'O',k:'O',m:1},{d:'o',k:'o',m:1,tl:1},
  {d:'I',k:'I',m:1},{d:'i',k:'i',m:1,tl:1},
  {d:'A',k:'A',m:1},{d:'a',k:'a',m:1,tl:1},
  {d:'U',k:'U',m:1},{d:'u',k:'u',m:1,tl:1},
  {d:'E',k:'E',m:1},{d:'e',k:'e',m:1,tl:1},
  {d:'M',k:'M',m:1},{d:'m',k:'m',m:1,tl:1},
  // Módulo 2
  {d:'P',k:'P',m:2},{d:'p',k:'p',m:2,tl:1},
  {d:'S',k:'S',m:2},{d:'s',k:'s',m:2,tl:1},
  {d:'L',k:'L',m:2},{d:'l',k:'l',m:2,tl:1},
  {d:'N',k:'N',m:2},{d:'n',k:'n',m:2,tl:1},
  // Módulo 3
  {d:'D',k:'D',m:3},{d:'d',k:'d',m:3,tl:1},
  {d:'T',k:'T',m:3},{d:'t',k:'t',m:3,tl:1},
  // Módulo 4
  {d:'F',k:'F',m:4},{d:'f',k:'f',m:4,tl:1},
  {d:'B',k:'B',m:4},{d:'b',k:'b',m:4,tl:1},
  {d:'R_',k:'R_',m:4},{d:'r',k:'r',m:4,tl:1},
  // Módulo 5
  {d:'C',k:'C',p:'/k/',m:5},{d:'c',k:'c',p:'/k/',m:5,tl:1},
  {d:'Q',k:'Q',m:5},{d:'q',k:'q',m:5,tl:1},
  {d:'V',k:'V',m:5},{d:'v',k:'v',m:5,tl:1},
  // Módulo 5 (review)
  {d:'R_',k:'R_',m:5},{d:'r',k:'r',m:5,tl:1},
  // Módulo 6
  {d:'Ll',k:'Ll',bl:1,m:6},{d:'ll',k:'ll',bl:1,m:6,tl:1},
  {d:'G',k:'G',p:'/g/',m:6},{d:'g',k:'g',p:'/g/',m:6,tl:1},
  {d:'Y',k:'Y',m:6},{d:'y',k:'y',m:6,tl:1},
  {d:'Z',k:'Z',m:6},{d:'z',k:'z',m:6,tl:1},
  // Módulo 7
  {d:'H',k:'H',m:7},{d:'h',k:'h',m:7,tl:1},
  {d:'J',k:'J',m:7},{d:'j',k:'j',m:7,tl:1},
  {d:'C',k:'C_s',p:'/s/',bl:1,m:7},{d:'c',k:'c_s',p:'/s/',bl:1,m:7,tl:1},
  {d:'Ñ',k:'Ñ',m:7},{d:'ñ',k:'ñ',m:7,tl:1},
  {d:'G',k:'G_j',p:'/j/',bl:1,m:7},{d:'g',k:'g_j',p:'/j/',bl:1,m:7,tl:1},
  // Módulo 7 (review)
  {d:'Ch',k:'Ch',bl:1,m:7},{d:'ch',k:'ch',bl:1,m:7,tl:1},
  // Módulo 8
  {d:'K',k:'K',m:8},{d:'k',k:'k',m:8,tl:1},
  {d:'X',k:'X',m:8},{d:'x',k:'x',m:8,tl:1},
  {d:'W',k:'W',m:8},{d:'w',k:'w',m:8,tl:1},
];

// Official Spanish high-frequency words.
// module_number and curriculum_lesson_number match the M#.L#
// assigned to an individual pathway day.
export const ES_SIGHT_WORD_SEQUENCE = [
  // Módulo 1
  {
    module_number: 1,
    curriculum_lesson_number: 1,
    words: ['el', 'la'],
  },
  {
    module_number: 1,
    curriculum_lesson_number: 5,
    words: ['un', 'una'],
  },
  {
    module_number: 1,
    curriculum_lesson_number: 11,
    words: ['en', 'las'],
  },
  {
    module_number: 1,
    curriculum_lesson_number: 16,
    words: ['de', 'y'],
  },

  // Módulo 2
  {
    module_number: 2,
    curriculum_lesson_number: 1,
    words: ['aquí', 'está', 'los'],
  },
  {
    module_number: 2,
    curriculum_lesson_number: 6,
    words: ['con', 'dos', 'sube'],
  },
  {
    module_number: 2,
    curriculum_lesson_number: 11,
    words: ['bajo', 'hay', 'no'],
  },
  {
    module_number: 2,
    curriculum_lesson_number: 16,
    words: ['del', 'encima', 'le'],
  },

  // Módulo 3
  {
    module_number: 3,
    curriculum_lesson_number: 1,
    words: ['dice', 'también', 'tiene'],
  },
  {
    module_number: 3,
    curriculum_lesson_number: 6,
    words: ['agua', 'pero', 'su'],
  },
  {
    module_number: 3,
    curriculum_lesson_number: 11,
    words: ['hacia', 'que', 'vamos'],
  },
  {
    module_number: 3,
    curriculum_lesson_number: 16,
    words: ['después', 'trabaja', 'va'],
  },

  // Módulo 4
  {
    module_number: 4,
    curriculum_lesson_number: 1,
    words: ['ahora', 'hoy', 'papá'],
  },
  {
    module_number: 4,
    curriculum_lesson_number: 6,
    words: ['mucho', 'piensa', 'qué'],
  },
  {
    module_number: 4,
    curriculum_lesson_number: 11,
    words: ['se', 'tengo', 'todavía'],
  },
  {
    module_number: 4,
    curriculum_lesson_number: 16,
    words: ['bosque', 'ir', 'noche'],
  },

  // Módulo 5
  {
    module_number: 5,
    curriculum_lesson_number: 1,
    words: ['flor', 'hasta', 'quiere'],
  },
  {
    module_number: 5,
    curriculum_lesson_number: 6,
    words: ['idea', 'hacer', 'yo'],
  },
  {
    module_number: 5,
    curriculum_lesson_number: 11,
    words: ['gusta', 'juntar', 'lleva'],
  },
  {
    module_number: 5,
    curriculum_lesson_number: 16,
    words: ['grande', 'hermano', 'tiempo'],
  },

  // Módulo 6
  {
    module_number: 6,
    curriculum_lesson_number: 1,
    words: ['barco', 'estrellas', 'sobre'],
  },
  {
    module_number: 6,
    curriculum_lesson_number: 6,
    words: ['hace', 'mejor', 'yo'],
  },
  {
    module_number: 6,
    curriculum_lesson_number: 11,
    words: ['cumpleaños', 'ha', 'muy'],
  },
  {
    module_number: 6,
    curriculum_lesson_number: 16,
    words: ['ella', 'pregunta', 'siempre'],
  },

  // Módulo 7
  {
    module_number: 7,
    curriculum_lesson_number: 1,
    words: ['aprender', 'dentro', 'pequeño'],
  },
  {
    module_number: 7,
    curriculum_lesson_number: 6,
    words: ['animales', 'gracias', 'madre'],
  },
  {
    module_number: 7,
    curriculum_lesson_number: 11,
    words: ['cómo', 'cuando', 'encuentra'],
  },
  {
    module_number: 7,
    curriculum_lesson_number: 16,
    words: ['libro', 'nuevo', 'primero'],
  },

  // Módulo 8
  {
    module_number: 8,
    curriculum_lesson_number: 1,
    words: ['más', 'música', 'quienes'],
  },
  {
    module_number: 8,
    curriculum_lesson_number: 6,
    words: ['letra', 'nombre', 'todo'],
  },
  {
    module_number: 8,
    curriculum_lesson_number: 11,
    words: ['crecer', 'material', 'tierra'],
  },
  {
    module_number: 8,
    curriculum_lesson_number: 16,
    words: ['cosa', 'grupo', 'tarea'],
  },

  // Módulo 9
  {
    module_number: 9,
    curriculum_lesson_number: 1,
    words: ['clase', 'escribir', 'pronto'],
  },
  {
    module_number: 9,
    curriculum_lesson_number: 6,
    words: ['desde', 'ejemplo', 'hablar'],
  },
  {
    module_number: 9,
    curriculum_lesson_number: 11,
    words: ['completa', 'importante', 'observa'],
  },
  {
    module_number: 9,
    curriculum_lesson_number: 16,
    words: ['árboles', 'buscan', 'guarda'],
  },
];

// Period metadata (labels + default end dates) — letters are computed dynamically.
export const ES_PERIOD_INFO = [
  { label: '1as 9 sem', defaultDate: 'oct. 09' },
  { label: '2as 9 sem', defaultDate: 'dic. 18' },
  { label: '3as 9 sem', defaultDate: 'mar. 05' },
  { label: '4as 9 sem', defaultDate: 'may. 21' },
];

// Default última letra for each period (used when no setting is saved).
const DEFAULT_LAST_LETTERS = ['n', 'v', 'ñ', 'w'];

// Compute which letters belong to each 9-week period based on the última letra settings.
// Returns an array of 4 arrays, each containing the letters for that period.
export function computePeriods(lastLetters) {
  let cursor = 0;
  const periods = [];

  for (let p = 0; p < 4; p++) {
    // Case-sensitive match: 'n' matches lowercase 'n' (index 19), not uppercase 'N' (index 18).
    // This ensures both N and n stay in the same period when the user types 'n'.
    const target = (lastLetters?.[PERIODS[p]] || DEFAULT_LAST_LETTERS[p]).trim();
    let endIdx = -1;

    for (let i = cursor; i < FULL_SEQUENCE.length; i++) {
      if (FULL_SEQUENCE[i].d === target) {
        endIdx = i;
        break;
      }
    }

    // If not found with case-sensitive match, try case-insensitive as fallback
    if (endIdx === -1) {
      const targetLower = target.toLowerCase();
      for (let i = cursor; i < FULL_SEQUENCE.length; i++) {
        if (FULL_SEQUENCE[i].d.toLowerCase() === targetLower) {
          endIdx = i;
          break;
        }
      }
    }

    // If still not found, try the default
    if (endIdx === -1) {
      for (let i = cursor; i < FULL_SEQUENCE.length; i++) {
        if (FULL_SEQUENCE[i].d.toLowerCase() === DEFAULT_LAST_LETTERS[p]) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx === -1) {
      // Still not found — include everything remaining (last period fallback)
      periods.push(FULL_SEQUENCE.slice(cursor));
      cursor = FULL_SEQUENCE.length;
    } else {
      periods.push(FULL_SEQUENCE.slice(cursor, endIdx + 1));
      cursor = endIdx + 1;
    }
  }

  return periods;
}

// Convert the sight-word introduction groups into one ordered sequence.
//
// The key includes the module so repeated words such as "yo" in Módulo 5
// and Módulo 6 remain distinguishable when used as 9-week cutoffs.
// Official mastery is still stored once per word in data.sightWords.
export function getSightWordSequence() {
  return ES_SIGHT_WORD_SEQUENCE.flatMap((introduction) =>
    introduction.words.map((word) => ({
      key: `${introduction.module_number}:${word}`,
      word,
      module_number: introduction.module_number,
      curriculum_lesson_number:
        introduction.curriculum_lesson_number,
    }))
  );
}

// Divide the ordered sight-word sequence among the four 9-week sections.
// Each selected cutoff is the last visible curriculum word in that period.
export function computeSightWordPeriods(lastSightWordLearned) {
  const sequence = getSightWordSequence();
  const periods = [];
  let cursor = 0;

  for (let periodIndex = 0; periodIndex < PERIODS.length; periodIndex++) {
    const periodKey = PERIODS[periodIndex];
    const cutoffKey = lastSightWordLearned?.[periodKey] || '';

    // Until a cutoff is selected, leave this section empty.
    // The final period receives all remaining words.
    if (!cutoffKey) {
      if (periodIndex === PERIODS.length - 1) {
        periods.push(sequence.slice(cursor));
        cursor = sequence.length;
      } else {
        periods.push([]);
      }
      continue;
    }

    const relativeEndIndex = sequence
      .slice(cursor)
      .findIndex((item) => item.key === cutoffKey);

    if (relativeEndIndex === -1) {
      periods.push([]);
      continue;
    }

    const endIndex = cursor + relativeEndIndex;
    periods.push(sequence.slice(cursor, endIndex + 1));
    cursor = endIndex + 1;
  }

  return periods;
}

// Group consecutive letters by module — returns [{name: 'Módulo 1', module: 1, letters: [...]}]
export function groupByModule(letters) {
  const groups = [];
  for (const l of letters) {
    const last = groups[groups.length - 1];
    if (last && last.module === l.m) {
      last.letters.push(l);
    } else {
      groups.push({ name: `Módulo ${l.m}`, module: l.m, letters: [l] });
    }
  }
  return groups;
}

// Backward compat — all possible letter keys for createEmptyData
export const ALL_ES_LETTERS = FULL_SEQUENCE;

export const NUMBERS_ROW1 = ['0','1','2','3','4','5','6','7','8','9','10'];
export const NUMBERS_ROW2 = ['11','12','13','14','15','16','17','18','19','20'];
export const COMPOSE_ROW1 = ['1','2','3','4','5','6','7','8','9','10'];
export const COMPOSE_ROW2 = ['11','12','13','14','15','16','17','18','19','20'];
export const PERIODS = ['1st', '2nd', '3rd', '4th'];

export function createEmptyData() {
  const data = {
    letters: {},
    sightWords: {},
    allUpper: false,
    allLower: false,
    allSounds: false,
    allFormation: false,
    periodDates: { '1st': 'oct. 10', '2nd': 'dic. 19', '3rd': 'mar. 6', '4th': 'may. 22' },
    lastLetterLearned: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
    lastSightWordLearned: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
    numbers: {},
    compose: {},
    counting: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
    parentInitials: {
      letters: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
      numbers: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
      compose: { '1st': '', '2nd': '', '3rd': '', '4th': '' },
    },
  };
  for (const l of [...EN_LETTERS_ROW1, ...EN_LETTERS_ROW2]) {
    data.letters[l] = { upper: false, lower: false, sound: false, formation: false };
  }
  for (const l of ALL_ES_LETTERS) {
    data.letters[l.k] = { upper: false, lower: false, sound: false, formation: false };
  }

  // Create one official mastery value for every sight word.
  // Repeated curriculum appearances, such as "yo", share one mastery value.
  for (const introduction of ES_SIGHT_WORD_SEQUENCE) {
    for (const word of introduction.words) {
      if (!(word in data.sightWords)) {
        data.sightWords[word] = {
          read: false,
          write: false,
        };
      }
    }
  }

  for (const n of [...NUMBERS_ROW1, ...NUMBERS_ROW2]) {
    data.numbers[n] = { read: false, write: false };
  }
  for (const n of [...COMPOSE_ROW1, ...COMPOSE_ROW2]) {
    data.compose[n] = { compose: false, decompose2: false, decompose3: false };
  }
  return data;
}

// Merge saved dashboard data with the newest structure.
// Also converts old sight-word Boolean values into
// separate reading and writing values.
export function mergeDashboardData(savedData) {
  const defaults = createEmptyData();

  if (
    !savedData ||
    typeof savedData !== 'object'
  ) {
    return defaults;
  }

  const sightWords = {
    ...(defaults.sightWords || {}),
  };

  for (const [word, mastery] of Object.entries(
    savedData.sightWords || {}
  )) {
    if (typeof mastery === 'boolean') {
      sightWords[word] = {
        read: mastery,
        write: false,
      };
    } else {
      sightWords[word] = {
        read: Boolean(mastery?.read),
        write: Boolean(mastery?.write),
      };
    }
  }

  return {
    ...defaults,
    ...savedData,

    letters: {
      ...defaults.letters,
      ...(savedData.letters || {}),
    },

    sightWords,

    numbers: {
      ...defaults.numbers,
      ...(savedData.numbers || {}),
    },

    compose: {
      ...defaults.compose,
      ...(savedData.compose || {}),
    },

    counting: {
      ...defaults.counting,
      ...(savedData.counting || {}),
    },

    parentInitials: {
      letters: {
        ...defaults.parentInitials.letters,
        ...(savedData.parentInitials?.letters ||
          {}),
      },

      numbers: {
        ...defaults.parentInitials.numbers,
        ...(savedData.parentInitials?.numbers ||
          {}),
      },

      compose: {
        ...defaults.parentInitials.compose,
        ...(savedData.parentInitials?.compose ||
          {}),
      },
    },
  };
}
