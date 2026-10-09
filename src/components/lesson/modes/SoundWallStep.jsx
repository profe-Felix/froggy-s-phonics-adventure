import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import CameraMirror from '@/components/soundwall/CameraMirror';
import RevealCard from '@/components/soundwall/RevealCard';
import { playLetterSound } from '@/lib/audio';
import { getCachedCards, invalidateCards, fetchWithRetry } from '@/lib/soundWallCardCache';
import { useImagePreload } from '@/hooks/useImagePreload';
import { ChevronLeft, ChevronRight, Volume2, Check } from 'lucide-react';

// Student-facing Sound Wall step. For each grapheme (sound), presents a
// 3-stage progression on its own page:
//   1. Phoneme mouth card — "We make it this way"
//   2. Camera mirror      — "Now you try it!"
//   3. Grapheme card      — "This sound is written as…"
//
// Cards are loaded from the SoundWallCard entity via a bounded cache with
// in-flight deduplication. Sounds are deduplicated before querying by
// grapheme so repeated entries don't generate parallel requests.

function mapRecs(recs) {
  return (recs || []).map((r) => ({
    label: r.label || r.grapheme,
    imageUrl: r.image_url,
    sound: r.grapheme,
    cardType: r.card_type,
    grapheme: r.grapheme,
    id: r.id,
    covers: r.covers || [],
    active_reveal_id: r.active_reveal_id || '',
  }));
}

export default function SoundWallStep({ onComplete, stepConfig }) {
  const lang = stepConfig?.language || 'es';
  const curriculumKey = stepConfig?.curriculumKey || '';
  const manualCards = stepConfig?.cards || [];

  const [entityCards, setEntityCards] = useState([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardError, setCardError] = useState(false);

  const manualKey = JSON.stringify(manualCards);

  useEffect(() => {
    let cancelled = false;

    // Strategy 1: curriculumKey set → load by curriculum position.
    if (curriculumKey) {
      setLoadingCards(true);
      setCardError(false);
      getCachedCards({ curriculum_key: curriculumKey }, () =>
        fetchWithRetry(() => base44.entities.SoundWallCard.filter({ curriculum_key: curriculumKey }))
      )
        .then((recs) => {
          if (cancelled) return;
          setEntityCards(mapRecs(recs));
          setLoadingCards(false);
        })
        .catch(() => {
          if (cancelled) return;
          setEntityCards([]);
          setLoadingCards(false);
          setCardError(true);
        });
      return () => { cancelled = true; };
    }

    // Strategy 2: manual cards with sounds but no images → look up by grapheme.
    // Deduplicate sounds first so repeated entries don't fire parallel requests.
    const soundsToLookup = [...new Set(
      manualCards
        .filter((c) => c.sound && !c.imageUrl)
        .map((c) => c.sound)
    )];

    if (soundsToLookup.length === 0) {
      setEntityCards([]);
      return;
    }

    setLoadingCards(true);
    setCardError(false);

    // Use cached lookups for each unique grapheme — in-flight dedup prevents
    // duplicate parallel requests for the same grapheme.
    Promise.all(
      soundsToLookup.map((s) =>
        getCachedCards({ grapheme: s }, () =>
          fetchWithRetry(() => base44.entities.SoundWallCard.filter({ grapheme: s }))
        )
      )
    )
      .then((results) => {
        if (cancelled) return;
        const seen = new Set();
        const all = [];
        for (const recs of results) {
          for (const r of recs || []) {
            if (seen.has(r.id)) continue;
            seen.add(r.id);
            all.push(r);
          }
        }
        setEntityCards(mapRecs(all));
        setLoadingCards(false);
      })
      .catch(() => {
        if (cancelled) return;
        setEntityCards([]);
        setLoadingCards(false);
        setCardError(true);
      });

    return () => { cancelled = true; };
  }, [curriculumKey, manualKey]);

  // Build per-grapheme stage groups: phoneme → camera → grapheme.
  const soundGroups = useMemo(() => {
    let cards = [];
    if (entityCards.length > 0) cards = entityCards;
    else if (manualCards.length) cards = manualCards;
    else if (stepConfig?.cardUrl)
      cards = [{ label: stepConfig.cardLabel || '', imageUrl: stepConfig.cardUrl, sound: stepConfig.sound || '', cardType: 'phoneme', grapheme: stepConfig.sound || '' }];

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
      const stages = [];
      if (pair.phoneme) stages.push({ type: 'phoneme', card: pair.phoneme });
      stages.push({ type: 'camera', card: pair.phoneme || pair.grapheme });
      if (pair.grapheme) stages.push({ type: 'grapheme', card: pair.grapheme });
      result.push({ grapheme: g, stages });
    }
    return result;
  }, [entityCards, manualKey, stepConfig]);

  const [currentSoundIndex, setCurrentSoundIndex] = useState(0);
  const [revealedCount, setRevealedCount] = useState(1);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setRevealedCount(1);
  }, [currentSoundIndex]);

  // Collect all upcoming image URLs in order for preloading.
  // The current visible stage is first; the hook preloads the next N.
  const upcomingImageUrls = useMemo(() => {
    const urls = [];
    for (let si = currentSoundIndex; si < soundGroups.length; si++) {
      const group = soundGroups[si];
      for (let i = 0; i < group.stages.length; i++) {
        // Skip stages already revealed in the current sound.
        if (si === currentSoundIndex && i < revealedCount) continue;
        const card = group.stages[i].card;
        if (card?.imageUrl) urls.push(card.imageUrl);
      }
    }
    return urls;
  }, [soundGroups, currentSoundIndex, revealedCount]);

  useImagePreload(upcomingImageUrls, { count: 2 });

  const playSound = (sound) => {
    if (sound) playLetterSound(sound, lang);
  };

  const currentGroup = soundGroups[currentSoundIndex];
  const currentStages = currentGroup?.stages || [];

  const next = () => {
    if (revealedCount < currentStages.length) {
      setRevealedCount(revealedCount + 1);
    } else if (currentSoundIndex < soundGroups.length - 1) {
      setCurrentSoundIndex(currentSoundIndex + 1);
      setRevealedCount(1);
    } else if (!done) {
      setDone(true);
      onComplete?.();
    }
  };

  const prev = () => {
    if (revealedCount > 1) {
      setRevealedCount(revealedCount - 1);
    } else if (currentSoundIndex > 0) {
      setCurrentSoundIndex(currentSoundIndex - 1);
      setRevealedCount((soundGroups[currentSoundIndex - 1]?.stages || []).length || 1);
    }
  };

  const retryLoad = () => {
    invalidateCards();
    setEntityCards([]);
    setLoadingCards(true);
    setCardError(false);
    // Re-trigger the effect by toggling a state — simplest: reload
    if (curriculumKey) {
      getCachedCards({ curriculum_key: curriculumKey }, () =>
        fetchWithRetry(() => base44.entities.SoundWallCard.filter({ curriculum_key: curriculumKey }))
      )
        .then((recs) => { setEntityCards(mapRecs(recs)); setLoadingCards(false); })
        .catch(() => { setLoadingCards(false); setCardError(true); });
    }
  };

  if (loadingCards) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
        <p className="text-xs text-slate-400 font-bold">Loading sound cards…</p>
      </div>
    );
  }

  if (cardError && soundGroups.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-400">
        <p className="text-lg font-bold">Couldn't load sound cards.</p>
        <button
          onClick={retryLoad}
          className="text-sm text-indigo-500 hover:text-indigo-700 font-bold underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (soundGroups.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-400">
        <p className="text-lg font-bold">No sound wall cards for {curriculumKey || 'this step'}.</p>
        <a
          href="/SoundWallManager"
          className="text-sm text-indigo-500 hover:text-indigo-700 font-bold underline"
        >
          Upload cards in the Sound Wall Manager →
        </a>
      </div>
    );
  }

  const stageLabels = {
    phoneme: { color: 'text-red-500', text: 'We make it this way' },
    camera: { color: 'text-indigo-500', text: 'Now you try it!' },
    grapheme: { color: 'text-green-600', text: 'This sound is written as' },
  };

  const totalStages = soundGroups.reduce((sum, g) => sum + g.stages.length, 0);
  const stagesBefore = soundGroups.slice(0, currentSoundIndex).reduce((sum, g) => sum + g.stages.length, 0);
  const globalProgress = stagesBefore + revealedCount;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Sound pager — one sound per page */}
      <div className="flex-1 flex items-center justify-center min-h-0 p-4 overflow-auto">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-center w-full max-w-5xl">
          {currentStages.map((stage, i) => {
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
                    <p className="text-[10px] text-gray-400 mt-0.5">Match the mouth shape</p>
                  )}
                </div>

                {stage.type === 'camera' ? (
                  <div className="w-full max-w-[320px] aspect-[3/4] rounded-2xl overflow-hidden shadow-lg bg-slate-900">
                    {isRevealed && <CameraMirror className="w-full h-full" />}
                  </div>
                ) : (
                  <div className="w-full max-w-[320px] aspect-[3/4] rounded-2xl overflow-hidden shadow-lg bg-white">
                    {isRevealed && <RevealCard card={stage.card} />}
                  </div>
                )}

                {stage.card?.label && isRevealed && (
                  <div className="text-2xl font-black text-indigo-600">{stage.card.label}</div>
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

      {/* Navigation */}
      <div className="flex items-center justify-center gap-3 p-4 shrink-0 bg-white border-t border-gray-100">
        <button
          onClick={prev}
          disabled={currentSoundIndex === 0 && revealedCount === 1}
          className="px-3 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold inline-flex items-center gap-1 hover:bg-slate-200 disabled:opacity-40"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <span className="text-sm font-bold text-gray-500">
          {globalProgress} / {totalStages}
          {soundGroups.length > 1 && (
            <span className="ml-2 text-indigo-500">
              · Sound {currentSoundIndex + 1} of {soundGroups.length}: /{currentGroup?.grapheme}/
            </span>
          )}
        </span>

        <button
          onClick={next}
          disabled={done}
          className="px-6 py-2.5 rounded-xl bg-green-500 text-white font-bold inline-flex items-center gap-1.5 hover:bg-green-600 disabled:opacity-60"
        >
          {revealedCount < currentStages.length ? (
            <>Show next <ChevronRight className="w-5 h-5" /></>
          ) : currentSoundIndex < soundGroups.length - 1 ? (
            <>Next sound <ChevronRight className="w-5 h-5" /></>
          ) : (
            <><Check className="w-5 h-5" /> {done ? 'Done!' : 'Done'}</>
          )}
        </button>
      </div>
    </div>
  );
}