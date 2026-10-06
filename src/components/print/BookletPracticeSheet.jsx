import GuideKeyVisual, { R_BASE_F } from '@/components/tracing/GuideKeyVisual';

/**
 * A single landscape page of a handwriting practice booklet.
 * Auto-calculates the number of practice rows that fit in the available height
 * based on the (already-scaled) line size.
 */
export default function BookletPracticeSheet({ student, mode = 'first', fontSize = 1.35, lineSize = 0.67, offset = 0, pageNumber, totalPages, ...gs }) {
  const fullName = (student?.student_name || student?.name || '').trim();
  const tokens = fullName.split(/\s+/).filter(Boolean);
  const first = tokens[0] || '';
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : '';

  // Available height for practice rows (landscape 8.5in minus padding/title/footer)
  const availHeightIn = 7.0;
  // Each practice-set is 3 * lineSize tall, plus lineSize gap between sets.
  // Total = n * 3g + (n-1) * g = g * (4n - 1)  →  n = (avail/g + 1) / 4
  const rows = Math.max(1, Math.min(12, Math.floor((availHeightIn / lineSize + 1) / 4)));

  const nameRows = mode === 'firstlast'
    ? Array.from({ length: rows }, (_, i) => (i % 2 === 0 ? first : last))
    : Array.from({ length: rows }, () => first);

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
      <div className="booklet-title">{fullName}</div>
      <div className="practice-sheet" style={{ '--f': `${fontSize}in`, '--g': `${lineSize}in`, '--offset': `${offset}in` }}>
        {nameRows.map((name, i) => (
          <div className="practice-set" key={i}>
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
            <div className="practice-line top" />
            <div className="practice-line mid" />
            <div className="practice-line base" />
            <div className="practice-line desc" />
            <div className="practice-text" style={{ left: `${textLeftIn}in` }}>{name}</div>
          </div>
        ))}
      </div>
      <div className="booklet-page-number">{pageNumber}</div>
    </div>
  );
}