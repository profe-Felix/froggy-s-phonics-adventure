import HandwritingLines from './HandwritingLines';
import { ROW_GAP_IN } from '@/lib/handwritingLayout';

// Printable noun practice sheet — portrait page. Each row: left = handwriting
// lines with the noun (ZBKidLettersArrowDot), right = picture with a solid
// green cutting border aligned to the sky and dirt lines.

// Strip the Spanish article (El/La/Los/Las) so students trace only the noun.
function stripArticle(text) {
  return String(text || '').replace(/^(El|La|Los|Las)\s+/i, '');
}

export default function NounPracticeSheet({ nouns = [], fontSize, lineGap: g, vOffset = 0 }) {
  return (
    <div className="page-preview" style={{ padding: '0.25in' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: `${ROW_GAP_IN}in` }}>
        {nouns.map((noun, i) => (
          <div key={noun.id || i} style={{ display: 'flex', height: `${3 * g}in` }}>
            <div style={{ flex: '0 0 5.3in' }}>
              <HandwritingLines word={stripArticle(noun.text)} lineGap={g} fontSize={fontSize} vOffset={vOffset} />
            </div>
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
              <img src={noun.color} alt={noun.text} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}