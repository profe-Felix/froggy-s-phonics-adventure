import PrintGuideVisual from './PrintGuideVisual';
import WaypointWord from './WaypointWord';
import { ASC_FACTOR } from '@/lib/handwritingLayout';

// One handwriting row: guide visual (walking figures + fence) on the left,
// sky / fence / grass / dirt lines, and the word in the chosen font/mode.
//   mode='arrows' → ZBKidLettersArrowDot font (dotted letters w/ arrows + numbers)
//   mode='dots'   → waypoint starting dots only (students form the letter)
export default function HandwritingLines({ word = '', lineGap: g, fontSize, vOffset = 0, color = '#2e7d32', mode = 'arrows', waypoints = null, dotsScale = 1, dotsShift = 0 }) {
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
      {word && mode === 'arrows' && (
        <div
          style={{
            position: 'absolute',
            left: '1.4in',
            top: `${2 * g - asc + vOffset}in`,
            fontFamily: 'ZBKidLettersArrowDot, ui-sans-serif, sans-serif',
            fontSize: `${fontSize}in`,
            color,
            whiteSpace: 'nowrap',
            lineHeight: 1.7,
          }}
        >
          {word}
        </div>
      )}
      {word && mode === 'dots' && waypoints && (
        <div style={{ position: 'absolute', left: '1.4in', top: `${dotsShift}in`, transform: `scale(${dotsScale})`, transformOrigin: 'top left' }}>
          <WaypointWord word={word} waypoints={waypoints} lineGap={g} color={color} mode="dots" />
        </div>
      )}
    </div>
  );
}