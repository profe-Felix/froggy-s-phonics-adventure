import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getIntroducedGraphemesThrough } from '@/lib/literacy/curriculumGraphemes';
import {
  getDecodableWords,
  getDecodableSyllables,
  TIER_LABELS,
} from '@/lib/wordBankDifficulty';
import { Link } from 'react-router-dom';

const TIER_COLORS = {
  1: 'bg-green-50 border-green-200 text-green-800',
  2: 'bg-amber-50 border-amber-200 text-amber-800',
  3: 'bg-rose-50 border-rose-200 text-rose-800',
};

// Shows what reading practice is available for a class based on its current
// grapheme progression (active_spanish_module / active_spanish_lesson in
// ClassConfig). Decodable words come from the WordBank entity, filtered by
// canDecodeWord against the introduced graphemes, grouped by difficulty tier.
export default function AvailablePracticePanel({ className }) {
  const { data: classConfigs = [] } = useQuery({
    queryKey: ['class-configs'],
    queryFn: () => base44.entities.ClassConfig.list(),
  });
  const cfg = classConfigs.find((c) => c.class_name === className);
  const module = Number(cfg?.active_spanish_module) || 1;
  const lesson = Number(cfg?.active_spanish_lesson) || 1;

  const { data: wordBank = [], isLoading } = useQuery({
    queryKey: ['word-bank'],
    queryFn: () => base44.entities.WordBank.list('-updated_date', 2000),
  });

  const graphemes = getIntroducedGraphemesThrough({ moduleNumber: module, lessonNumber: lesson });
  const decodable = getDecodableWords(wordBank, graphemes);
  const syllables = getDecodableSyllables(wordBank, graphemes);

  const byTier = { 1: [], 2: [], 3: [] };
  decodable.forEach((w) => {
    const t = w.difficulty || 1;
    if (byTier[t]) byTier[t].push(w);
  });

  return (
    <div className="px-3 sm:px-4 py-3 bg-white border-b">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-black text-gray-500 uppercase">
          Available Practice · M{module}.L{lesson} · {graphemes.length} graphemes
        </h2>
        <Link to="/WordBank" className="text-xs font-bold text-indigo-600 hover:underline">
          Word Bank →
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading word bank…</p>
      ) : decodable.length === 0 ? (
        <p className="text-sm text-gray-400">
          No decodable words yet for this position. Add words to the{' '}
          <Link to="/WordBank" className="text-indigo-600 underline">Word Bank</Link>.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Decodable syllables */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-1">
              Syllables ({syllables.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {syllables.slice(0, 40).map((s) => (
                <span key={s} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold">
                  {s}
                </span>
              ))}
              {syllables.length > 40 && (
                <span className="text-xs text-gray-400 px-1">+{syllables.length - 40} more</span>
              )}
            </div>
          </div>

          {/* Words grouped by difficulty tier */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[1, 2, 3].map((t) => (
              <div key={t} className={`rounded-lg border p-2 ${TIER_COLORS[t]}`}>
                <p className="text-xs font-black mb-1">
                  {TIER_LABELS[t]} · {byTier[t].length}
                </p>
                <p className="text-xs leading-relaxed">
                  {byTier[t].slice(0, 14).map((w) => w.word).join(', ')}
                  {byTier[t].length > 14 && (
                    <span className="text-xs font-bold"> +{byTier[t].length - 14}</span>
                  )}
                  {byTier[t].length === 0 && <span className="text-xs opacity-60">—</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}