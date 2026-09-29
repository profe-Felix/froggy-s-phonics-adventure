import React from 'react';
import { CARDS_BY_CATEGORY } from '@/components/data/sentenceCards';

// Grid picker — shows all 18 cards in a category so the student can tap
// to choose a specific one instead of spinning.
export default function CardPicker({ category, artMode, selectedCardId, onSelect, onClose }) {
  const cards = CARDS_BY_CATEGORY[category.id];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg" style={{ color: category.color }}>
            {category.label} — Elige una tarjeta
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() => { onSelect(card.id); onClose(); }}
              className={`rounded-lg p-1 border-2 transition-all hover:scale-105 ${
                selectedCardId === card.id ? 'border-indigo-500 ring-2 ring-indigo-300' : 'border-slate-200'
              }`}
              style={{ background: '#fff' }}
            >
              <img
                src={artMode === 'bw' ? card.bw : card.color}
                alt={card.text}
                className="w-full h-20 object-contain"
                draggable={false}
              />
              <p className="text-[10px] font-medium text-slate-700 text-center mt-0.5 leading-tight">
                {card.text}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}