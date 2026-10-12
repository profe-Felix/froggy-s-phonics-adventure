import { Sun, Moon, X } from 'lucide-react';
import HighlightedText from '@/components/book/HighlightedText';

// Sol asks the question, Luna answers with the sentence stem.
export default function QuestionBar({ question, onClose, knownWords }) {
  return (
    <div className="relative grid grid-cols-2 gap-4 rounded-2xl bg-white p-4 shadow-2xl">
      <button onClick={onClose} className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
        <X className="h-5 w-5" />
      </button>
      <div className="flex items-start gap-3 pr-2">
        <div className="flex flex-shrink-0 flex-col items-center gap-0.5">
          <Sun className="h-10 w-10" style={{ color: '#f59e0b' }} strokeWidth={2.5} />
          <span className="text-xs font-black" style={{ color: '#f59e0b' }}>Sol</span>
        </div>
        <p className="pt-1 text-lg font-black leading-snug text-slate-800">
          <HighlightedText knownWords={knownWords} text={question.question_text} />
        </p>
      </div>
      <div className="flex items-start gap-3 border-l-2 border-slate-100 pl-4 pr-6">
        <div className="flex flex-shrink-0 flex-col items-center gap-0.5">
          <Moon className="h-10 w-10" style={{ color: '#6366f1' }} strokeWidth={2.5} />
          <span className="text-xs font-black" style={{ color: '#6366f1' }}>Luna</span>
        </div>
        <p className="pt-1 text-lg font-bold leading-snug text-slate-500">
          <HighlightedText knownWords={knownWords} text={question.sentence_stem || '—'} />
        </p>
      </div>
    </div>
  );
}