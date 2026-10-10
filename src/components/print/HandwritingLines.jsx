import PrintGuideVisual from './PrintGuideVisual';
import { ASC_FACTOR } from '@/lib/handwritingLayout';

// One handwriting row: guide visual (walking figures + fence) on the left,
// sky / fence / grass / dirt lines, and the word in the arrow-dot font.
export default function HandwritingLines({ word = '', lineGap: g, fontSize, vOffset = 0 }) {
  const asc = fontSize * ASC_FACTOR;
  const line = (top, border) => (
    <div style={{ position: 'absolute', top, left: 0, right: 0, borderTop: border }} />
  );

  return (
    <div style={{ position: 'relative', height: `${3 * g}in` }}>
      <PrintGuideVisual lineGap={g} />
      {line(0, '2px solid #4a90e2')}
      {line(`${g}in`, '2px dashed #000000')}
      {line(`${2 * g}in`, '2px solid #43a047')}
      {line(`calc(${3 * g}in - 2px)`, '2px solid #4e342e')}
      {word && (
        <div
          style={{
            position: 'absolute',
            left: '1.4in',
            top: `${2 * g - asc + vOffset}in`,
            fontFamily: 'ZBKidLettersArrowDot, ui-sans-serif, sans-serif',
            fontSize: `${fontSize}in`,
            color: '#2e7d32',
            whiteSpace: 'nowrap',
            lineHeight: 1.7,
          }}
        >
          {word}
        </div>
      )}
    </div>
  );
}