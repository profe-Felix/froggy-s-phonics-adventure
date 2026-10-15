import { Sun, Moon, X } from 'lucide-react';
import HighlightedText from '@/components/book/HighlightedText';

// Sol/Luna question bar with an icon toggle. The question ALWAYS stays on the
// left and the sentence stem ALWAYS stays on the right. Clicking either side
// swaps the sun/moon icons so the teacher can choose which character "asks"
// without moving the text. Known sight words are highlighted in both columns.
// Optional onClose renders an X button (used by the single-book reader).
export default function ToggleableQuestionBar({ question, solFirst, setSolFirst, knownWords, onClose }) {
  const LeftIcon = solFirst ? Sun : Moon;
  const RightIcon = solFirst ? Moon : Sun;
  const leftColor = solFirst ? '#f59e0b' : '#6366f1';
  const leftLabel = solFirst ? 'Sol' : 'Luna';
  const rightColor = solFirst ? '#6366f1' : '#f59e0b';
  const rightLabel = solFirst ? 'Luna' : 'Sol';

  return (
    <div className="relative grid grid-cols-2 gap-4 rounded-2xl bg-white p-6 shadow-2xl">
      {onClose && (
        <button onClick={onClose} className="absolute right-2 top-2 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>
      )}
      {/* Question — always left */}
      <div
        onClick={() => setSolFirst(v => !v)}
        className="flex cursor-pointer items-start gap-3 pr-2 transition"
      >
        <div className="flex flex-shrink-0 flex-col items-center gap-0.5">
          <LeftIcon
            className="h-12 w-12 transition-transform scale-110"
            style={{ color: leftColor }}
            strokeWidth={2.5}
          />
          <span className="text-sm font-black" style={{ color: leftColor }}>{leftLabel}</span>
        </div>
        <p className="pt-1.5 text-2xl font-black leading-tight text-slate-800">
          <HighlightedText knownWords={knownWords} text={question.question_text} />
        </p>
      </div>

      {/* Sentence stem — always right */}
      <div
        onClick={() => setSolFirst(v => !v)}
        className={`flex cursor-pointer items-start gap-3 border-l-2 border-slate-100 pl-4 pr-6 transition ${question.sentence_stem ? '' : 'opacity-50'}`}
      >
        <div className="flex flex-shrink-0 flex-col items-center gap-0.5">
          <RightIcon
            className="h-12 w-12 transition-transform"
            style={{ color: rightColor }}
            strokeWidth={2.5}
          />
          <span className="text-sm font-black" style={{ color: rightColor }}>{rightLabel}</span>
        </div>
        <p className="pt-1.5 text-xl font-bold leading-snug text-slate-500">
          <HighlightedText knownWords={knownWords} text={question.sentence_stem || '—'} />
        </p>
      </div>
    </div>
  );
}