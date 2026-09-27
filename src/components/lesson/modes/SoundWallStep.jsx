import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import CameraMirror from '@/components/soundwall/CameraMirror';
import RevealCard from '@/components/soundwall/RevealCard';
import { playLetterSound } from '@/lib/audio';
import { ChevronLeft, ChevronRight, Volume2, Check } from 'lucide-react';

// Student-facing Sound Wall step. Shows a sequential progression on a single
// page for each grapheme:
//   1. Phoneme mouth card — "We make it this way"
//   2. Camera mirror      — "Now you try it!"
//   3. Grapheme card      — "This sound is written as…"
//
// When stepConfig.curriculumKey is set (e.g. "M1.L3"), cards are auto-loaded
// from the SoundWallCard entity for that curriculum position. Manual
// stepConfig.cards still work as a fallback.
export default function SoundWallStep({ onComplete, stepConfig }) {
  const lang = stepConfig?.language || 'es';
  const curriculumKey = stepConfig?.curriculumKey || '';

  const [entityCards, setEntityCards] = useState([]);
  const [loadingCards, setLoadingCards] = useState(false);

  useEffect(() => {
    if (!curriculumKey) { setEntityCards([]); return; }
    let cancelled = false;
    setLoadingCards(true);
    base44.entities.SoundWallCard.filter({ curriculum_key: curriculumKey })
      .then((recs) => {
        if (cancelled) return;
        setEntityCards((recs || []).map((r) => ({
          label: r.label || r.grapheme,
          imageUrl: r.image_url,
          sound: r.grapheme,
          cardType: r.card_type,
          grapheme: r.grapheme,
          id: r.id,
          covers: r.covers || [],
          active_reveal_id: r.active_reveal_id || '',
        })));
      })
      .catch(() => { if (!cancelled) setEntityCards([]); })
      .finally(() => { if (!cancelled) setLoadingCards(false); });
    return () => { cancelled = true; };
  }, [curriculumKey]);

  // Build sequential stages: phoneme → camera → grapheme for each grapheme.
  const stages = useMemo(() => {
    let cards = [];
    if (entityCards.length > 0) cards = entityCards;
    else if (stepConfig?.cards?.length) cards = stepConfig.cards;
    else if (stepConfig?.cardUrl)
      cards = [{ label: stepConfig.cardLabel || '', imageUrl: stepConfig.cardUrl, sound: stepConfig.sound || '', cardType: 'phoneme', grapheme: stepConfig.sound || '' }];

    // Group by grapheme, preserving first-seen order.
    const byGrapheme = {};
    const order = [];
    for (const c of cards) {
      const g = c.grapheme || c.sound || 'sound';
      if (!byGrapheme[g]) { byGrapheme[g] = {}; order.push(g); }
      if (c.cardType === 'phoneme') byGrapheme[g].phoneme = c;
      else byGrapheme[g].grapheme = c;
    }

    const result = [];
    for (const g of order) {
      const pair = byGrapheme[g];
      if (pair.phoneme) result.push({ type: 'phoneme', grapheme: g, card: pair.phoneme });
      result.push({ type: 'camera', grapheme: g, card: pair.phoneme || pair.grapheme });
      if (pair.grapheme) result.push({ type: 'grapheme', grapheme: g, card: pair.grapheme });
    }
    return result;
  }, [entityCards, stepConfig]);

  const [stageIdx, setStageIdx] = useState(0);
  const [done, setDone] = useState(false);
  const stage = stages[stageIdx];

  const playSound = () => {
    if (stage?.card?.sound) playLetterSound(stage.card.sound, lang);
  };

  const next = () => {
    if (stageIdx < stages.length - 1) setStageIdx(stageIdx + 1);
    else if (!done) { setDone(true); onComplete?.(); }
  };

  const prev = () => {
    if (stageIdx > 0) setStageIdx(stageIdx - 1);
  };

  if (loadingCards) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-400">
        <p className="text-lg font-bold">No sound wall cards for {curriculumKey || 'this step'}.</p>
        {curriculumKey && (
          <a
            href="/SoundWallManager"
            className="text-sm text-indigo-500 hover:text-indigo-700 font-bold underline"
          >
            Upload cards in the Sound Wall Manager →
          </a>
        )}
      </div>
    );
  }

  const stageLabels = {
    phoneme: { color: 'text-red-500', text: 'We make it this way' },
    camera: { color: 'text-indigo-500', text: 'Now you try it!' },
    grapheme: { color: 'text-green-600', text: 'This sound is written as' },
  };
  const label = stageLabels[stage.type];

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Stage content */}
      <div className="flex-1 flex items-center justify-center min-h-0 p-4 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={stageIdx}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md flex flex-col items-center gap-3"
          >
            <div className="text-center">
              <p className={`text-sm font-black uppercase tracking-wide ${label.color}`}>
                {label.text}
              </p>
              {stage.type === 'camera' && (
                <p className="text-xs text-gray-400 mt-0.5">Make your mouth match the sound</p>
              )}
            </div>

            {stage.type === 'camera' ? (
              <div className="w-full max-w-sm aspect-[3/4] rounded-2xl overflow-hidden shadow-lg bg-slate-900">
                <CameraMirror className="w-full h-full" />
              </div>
            ) : (
              <div className="w-full max-w-sm aspect-[3/4] rounded-2xl overflow-hidden shadow-lg bg-white">
                <RevealCard card={stage.card} />
              </div>
            )}

            {stage.card?.label && (
              <div className="text-3xl font-black text-indigo-600">{stage.card.label}</div>
            )}

            <button
              onClick={playSound}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-500 text-white font-black shadow-lg hover:bg-indigo-600 transition"
            >
              <Volume2 className="w-5 h-5" /> {stage.type === 'camera' ? 'Hear it again' : 'Play sound'}
            </button>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between p-4 shrink-0 bg-white border-t border-gray-100">
        <button
          onClick={prev}
          disabled={stageIdx === 0}
          className="px-4 py-2 rounded-xl bg-white border border-gray-200 font-bold text-gray-600 disabled:opacity-40 inline-flex items-center gap-1 hover:bg-gray-50"
        >
          <ChevronLeft className="w-5 h-5" /> Back
        </button>
        <span className="text-sm font-bold text-gray-500">
          {stageIdx + 1} / {stages.length}
        </span>
        <button
          onClick={next}
          disabled={done}
          className="px-4 py-2 rounded-xl bg-green-500 text-white font-bold inline-flex items-center gap-1 hover:bg-green-600 disabled:opacity-60"
        >
          {stageIdx < stages.length - 1 ? (
            <>Next <ChevronRight className="w-5 h-5" /></>
          ) : (
            <><Check className="w-5 h-5" /> {done ? 'Done!' : 'Done'}</>
          )}
        </button>
      </div>
    </div>
  );
}