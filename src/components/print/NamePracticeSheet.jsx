import GuideKeyVisual, { R_BASE_F } from '@/components/tracing/GuideKeyVisual';

export default function NamePracticeSheet({ student, mode = 'first', fontSize = 1.35, lineSize = 0.7, offset = 0,
  emojiHeightFactor, emojiFeetFactor, emojiSpacingRatio, emojiXRatio, fenceGapRatio, fenceWidthRatio, fenceOffsetRatio }) {
  const tokens = (student?.student_name || student?.name || '').trim().split(/\s+/).filter(Boolean);
  const first = tokens[0] || '';
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : '';
  const rows = mode === 'firstlast' ? [first, last, first, last] : [first, first, first, first];

  // GuideKeyVisual viewBox — sized in hundredths of an inch so the aspect
  // ratio matches the practice-set (width: 2in, height: 3 * lineSize in).
  const vbW = 200;
  const gUnits = lineSize * 100;
  const vbH = 3 * gUnits;

  // Compute fence end from ratio-based settings (mirrors GuideKeyVisual logic)
  // so the name text starts past the fence, not overlapping it.
  const capZoneH = 2 * gUnits; // grassY - skyY
  const grassH = gUnits;       // grassY - fenceY
  const capFSize = capZoneH * emojiHeightFactor;
  const fenceEnd = capFSize * (R_BASE_F + emojiXRatio + emojiSpacingRatio + fenceGapRatio) + grassH * fenceWidthRatio;
  // Gap after fence mirrors WordTracingCanvas: ~77 units in a 600-unit canvas
  // → proportional gap in the 200-unit viewBox, plus a small fixed margin.
  const gapUnits = fenceEnd * 0.17;
  const textLeftIn = (fenceEnd + gapUnits) / 100;

  return (
    <div className="page-preview">
      <div className="practice-sheet" style={{ '--f': `${fontSize}in`, '--g': `${lineSize}in`, '--offset': `${offset}in` }}>
        {rows.map((name, i) => (
          <div className="practice-set" key={i}>
            <svg
              className="practice-guide-visual"
              viewBox={`0 0 ${vbW} ${vbH}`}
              preserveAspectRatio="none"
            >
              <GuideKeyVisual
                skyY={0}
                fenceY={gUnits}
                grassY={2 * gUnits}
                dirtY={3 * gUnits}
                emojiHeightFactor={emojiHeightFactor}
                emojiFeetFactor={emojiFeetFactor}
                emojiSpacingRatio={emojiSpacingRatio}
                emojiXRatio={emojiXRatio}
                fenceGapRatio={fenceGapRatio}
                fenceWidthRatio={fenceWidthRatio}
                fenceOffsetRatio={fenceOffsetRatio}
              />
            </svg>
            <div className="practice-line top" />
            <div className="practice-line mid" />
            <div className="practice-line base" />
            <div className="practice-line desc" />
            <div className="practice-text" style={{ left: `${textLeftIn}in` }}>{name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}