import React from 'react';

// Sentence-patterning color coding for "Creando oraciones".
// Each word in the assembled sentence is colored by its part of speech:
//   Nouns            → green
//   Female articles  → pink        (la, las, una, unas)
//   Male articles    → light blue  (el, los, un, unos)
//   Verbs            → orange      (first word of the ¿Qué? card)
//   Prepositions     → dark blue   (en, a, de, con, …)
//
// The category-level colors (¿Quién?=green, ¿Qué?=orange, ¿Dónde?=dark blue)
// are defined in CARD_CATEGORIES; this component handles the word-level
// coloring inside the assembled sentence display.

const FEMALE_ARTICLES = new Set(['la', 'las', 'una', 'unas']);
const MALE_ARTICLES = new Set(['el', 'los', 'un', 'unos']);
const PREPOSITIONS = new Set(['en', 'a', 'de', 'del', 'con', 'por', 'para', 'sin', 'sobre', 'bajo', 'desde', 'hacia', 'entre']);

export const WORD_COLORS = {
  noun: '#16a34a',
  femaleArticle: '#ec4899',
  maleArticle: '#38bdf8',
  verb: '#f97316',
  preposition: '#1d4ed8',
};

function classifyWord(word, category, wordIndexInCard) {
  const lower = word.toLowerCase().replace(/[.,¡!¿?]/g, '');
  if (FEMALE_ARTICLES.has(lower)) return 'femaleArticle';
  if (MALE_ARTICLES.has(lower)) return 'maleArticle';
  if (PREPOSITIONS.has(lower)) return 'preposition';
  if (category === 'what' && wordIndexInCard === 0) return 'verb';
  return 'noun';
}

// Build [{ word, color }] segments from the three card texts.
export function colorizeSentence(whoText, whatText, whereText, mode) {
  const segments = [];
  const addCard = (text, category) => {
    text.split(/\s+/).filter(Boolean).forEach((word, idx) => {
      const type = classifyWord(word, category, idx);
      segments.push({ word, color: WORD_COLORS[type] });
    });
  };
  addCard(whoText || '', 'who');
  addCard(whatText || '', 'what');
  if (mode === '3part' && whereText) addCard(whereText || '', 'where');
  return segments;
}

// Renders the assembled sentence with each word colored by part of speech.
// Mirrors assembleSentence() (capitalize first letter, period after what in
// 2-part mode, where cards already end with a period in 3-part mode).
export default function ColoredSentence({ whoCard, whatCard, whereCard, mode, className = '', style = {} }) {
  const segments = colorizeSentence(whoCard?.text || '', whatCard?.text || '', whereCard?.text || '', mode);
  if (segments.length === 0) return null;

  // Capitalize the first word.
  segments[0].word = segments[0].word.charAt(0).toUpperCase() + segments[0].word.slice(1);
  // 2-part mode: add a final period if the last word doesn't already have one.
  if (mode !== '3part') {
    const last = segments[segments.length - 1];
    if (!last.word.endsWith('.')) last.word += '.';
  }

  return (
    <span className={className} style={style}>
      {segments.map((seg, i) => (
        <span key={i} style={{ color: seg.color }}>
          {seg.word}{i < segments.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}