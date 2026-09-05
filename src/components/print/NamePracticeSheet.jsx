// Full-page name tracing practice sheet with handwriting guide lines
// (ascender / midline / baseline / descender). mode='first' repeats the first
// name 4×; 'firstlast' alternates first/last.
export default function NamePracticeSheet({ student, mode = 'first', fontSize = 1.35 }) {
  const tokens = (student?.name || '').trim().split(/\s+/).filter(Boolean);
  const first = tokens[0] || '';
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : '';
  const rows = mode === 'firstlast' ? [first, last, first, last] : [first, first, first, first];

  return (
    <div style={{ width: '8.5in', minHeight: '11in', padding: '0.6in 0.8in', background: '#fff', breakInside: 'avoid' }}>
      {rows.map((name, i) => (
        <div key={i} style={{ position: 'relative', height: '1.1in', marginBottom: '0.25in' }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, borderBottom: '2px solid #93c5fd' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', borderBottom: '1.5px dashed #94a3b8' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: '72%', borderBottom: '2.5px solid #16a34a' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderBottom: '1.5px dashed #fca5a5' }} />
          <div
            style={{
              position: 'absolute',
              left: '2%',
              top: 'calc(72% - 0.95in)',
              fontSize: `${fontSize}in`,
              fontFamily: "'Teachers', sans-serif",
              fontWeight: 700,
              lineHeight: 1,
              color: '#000',
            }}
          >
            {name}
          </div>
        </div>
      ))}
    </div>
  );
}