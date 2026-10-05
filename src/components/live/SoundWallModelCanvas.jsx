import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import CameraMirror from '@/components/soundwall/CameraMirror';
import RevealCard from '@/components/soundwall/RevealCard';
import { playLetterSound } from '@/lib/audio';
import { ChevronRight, Volume2, Check } from 'lucide-react';

// Teacher's model panel for the Sound Wall activity during a live lesson.
// Loads phoneme + grapheme cards from the SoundWallCard entity (by curriculum
// key) or falls back to manual step config. Drives a sequential progression:
//   1. Phoneme mouth card — "We make it this way"
//   2. Camera mirror      — "Now you try it!"
//   3. Grapheme card      — "This sound is written as…"
// The teacher advances with "Show next"; student mirrors follow in realtime.
export default function SoundWallModelCanvas({ step, send }) {
  const cfg = step?.config || {};
  const lang = cfg.language || 'es';
  const curriculumKey = cfg.curriculumKey || '';

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
    else if (cfg.cards?.length) cards = cfg.cards;
    else if (cfg.cardUrl)
      cards = [{ label: cfg.cardLabel || '', imageUrl: cfg.cardUrl, sound: cfg.sound || '', cardType: 'phoneme', grapheme: cfg.sound || '' }];

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
  }, [entityCards, cfg]);

  const [revealedCount, setRevealedCount] = useState(1);

  // Broadcast current progression state to student mirrors.
  useEffect(() => {
    if (stages.length === 0) return;
    send({
      type: 'soundwall',
      lang,
      revealedCount,
      stages: stages.map(s => ({
        type: s.type,
        grapheme: s.grapheme,
        card: s.card,
      })),
      totalStages: stages.length,
    });
  }, [revealedCount, stages, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const playSound = (sound) => {
    if (sound) playLetterSound(sound, lang);
  };

  const next = () => {
    if (revealedCount < stages.length) setRevealedCount(revealedCount + 1);
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
      <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-400">
        <p className="text-lg font-bold">No sound wall cards for {curriculumKey || 'this step'}.</p>
        {curriculumKey && (
          <a href="/SoundWallManager" className="text-sm text-indigo-500 hover:text-indigo-700 font-bold underline">
            Upload cards in the Sound Wall Manager →
          </a>
        )}
      </div>
    );
  }

  const stageLabels = {
    phoneme: { color: 'text-red-400', text: 'We make it this way' },
    camera: { color: 'text-indigo-400', text: 'Now you try it!' },
    grapheme: { color: 'text-green-400', text: 'This sound is written as' },
  };

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="text-xs font-bold text-indigo-400 uppercase tracking-wide shrink-0 p-3 text-center">
        Sound Wall · Modeling — students follow along
      </div>

      <div className="flex-1 flex items-center justify-center min-h-0 p-4 overflow-auto">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-center w-full max-w-5xl">
          {stages.map((stage, i) => {
            const label = stageLabels[stage.type];
            const isRevealed = i < revealedCount;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isRevealed ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4 }}
                className={`flex-1 flex flex-col items-center gap-2 ${isRevealed ? '' : 'pointer-events-none'}`}
              >
                <div className="text-center">
                  <p className={`text-xs font-black uppercase tracking-wide ${label.color}`}>
                    {label.text}
                  </p>
                  {stage.type === 'camera' && (
                    <p className="text-[10px] text-white/40 mt-0.5">Match the mouth shape</p>
                  )}
                </div>

                {stage.type === 'camera' ? (
                  <div className="w-full max-w-[320px] aspect-[3/4] rounded-2xl overflow-hidden shadow-lg bg-slate-950">
                    {isRevealed && <CameraMirror className="w-full h-full" />}
                  </div>
                ) : (
                  <div className="w-full max-w-[320px] aspect-[3/4] rounded-2xl overflow-hidden shadow-lg bg-white">
                    {isRevealed && <RevealCard card={stage.card} />}
                  </div>
                )}

                {stage.card?.label && isRevealed && (
                  <div className="text-2xl font-black text-white">{stage.card.label}</div>
                )}

                {isRevealed && (
                  <button
                    onClick={() => playSound(stage.card?.sound)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500 text-white font-black text-sm shadow hover:bg-indigo-600 transition"
                  >
                    <Volume2 className="w-4 h-4" /> {stage.type === 'camera' ? 'Hear it' : 'Play'}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 p-4 shrink-0 bg-slate-800 border-t border-slate-700">
        <span className="text-sm font-bold text-white/60">
          {revealedCount} / {stages.length}
        </span>
        <button
          onClick={next}
          disabled={revealedCount >= stages.length}
          className="px-6 py-2.5 rounded-xl bg-green-500 text-white font-bold inline-flex items-center gap-1.5 hover:bg-green-600 disabled:opacity-60"
        >
          {revealedCount < stages.length ? (
            <>Show next <ChevronRight className="w-5 h-5" /></>
          ) : (
            <><Check className="w-5 h-5" /> Done</>
          )}
        </button>
      </div>
    </div>
  );
}