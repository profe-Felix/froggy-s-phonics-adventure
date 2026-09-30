import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Volume2, RotateCw, ChevronRight, RefreshCw } from 'lucide-react';
import { playTts } from '@/lib/audio';
import SentenceWritingLines from './SentenceWritingLines';

// A single numbered sentence-writing area with SVG handwriting guide lines,
// a faint model sentence, TTS speaker, and word-by-word letter animation:
// "Ver letras" writes the first word while TTS says it, then "Siguiente"
// advances to the next word.
export default function SentenceWritingArea({
  index, row, sentenceText,
  tool, color, size,
  onStrokeStart, onStrokeEnd, onActivateCanvas,
  onTypedTextChange, onSelfCheckChange,
  active, onActivate,
  canvasRef,
}) {
  const [replayKey, setReplayKey] = useState(0);
  const [wordIndex, setWordIndex] = useState(-1); // -1 = not started
  const [scrub, setScrub] = useState(null); // null = auto-animate, 0-1 = scrubbing
  const [sliderValue, setSliderValue] = useState(0);
  const scrubRef = useRef(null);
  scrubRef.current = scrub;

  const words = useMemo(() => sentenceText ? sentenceText.split(' ') : [], [sentenceText]);
  const hasMore = wordIndex >= 0 && wordIndex < words.length - 1;
  const isDone = wordIndex === words.length - 1 && words.length > 0;

  const handlePlay = (e) => {
    e.stopPropagation();
    if (sentenceText) playTts(sentenceText, 'es', 0.85);
  };

  // Start word-by-word: write first word + TTS says it
  const handleReplay = (e) => {
    e.stopPropagation();
    setScrub(null);
    setSliderValue(0);
    setWordIndex(0);
    setReplayKey((k) => k + 1);
    if (words[0]) playTts(words[0], 'es', 0.85);
  };

  // Next word: write it + TTS says it
  const handleNext = (e) => {
    e.stopPropagation();
    setScrub(null);
    setSliderValue(0);
    setWordIndex((i) => {
      const ni = Math.min(i + 1, words.length - 1);
      if (words[ni]) playTts(words[ni], 'es', 0.85);
      return ni;
    });
    setReplayKey((k) => k + 1);
  };

  // Restart from the beginning
  const handleRestart = (e) => {
    e.stopPropagation();
    setScrub(null);
    setSliderValue(0);
    setWordIndex(-1);
    setReplayKey((k) => k + 1);
  };

  // Report animation progress to the scrub bar (only when auto-animating)
  const handleProgress = useCallback((norm) => {
    if (scrubRef.current === null) setSliderValue(norm);
  }, []);

  return (
    <div
      className={`rounded-xl border-2 transition-all ${active ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-300'}`}
      onClick={onActivate}
    >
      {/* Row number + mode badge + controls */}
      <div className="flex items-center gap-2 px-2 pt-2">
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-800 text-white text-sm font-bold">
          {index + 1}
        </span>
        <span className="text-xs font-bold text-slate-500">
          {row.mode === '3part' ? '3 partes' : '2 partes'}
        </span>
        {active && (
          <span className="text-[10px] font-bold text-indigo-500 animate-pulse">✏️ Editando</span>
        )}
        {wordIndex >= 0 && words.length > 1 && (
          <span className="text-[10px] font-bold text-teal-600">
            Palabra {wordIndex + 1}/{words.length}
          </span>
        )}
        <div className="flex-1" />
        {sentenceText && (
          <>
            {/* Restart — show when all words are done */}
            {isDone && (
              <button
                onClick={handleRestart}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all"
                title="Reiniciar"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reiniciar
              </button>
            )}
            {/* Next word — show when there are more words */}
            {hasMore && (
              <button
                onClick={handleNext}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 active:scale-95 transition-all"
                title="Siguiente palabra"
              >
                <ChevronRight className="w-3.5 h-3.5" /> Siguiente
              </button>
            )}
            {/* Start / replay from first word */}
            <button
              onClick={handleReplay}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold text-teal-700 bg-teal-100 hover:bg-teal-200 active:scale-95 transition-all"
              title="Ver cómo se escriben las letras"
            >
              <RotateCw className="w-3.5 h-3.5" /> Ver letras
            </button>
            <button
              onClick={handlePlay}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-600 active:scale-95 transition-all"
              title="Escuchar la oración"
            >
              <Volume2 className="w-3.5 h-3.5" /> Escuchar
            </button>
          </>
        )}
      </div>

      {/* Scrub bar — drag to replay/scrub through the current word's letter animation */}
      {wordIndex >= 0 && words.length > 0 && (
        <div className="flex items-center gap-2 px-3 pb-1">
          <RotateCw className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
          <input
            type="range"
            min="0"
            max="1000"
            value={Math.round(sliderValue * 1000)}
            onChange={(e) => {
              const v = parseFloat(e.target.value) / 1000;
              setScrub(v);
              setSliderValue(v);
            }}
            onMouseUp={() => setScrub(null)}
            onTouchEnd={() => setScrub(null)}
            className="flex-1 h-2 accent-teal-600 cursor-pointer"
          />
          <span className="text-[10px] font-bold text-slate-400 w-8 text-right">
            {Math.round(sliderValue * 100)}%
          </span>
        </div>
      )}

      {/* Writing area — model sentence on top guide line + 2 practice lines */}
      <div className="mx-2 mt-1 mb-1">
        <SentenceWritingLines
          row={row}
          canvasRef={canvasRef}
          tool={tool}
          color={color}
          size={size}
          onStrokeStart={onStrokeStart}
          onStrokeEnd={onStrokeEnd}
          onActivateCanvas={onActivateCanvas}
          onActivate={onActivate}
          lineCount={2}
          modelText={sentenceText || ''}
          active={active}
          replayKey={replayKey}
          activeWordIndex={wordIndex}
          scrub={scrub}
          onProgress={handleProgress}
        />
      </div>

    </div>
  );
}