import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { useClassConfigs } from '@/hooks/useClassConfigs';
import { Trash2, Users, Star, Trophy, ArrowRight, Gamepad2, BookOpen, Activity, SpellCheck, Type, PenLine, Eye, Layers, Search, Fingerprint, BookMarked, Baby, Layers2, FlaskConical, Volume2 } from 'lucide-react';

// ─── Literacy game modes (mirrors the student-facing ModeSelection) ───────────
const LITERACY_MODES = [
  { id: 'letter_sounds', label: 'Letter Sounds', icon: '🔊', color: 'blue' },
  { id: 'letter_tracing', label: 'Letter Tracing', icon: '✏️', color: 'violet' },
  { id: 'sight_words_easy', label: 'Sight Words', icon: '👀', color: 'green' },
  { id: 'sight_words_spelling', label: 'Spell Sight Words', icon: '✍️', color: 'purple' },
  { id: 'case_matching', label: 'Upper & Lowercase', icon: '🔄', color: 'pink' },
  { id: 'phonics', label: 'Phonics Cloze', icon: '🎧', color: 'cyan' },
  { id: 'sentences', label: 'Sentences', icon: '📝', color: 'rose' },
  { id: 'spanish_reading', label: 'Spanish Reading', icon: '📖', color: 'sky' },
  { id: 'spelling', label: 'Spelling Words', icon: '🔠', color: 'orange' },
  { id: 'storybuilder', label: 'Story Builder', icon: '📚', color: 'amber' },
  { id: 'book_reading', label: 'Book Reading', icon: '📕', color: 'teal' },
  { id: 'missing_letter', label: 'Missing Letter', icon: '🔤', color: 'fuchsia' },
  { id: 'name_tracing', label: 'Name Tracing', icon: '🧒', color: 'lime' },
  { id: 'sentence_builder', label: 'Creando Oraciones', icon: '🃏', color: 'rose' },
];

const COLOR_MAP = {
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  violet: 'bg-violet-50 border-violet-200 text-violet-700',
  green: 'bg-green-50 border-green-200 text-green-700',
  purple: 'bg-purple-50 border-purple-200 text-purple-700',
  pink: 'bg-pink-50 border-pink-200 text-pink-700',
  cyan: 'bg-cyan-50 border-cyan-200 text-cyan-700',
  rose: 'bg-rose-50 border-rose-200 text-rose-700',
  sky: 'bg-sky-50 border-sky-200 text-sky-700',
  orange: 'bg-orange-50 border-orange-200 text-orange-700',
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  teal: 'bg-teal-50 border-teal-200 text-teal-700',
  fuchsia: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700',
  lime: 'bg-lime-50 border-lime-200 text-lime-700',
  slate: 'bg-slate-50 border-slate-200 text-slate-700',
};

// ─── Teacher tool links ───────────────────────────────────────────────────────
const TEACHER_TOOLS = [
  { to: '/Activities', label: 'Contar & Cazar', desc: 'Counting, phoneme, hunt activities', icon: Activity, color: 'indigo' },
  { to: '/ActivityPresets', label: 'Activity Presets', desc: 'Manage saved activity configs', icon: Layers, color: 'purple' },
  { to: '/WordBuilderDashboard', label: 'Word Builder', desc: 'Review word builder attempts', icon: SpellCheck, color: 'blue' },
  { to: '/SoundWallManager', label: 'Sound Wall', desc: 'Phoneme & grapheme cards', icon: Volume2, color: 'cyan' },
  { to: '/LetterTracingAuthoring', label: 'Letter Tracing Authoring', desc: 'Author tracing waypoints', icon: PenLine, color: 'violet' },
  { to: '/LetterTracingProgression', label: 'Tracing Progression', desc: 'Enable letters & groups', icon: Type, color: 'violet' },
  { to: '/LetterRecognition', label: 'Letter Recognition', desc: 'Letter recognition practice', icon: Eye, color: 'blue' },
  { to: '/SpanishReadingDashboard', label: 'Spanish Reading', desc: 'Reading sessions & review', icon: BookOpen, color: 'sky' },
  { to: '/SpellingWritingDashboard', label: 'Writing Samples', desc: 'Spelling & handwriting review', icon: PenLine, color: 'orange' },
  { to: '/StoryBuilder', label: 'Story Builder', desc: 'Student story dashboard', icon: BookMarked, color: 'amber' },
  { to: '/BookReading?mode=teacher', label: 'Book Reading', desc: 'Assign & review books', icon: BookOpen, color: 'teal' },
  { to: '/CreandoOraciones', label: 'Creando Oraciones', desc: 'Sentence building activity', icon: Layers2, color: 'rose' },
  { to: '/NounPractice', label: 'Noun Practice Sheets', desc: 'Printable noun worksheets', icon: Type, color: 'green' },
  { to: '/Workstations', label: 'Workstations', desc: 'Station rotation activities', icon: FlaskConical, color: 'indigo' },
  { to: '/SmallGroupLessonPlanner', label: 'Small Group Lessons', desc: 'Plan small group instruction', icon: Users, color: 'purple' },
  { to: '/Lessons', label: 'Lessons', desc: 'Lesson editor & manager', icon: BookOpen, color: 'blue' },
];

export default function LiteracyDashboard() {
  const [selectedClass, setSelectedClass] = useState('All');
  const { data: classConfigs = [] } = useClassConfigs();

  const classes = useMemo(() => {
    const names = (classConfigs || [])
      .filter(c => c.class_name && c.language !== 'en')
      .map(c => c.class_name)
      .sort((a, b) => a.localeCompare(b));
    return ['All', ...Array.from(new Set(names))];
  }, [classConfigs]);

  // ─── Students (for engagement stats) ────────────────────────────────────────
  const { data: students = [] } = useQuery({
    queryKey: ['literacy-students', selectedClass],
    queryFn: async () => {
      const query = selectedClass === 'All'
        ? { school_year: ACTIVE_SCHOOL_YEAR }
        : { school_year: ACTIVE_SCHOOL_YEAR, class_name: selectedClass };
      const { items } = await base44.entities.Student.filter(query, { limit: 200, sort: 'student_number' });
      return items;
    },
  });

  // ─── Live bingo games ───────────────────────────────────────────────────────
  const { data: bingoGames = [], refetch: refetchBingo } = useQuery({
    queryKey: ['literacy-bingo-games', selectedClass],
    queryFn: async () => {
      const query = selectedClass === 'All'
        ? { status: { $in: ['waiting', 'active'] } }
        : { class_name: selectedClass, status: { $in: ['waiting', 'active'] } };
      const { items } = await base44.entities.LiteracyBingoGame.filter(query, { limit: 100, sort: '-created_date' });
      return items;
    },
    refetchInterval: 5000,
  });

  // ─── Live peer spelling games ───────────────────────────────────────────────
  const { data: peerGames = [], refetch: refetchPeer } = useQuery({
    queryKey: ['literacy-peer-games', selectedClass],
    queryFn: async () => {
      const query = selectedClass === 'All'
        ? { status: { $in: ['waiting', 'active'] } }
        : { class_name: selectedClass, status: { $in: ['waiting', 'active'] } };
      const { items } = await base44.entities.LiteracyPeerGame.filter(query, { limit: 100, sort: '-created_date' });
      return items;
    },
    refetchInterval: 5000,
  });

  // ─── Engagement stats per mode ──────────────────────────────────────────────
  const modeStats = useMemo(() => {
    const stats = {};
    LITERACY_MODES.forEach(m => { stats[m.id] = { students: 0, mastered: 0, learning: 0 }; });
    students.forEach(s => {
      const mp = s.mode_progress || {};
      Object.entries(mp).forEach(([modeId, data]) => {
        if (!stats[modeId] || !data) return;
        const mastered = data.mastered_items?.length || 0;
        const learning = data.learning_items?.length || 0;
        if (mastered > 0 || learning > 0 || (data.total_attempts || 0) > 0) {
          stats[modeId].students++;
          stats[modeId].mastered += mastered;
          stats[modeId].learning += learning;
        }
      });
    });
    return stats;
  }, [students]);

  const activeStudents = students.length;

  const deleteBingoGame = async (id) => {
    await base44.entities.LiteracyBingoGame.delete(id);
    refetchBingo();
  };

  const deletePeerGame = async (id) => {
    await base44.entities.LiteracyPeerGame.delete(id);
    refetchPeer();
  };

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-5 space-y-6">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 flex items-center gap-2">
            <Gamepad2 className="w-6 h-6 text-indigo-600" />
            Literacy Activities
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeStudents} students · {bingoGames.length + peerGames.length} live games
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-500">Class</label>
          <select
            value={selectedClass}
            onChange={e => setSelectedClass(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700"
          >
            {classes.map(c => (
              <option key={c} value={c}>{c === 'All' ? 'All Classes' : `Class ${c}`}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── Live Games ───────────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-black text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
          </span>
          Live Games
        </h3>
        {bingoGames.length === 0 && peerGames.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
            <p className="text-sm text-slate-400 font-medium">No active games right now</p>
            <p className="text-xs text-slate-400 mt-1">Students create bingo and spelling rooms from their game screen</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bingoGames.map(g => (
              <div key={g.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-lg font-black text-indigo-600">🎱 Bingo</span>
                    <span className="ml-2 text-xs font-bold text-slate-500">
                      {g.mode === 'letter_sounds' ? 'Letter Sounds' : 'Sight Words'}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteBingoGame(g.id)}
                    className="text-slate-300 hover:text-red-500 transition"
                    title="End game"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-slate-600">
                  <Users className="w-3.5 h-3.5" />
                  <span className="font-bold">Class {g.class_name}</span>
                  <span className="text-slate-300">·</span>
                  <span>{(g.players || []).length} players</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(g.players || []).map(p => (
                    <span key={p} className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-xs font-bold text-indigo-600">#{p}</span>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    g.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {g.status === 'active' ? 'Playing' : 'Waiting'}
                  </span>
                  {g.current_item && (
                    <span className="text-xs text-slate-400">Calling: <span className="font-bold text-slate-600">{g.current_item}</span></span>
                  )}
                </div>
              </div>
            ))}
            {peerGames.map(g => (
              <div key={g.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-lg font-black text-purple-600">👫 Spelling Race</span>
                    <span className="ml-2 text-xs font-bold text-slate-500">
                      {g.mode === 'spelling' ? 'Spelling' : 'Sight Words'}
                    </span>
                  </div>
                  <button
                    onClick={() => deletePeerGame(g.id)}
                    className="text-slate-300 hover:text-red-500 transition"
                    title="End game"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-slate-600">
                  <Users className="w-3.5 h-3.5" />
                  <span className="font-bold">Class {g.class_name}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-sm">
                  <span className="font-bold text-slate-600">#{g.player1_number}</span>
                  <span className="text-slate-300">vs</span>
                  <span className="font-bold text-slate-600">#{g.player2_number}</span>
                </div>
                <div className="mt-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    g.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {g.status === 'active' ? 'Racing' : 'Waiting'}
                  </span>
                  {g.winner && (
                    <span className="ml-2 text-xs font-bold text-amber-600">🏆 #{g.winner} won!</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Activity Mode Engagement ─────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-black text-slate-600 uppercase tracking-wide mb-2">
          Activity Modes
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
          {LITERACY_MODES.map(mode => {
            const s = modeStats[mode.id] || { students: 0, mastered: 0, learning: 0 };
            const colorClass = COLOR_MAP[mode.color] || COLOR_MAP.slate;
            return (
              <div key={mode.id} className={`rounded-xl border-2 p-3 ${colorClass}`}>
                <div className="text-2xl mb-1">{mode.icon}</div>
                <h4 className="text-sm font-black leading-tight mb-2">{mode.label}</h4>
                <div className="space-y-0.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3 h-3" />
                    <span className="font-bold">{s.students}</span>
                    <span className="opacity-60">students</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Star className="w-3 h-3" />
                    <span className="font-bold">{s.mastered}</span>
                    <span className="opacity-60">mastered</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Trophy className="w-3 h-3" />
                    <span className="font-bold">{s.learning}</span>
                    <span className="opacity-60">learning</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Teacher Tools ─────────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-black text-slate-600 uppercase tracking-wide mb-2">
          Teacher Tools
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {TEACHER_TOOLS.map(tool => {
            const Icon = tool.icon;
            const colorClass = COLOR_MAP[tool.color] || COLOR_MAP.slate;
            return (
              <Link
                key={tool.to}
                to={tool.to}
                className={`group rounded-xl border-2 p-3 transition hover:shadow-md hover:-translate-y-0.5 ${colorClass}`}
              >
                <div className="flex items-start gap-2">
                  <Icon className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-black leading-tight">{tool.label}</h4>
                    <p className="text-xs opacity-60 leading-snug mt-0.5">{tool.desc}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-30 group-hover:opacity-60 transition" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}