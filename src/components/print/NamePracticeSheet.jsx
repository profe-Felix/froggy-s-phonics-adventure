import GuideKeyVisual from '@/components/tracing/GuideKeyVisual';

export default function NamePracticeSheet({ student, mode = 'first', fontSize = 1.35, lineSize = 0.7, offset = 0,
  emojiHeightFactor, emojiFeetFactor, emojiSpacing, bgWidth, fenceWidth, fenceOffset, emojiX, fenceGap }) {
  const tokens = (student?.student_name || student?.name || '').trim().split(/\s+/).filter(Boolean);
  const first = tokens[0] || '';
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : '';
  const rows = mode === 'firstlast' ? [first, last, first, last] : [first, first, first, first];

  // GuideKeyVisual viewBox — sized in hundredths of an inch so the aspect
  // ratio matches the practice-set (width: 0.7in, height: 3 * lineSize in).
  const vbW = 200;
  const gUnits = lineSize * 100;
  const vbH = 3 * gUnits;

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
                width={vbW}
                bgWidth={bgWidth}
                emojiHeightFactor={emojiHeightFactor}
                emojiFeetFactor={emojiFeetFactor}
                emojiSpacing={emojiSpacing}
                fenceWidth={fenceWidth}
                fenceOffset={fenceOffset}
                emojiX={emojiX}
                fenceGap={fenceGap}
              />
            </svg>
            <div className="practice-line top" />
            <div className="practice-line mid" />
            <div className="practice-line base" />
            <div className="practice-line desc" />
            <div className="practice-text" style={{ left: `${(bgWidth / 100) + 0.02}in` }}>{name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}