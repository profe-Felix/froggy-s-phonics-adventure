import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, ChevronLeft, ChevronRight, Image as ImageIcon, X } from 'lucide-react';
import ToggleableQuestionBar from './ToggleableQuestionBar';

// ? button + slide-up question bar inside the book reader.
// Remount with a key per page so it closes when the page changes.
export default function ReaderQuestions({ questions, onActiveChange, knownWords }) {
  const [idx, setIdx] = useState(null);
  const [solFirst, setSolFirst] = useState(true);
  const [showAnchor, setShowAnchor] = useState(false);
  if (questions.length === 0) return null;
  const q = idx === null ? null : questions[idx];

  const open = (i) => { setIdx(i); setShowAnchor(false); onActiveChange(questions[i]); };
  const close = () => { setIdx(null); setShowAnchor(false); onActiveChange(null); };

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
            <ToggleableQuestionBar question={q} solFirst={solFirst} setSolFirst={setSolFirst} knownWords={knownWords} onClose={close} />
            {q.anchor_chart_url && (
              <button
                onClick={() => setShowAnchor(v => !v)}
                className="absolute -top-14 right-3 z-30 flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-2 text-sm font-bold text-white shadow-lg transition hover:scale-105"
              >
                <ImageIcon className="h-4 w-4" />
                {showAnchor ? 'Hide chart' : 'Anchor chart'}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {q?.anchor_chart_url && showAnchor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setShowAnchor(false)}
          >
            <img
              src={q.anchor_chart_url}
              alt="Anchor chart"
              className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
            <button
              onClick={() => setShowAnchor(false)}
              className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-slate-700 shadow-lg hover:bg-white"
            >
              <X className="h-6 w-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}