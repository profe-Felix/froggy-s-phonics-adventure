import PrintGuideVisual from './PrintGuideVisual';

// Printable noun practice sheet — portrait page with 5 rows.
// Each row: left = handwriting lines with the noun in green (ZBKidLettersArrowDot
// font has built-in directional arrows for letter formation), right = picture.
// Designed for the "who" nouns from the Creando Oraciones card set.

// Strip the Spanish article (El/La/Los/Las) from the noun text so students
// practice only the noun itself on the handwriting lines.
function stripArticle(text) {
  return String(text || '').replace(/^(El|La|Los|Las)\s+/i, '');
}

export default function NounPracticeSheet({ nouns = [], fontSize = 0.45, lineGap = 0.65, vOffset = 0 }) {
  const g = lineGap; // gap between handwriting zones (inches)
  // The ZBKidLettersArrowDot font's visual glyphs are much smaller than its
  // em square (arrows + stroke-order numbers eat the space), so the old
  // descender-based cap kept letters too small to reach the guide lines.
  // Allow a generous multiple of the band height; the teacher uses the
  // font-size slider + vOffset to fine-tune alignment.
  const maxFontSize = g * 2.4;
  const effectiveFontSize = Math.min(fontSize, maxFontSize);
  const asc = effectiveFontSize * 1.166667; // ascender height for baseline alignment

  return (
    <div className="page-preview" style={{ padding: '0.25in' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3in' }}>
        {nouns.map((noun, i) => (
          <div
            key={noun.id || i}
            style={{
              display: 'flex',
              height: `${3 * g}in`,
              position: 'relative',
            }}
          >
            {/* Left: handwriting lines */}
            <div
              style={{
                flex: '0 0 5.3in',
                position: 'relative',
              }}
            >
              {/* Guide visual — walking figures + fence with colored zones
                  limited to the visual width (saves ink; no color behind letters). */}
              <PrintGuideVisual lineGap={lineGap} />
              {/* Top line (sky ceiling) */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  borderTop: '2px solid #4a90e2',
                }}
              />
              {/* Fence line (dashed — midline) */}
              <div
                style={{
                  position: 'absolute',
                  top: `${g}in`,
                  left: 0,
                  right: 0,
                  borderTop: '2px dashed #000000',
                }}
              />
              {/* Base line (solid — grass floor) */}
              <div
                style={{
                  position: 'absolute',
                  top: `${2 * g}in`,
                  left: 0,
                  right: 0,
                  borderTop: '2px solid #43a047',
                }}
              />
              {/* Dirt line (bottom) — aligned with the picture's green border
                  bottom edge so cutting stays straight. */}
              <div
                style={{
                  position: 'absolute',
                  top: `calc(${3 * g}in - 2px)`,
                  left: 0,
                  right: 0,
                  borderTop: '2px solid #4e342e',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '1.4in',
                  top: `${2 * g - asc + vOffset}in`,
                  fontFamily: 'ZBKidLettersArrowDot, ui-sans-serif, sans-serif',
                  fontSize: `${effectiveFontSize}in`,
                  color: '#2e7d32',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.7,
                }}
              >
                {stripArticle(noun.text)}
              </div>
            </div>

            {/* Right: picture — solid green border aligns exactly with the
                sky line (top) and dirt line (bottom) for clean cutting. */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.06in',
                border: '4px solid #2e7d32',
                boxSizing: 'border-box',
                height: `${3 * g}in`,
              }}
            >
              <img
                src={noun.color}
                alt={noun.text}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}