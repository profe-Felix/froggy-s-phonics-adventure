// Printable noun practice sheet — portrait page with 5 rows.
// Each row: left = handwriting lines with the noun in green (ZBKidLettersArrowDot
// font has built-in directional arrows for letter formation), right = picture.
// Designed for the "who" nouns from the Creando Oraciones card set.

// Strip the Spanish article (El/La/Los/Las) from the noun text so students
// practice only the noun itself on the handwriting lines.
function stripArticle(text) {
  return String(text || '').replace(/^(El|La|Los|Las)\s+/i, '');
}

export default function NounPracticeSheet({ nouns = [], fontSize = 0.45, lineGap = 0.65 }) {
  const g = lineGap; // gap between handwriting zones (inches)
  const asc = fontSize * 1.166667; // ascender height for baseline alignment

  return (
    <div className="page-preview" style={{ padding: '0.25in' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.12in' }}>
        {nouns.map((noun, i) => (
          <div
            key={noun.id || i}
            style={{
              display: 'flex',
              height: `${3 * g}in`,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Left: handwriting lines */}
            <div
              style={{
                flex: '0 0 5.3in',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Sky band */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: `${g}in`,
                  background: '#dceaf9',
                }}
              />
              {/* Grass band */}
              <div
                style={{
                  position: 'absolute',
                  top: `${g}in`,
                  left: 0,
                  right: 0,
                  height: `${g}in`,
                  background: '#e8f5e9',
                }}
              />
              {/* Dirt band */}
              <div
                style={{
                  position: 'absolute',
                  top: `${2 * g}in`,
                  left: 0,
                  right: 0,
                  height: `${g}in`,
                  background: '#f5ebe0',
                }}
              />
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
              {/* Dirt line (bottom) */}
              <div
                style={{
                  position: 'absolute',
                  top: `${3 * g}in`,
                  left: 0,
                  right: 0,
                  borderTop: '2px solid #795548',
                }}
              />
              {/* Noun text — green with formation arrows from the font */}
              <div
                style={{
                  position: 'absolute',
                  left: '0.2in',
                  top: `${2 * g - asc}in`,
                  fontFamily: 'ZBKidLettersArrowDot, ui-sans-serif, sans-serif',
                  fontSize: `${fontSize}in`,
                  color: '#2e7d32',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.7,
                }}
              >
                {stripArticle(noun.text)}
              </div>
            </div>

            {/* Right: picture */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.08in',
                borderLeft: '2px dotted #cbd5e1',
              }}
            >
              <img
                src={noun.color}
                alt={noun.text}
                style={{
                  maxWidth: '100%',
                  maxHeight: `${3 * g - 0.16}in`,
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