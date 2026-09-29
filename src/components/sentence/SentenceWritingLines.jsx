import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import AnnotationCanvas from '@/components/notebook/AnnotationCanvas';
import GuideKeyVisual from '@/components/tracing/GuideKeyVisual';
import { useTracingGuideSettings } from '@/hooks/useTracingGuideSettings';

// SVG-based handwriting guide lines matching Letter Tracing / Name Tracing size.
// Uses the same CANVAS_H, Y-fractions, and GuideKeyVisual as NameTracingCanvas
// so the emoji guys + fence appear on the left and only color a small portion
// of the line — not the full width. An AnnotationCanvas overlay sits on top
// for freehand writing.
const CANVAS_H = 375;
const RENDER_H = 200; // ~Letter Tracing Medium size
const SKY_Y = 0.10 * CANVAS_H;
const FENCE_Y = 0.367 * CANVAS_H;
const GRASS_Y = 0.633 * CANVAS_H;
const DIRT_Y = 0.90 * CANVAS_H;

export default function SentenceWritingLines({
  row, canvasRef, tool, color, size,
  onStrokeStart, onStrokeEnd, onActivateCanvas, onActivate,
}) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 300, h: RENDER_H });
  const { settings: gs } = useTracingGuideSettings();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setDims({ w: Math.round(width), h: RENDER_H });
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

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
  const vbW = dims.w * (CANVAS_H / RENDER_H);

  return (
    <div ref={containerRef} className="relative" style={{ height: RENDER_H }}>
      <svg
        viewBox={`0 0 ${vbW} ${CANVAS_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full"
        style={{ background: '#fff' }}
      >
        <GuideKeyVisual
          skyY={SKY_Y} fenceY={FENCE_Y} grassY={GRASS_Y} dirtY={DIRT_Y}
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
        <line x1="0" y1={SKY_Y} x2={vbW} y2={SKY_Y} stroke="#4a90e2" strokeWidth="2.5" opacity="0.8" vectorEffect="non-scaling-stroke" />
        {/* Fence line (dashed black) */}
        <line x1="0" y1={FENCE_Y} x2={vbW} y2={FENCE_Y} stroke="#000" strokeWidth="2" strokeDasharray="8 6" opacity="0.8" vectorEffect="non-scaling-stroke" />
        {/* Grass line / baseline (green) */}
        <line x1="0" y1={GRASS_Y} x2={vbW} y2={GRASS_Y} stroke="#16a34a" strokeWidth="2.5" opacity="0.8" vectorEffect="non-scaling-stroke" />
        {/* Dirt line (dashed brown) */}
        <line x1="0" y1={DIRT_Y} x2={vbW} y2={DIRT_Y} stroke="#8d6e63" strokeWidth="2.5" strokeDasharray="6 6" opacity="0.85" vectorEffect="non-scaling-stroke" />
      </svg>
      <AnnotationCanvas
        ref={canvasRef}
        width={dims.w}
        height={dims.h}
        color={color}
        size={size}
        tool={tool}
        onStrokeStart={() => { onStrokeStart?.(); onActivateCanvas?.(canvasRef); onActivate?.(); }}
        onStrokeEnd={onStrokeEnd}
      />
    </div>
  );
}