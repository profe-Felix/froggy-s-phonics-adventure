import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import QuestionBar from './QuestionBar';

// ? button + slide-up question bar inside the book reader.
// Remount with a key per page so it closes when the page changes.
export default function ReaderQuestions({ questions, onActiveChange }) {
  const [idx, setIdx] = useState(null);
  if (questions.length === 0) return null;
  const q = idx === null ? null : questions[idx];

  const open = (i) => { setIdx(i); onActiveChange(questions[i]); };
  const close = () => { setIdx(null); onActiveChange(null); };

  return (
    <>
      {!q && (
        <button onClick={() => open(0)}
          className="absolute right-3 top-14 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white shadow-xl transition hover:scale-110">
          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
            <HelpCircle className="h-7 w-7" />
          </motion.div>
        </button>
      )}
      <AnimatePresence>
        {q && (
          <motion.div key={q.id} initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="relative z-20 mx-auto w-full max-w-4xl shrink-0 px-3 py-2">
            {questions.length > 1 && (
              <div className="mb-2 flex items-center justify-center gap-2">
                <button onClick={() => open(idx - 1)} disabled={idx === 0} className="rounded-full bg-slate-800/70 p-1.5 text-white disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
                <span className="rounded-full bg-slate-800/70 px-3 py-1 text-xs font-bold text-white">{idx + 1} / {questions.length}</span>
                <button onClick={() => open(idx + 1)} disabled={idx === questions.length - 1} className="rounded-full bg-slate-800/70 p-1.5 text-white disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
              </div>
            )}
            <QuestionBar question={q} onClose={close} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}