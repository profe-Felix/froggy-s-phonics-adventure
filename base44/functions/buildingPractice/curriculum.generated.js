// Generated from canonical app curriculum by scripts/build-building-curriculum.mjs. Do not edit manually.

// .local/base44-working-copy/src/lib/dashboardData.js
var ES_SIGHT_WORD_SEQUENCE = [
  // Módulo 1
  {
    module_number: 1,
    curriculum_lesson_number: 1,
    words: ["el", "la"]
  },
  {
    module_number: 1,
    curriculum_lesson_number: 5,
    words: ["un", "una"]
  },
  {
    module_number: 1,
    curriculum_lesson_number: 11,
    words: ["en", "las"]
  },
  {
    module_number: 1,
    curriculum_lesson_number: 16,
    words: ["de", "y"]
  },
  // Módulo 2
  {
    module_number: 2,
    curriculum_lesson_number: 1,
    words: ["aqu\xED", "est\xE1", "los"]
  },
  {
    module_number: 2,
    curriculum_lesson_number: 6,
    words: ["con", "dos", "sube"]
  },
  {
    module_number: 2,
    curriculum_lesson_number: 11,
    words: ["bajo", "hay", "no"]
  },
  {
    module_number: 2,
    curriculum_lesson_number: 16,
    words: ["del", "encima", "le"]
  },
  // Módulo 3
  {
    module_number: 3,
    curriculum_lesson_number: 1,
    words: ["dice", "tambi\xE9n", "tiene"]
  },
  {
    module_number: 3,
    curriculum_lesson_number: 6,
    words: ["agua", "pero", "su"]
  },
  {
    module_number: 3,
    curriculum_lesson_number: 11,
    words: ["hacia", "que", "vamos"]
  },
  {
    module_number: 3,
    curriculum_lesson_number: 16,
    words: ["despu\xE9s", "trabaja", "va"]
  },
  // Módulo 4
  {
    module_number: 4,
    curriculum_lesson_number: 1,
    words: ["ahora", "hoy", "pap\xE1"]
  },
  {
    module_number: 4,
    curriculum_lesson_number: 6,
    words: ["mucho", "piensa", "qu\xE9"]
  },
  {
    module_number: 4,
    curriculum_lesson_number: 11,
    words: ["se", "tengo", "todav\xEDa"]
  },
  {
    module_number: 4,
    curriculum_lesson_number: 16,
    words: ["bosque", "ir", "noche"]
  },
  // Módulo 5
  {
    module_number: 5,
    curriculum_lesson_number: 1,
    words: ["flor", "hasta", "quiere"]
  },
  {
    module_number: 5,
    curriculum_lesson_number: 6,
    words: ["idea", "hacer", "yo"]
  },
  {
    module_number: 5,
    curriculum_lesson_number: 11,
    words: ["gusta", "juntar", "lleva"]
  },
  {
    module_number: 5,
    curriculum_lesson_number: 16,
    words: ["grande", "hermano", "tiempo"]
  },
  // Módulo 6
  {
    module_number: 6,
    curriculum_lesson_number: 1,
    words: ["barco", "estrellas", "sobre"]
  },
  {
    module_number: 6,
    curriculum_lesson_number: 6,
    words: ["hace", "mejor", "yo"]
  },
  {
    module_number: 6,
    curriculum_lesson_number: 11,
    words: ["cumplea\xF1os", "ha", "muy"]
  },
  {
    module_number: 6,
    curriculum_lesson_number: 16,
    words: ["ella", "pregunta", "siempre"]
  },
  // Módulo 7
  {
    module_number: 7,
    curriculum_lesson_number: 1,
    words: ["aprender", "dentro", "peque\xF1o"]
  },
  {
    module_number: 7,
    curriculum_lesson_number: 6,
    words: ["animales", "gracias", "madre"]
  },
  {
    module_number: 7,
    curriculum_lesson_number: 11,
    words: ["c\xF3mo", "cuando", "encuentra"]
  },
  {
    module_number: 7,
    curriculum_lesson_number: 16,
    words: ["libro", "nuevo", "primero"]
  },
  // Módulo 8
  {
    module_number: 8,
    curriculum_lesson_number: 1,
    words: ["m\xE1s", "m\xFAsica", "quienes"]
  },
  {
    module_number: 8,
    curriculum_lesson_number: 6,
    words: ["letra", "nombre", "todo"]
  },
  {
    module_number: 8,
    curriculum_lesson_number: 11,
    words: ["crecer", "material", "tierra"]
  },
  {
    module_number: 8,
    curriculum_lesson_number: 16,
    words: ["cosa", "grupo", "tarea"]
  },
  // Módulo 9
  {
    module_number: 9,
    curriculum_lesson_number: 1,
    words: ["clase", "escribir", "pronto"]
  },
  {
    module_number: 9,
    curriculum_lesson_number: 6,
    words: ["desde", "ejemplo", "hablar"]
  },
  {
    module_number: 9,
    curriculum_lesson_number: 11,
    words: ["completa", "importante", "observa"]
  },
  {
    module_number: 9,
    curriculum_lesson_number: 16,
    words: ["\xE1rboles", "buscan", "guarda"]
  }
];

// .local/base44-working-copy/src/lib/literacy/sightWordProgression.mjs
var position = (row) => [Number(row.module_number), Number(row.curriculum_lesson_number)];
var compare = (a, b) => position(a)[0] - position(b)[0] || position(a)[1] - position(b)[1];
function sightWordIntroductions({ moduleNumber, lessonNumber }) {
  const target = { module_number: Number(moduleNumber), curriculum_lesson_number: Number(lessonNumber) };
  if (!position(target).every((n) => Number.isSafeInteger(n) && n > 0)) return [];
  const seen = /* @__PURE__ */ new Set();
  return ES_SIGHT_WORD_SEQUENCE.filter((row) => compare(row, target) <= 0).slice().sort(compare).map((row) => ({
    ...row,
    words: row.words.filter((word) => {
      const key = word.normalize("NFKC").toLocaleLowerCase("es");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  })).filter((row) => row.words.length);
}
function knownSightWordsAt(position2) {
  return sightWordIntroductions(position2).flatMap((row) => row.words);
}

// .local/base44-working-copy/src/lib/literacy/curriculumGraphemes.js
var ES_GRAPHEME_CHART = {
  // ─────────────────────────────────────────────
  // Módulo 1
  // ─────────────────────────────────────────────
  "M1.L1": ["o"],
  "M1.L2": [],
  "M1.L3": ["i"],
  "M1.L4": [],
  "M1.L5": [],
  "M1.L6": ["a", "u"],
  "M1.L7": [],
  "M1.L8": ["e"],
  "M1.L9": [],
  "M1.L10": [],
  "M1.L11": [],
  "M1.L12": [],
  "M1.L13": [],
  "M1.L14": [],
  "M1.L15": [],
  "M1.L16": ["m"],
  "M1.L17": [],
  "M1.L18": [],
  "M1.L19": [],
  "M1.L20": [],
  // ─────────────────────────────────────────────
  // Módulo 2
  // ─────────────────────────────────────────────
  "M2.L1": ["p"],
  "M2.L2": [],
  "M2.L3": [],
  "M2.L4": [],
  "M2.L5": [],
  "M2.L6": ["s"],
  "M2.L7": [],
  "M2.L8": [],
  "M2.L9": [],
  "M2.L10": [],
  "M2.L11": ["l"],
  "M2.L12": [],
  "M2.L13": [],
  "M2.L14": [],
  "M2.L15": [],
  "M2.L16": ["n"],
  "M2.L17": [],
  "M2.L18": [],
  "M2.L19": [],
  "M2.L20": [],
  // ─────────────────────────────────────────────
  // Módulo 3
  // ─────────────────────────────────────────────
  "M3.L1": ["d"],
  "M3.L2": [],
  "M3.L3": [],
  "M3.L4": [],
  "M3.L5": [],
  "M3.L6": ["t"],
  "M3.L7": [],
  "M3.L8": [],
  "M3.L9": [],
  "M3.L10": [],
  "M3.L11": ["f"],
  "M3.L12": [],
  "M3.L13": [],
  "M3.L14": [],
  "M3.L15": [],
  "M3.L16": [],
  "M3.L17": [],
  "M3.L18": [],
  "M3.L19": [],
  "M3.L20": [],
  // ─────────────────────────────────────────────
  // Módulo 4
  // ─────────────────────────────────────────────
  "M4.L1": ["b"],
  "M4.L2": [],
  "M4.L3": [],
  "M4.L4": [],
  "M4.L5": [],
  "M4.L6": ["r-inicial", "rr-medial"],
  //r inicial y rr medial
  "M4.L7": [],
  "M4.L8": [],
  "M4.L9": [],
  "M4.L10": [],
  "M4.L11": ["c-fuerte"],
  //c fuerte: ca,co,cu 
  "M4.L12": [],
  "M4.L13": [],
  "M4.L14": [],
  "M4.L15": [],
  "M4.L16": ["qu"],
  "M4.L17": [],
  "M4.L18": [],
  "M4.L19": [],
  "M4.L20": [],
  // ─────────────────────────────────────────────
  // Módulo 5
  // ─────────────────────────────────────────────
  "M5.L1": ["v"],
  "M5.L2": [],
  "M5.L3": [],
  "M5.L4": [],
  "M5.L5": [],
  "M5.L6": ["r-medial", "r-final"],
  //r medial y r final
  "M5.L7": [],
  "M5.L8": [],
  "M5.L9": [],
  "M5.L10": [],
  "M5.L11": ["ll"],
  "M5.L12": [],
  "M5.L13": [],
  "M5.L14": [],
  "M5.L15": [],
  "M5.L16": [],
  "M5.L17": [],
  "M5.L18": [],
  "M5.L19": [],
  "M5.L20": [],
  // ─────────────────────────────────────────────
  // Módulo 6
  // ─────────────────────────────────────────────
  "M6.L1": ["g-fuerte"],
  //g fuerte: ga,go,gu,gue,gui
  "M6.L2": [],
  "M6.L3": [],
  "M6.L4": [],
  "M6.L5": [],
  "M6.L6": ["y-inicial", "z"],
  //y inicial
  "M6.L7": [],
  "M6.L8": [],
  "M6.L9": [],
  "M6.L10": [],
  "M6.L11": ["h", "j"],
  "M6.L12": [],
  "M6.L13": [],
  "M6.L14": [],
  "M6.L15": [],
  "M6.L16": ["c-suave"],
  //c suave: ce, ci
  "M6.L17": [],
  "M6.L18": [],
  "M6.L19": [],
  "M6.L20": [],
  // ─────────────────────────────────────────────
  // Módulo 7
  // ─────────────────────────────────────────────
  "M7.L1": ["\xF1"],
  "M7.L2": [],
  "M7.L3": [],
  "M7.L4": [],
  "M7.L5": [],
  "M7.L6": ["g-suave"],
  //g suave: ge, gi
  "M7.L7": [],
  "M7.L8": [],
  "M7.L9": [],
  "M7.L10": [],
  "M7.L11": ["ch", "g-di\xE9resis"],
  //g fuerte: güe, güi
  "M7.L12": [],
  "M7.L13": [],
  "M7.L14": [],
  "M7.L15": [],
  "M7.L16": [],
  "M7.L17": [],
  "M7.L18": [],
  "M7.L19": [],
  "M7.L20": [],
  // ─────────────────────────────────────────────
  // Módulo 8
  // ─────────────────────────────────────────────
  "M8.L1": ["k", "x", "w"],
  "M8.L2": [],
  "M8.L3": [],
  "M8.L4": [],
  "M8.L5": [],
  "M8.L6": [],
  "M8.L7": [],
  "M8.L8": [],
  "M8.L9": [],
  "M8.L10": [],
  "M8.L11": ["tr", "br"],
  "M8.L12": [],
  "M8.L13": [],
  "M8.L14": [],
  "M8.L15": [],
  "M8.L16": ["gr", "pr"],
  "M8.L17": [],
  "M8.L18": [],
  "M8.L19": [],
  "M8.L20": [],
  // ─────────────────────────────────────────────
  // Módulo 9
  // ─────────────────────────────────────────────
  "M9.L1": ["fr", "cr", "dr"],
  "M9.L2": [],
  "M9.L3": [],
  "M9.L4": [],
  "M9.L5": [],
  "M9.L6": ["cl", "bl"],
  "M9.L7": [],
  "M9.L8": [],
  "M9.L9": [],
  "M9.L10": [],
  "M9.L11": ["pl", "fl", "gl"],
  "M9.L12": [],
  "M9.L13": [],
  "M9.L14": [],
  "M9.L15": [],
  "M9.L16": [],
  "M9.L17": [],
  "M9.L18": [],
  "M9.L19": [],
  "M9.L20": []
};
function normalizeGrapheme(value) {
  return String(value || "").trim().toLowerCase().normalize("NFC");
}
function uniqueGraphemes(items) {
  const seen = /* @__PURE__ */ new Set();
  return (items || []).filter((item) => {
    const normalized = normalizeGrapheme(item);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}
function parseCurriculumKey(key) {
  const match = /^M(\d+)\.L(\d+)$/i.exec(
    String(key || "").trim()
  );
  if (!match) {
    return null;
  }
  return {
    module_number: Number(match[1]),
    curriculum_lesson_number: Number(match[2])
  };
}
var ES_GRAPHEME_SEQUENCE = Object.entries(ES_GRAPHEME_CHART).map(([key, graphemes]) => {
  const position2 = parseCurriculumKey(key);
  if (!position2) {
    return null;
  }
  return {
    ...position2,
    graphemes: uniqueGraphemes(graphemes)
  };
}).filter(Boolean);
function compareCurriculumPositions(first, second) {
  const firstModule = Number(
    first?.module_number || 0
  );
  const secondModule = Number(
    second?.module_number || 0
  );
  if (firstModule !== secondModule) {
    return firstModule - secondModule;
  }
  return Number(
    first?.curriculum_lesson_number || 0
  ) - Number(
    second?.curriculum_lesson_number || 0
  );
}
function getIntroducedGraphemesThrough({
  moduleNumber,
  lessonNumber
}) {
  const cutoff = {
    module_number: Number(moduleNumber) || 0,
    curriculum_lesson_number: Number(lessonNumber) || 0
  };
  const introduced = ES_GRAPHEME_SEQUENCE.filter(
    (entry) => compareCurriculumPositions(
      entry,
      cutoff
    ) <= 0
  ).sort(compareCurriculumPositions).flatMap(
    (entry) => entry.graphemes || []
  );
  return uniqueGraphemes(
    introduced
  );
}

// .local/base44-working-copy/src/lib/literacy/lessonProgression.js
function normalizeSpanish(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/n\u0303/g, "\xF1").replace(/u\u0308/g, "\xFC").replace(/[\u0300-\u036f]/g, "");
}
function uniqueNormalized(items) {
  const seen = /* @__PURE__ */ new Set();
  return (items || []).filter((item) => {
    const key = normalizeSpanish(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
function canDecodeWord(word, graphemes) {
  const normalizedWord = normalizeSpanish(word).replace(
    /[^a-zñü]/g,
    ""
  );
  if (!normalizedWord) {
    return false;
  }
  const introduced = new Set(
    uniqueNormalized(graphemes).map(normalizeSpanish).filter(Boolean)
  );
  if (!introduced.size) {
    return false;
  }
  const has = (token) => introduced.has(
    normalizeSpanish(token)
  );
  const requiredLiteralPatterns = [
    "ch",
    "ll",
    "qu",
    "tr",
    "br",
    "gr",
    "pr",
    "fr",
    "cr",
    "dr",
    "cl",
    "bl",
    "pl",
    "fl",
    "gl"
  ];
  for (const pattern of requiredLiteralPatterns) {
    if (normalizedWord.includes(
      pattern
    ) && !has(pattern)) {
      return false;
    }
  }
  for (let index = 0; index < normalizedWord.length; index += 1) {
    if (normalizedWord[index] !== "c") {
      continue;
    }
    const following = normalizedWord[index + 1] || "";
    if (following === "h") {
      continue;
    }
    if (following === "e" || following === "i") {
      if (!has("c-suave")) {
        return false;
      }
    } else if (!has("c-fuerte")) {
      return false;
    }
  }
  for (let index = 0; index < normalizedWord.length; index += 1) {
    if (normalizedWord[index] !== "g") {
      continue;
    }
    const nextTwo = normalizedWord.slice(
      index,
      index + 3
    );
    const following = normalizedWord[index + 1] || "";
    if (nextTwo === "g\xFCe" || nextTwo === "g\xFCi") {
      if (!has("g-di\xE9resis")) {
        return false;
      }
      continue;
    }
    if (nextTwo === "gue" || nextTwo === "gui") {
      if (!has("g-fuerte")) {
        return false;
      }
      continue;
    }
    if (following === "e" || following === "i") {
      if (!has("g-suave")) {
        return false;
      }
    } else if (!has("g-fuerte")) {
      return false;
    }
  }
  for (let index = 0; index < normalizedWord.length; index += 1) {
    if (normalizedWord[index] !== "r") {
      continue;
    }
    const isDouble = normalizedWord[index + 1] === "r";
    if (isDouble) {
      if (!has("rr-medial")) {
        return false;
      }
      index += 1;
      continue;
    }
    if (index === 0) {
      if (!has("r-inicial")) {
        return false;
      }
      continue;
    }
    if (index === normalizedWord.length - 1) {
      if (!has("r-final")) {
        return false;
      }
      continue;
    }
    if (!has("r-medial")) {
      return false;
    }
  }
  if (normalizedWord.startsWith("y") && !has("y-inicial")) {
    return false;
  }
  const contextualIds = /* @__PURE__ */ new Set([
    "r-inicial",
    "rr-medial",
    "r-medial",
    "r-final",
    "c-fuerte",
    "c-suave",
    "g-fuerte",
    "g-suave",
    "g-dieresis",
    "y-inicial"
  ]);
  const allowed = [];
  introduced.forEach((item) => {
    if (!contextualIds.has(item)) {
      allowed.push(item);
      return;
    }
    switch (item) {
      case "r-inicial":
      case "r-medial":
      case "r-final":
        allowed.push("r");
        break;
      case "rr-medial":
        allowed.push("rr");
        break;
      case "c-fuerte":
      case "c-suave":
        allowed.push("c");
        break;
      case "g-fuerte":
      case "g-suave":
        allowed.push("g");
        break;
      case "g-dieresis":
        allowed.push("g\xFC");
        break;
      case "y-inicial":
        allowed.push("y");
        break;
      default:
        break;
    }
  });
  const decodingUnits = uniqueNormalized(allowed).map(normalizeSpanish).filter(Boolean).sort(
    (first, second) => second.length - first.length
  );
  if (!decodingUnits.length) {
    return false;
  }
  const memo = /* @__PURE__ */ new Map();
  const canFinish = (index) => {
    if (index === normalizedWord.length) {
      return true;
    }
    if (memo.has(index)) {
      return memo.get(index);
    }
    const works = decodingUnits.some(
      (unit) => normalizedWord.startsWith(
        unit,
        index
      ) && canFinish(
        index + unit.length
      )
    );
    memo.set(index, works);
    return works;
  };
  return canFinish(0);
}

// .local/base44-working-copy/src/lib/lettersort/phonics.js
var ONSET_PAIRS = ["pl", "pr", "bl", "br", "tr", "dr", "cl", "cr", "gl", "gr", "fl", "fr", "ch", "ll", "rr"];
function syllabifyEs(wordRaw) {
  const word = (wordRaw || "").toLowerCase();
  const isV = (ch) => /[aeiouáéíóúü]/.test((ch || "")[0] || "");
  const isWeakUnaccented = (ch) => /^(i|u|ü)$/.test((ch || "")[0] || "");
  const isAccWeak = (ch) => /[íú]/.test((ch || "")[0] || "");
  const chars = [];
  for (let i2 = 0; i2 < word.length; i2++) {
    const two = word.slice(i2, i2 + 2);
    if (["ch", "ll", "rr"].includes(two)) {
      chars.push(two);
      i2++;
      continue;
    }
    if (word[i2] === "q" && word[i2 + 1] === "u" && /[eiéí]/.test(word[i2 + 2] || "")) {
      chars.push("qu");
      i2++;
      continue;
    }
    if (word[i2] === "g" && word[i2 + 1] === "u" && /[eiéí]/.test(word[i2 + 2] || "") && word[i2 + 1] !== "\xFC") {
      chars.push("gu");
      i2++;
      continue;
    }
    chars.push(word[i2]);
  }
  const syl = [];
  let i = 0;
  while (i < chars.length) {
    let onset = [];
    while (i < chars.length && !isV(chars[i])) onset.push(chars[i++]);
    if (i >= chars.length) {
      if (syl.length) syl[syl.length - 1] += onset.join("");
      else syl.push(onset.join(""));
      break;
    }
    let nuc = [chars[i++]];
    for (let k = 0; k < 2 && i < chars.length && isV(chars[i]); k++) {
      const prev = nuc[nuc.length - 1], next = chars[i];
      const canJoin = isWeakUnaccented(prev) && !isAccWeak(prev) && !isAccWeak(next) || isWeakUnaccented(next) && !isAccWeak(next) && !isAccWeak(prev) || isWeakUnaccented(prev) && isWeakUnaccented(next);
      if (canJoin) {
        nuc.push(next);
        i++;
      } else break;
    }
    let after = [];
    while (i < chars.length && !isV(chars[i])) after.push(chars[i++]);
    let coda = [], nextOnset = after.slice();
    if (nextOnset.length) {
      let m = 0;
      while (nextOnset.length - m >= 2) {
        const a = nextOnset[m], b = nextOnset[m + 1];
        const pair = (a + b).replace(/[^a-zñ]/g, "");
        if (ONSET_PAIRS.includes(pair)) break;
        m++;
      }
      coda = nextOnset.slice(0, m);
      nextOnset = nextOnset.slice(m);
      while (nextOnset.length > 2) coda.push(nextOnset.shift());
    }
    syl.push(onset.join("") + nuc.join("") + coda.join(""));
    if (nextOnset.length) i -= nextOnset.length;
  }
  return syl.filter(Boolean).map((s) => s.trim());
}

// .local/base44-working-copy/src/lib/literacy/dailyFluency.mjs
var PRACTICE_DAYS = [
  ["monday", "Lunes"],
  ["tuesday", "Martes"],
  ["wednesday", "Mi\xE9rcoles"],
  ["thursday", "Jueves"],
  ["friday", "Viernes"]
].map(([day, label]) => ({ day, label }));

// .local/base44-working-copy/base44/shared/bookMetadata.mjs
function bookLessonTags(book) {
  const values = Array.isArray(book?.lessons) && book.lessons.length ? book.lessons : book?.lesson ? [book.lesson] : [];
  return [...new Set(values.filter((v) => /^L(?:[1-9]|1\d|20)$/.test(v)))].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}
function enrichBookCatalog(catalog, assignments) {
  return catalog.map((book) => {
    const matches = assignments.filter((a) => a.catalog_book_id === book.id);
    const source = matches.find((a) => a.id === book.source_assignment_id);
    const candidates = source ? [source] : matches;
    const result = { ...book };
    for (const field of ["subject", "module"]) {
      const values = [...new Set(candidates.map((a) => a[field]).filter(Boolean))];
      if (result[field] == null && values.length === 1) result[field] = values[0];
    }
    if (!Array.isArray(book.lessons) && !book.lesson) {
      const tagSets = [...new Set(candidates.map((a) => JSON.stringify(bookLessonTags(a))).filter((v) => v !== "[]"))];
      if (tagSets.length === 1) result.lessons = JSON.parse(tagSets[0]);
    }
    return result;
  });
}

// .local/base44-working-copy/src/lib/literacy/vocabularyReview.mjs
var normalizeVocabulary = (text) => String(text || "").normalize("NFC").trim().toLocaleLowerCase("es");
var vocabularyKey = (kind, text) => `${kind}:${normalizeVocabulary(text)}`;
var validText = (text) => /^[a-záéíóúüñ]+$/iu.test(text);
function reviewDecisions(rows = []) {
  const latest = /* @__PURE__ */ new Map();
  for (const row of [...rows].sort((a, b) => String(b.updated_date || b.created_date || "").localeCompare(String(a.updated_date || a.created_date || "")) || String(b.id || "").localeCompare(String(a.id || "")))) {
    const key = vocabularyKey(row.kind, row.text);
    if (!latest.has(key)) latest.set(key, row);
  }
  return latest;
}
function wordModel(entry, decisions) {
  const original = normalizeVocabulary(entry.word);
  const rule = decisions.get(vocabularyKey("word", original));
  const corrected = rule?.status !== "pending" && !!rule?.replacement;
  const word = corrected ? normalizeVocabulary(rule.replacement) : original;
  const syllables = rule?.status !== "pending" && rule?.syllables?.length ? rule.syllables.map(normalizeVocabulary) : corrected ? syllabifyEs(word) : (entry.syllables || syllabifyEs(word)).map(normalizeVocabulary);
  return { original, word, syllables, rule };
}
function applyVocabularyReviews(indexes, rows = []) {
  const decisions = reviewDecisions(rows);
  const strict = decisions.get(vocabularyKey("settings", "bank"))?.approved_only === true;
  return indexes.map((index) => ({ ...index, entries: (index.entries || []).flatMap((entry) => {
    const { word, syllables, rule } = wordModel(entry, decisions);
    if (!validText(word) || rule?.status === "excluded" || decisions.get(vocabularyKey("word", word))?.status === "excluded") return [];
    const approved = rule?.status === "approved";
    return [{
      ...entry,
      word,
      wordAllowed: !strict || approved,
      syllables: syllables.flatMap((syllable) => {
        const review = decisions.get(vocabularyKey("syllable", syllable));
        if (review?.status === "excluded") return [];
        const text = review?.status === "approved" && review.replacement ? normalizeVocabulary(review.replacement) : syllable;
        if (!validText(text) || decisions.get(vocabularyKey("syllable", text))?.status === "excluded") return [];
        return !strict || approved || review?.status === "approved" ? [text] : [];
      })
    }];
  }) }));
}

// .local/base44-working-copy/src/lib/literacy/pathwayCurriculum.mjs
function pathwayPosition(number, dayIndex) {
  const n = Number(number);
  if (n < 1 || n > 36 || !Number.isInteger(n) || dayIndex < 0 || dayIndex > 4) return null;
  return { moduleNumber: Math.floor((n - 1) / 4) + 1, lessonNumber: (n - 1) % 4 * 5 + dayIndex + 1 };
}
var hasIntroducedConsonant = (position2) => getIntroducedGraphemesThrough(position2).some((g) => /[bcdfghjklmnñpqrstvwxyz]/i.test(g.split("-")[0]));
function decodableBookPool(indexes, position2, { books = [], kind = "words", limit = 80, reviews = [] } = {}) {
  const graphemes = getIntroducedGraphemesThrough(position2);
  const hfw = new Set(knownSightWordsAt({ moduleNumber: 9, lessonNumber: 20 }).map(normalizeSpanish));
  const byId = new Map(books.map((b) => [b.id, b]));
  const selected = [];
  for (const row of applyVocabularyReviews(indexes, reviews)) {
    const book = byId.get(row.book_id);
    if (!book || book.language && !["es", "bilingual"].includes(book.language)) continue;
    let priority = 0;
    if (book.subject === "df") {
      const moduleNumber = Number((book.module || "").slice(1));
      const tags = bookLessonTags(book);
      if (!moduleNumber || !tags.length || moduleNumber > position2.moduleNumber || moduleNumber === position2.moduleNumber && Number(tags[0].slice(1)) > position2.lessonNumber) continue;
      priority = 1e3 + moduleNumber * 20 + Number(tags[0].slice(1));
    }
    for (const entry of row.entries || []) {
      if (kind !== "syllables" && entry.wordAllowed === false) continue;
      if (hfw.has(normalizeSpanish(entry.word))) continue;
      const candidates = kind === "syllables" ? entry.syllables || [] : [entry.word];
      for (const text of candidates) {
        if (text && canDecodeWord(text, graphemes)) selected.push({ text, priority });
      }
    }
  }
  selected.sort((a, b) => b.priority - a.priority);
  return [...new Set(selected.map((v) => v.text))].slice(0, limit);
}
export {
  canDecodeWord,
  decodableBookPool,
  enrichBookCatalog,
  getIntroducedGraphemesThrough,
  hasIntroducedConsonant,
  knownSightWordsAt,
  pathwayPosition,
  syllabifyEs
};
