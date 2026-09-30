import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import GuideKeyVisual from '@/components/tracing/GuideKeyVisual';
import SentenceModelAnimation from './SentenceModelAnimation';
import { useTracingGuideSettings } from '@/hooks/useTracingGuideSettings';

// SVG-based handwriting guide lines matching Letter Tracing / Name Tracing size.
// Supports an optional faint "model" sentence printed on a top guide line so
// students can see how the letters sit on the lines, plus N blank practice
// lines below for their own freehand writing (AnnotationCanvas overlay).
const CANVAS_H = 375;
const RENDER_H_PER_LINE = 100; // half of Letter Tracing Medium — compact per line
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
  const hasModel = !!modelText;
  const totalLines = (hasModel ? 1 : 0) + lineCount;
  const totalRenderH = totalLines * RENDER_H_PER_LINE;
  const modelRenderH = hasModel ? RENDER_H_PER_LINE : 0;
  const practiceRenderH = lineCount * RENDER_H_PER_LINE;
  const [dims, setDims] = useState({ w: 300, h: totalRenderH });
  const { settings: gs } = useTracingGuideSettings();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDims({ w: Math.round(width), h: totalRenderH });
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, [totalRenderH]);

  useLayoutEffect(() => {
    if (!canvasRef.current) return;
    const data = row.writing_strokes;
    if (data && Object.keys(data).length > 0) {
      canvasRef.current.loadStrokes(data);
    } else {
      canvasRef.current.loadStrokes(null);
    }
  }, [row.writing_strokes]);

  // viewBox maintains uniform scale so GuideKeyVisual isn't stretched
  const vbW = dims.w * (CANVAS_H / RENDER_H_PER_LINE);
  const vbH = totalLines * CANVAS_H;

  // Model sentence auto-fit: the animation component handles its own scaling.
  const modelStartX = 240;
  const modelMaxX = vbW - 40;

  return (
    <div ref={containerRef} className="relative" style={{ height: totalRenderH }}>
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
          ref={canvasRef}
          width={dims.w}
          height={practiceRenderH}
          color={color}
          size={size}
          tool={tool}
          onStrokeStart={() => { onStrokeStart?.(); onActivateCanvas?.(canvasRef); onActivate?.(); }}
          onStrokeEnd={onStrokeEnd}
        />
      </div>
    </div>
  );
}