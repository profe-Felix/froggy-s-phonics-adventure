import { Sun, Moon } from 'lucide-react';

// Sol/Luna question bar with a toggle: click Sol or Luna to set who asks
// the question. The active side shows the question_text (bold), the inactive
// side shows the sentence_stem (muted). Used by ComparisonReader on
// question slides.
export default function ToggleableQuestionBar({ question, solFirst, setSolFirst }) {
  return (
    <div className="relative grid grid-cols-2 gap-4 rounded-2xl bg-white p-5 shadow-2xl">
      <div
        onClick={() => setSolFirst(true)}
        className={`flex cursor-pointer items-start gap-3 pr-2 transition ${solFirst ? '' : 'opacity-60'}`}
      >
        <div className="flex flex-shrink-0 flex-col items-center gap-0.5">
          <Sun
            className={`h-10 w-10 transition-transform ${solFirst ? 'scale-110' : ''}`}
            style={{ color: '#f59e0b' }}
            strokeWidth={2.5}
          />
          <span className="text-xs font-black" style={{ color: '#f59e0b' }}>Sol</span>
        </div>
        <p className={`pt-1 text-lg leading-snug ${solFirst ? 'font-black text-slate-800' : 'font-bold text-slate-500'}`}>
          {solFirst ? question.question_text : (question.sentence_stem || '—')}
        </p>
      </div>
      <div
        onClick={() => setSolFirst(false)}
        className={`flex cursor-pointer items-start gap-3 border-l-2 border-slate-100 pl-4 pr-6 transition ${!solFirst ? '' : 'opacity-60'}`}
      >
        <div className="flex flex-shrink-0 flex-col items-center gap-0.5">
          <Moon
            className={`h-10 w-10 transition-transform ${!solFirst ? 'scale-110' : ''}`}
            style={{ color: '#6366f1' }}
            strokeWidth={2.5}
          />
          <span className="text-xs font-black" style={{ color: '#6366f1' }}>Luna</span>
        </div>
        <p className={`pt-1 text-lg leading-snug ${!solFirst ? 'font-black text-slate-800' : 'font-bold text-slate-500'}`}>
          {!solFirst ? question.question_text : (question.sentence_stem || '—')}
        </p>
      </div>
    </div>
  );
}