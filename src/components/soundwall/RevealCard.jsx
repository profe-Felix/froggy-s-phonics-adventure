import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Renders a Sound Wall card image with optional covers drawn over it.
// The cover whose id matches activeRevealId animates away (slides up + fades)
// when the student taps it, unveiling the part of the card underneath.
// Other covers stay in place as static hidden parts.
//
// covers: [{ id, x_pct, y_pct, w_pct, h_pct, label }]
// activeRevealId: string | ''
export default function RevealCard({ card, className = '' }) {
  const covers = Array.isArray(card?.covers) ? card.covers : [];
  const activeRevealId = card?.active_reveal_id || '';
  const [revealedIds, setRevealedIds] = useState(() => new Set());

  // Reset revealed state whenever the card changes (student navigates to a
  // different card) so the reveal can play again fresh.
  useEffect(() => {
    setRevealedIds(new Set());
  }, [card?.imageUrl, card?.id]);

  const reveal = (id) => {
    if (!id) return;
    setRevealedIds((prev) => new Set(prev).add(id));
  };

  return (
    <div className={`relative w-full h-full ${className}`}>
      {card?.imageUrl ? (
        <img src={card.imageUrl} alt={card?.label || 'Sound card'} className="absolute inset-0 w-full h-full object-contain" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">No image</div>
      )}

      {/* Covers */}
      {covers.map((c) => {
        const isActive = c.id === activeRevealId;
        const isRevealed = revealedIds.has(c.id);

        // Non-active covers are always visible (static hidden parts).
        // The active cover is visible until the student taps to reveal it.
        if (!isActive || isRevealed) return null;

        return (
          <motion.div
            key={c.id}
            initial={false}
            animate={isActive ? { y: 0, opacity: 1 } : {}}
            exit={{ y: '-120%', opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
            onClick={() => reveal(c.id)}
            className="absolute rounded-xl flex items-center justify-center cursor-pointer group"
            style={{
              left: `${c.x_pct}%`,
              top: `${c.y_pct}%`,
              width: `${c.w_pct}%`,
              height: `${c.h_pct}%`,
              background: 'rgba(220,38,38,0.5)',
              border: '2px solid #dc2626',
              boxShadow: '0 0 0 3px rgba(220,38,38,0.2)',
            }}
          >
            {c.label && (
              <span className="text-white font-black text-sm sm:text-base text-center px-2 drop-shadow-lg">
                {c.label}
              </span>
            )}
            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-full bg-white/80 text-red-600 text-[10px] font-black flex items-center gap-0.5 animate-pulse">
              👆 tap to reveal
            </span>
          </motion.div>
        );
      })}

      {/* Reveal confirmation flash */}
      <AnimatePresence>
        {activeRevealId && revealedIds.has(activeRevealId) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-green-500 text-white text-xs font-black shadow-lg"
          >
            ✓ Revealed!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}