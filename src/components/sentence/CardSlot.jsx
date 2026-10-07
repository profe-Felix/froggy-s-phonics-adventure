import React, { useState, useRef, useCallback, useEffect } from 'react';
import { CARDS_BY_CATEGORY, CARD_MAP } from '@/components/data/sentenceCards';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';

// A single card category slot — shows the selected card image, a Girar (spin)
// button, and supports B&W coloring via an overlaid AnnotationCanvas.
// Tapping the card opens the picker to choose a specific card.
export default function CardSlot({
  category, selectedCardId, onSelectCard, artMode, mode,
  coloringStrokes, onColoringChange,
  tool, color, size, onStrokeStart, onStrokeEnd, onActivateCanvas,
  spinning, onSpinStart, spinSignal = 0,
}) {
  const cards = CARDS_BY_CATEGORY[category.id];
  const [displayCardId, setDisplayCardId] = useState(selectedCardId);
  const [isSpinning, setIsSpinning] = useState(false);
  const [reel, setReel] = useState([]);
  const [offset, setOffset] = useState(0);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const startRef = useRef(null);

  const ITEM_H = 100;
  const imageFrameRef = useRef(null);
  const [cardWidth, setCardWidth] = useState(200);
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px), (max-height: 500px)').matches
  );
  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px), (max-height: 500px)');
    const update = () => setCompact(query.matches);
    update();
    if (query.addEventListener) query.addEventListener('change', update);
    else query.addListener(update);
    return () => {
      if (query.removeEventListener) query.removeEventListener('change', update);
      else query.removeListener(update);
    };
  }, []);
  useEffect(() => {
    const frame = imageFrameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(entries => {
      setCardWidth(Math.max(1, Math.round(entries[0].contentRect.width)));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const cardHeight = compact ? 64 : 100;
  const SPIN_MS = 2600;

  const selectedCard = CARD_MAP[selectedCardId];
  const displayCard = CARD_MAP[displayCardId] || cards[0];
  const imgUrl = artMode === 'bw' ? displayCard?.bw : displayCard?.color;

  // Smooth vertical reel spin — same approach as the prize wheel.
  const handleSpin = useCallback(() => {
    if (spinning) return;
    onSpinStart();
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const finalCard = cards[Math.floor(Math.random() * cards.length)];

    // Build a long reel cycling through the cards, with the winner near the end.
    const REEL_LEN = 30;
    const tiles = [];
    for (let i = 0; i < REEL_LEN; i++) {
      tiles.push(cards[i % cards.length]);
    }
    const winIdx = REEL_LEN - 4;
    tiles[winIdx] = finalCard;

    setReel(tiles);
    setOffset(0);
    setIsSpinning(true);

    const target = winIdx * ITEM_H;
    startRef.current = null;

    const easeOut = (t) => 1 - Math.pow(1 - t, 4);

    const animate = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp;
      const progress = Math.min((timestamp - startRef.current) / SPIN_MS, 1);
      setOffset(target * easeOut(progress));
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setOffset(target);
        setIsSpinning(false);
        setDisplayCardId(finalCard.id);
        setReel([]);
        onSelectCard(finalCard.id);
      }
    };
    animRef.current = requestAnimationFrame(animate);
  }, [cards, spinning, onSelectCard, onSpinStart]);

  // Cancel any in-flight animation on unmount
  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

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
        ref={imageFrameRef}
        className="relative bg-white rounded-lg overflow-hidden flex items-center justify-center"
        style={{ width: '100%', height: cardHeight, border: '2px solid #1a1a2e', cursor: 'pointer' }}
        onClick={() => !spinning && onSelectCard?.(displayCardId, true)}
      >
        {isSpinning && reel.length > 0 ? (
          <div style={{ height: cardHeight, overflow: 'hidden', position: 'relative', width: '100%' }}>
            <div style={{ transform: `translateY(${-offset}px)`, willChange: 'transform' }}>
              {reel.map((card, i) => (
                <div key={i} style={{ height: ITEM_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img
                    src={artMode === 'bw' ? card?.bw : card?.color}
                    alt=""
                    className="max-w-full max-h-full object-contain p-1"
                    draggable={false}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : displayCardId ? (
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
            width={cardWidth}
            height={cardHeight}
            color={color}
            size={size}
            tool={tool}
            onStrokeStart={() => { onStrokeStart?.(); onActivateCanvas?.(canvasRef); }}
            onStrokeEnd={handleStrokeEnd}
          />
        )}
      </div>
      <p className="text-xs font-medium text-slate-700 text-center min-h-[1em] leading-tight">
        {displayCard?.text || ''}{mode === '2part' && category.id === 'what' && displayCard?.text ? '.' : ''}
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