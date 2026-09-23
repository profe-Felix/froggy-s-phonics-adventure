import {
  useEffect,
  useState,
} from 'react';

import {
  useClassColors,
  CLASS_COLOR_PALETTE,
} from '@/hooks/useClassColors';

import {
  useClassNames,
} from '@/hooks/useClassNames';

import {
  Trash2,
  Plus,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Wand2,
} from 'lucide-react';

import {
  SPELLING_WORDS,
} from '@/components/data/spellingWords';

import {
  syllabifyEs,
} from '@/lib/spanishSyllables';

import {
  getIntroducedGraphemesThrough,
} from '@/lib/literacy/curriculumGraphemes';

import {
  canDecodeWord,
} from '@/lib/literacy/lessonProgression';

import {
  getDefaultVoice,
} from '@/lib/activities/ttsVoices';

const GRADES = [
  { key: 'kinder', label: 'Kinder' },
  { key: 'first', label: '1st Grade' },
];
const LANGS = [
  { key: 'es', label: 'Spanish' },
  { key: 'en', label: 'English' },
];

const FIRST_CURRICULUM_POSITION = 0;
const LAST_CURRICULUM_POSITION =
  9 * 20 - 1;

function curriculumPositionToIndex(
  moduleNumber,
  lessonNumber
) {
  const safeModule =
    Math.min(
      9,
      Math.max(
        1,
        Number(moduleNumber) || 1
      )
    );

  const safeLesson =
    Math.min(
      20,
      Math.max(
        1,
        Number(lessonNumber) || 1
      )
    );

  return (
    (safeModule - 1) * 20 +
    (safeLesson - 1)
  );
}

function curriculumIndexToPosition(index) {
  const safeIndex =
    Math.min(
      LAST_CURRICULUM_POSITION,
      Math.max(
        FIRST_CURRICULUM_POSITION,
        Number(index) || 0
      )
    );

  return {
    module:
      Math.floor(safeIndex / 20) + 1,

    lesson:
      safeIndex % 20 + 1,
  };
}

function getReleasedSyllables(
  moduleNumber,
  lessonNumber
) {
  const graphemes =
    getIntroducedGraphemesThrough({
      moduleNumber,
      lessonNumber,
    });

  const seen = new Set();

  return SPELLING_WORDS
    .flatMap((word) =>
      syllabifyEs(word)
    )
    .map((syllable) =>
      String(syllable || '')
        .trim()
        .toLowerCase()
    )
    .filter(
      (syllable) =>
        syllable.length >= 2 &&
        syllable.length <= 5 &&
        /^[a-zñü]+$/.test(
          syllable
        )
    )
    .filter((syllable) =>
      canDecodeWord(
        syllable,
        graphemes
      )
    )
    .filter((syllable) => {
      if (seen.has(syllable)) {
        return false;
      }

      seen.add(syllable);
      return true;
    })
    .sort((first, second) =>
      first.localeCompare(
        second,
        'es'
      )
    );
}

// Teacher UI to add/remove/edit classes (teacher last names) and their color,
// grade, and language — so new teachers appear in every dashboard without a
// code change. Replaces the old hardcoded CLASS_NAMES arrays.
export default function ClassManager() {
  const { colorFor, languageFor, gradeFor, tracingOnlyFor, setColor, configs } = useClassColors();
  const { classList, addClass, removeClass } = useClassNames();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await addClass(name, { color: 'emerald', grade: 'kinder', language: 'es' });
      setNewName('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Classes</h2>
        <span className="text-xs text-slate-400 font-bold">{classList.length} classes</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Add a teacher's class here and it shows up in every dashboard automatically. Set color, grade, and language per class.
      </p>

      <div className="flex flex-col divide-y divide-slate-100">
        {classList.map((cls) => {
          const color = colorFor(cls);
          const lang = languageFor(cls);
          const grade = gradeFor(cls);
          const cfg = configs.find((c) => c.class_name === cls);
          return (
            <div key={cls} className="py-2.5 flex items-center gap-2 flex-wrap">
              <span
                className="w-5 h-5 rounded-full ring-2 ring-white shadow-sm shrink-0"
                style={{ backgroundImage: `linear-gradient(to bottom right, ${color.from}, ${color.to})` }}
              />
              <span className="font-bold text-slate-800 text-sm w-24 shrink-0">{cls}</span>
              <select
                value={cfg?.color || 'emerald'}
                onChange={(e) => setColor(cls, e.target.value)}
                className="px-2 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600"
              >
                {Object.entries(CLASS_COLOR_PALETTE).map(([k, p]) => (
                  <option key={k} value={k}>{p.name}</option>
                ))}
              </select>
              <select
                value={grade}
                onChange={async (e) => {
                  const g = e.target.value;
                  if (cfg) await base44Update(cfg.id, { grade: g });
                }}
                className="px-2 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600"
              >
                {GRADES.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
              <select
                value={lang}
                onChange={async (e) => {
                  const l = e.target.value;
                  if (cfg) await base44Update(cfg.id, { language: l });
                }}
                className="px-2 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-600"
              >
                {LANGS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
              </select>
              <label className="flex items-center gap-1 text-xs font-bold text-slate-500" title="Tracing-only: skip the level path, land on Games with only Letter Tracing (no sound)">
                <input
                  type="checkbox"
                  checked={tracingOnlyFor(cls)}
                  onChange={async (e) => { if (cfg) await base44Update(cfg.id, { tracing_only: e.target.checked }); }}
                  className="w-4 h-4 rounded"
                />
                Tracing only
              </label>

              {lang === 'es' && cfg && (
                <CurriculumPositionControl
                  config={cfg}
                />
              )}

              <button
                onClick={() => { if (window.confirm(`Remove class "${cls}"? Students are NOT deleted — only the class config.`)) removeClass(cls); }}
                className="ml-auto p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                title="Remove class"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="New class name…"
          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newName.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
        >
          {adding ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          Add
        </button>
      </div>
    </div>
  );
}

function CurriculumPositionControl({
  config,
}) {
  const savedModule =
    Math.min(
      9,
      Math.max(
        1,
        Number(
          config?.active_spanish_module
        ) || 1
      )
    );

  const savedLesson =
    Math.min(
      20,
      Math.max(
        1,
        Number(
          config?.active_spanish_lesson
        ) || 1
      )
    );

  const [draftPosition, setDraftPosition] =
    useState({
      module: savedModule,
      lesson: savedLesson,
    });

  const [activePosition, setActivePosition] =
    useState({
      module: savedModule,
      lesson: savedLesson,
    });

  const [saving, setSaving] =
    useState(false);

  const [
    generatingAudio,
    setGeneratingAudio,
  ] = useState(false);

  const [
    audioProgress,
    setAudioProgress,
  ] = useState(null);

  const [
    audioResult,
    setAudioResult,
  ] = useState('');

  useEffect(() => {
    const nextPosition = {
      module: savedModule,
      lesson: savedLesson,
    };

    setDraftPosition(
      nextPosition
    );

    setActivePosition(
      nextPosition
    );
  }, [
    savedModule,
    savedLesson,
  ]);

  const draftIndex =
    curriculumPositionToIndex(
      draftPosition.module,
      draftPosition.lesson
    );

  const activeIndex =
    curriculumPositionToIndex(
      activePosition.module,
      activePosition.lesson
    );

  const hasChanges =
    draftIndex !== activeIndex;

  const move = (amount) => {
    const nextIndex =
      Math.min(
        LAST_CURRICULUM_POSITION,
        Math.max(
          FIRST_CURRICULUM_POSITION,
          draftIndex + amount
        )
      );

    setDraftPosition(
      curriculumIndexToPosition(
        nextIndex
      )
    );
  };

  const save = async () => {
    if (
      !config?.id ||
      !hasChanges
    ) {
      return;
    }

    setSaving(true);

    try {
      await base44Update(
        config.id,
        {
          active_spanish_module:
            draftPosition.module,

          active_spanish_lesson:
            draftPosition.lesson,
        }
      );

      setActivePosition({
        ...draftPosition,
      });

      setAudioResult('');
    } finally {
      setSaving(false);
    }
  };

  const generateSyllableAudio =
    async () => {
      if (generatingAudio) {
        return;
      }

      const syllables =
        getReleasedSyllables(
          activePosition.module,
          activePosition.lesson
        );

      if (!syllables.length) {
        setAudioResult(
          'No syllables available'
        );

        return;
      }

      // Generate the reusable instruction only once,
      // followed by every currently released syllable.
      const audioTexts = [
        'Construye la sílaba',
        ...syllables,
      ];

      setGeneratingAudio(true);
      setAudioResult('');

      let successful = 0;

      try {
        const voice =
          await getDefaultVoice();

        for (
          let index = 0;
          index < audioTexts.length;
          index += 1
        ) {
          const text =
            audioTexts[index];

          setAudioProgress({
            current: index + 1,
            total:
              audioTexts.length,
            text,
          });

          try {
            const response =
              await base44.functions.invoke(
                'generateTts',
                {
                  text,
                  lang: 'es',
                  voice:
                    voice ||
                    undefined,
                }
              );

            if (
              response?.data?.url
            ) {
              successful += 1;
            }
          } catch {
            // Continue generating the remaining clips.
          }
        }

        setAudioResult(
          `${successful}/${audioTexts.length} audio clips ready`
        );
      } finally {
        setGeneratingAudio(false);
        setAudioProgress(null);
      }
    };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-2 py-1.5">
      <span className="text-[10px] font-black uppercase tracking-wide text-indigo-500">
        Active M{activePosition.module}.L{activePosition.lesson}
      </span>

      <button
        type="button"
        onClick={() => move(-1)}
        disabled={
          draftIndex ===
          FIRST_CURRICULUM_POSITION
        }
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-30"
        title="Previous curriculum lesson"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <span className="min-w-[62px] text-center text-sm font-black text-slate-800">
        M{draftPosition.module}.L{draftPosition.lesson}
      </span>

      <button
        type="button"
        onClick={() => move(1)}
        disabled={
          draftIndex ===
          LAST_CURRICULUM_POSITION
        }
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-30"
        title="Next curriculum lesson"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={save}
        disabled={
          saving ||
          !hasChanges
        }
        className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {saving
          ? 'Saving…'
          : 'Set Active'}
      </button>

      <button
        type="button"
        onClick={
          generateSyllableAudio
        }
        disabled={
          generatingAudio ||
          hasChanges
        }
        className="flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-2.5 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
        title={
          hasChanges
            ? 'Click Set Active before generating audio'
            : 'Prepare all released syllable audio'
        }
      >
        {generatingAudio ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Wand2 className="h-3.5 w-3.5" />
        )}

        {generatingAudio
          ? `${audioProgress?.current || 0}/${audioProgress?.total || 0}`
          : 'Prepare audio'}
      </button>

      {audioResult && (
        <span className="text-[10px] font-bold text-green-700">
          {audioResult}
        </span>
      )}
    </div>
  );
}

// Helper to update a ClassConfig record (avoids importing base44 at top of this
// presentational file repeatedly).
import { base44 } from '@/api/base44Client';

async function base44Update(
  id,
  data
) {
  await base44.entities.ClassConfig.update(
    id,
    data
  );
}