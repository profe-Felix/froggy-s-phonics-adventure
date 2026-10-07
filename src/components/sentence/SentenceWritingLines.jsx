import React, { useRef, useLayoutEffect, useState, useImperativeHandle } from 'react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import GuideKeyVisual from '@/components/tracing/GuideKeyVisual';
import SentenceModelAnimation from './SentenceModelAnimation';
import { useTracingGuideSettings } from '@/hooks/useTracingGuideSettings';
import { inchesToCssPx } from '@/lib/physicalSize';

// SVG-based handwriting guide lines matching Letter Tracing / Name Tracing size.
// Supports an optional faint "model" sentence printed on a top guide line so
// students can see how the letters sit on the lines, plus N blank practice
// lines below for their own freehand writing (AnnotationCanvas overlay).
const CANVAS_H = 375;
// Line height in physical inches — consistent across phones and tablets.
const LINE_HEIGHT_IN = 1.4;
const LEGACY_LINE_HEIGHT_IN = 1.0;
const SKY_Y = 0.10 * CANVAS_H;
const FENCE_Y = 0.367 * CANVAS_H;
const GRASS_Y = 0.633 * CANVAS_H;
const DIRT_Y = 0.90 * CANVAS_H;
const CAP_ZONE_H = GRASS_Y - SKY_Y;

export default function SentenceWritingLines({
  row, canvasRef, tool, color, size,
  onStrokeStart, onStrokeEnd, onActivateCanvas, onActivate,
  lineCount = 1, modelText = '', active = false, replayKey = 0, activeWordIndex = -1,
  scrub = null, onProgress = null,
}) {
  const containerRef = useRef(null);
  const viewportRef = useRef(null);
  const inkRef = useRef(null);
  const loadedRef = useRef(false);
  const [panMode, setPanMode] = useState(false);
  const hasModel = !!modelText;
  const savedHeight = Number(row.writing_strokes?.canvasHeight);
  const legacyInk = Boolean(row.writing_strokes?.strokes?.length || row.writing_strokes?.history?.length);
  const [lineHeight] = useState(() =>
    savedHeight > 0 ? savedHeight / Math.max(1, lineCount)
      : legacyInk ? inchesToCssPx(LEGACY_LINE_HEIGHT_IN) : inchesToCssPx(LINE_HEIGHT_IN)
  );
  const totalLines = (hasModel ? 1 : 0) + lineCount;
  const totalRenderH = totalLines * lineHeight;
  const modelRenderH = hasModel ? lineHeight : 0;
  const practiceRenderH = lineCount * lineHeight;
  const [dims, setDims] = useState(null);
  const { settings: gs } = useTracingGuideSettings();

  useLayoutEffect(() => {
    if (dims || !containerRef.current) return;
    const saved = row.writing_strokes;
    const savedWidth = Number(saved?.canvasWidth);
    const legacyInk = !savedWidth && Boolean(saved?.strokes?.length || saved?.history?.length);
    const width = savedWidth > 0
      ? savedWidth
      : legacyInk
        ? Math.max(280, Math.round(containerRef.current.getBoundingClientRect().width))
        : 800;
    setDims({ w: width, h: totalRenderH });
  }, [dims, row.writing_strokes, totalRenderH]);

  useImperativeHandle(canvasRef, () => new Proxy({}, {
    get(_, key) {
      if (key === 'getStrokes') {
        return () => {
          if (!loadedRef.current || !inkRef.current || !dims) return undefined;
          return {
            ...inkRef.current.getStrokes(),
            canvasWidth: dims.w,
            canvasHeight: practiceRenderH,
            normalized: true,
          };
        };
      }
      const value = inkRef.current?.[key];
      return typeof value === 'function' ? value.bind(inkRef.current) : value;
    },
  }), [dims?.w, practiceRenderH]);

  useLayoutEffect(() => {
    if (!dims || !inkRef.current || loadedRef.current) return;
    const data = row.writing_strokes;
    inkRef.current.loadStrokes(data && Object.keys(data).length ? data : null);
    loadedRef.current = true;
  }, [dims?.w, row.writing_strokes]);

  // viewBox maintains uniform scale so GuideKeyVisual isn't stretched
  const vbW = (dims?.w || 800) * (CANVAS_H / lineHeight);
  const vbH = totalLines * CANVAS_H;

  // Model sentence auto-fit: the animation component handles its own scaling.
  const modelStartX = 240;
  const modelMaxX = vbW - 40;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 py-1">
        <button type="button" aria-pressed={panMode}
          onClick={() => {
            inkRef.current?.finishPendingStroke?.();
            setPanMode(v => !v);
          }}
          className="min-h-11 rounded-lg border px-3 text-xs font-bold">
          {panMode ? '✍️ Escribir' : '↔ Mover'}
        </button>
        <button type="button" aria-label="Mover a la izquierda"
          onClick={() => viewportRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
          className="min-h-11 min-w-11 rounded-lg border">←</button>
        <button type="button" aria-label="Mover a la derecha"
          onClick={() => viewportRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
          className="min-h-11 min-w-11 rounded-lg border">→</button>
      </div>
      <div ref={viewportRef} className="w-full overflow-x-auto overscroll-x-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}>
        <div ref={containerRef} className="relative"
          style={{ width: dims?.w || '100%', height: totalRenderH }}>
      {dims && <>
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full"
        style={{ background: '#fff' }}
      >
        {Array.from({ length: totalLines }).map((_, i) => {
          const offset = i * CANVAS_H;
          const skyY = SKY_Y + offset;
          const fenceY = FENCE_Y + offset;
          const grassY = GRASS_Y + offset;
          const dirtY = DIRT_Y + offset;
          return (
            <g key={i}>
              <GuideKeyVisual
                skyY={skyY} fenceY={fenceY} grassY={grassY} dirtY={dirtY}
                width={vbW}
                emojiHeightFactor={gs?.emojiHeightFactor}
                emojiFeetFactor={gs?.emojiFeetFactor}
                emojiSpacingRatio={gs?.emojiSpacingRatio}
                emojiXRatio={gs?.emojiXRatio}
                fenceGapRatio={gs?.fenceGapRatio}
                fenceWidthRatio={gs?.fenceWidthRatio}
                fenceOffsetRatio={gs?.fenceOffsetRatio}
              />
              {/* Sky line (blue) */}
              <line x1="0" y1={skyY} x2={vbW} y2={skyY} stroke="#4a90e2" strokeWidth="2.5" opacity="0.8" vectorEffect="non-scaling-stroke" />
              {/* Fence line (dashed black) */}
              <line x1="0" y1={fenceY} x2={vbW} y2={fenceY} stroke="#000" strokeWidth="2" strokeDasharray="8 6" opacity="0.8" vectorEffect="non-scaling-stroke" />
              {/* Grass line / baseline (green) */}
              <line x1="0" y1={grassY} x2={vbW} y2={grassY} stroke="#16a34a" strokeWidth="2.5" opacity="0.8" vectorEffect="non-scaling-stroke" />
              {/* Dirt line (dashed brown) */}
              <line x1="0" y1={dirtY} x2={vbW} y2={dirtY} stroke="#8d6e63" strokeWidth="2.5" strokeDasharray="6 6" opacity="0.85" vectorEffect="non-scaling-stroke" />
              {/* Animated model sentence — letter pathways drawn stroke by stroke */}
              {hasModel && i === 0 && modelText && (
                <SentenceModelAnimation
                  text={modelText}
                  startX={modelStartX}
                  maxX={modelMaxX}
                  lineIndex={0}
                  activeWordIndex={activeWordIndex}
                  replayKey={replayKey}
                  scrub={scrub}
                  onProgress={onProgress}
                />
              )}
            </g>
          );
        })}
      </svg>
      {/* Annotation canvas overlays only the practice lines (not the model) */}
      <div
        className="absolute left-0 right-0"
        style={{ top: modelRenderH, height: practiceRenderH }}
      >
        <AnnotationCanvas
          ref={inkRef}
          passThrough={panMode}
          scrollContainerRef={viewportRef}
          width={dims.w}
          height={practiceRenderH}
          color={color}
          size={size}
          tool={tool}
          onStrokeStart={() => { onStrokeStart?.(); onActivateCanvas?.(canvasRef); onActivate?.(); }}
          onStrokeEnd={onStrokeEnd}
        />
      </div>
      </>}
        </div>
      </div>
    </div>
  );
}