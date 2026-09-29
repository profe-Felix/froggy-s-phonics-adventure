import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CARDS_BY_CATEGORY, CARD_MAP } from '@/components/data/sentenceCards';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';

// A single card category slot — shows the selected card image, a Girar (spin)
// button, and supports B&W coloring via an overlaid AnnotationCanvas.
// Tapping the card opens the picker to choose a specific card.
export default function CardSlot({
  category, selectedCardId, onSelectCard, artMode,
  coloringStrokes, onColoringChange,
  tool, color, size, onStrokeStart, onStrokeEnd, onActivateCanvas,
  spinning, onSpinStart, spinSignal = 0,
}) {
  const cards = CARDS_BY_CATEGORY[category.id];
  const [displayCardId, setDisplayCardId] = useState(selectedCardId);
  const canvasRef = useRef(null);
  const spinTimers = useRef([]);

  const selectedCard = CARD_MAP[selectedCardId];
  const displayCard = CARD_MAP[displayCardId] || cards[0];
  const imgUrl = artMode === 'bw' ? displayCard?.bw : displayCard?.color;

  // Slot-reel spin: cycle through cards fast, then slow down and stop on random.
  const handleSpin = useCallback(() => {
    if (spinning) return;
    onSpinStart();
    // Clear any pending timers
    spinTimers.current.forEach(t => clearTimeout(t));
    spinTimers.current = [];

    const totalCycles = 15 + Math.floor(Math.random() * 8);
    let cycle = 0;

    const tick = () => {
      const card = cards[cycle % cards.length];
      setDisplayCardId(card.id);
      cycle++;
      if (cycle < totalCycles) {
        // Ease out: start at 60ms, increase to 250ms
        const progress = cycle / totalCycles;
        const delay = 60 + Math.pow(progress, 2) * 190;
        const timer = setTimeout(tick, delay);
        spinTimers.current.push(timer);
      } else {
        // Stop on a random card
        const finalCard = cards[Math.floor(Math.random() * cards.length)];
        setDisplayCardId(finalCard.id);
        onSelectCard(finalCard.id);
      }
    };
    tick();
  }, [cards, spinning, onSelectCard, onSpinStart]);

  // Sync display when selection changes externally (e.g. from picker)
  useEffect(() => {
    if (!spinning) setDisplayCardId(selectedCardId);
  }, [selectedCardId, spinning]);

  // External spin trigger (from "Girar todo" button)
  useEffect(() => {
    if (spinSignal > 0) handleSpin();
  }, [spinSignal]);

  // Load coloring strokes when card changes
  React.useEffect(() => {
    if (!canvasRef.current) return;
    const data = coloringStrokes?.[displayCardId];
    canvasRef.current.loadStrokes(data || null);
  }, [displayCardId, coloringStrokes]);

  const handleStrokeEnd = () => {
    onStrokeEnd?.();
    if (canvasRef.current && artMode === 'bw' && displayCardId) {
      const strokes = canvasRef.current.getStrokes();
      onColoringChange?.(displayCardId, strokes);
    }
  };

  return (
    <div
      className="flex flex-col items-center gap-1"
      style={{ background: category.bg, borderRadius: 12, padding: '8px 6px', border: `2px solid ${category.border}` }}
    >
      <p className="text-sm font-bold" style={{ color: category.color }}>{category.label}</p>
      <div
        className="relative bg-white rounded-lg overflow-hidden flex items-center justify-center"
        style={{ width: '100%', height: 100, border: '2px solid #1a1a2e', cursor: 'pointer' }}
        onClick={() => !spinning && onSelectCard?.(displayCardId, true)}
      >
        {displayCardId ? (
          <img
            src={imgUrl}
            alt={displayCard?.text}
            className="max-w-full max-h-full object-contain p-1"
            draggable={false}
          />
        ) : (
          <span className="text-slate-300 text-xs text-center px-2">Presiona Girar o toca para elegir</span>
        )}
        {/* Coloring canvas overlay — only active in B&W mode */}
        {artMode === 'bw' && (
          <AnnotationCanvas
            ref={canvasRef}
            width={200}
            height={100}
            color={color}
            size={size}
            tool={tool}
            onStrokeStart={() => { onStrokeStart?.(); onActivateCanvas?.(canvasRef); }}
            onStrokeEnd={handleStrokeEnd}
          />
        )}
      </div>
      <p className="text-xs font-medium text-slate-700 text-center min-h-[1em] leading-tight">
        {displayCard?.text || ''}
      </p>
      <button
        onClick={handleSpin}
        disabled={spinning}
        className="px-3 py-1 rounded-full text-xs font-bold text-white shadow transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
        style={{ background: category.color }}
      >
        🎰 Girar
      </button>
    </div>
  );
}