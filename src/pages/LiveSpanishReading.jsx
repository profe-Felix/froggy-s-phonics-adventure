import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import {
  SYLLABLE_TYPES,
  CONSONANT_OPTIONS,
  generateBlendingItems,
  generateLetterHuntItems,
} from '@/lib/liveSpanishReadingItems';
import { ArrowLeft, ChevronLeft, ChevronRight, X, BookOpen, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const SUPABASE_LISTS_URL =
  'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/slidetoread/lists.json';

const COLOR_LABELS = {
  red: 'Red', orange: 'Orange', yellow: 'Yellow',
  green: 'Green', blue: 'Blue', purple: 'Purple',
};

// Collect every sentence across all modules of a section (Oraciones).
function collectSentences(listsData, sectionKey) {
  const section = listsData?.[sectionKey] || {};
  return Object.keys(section)
    .filter((k) => /^M\d+$/i.test(k))
    .sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')))
    .flatMap((k) => section[k]?.new || []);
}

export default function LiveSpanishReading() {
  const urlParams = new URLSearchParams(window.location.search);
  const teacher = urlParams.get('teacher') || 'Felix';
  const block = urlParams.get('block') || 'A';
  const group = urlParams.get('group') || 'red';

  const [wordBank, setWordBank] = useState([]);
  const [sentences, setSentences] = useState([]);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Setup config
  const [mode, setMode] = useState('blending');
  const [syllableTypes, setSyllableTypes] = useState(['CV']);
  const [consonants, setConsonants] = useState(['m', 's', 'l']);
  const [targetLetter, setTargetLetter] = useState('m');
  const [huntSource, setHuntSource] = useState('words'); // 'words' | 'sentences' | 'both'
  const [huntCount, setHuntCount] = useState(12);
  const [generating, setGenerating] = useState(false);

  // Load WordBank + sentences once.
  useEffect(() => {
    (async () => {
      try {
        const [wb, lists] = await Promise.all([
          base44.entities.WordBank.list('-updated_date', 2000),
          fetch(SUPABASE_LISTS_URL).then((r) => r.json()).catch(() => ({})),
        ]);
        setWordBank((wb || []).filter((w) => w.active !== false));
        setSentences(collectSentences(lists, 'Oraciones'));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Resume an existing active session for this group.
  const resume = useCallback(async () => {
    try {
      const active = await base44.entities.LiveSpanishReadingSession.filter({
        teacher_name: teacher,
        block,
        color_group: group,
        status: 'active',
        school_year: ACTIVE_SCHOOL_YEAR,
      });
      if (active && active.length > 0) {
        const s = active[0];
        setSession(s);
        setMode(s.mode || 'blending');
        if (s.config) {
          if (s.config.syllable_types) setSyllableTypes(s.config.syllable_types);
          if (s.config.consonants) setConsonants(s.config.consonants);
          if (s.config.target_letter) setTargetLetter(s.config.target_letter);
          if (s.config.hunt_source) setHuntSource(s.config.hunt_source);
        }
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [teacher, block, group]);

  useEffect(() => {
    resume();
  }, [resume]);

  // Realtime: keep the session in sync (in case another tab advances it).
  useEffect(() => {
    if (!session) return;
    const unsub = base44.entities.LiveSpanishReadingSession.subscribe((event) => {
      if (event.type === 'delete') { setSession(null); return; }
      if (event.data?.id === session.id) setSession(event.data);
    });
    return unsub;
  }, [session?.id]);

  const toggleArr = (arr, setArr, val) => {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      let items = [];
      let config = {};
      if (mode === 'blending') {
        if (!syllableTypes.length || !consonants.length) {
          alert('Pick at least one syllable type and one consonant.');
          return;
        }
        const generated = generateBlendingItems({ syllableTypes, consonants });
        if (!generated.length) {
          alert('No items for those consonants. Try adding more consonants or a different syllable type.');
          return;
        }
        items = generated.map((g) => g.text);
        config = { syllable_types: syllableTypes, consonants };
      } else {
        if (!targetLetter) {
          alert('Pick a target letter to hunt.');
          return;
        }
        const pools = {
          words: { words: wordBank, sentences: [] },
          sentences: { words: [], sentences },
          both: { words: wordBank, sentences },
        };
        const generated = generateLetterHuntItems({
          targetLetter,
          ...pools[huntSource],
          count: huntCount,
        });
        if (!generated.length) {
          alert('No words/sentences contain that letter. Try another letter or source.');
          return;
        }
        items = generated.map((g) => g.text);
        config = { target_letter: targetLetter, hunt_source: huntSource };
      }

      // End any existing active session for this group first.
      if (session) {
        await base44.entities.LiveSpanishReadingSession.update(session.id, {
          status: 'completed',
          ended_at: new Date().toISOString(),
        });
      }

      const created = await base44.entities.LiveSpanishReadingSession.create({
        teacher_name: teacher,
        block,
        color_group: group,
        school_year: ACTIVE_SCHOOL_YEAR,
        status: 'active',
        mode,
        config,
        items,
        current_index: 0,
        started_at: new Date().toISOString(),
      });
      setSession(created);
    } finally {
      setGenerating(false);
    }
  };

  const advance = async (dir) => {
    if (!session) return;
    const next = Math.max(0, Math.min((session.items || []).length - 1, (session.current_index || 0) + dir));
    if (next === (session.current_index || 0)) return;
    const updated = await base44.entities.LiveSpanishReadingSession.update(session.id, { current_index: next });
    setSession(updated);
  };

  const jumpTo = async (idx) => {
    if (!session) return;
    const updated = await base44.entities.LiveSpanishReadingSession.update(session.id, { current_index: idx });
    setSession(updated);
  };

  const handleEnd = async () => {
    if (!session) return;
    if (!confirm('End this live reading session? Students will be freed back to their normal login.')) return;
    const updated = await base44.entities.LiveSpanishReadingSession.update(session.id, {
      status: 'completed',
      ended_at: new Date().toISOString(),
    });
    setSession(null);
  };

  const groupLabel = COLOR_LABELS[group] || group;

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Live control screen ──
  if (session) {
    const items = session.items || [];
    const idx = session.current_index || 0;
    const current = items[idx];
    const cfg = session.config || {};

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <header className="bg-slate-800 px-4 py-3 flex items-center gap-3">
          <Link to="/SmallGroupManager" className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-white font-bold text-sm sm:text-base">
            Live Reading · {teacher} · Block {block} · {groupLabel}
          </h1>
          <span className="text-xs text-slate-400 hidden sm:inline">
            {session.mode === 'blending' ? 'Blending practice' : 'Letter hunt'}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleEnd}
            className="text-sm font-medium text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10"
          >
            End Session
          </button>
        </header>

        {/* Current item — big, mirrors what students see */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
          {session.mode === 'letter_hunt' && cfg.target_letter && (
            <div className="mb-4 px-4 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-500 text-indigo-300 text-sm font-bold">
              Hunt the letter: <span className="text-white text-lg">{cfg.target_letter}</span>
            </div>
          )}
          <div
            key={idx}
            className="text-white font-black text-center leading-none assessment-fade-in"
            style={{ fontSize: 'clamp(60px, 18vw, 180px)' }}
          >
            {current || '—'}
          </div>
          <p className="text-slate-400 mt-6 text-sm">
            Item {idx + 1} of {items.length}
          </p>
        </div>

        {/* Advance controls */}
        <div className="bg-slate-800 px-4 py-5">
          <div className="max-w-2xl mx-auto flex items-center justify-center gap-6">
            <button
              onClick={() => advance(-1)}
              disabled={idx === 0}
              className="flex flex-col items-center gap-1 text-slate-300 hover:text-white disabled:opacity-30 transition-colors"
            >
              <div className="w-16 h-16 rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center">
                <ChevronLeft className="w-8 h-8" />
              </div>
              <span className="text-sm font-medium">Back</span>
            </button>
            <button
              onClick={() => advance(1)}
              disabled={idx >= items.length - 1}
              className="flex flex-col items-center gap-1 text-green-400 hover:text-green-300 disabled:opacity-30 transition-colors"
            >
              <div className="w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center">
                <ChevronRight className="w-10 h-10" />
              </div>
              <span className="text-sm font-bold">Next</span>
            </button>
          </div>

          {/* Item strip */}
          <div className="max-w-3xl mx-auto mt-5 flex gap-2 overflow-x-auto pb-2">
            {items.map((it, i) => (
              <button
                key={i}
                onClick={() => jumpTo(i)}
                className={cn(
                  'shrink-0 px-3 py-2 rounded-lg text-sm font-bold border-2 transition-colors whitespace-nowrap',
                  i === idx
                    ? 'bg-indigo-500 text-white border-indigo-500'
                    : i < idx
                    ? 'bg-slate-700 text-slate-300 border-slate-600'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
                )}
              >
                {it}
              </button>
            ))}
          </div>

          <div className="max-w-2xl mx-auto mt-4 bg-slate-700/50 rounded-lg px-4 py-2 text-xs text-slate-400 text-center">
            Student iPad link:{' '}
            <code className="bg-slate-900 px-1.5 py-0.5 rounded text-slate-300">
              /LiveSpanishReadingStudent?class={teacher}&number=2
            </code>
          </div>
        </div>
      </div>
    );
  }

  // ── Setup screen ──
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/SmallGroupManager" className="text-slate-400 hover:text-slate-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold text-slate-800">Live Spanish Reading</h1>
          <span className="text-sm text-slate-500">
            {teacher} · Block {block} · {groupLabel}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Mode picker */}
        <div>
          <p className="text-sm font-bold text-slate-700 mb-2">Practice mode</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode('blending')}
              className={cn(
                'p-4 rounded-xl border-2 text-left transition-colors',
                mode === 'blending'
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <BookOpen className="w-5 h-5 text-indigo-500 mb-1" />
              <p className="font-bold text-slate-800 text-sm">Blending</p>
              <p className="text-xs text-slate-500">Slide to read syllables & words together</p>
            </button>
            <button
              onClick={() => setMode('letter_hunt')}
              className={cn(
                'p-4 rounded-xl border-2 text-left transition-colors',
                mode === 'letter_hunt'
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <Search className="w-5 h-5 text-indigo-500 mb-1" />
              <p className="font-bold text-slate-800 text-sm">Letter Hunt</p>
              <p className="text-xs text-slate-500">Find a target letter in words</p>
            </button>
          </div>
        </div>

        {mode === 'blending' ? (
          <>
            {/* Syllable types */}
            <div>
              <p className="text-sm font-bold text-slate-700 mb-2">Syllable types</p>
              <div className="flex flex-wrap gap-2">
                {SYLLABLE_TYPES.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => toggleArr(syllableTypes, setSyllableTypes, st.id)}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm font-bold border-2 transition-colors',
                      syllableTypes.includes(st.id)
                        ? 'bg-indigo-500 text-white border-indigo-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    )}
                  >
                    {st.label}
                    <span className="block text-[10px] font-normal opacity-70">{st.sample}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Consonants */}
            <div>
              <p className="text-sm font-bold text-slate-700 mb-2">
                Consonants <span className="text-slate-400 font-normal">(pick the ones to focus on)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {CONSONANT_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => toggleArr(consonants, setConsonants, c)}
                    className={cn(
                      'w-11 h-11 rounded-lg text-lg font-bold border-2 transition-colors',
                      consonants.includes(c)
                        ? 'bg-indigo-500 text-white border-indigo-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Target letter */}
            <div>
              <p className="text-sm font-bold text-slate-700 mb-2">Target letter to hunt</p>
              <div className="flex flex-wrap gap-2">
                {CONSONANT_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setTargetLetter(c)}
                    className={cn(
                      'w-11 h-11 rounded-lg text-lg font-bold border-2 transition-colors',
                      targetLetter === c
                        ? 'bg-indigo-500 text-white border-indigo-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Source */}
            <div>
              <p className="text-sm font-bold text-slate-700 mb-2">Pick from</p>
              <div className="flex gap-2">
                {[
                  { id: 'words', label: 'Words' },
                  { id: 'sentences', label: 'Sentences' },
                  { id: 'both', label: 'Both' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setHuntSource(s.id)}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-bold border-2 transition-colors',
                      huntSource === s.id
                        ? 'bg-indigo-500 text-white border-indigo-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Count */}
            <div>
              <p className="text-sm font-bold text-slate-700 mb-2">Number of items: {huntCount}</p>
              <input
                type="range"
                min={4}
                max={24}
                value={huntCount}
                onChange={(e) => setHuntCount(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </>
        )}

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-base shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {generating ? 'Starting…' : 'Start live session'}
        </button>

        <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-4 text-sm text-indigo-800">
          <p className="font-bold mb-1">How it works</p>
          <p className="text-xs text-indigo-600">
            All students in the {groupLabel} group see the same item at the same time.
            Each student practices on their own iPad with an individual slider (blending)
            or taps letters (hunt). You control when the whole group moves to the next item.
          </p>
        </div>
      </main>
    </div>
  );
}