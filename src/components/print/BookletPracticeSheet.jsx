import GuideKeyVisual, { R_BASE_F } from '@/components/tracing/GuideKeyVisual';

/**
 * A single landscape page of a blank handwriting practice booklet.
 * No name — just guide lines teachers can print at adjustable scale.
 * Fixed 6 rows per page. Optional guide visual and page number.
 */
export default function BookletPracticeSheet({ fontSize = 1.35, lineSize = 0.67, offset = 0, pageNumber, showGuides = true, showPageNumber = true, ...gs }) {
  const rows = 6;

  // GuideKeyVisual geometry — mirrors NamePracticeSheet
  const vbW = 300;
  const gUnits = lineSize * 100;
  const vbH = 3 * gUnits;
  const capZoneH = 2 * gUnits;
  const grassH = gUnits;
  const capFSize = capZoneH * gs.emojiHeightFactor;
  const fenceEnd = capFSize * (R_BASE_F + gs.emojiXRatio + gs.emojiSpacingRatio + gs.fenceGapRatio) + grassH * gs.fenceWidthRatio;
  const gapUnits = 30;
  const textLeftIn = (fenceEnd + gapUnits) / 100;

  return (
    <div className="booklet-page">
      <div className="practice-sheet" style={{ '--f': `${fontSize}in`, '--g': `${lineSize}in`, '--offset': `${offset}in` }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div className="practice-set" key={i}>
            {showGuides && (
              <svg className="practice-guide-visual" viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="none">
                <GuideKeyVisual
                  skyY={0}
                  fenceY={gUnits}
                  grassY={2 * gUnits}
                  dirtY={3 * gUnits}
                  emojiHeightFactor={gs.emojiHeightFactor}
                  emojiFeetFactor={gs.emojiFeetFactor}
                  emojiSpacingRatio={gs.emojiSpacingRatio}
                  emojiXRatio={gs.emojiXRatio}
                  fenceGapRatio={gs.fenceGapRatio}
                  fenceWidthRatio={gs.fenceWidthRatio}
                  fenceOffsetRatio={gs.fenceOffsetRatio}
                />
              </svg>
            )}
            <div className="practice-line top" />
            <div className="practice-line mid" />
            <div className="practice-line base" />
            <div className="practice-line desc" />
            <div className="practice-text" style={{ left: showGuides ? `${textLeftIn}in` : '0.3in' }} />
          </div>
        ))}
      </div>
      {showPageNumber && <div className="booklet-page-number">{pageNumber}</div>}
    </div>
  );
}