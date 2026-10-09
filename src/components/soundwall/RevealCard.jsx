import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Loader2, AlertCircle, RotateCcw } from 'lucide-react';

// Renders a Sound Wall card image with optional covers drawn over it.
// The cover whose id matches activeRevealId animates away (slides up + fades)
// when the student taps it, "unlocking" the sound underneath.
// Other covers stay in place as static hidden parts.
//
// The stored image_url is already the red-processed + optimized version
// (the upload flow saves it as image_url), so we display it directly.
// No per-render canvas pixel-scan.
//
// covers: [{ id, x_pct, y_pct, w_pct, h_pct, label }]
// activeRevealId: string | ''
export default function RevealCard({ card, className = '' }) {
  const covers = Array.isArray(card?.covers) ? card.covers : [];
  const activeRevealId = card?.active_reveal_id || '';
  const [revealedIds, setRevealedIds] = useState(() => new Set());
  const processedImageUrl = card?.imageUrl;

  // Image load state: 'loading' | 'loaded' | 'error'
  const [imgState, setImgState] = useState('loading');
  const [retryKey, setRetryKey] = useState(0);

  // Reset revealed state and image load state whenever the card changes.
  useEffect(() => {
    setRevealedIds(new Set());
    setImgState('loading');
  }, [card?.imageUrl, card?.id, retryKey]);

  const reveal = (id) => {
    if (!id) return;
    setRevealedIds((prev) => new Set(prev).add(id));
  };

  return (
    <div className={`relative w-full h-full ${className}`}>
      {processedImageUrl ? (
        <>
          {imgState !== 'error' && (
            <img
              key={retryKey}
              src={processedImageUrl}
              alt={card?.label || 'Sound card'}
              className="absolute inset-0 w-full h-full object-contain"
              onLoad={() => setImgState('loaded')}
              onError={() => setImgState('error')}
              draggable={false}
            />
          )}

          {/* Loading overlay */}
          {imgState === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            </div>
          )}

          {/* Error overlay with retry */}
          {imgState === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50 p-4 text-center">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-xs font-bold text-slate-500">Image failed to load</p>
              <button
                onClick={() => {
                  setImgState('loading');
                  setRetryKey((k) => k + 1);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-xs font-bold shadow hover:bg-indigo-600 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">No image</div>
      )}

      {/* Covers — only show once the image is loaded, so they don't float over a blank card */}
      {imgState === 'loaded' && covers.map((c) => {
        const isActive = c.id === activeRevealId;
        const isRevealed = revealedIds.has(c.id);

        if (!isActive || isRevealed) return null;

        return (
          <motion.div
            key={c.id}
            initial={false}
            animate={isActive ? { y: 0, opacity: 1 } : {}}
            exit={{ y: '-120%', opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
            onClick={() => reveal(c.id)}
            className="absolute rounded-xl flex flex-col items-center justify-center cursor-pointer group"
            style={{
              left: `${c.x_pct}%`,
              top: `${c.y_pct}%`,
              width: `${c.w_pct}%`,
              height: `${c.h_pct}%`,
              background: '#dc2626',
              border: '2px solid #b91c1c',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              zIndex: 10,
            }}
          >
            <Lock className="w-7 h-7 text-white/90 group-hover:scale-110 transition-transform" />
            {c.label && (
              <span className="text-white font-black text-xs sm:text-sm text-center px-2 mt-1 drop-shadow-lg">
                {c.label}
              </span>
            )}
            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-full bg-white/90 text-red-600 text-[10px] font-black flex items-center gap-0.5 animate-pulse">
              <Lock className="w-2.5 h-2.5" /> Tap to unlock
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
            className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-green-500 text-white text-xs font-black shadow-lg"
            style={{ zIndex: 20 }}
          >
            🔓 Unlocked!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}