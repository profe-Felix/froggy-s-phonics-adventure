import React, { useRef, useState, useEffect, useMemo } from 'react';
import { parseText } from './phonetics';

// Letter Ink Fill — renders the target text as individual letter spans using
// CSS background-clip: text.  Each letter fills upward with colored ink as the
// student sustains their voice (driven by the `continuity` 0-1 value from
// useLiveVoice).  Vowels get coral ink; consonants get teal ink; silent letters
// (h, punctuation, spaces) stay faint.  The Teachers font is used throughout.
//
// The text is always visible faintly via a thin -webkit-text-stroke; the
// gradient fill rises from the bottom of each letter as continuity increases.

const VOWELS = 'aeiouáéíóúüAEIOUÁÉÍÓÚÜ';

function getInkColor(char) {
  if (VOWELS.includes(char)) return '#ff6b6b'; // coral
  if (char.toLowerCase() === 'h') return null; // silent
  if (/^\s$/.test(char)) return null; // space
  if (/[.,!?;:¿¡"«»()]/.test(char)) return null; // punctuation
  return '#14b8a6'; // teal
}

export default function LetterInkFillOverlay({ text, continuity = 0 }) {
  const containerRef = useRef(null);
  const [fontSize, setFontSize] = useState(120);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Measure container via ResizeObserver so the font size adapts to any screen
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Calculate the largest font size that fits the text on one line
  useEffect(() => {
    if (containerSize.w === 0 || containerSize.h === 0 || !text) return;

    const padding = 32;
    const maxW = containerSize.w - padding * 2;
    const maxH = containerSize.h - padding * 2;

    const measureCanvas = document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');

    let fs = Math.min(maxH * 0.85, 200);
    ctx.font = `bold ${fs}px Teachers, sans-serif`;
    const fullW = ctx.measureText(text).width;

    if (fullW > maxW) {
      for (; fs >= 24; fs -= 2) {
        ctx.font = `bold ${fs}px Teachers, sans-serif`;
        if (ctx.measureText(text).width <= maxW) break;
      }
    }

    setFontSize(Math.max(24, Math.floor(fs)));
  }, [text, containerSize]);

  // Parse text into individual letters with ink colors
  const letters = useMemo(() => {
    const units = parseText(text);
    const result = [];
    for (const unit of units) {
      for (const char of unit.chars) {
        result.push({
          char: char.char,
          color: getInkColor(char.char),
          isSpace: /^\s$/.test(char.char),
        });
      }
    }
    return result;
  }, [text]);

  // Group letters into words so wrapping happens at word boundaries
  const words = useMemo(() => {
    const result = [];
    let currentWord = [];
    for (const letter of letters) {
      if (letter.isSpace) {
        if (currentWord.length > 0) {
          result.push(currentWord);
          currentWord = [];
        }
      } else {
        currentWord.push(letter);
      }
    }
    if (currentWord.length > 0) result.push(currentWord);
    return result;
  }, [letters]);

  const fillPct = `${(Math.min(1, Math.max(0, continuity)) * 100).toFixed(1)}%`;

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center overflow-hidden" style={{ background: '#ffffff' }}>
      <div style={{
        textAlign: 'center',
        fontFamily: 'Teachers, sans-serif',
        fontWeight: 700,
        fontSize: `${fontSize}px`,
        lineHeight: 1.15,
        padding: '16px',
        maxWidth: '100%',
      }}>
        {words.map((word, wi) => (
          <React.Fragment key={wi}>
            <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
              {word.map((letter, li) => {
                if (letter.color === null) {
                  return (
                    <span key={li} className="ink-letter-faint" style={{ fontSize: `${fontSize}px` }}>
                      {letter.char}
                    </span>
                  );
                }
                return (
                  <span
                    key={li}
                    className="ink-letter"
                    style={{
                      '--ink-color': letter.color,
                      '--fill-pct': fillPct,
                      fontSize: `${fontSize}px`,
                    }}
                  >
                    {letter.char}
                  </span>
                );
              })}
            </span>
            {wi < words.length - 1 && ' '}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}