import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  buildWordRecord,
  TIER_LABELS,
} from '@/lib/wordBankDifficulty';

const TIER_COLORS = {
  1: 'bg-green-100 text-green-700 border-green-300',
  2: 'bg-amber-100 text-amber-700 border-amber-300',
  3: 'bg-rose-100 text-rose-700 border-rose-300',
};

// Teacher editor for the WordBank entity. Words are auto-syllabified and
// assigned a difficulty tier on add. The Spanish Reading dashboard reads
// from here to show decodable practice per class grapheme progression.
export default function WordBank() {
  const qc = useQueryClient();
  const [newWords, setNewWords] = useState('');
  const [adding, setAdding] = useState(false);
  const [filterTier, setFilterTier] = useState(0);
  const [search, setSearch] = useState('');

  const { data: words = [], isLoading } = useQuery({
    queryKey: ['word-bank'],
    queryFn: () => base44.entities.WordBank.list('-updated_date', 2000),
  });

  const addWords = async () => {
    const list = newWords
      .split('\n')
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    if (!list.length) return;
    setAdding(true);
    try {
      const existing = new Set(words.map((w) => (w.word || '').toLowerCase()));
      const toCreate = list
        .filter((w) => !existing.has(w))
        .map(buildWordRecord)
        .filter((r) => r.word);
      if (toCreate.length) await base44.entities.WordBank.bulkCreate(toCreate);
      setNewWords('');
      qc.invalidateQueries({ queryKey: ['word-bank'] });
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (w) => {
    await base44.entities.WordBank.update(w.id, { active: !w.active });
    qc.invalidateQueries({ queryKey: ['word-bank'] });
  };

  const remove = async (w) => {
    if (!window.confirm(`Delete "${w.word}"?`)) return;
    await base44.entities.WordBank.delete(w.id);
    qc.invalidateQueries({ queryKey: ['word-bank'] });
  };

  const filtered = words.filter((w) => {
    if (filterTier && (w.difficulty || 1) !== filterTier) return false;
    if (search && !(w.word || '').includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: words.length,
    t1: words.filter((w) => (w.difficulty || 1) === 1).length,
    t2: words.filter((w) => (w.difficulty || 1) === 2).length,
    t3: words.filter((w) => (w.difficulty || 1) === 3).length,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/Dashboard" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-800">📚 Word Bank</h1>
              <p className="text-xs text-gray-500">
                {stats.total} words · {stats.t1} simple · {stats.t2} intermediate · {stats.t3} complex
              </p>
            </div>
          </div>
          <Link
            to="/SpanishReadingDashboard"
            className="text-xs font-bold text-indigo-600 hover:underline"
          >
            Spanish Reading →
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* Add words */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="text-sm font-bold text-slate-700 uppercase mb-2">Add words</h2>
          <textarea
            value={newWords}
            onChange={(e) => setNewWords(e.target.value)}
            rows={3}
            placeholder={'One word per line, e.g.\nsamba\npiano\nplato'}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 font-mono"
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-slate-400">
              Words are auto-syllabified and assigned a difficulty tier (simple → complex).
            </p>
            <button
              onClick={addWords}
              disabled={adding || !newWords.trim()}
              className="px-4 py-2 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {adding ? 'Adding…' : '+ Add words'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
          />
          <button
            onClick={() => setFilterTier(0)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${
              filterTier === 0 ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            All
          </button>
          {[1, 2, 3].map((t) => (
            <button
              key={t}
              onClick={() => setFilterTier(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                filterTier === t ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              {TIER_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Word list */}
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            No words yet. Add some above!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {filtered.map((w) => (
              <div
                key={w.id}
                className={`bg-white rounded-xl border p-3 flex items-center gap-2 ${
                  w.active === false ? 'opacity-40' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm">{w.word}</p>
                  <p className="text-xs text-slate-400 font-mono">
                    {(w.syllables || []).join(' · ')}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                    TIER_COLORS[w.difficulty || 1]
                  }`}
                >
                  T{w.difficulty || 1}
                </span>
                <button
                  onClick={() => toggleActive(w)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                  title={w.active === false ? 'Hidden — click to activate' : 'Active — click to hide'}
                >
                  {w.active === false ? '🚫' : '👁️'}
                </button>
                <button
                  onClick={() => remove(w)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}