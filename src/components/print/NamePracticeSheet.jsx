export default function NamePracticeSheet({ student, mode = 'first', fontSize = 1.35, lineSize = 0.7, offset = 0 }) {
  const tokens = (student?.student_name || student?.name || '').trim().split(/\s+/).filter(Boolean);
  const first = tokens[0] || '';
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : '';
  const rows = mode === 'firstlast' ? [first, last, first, last] : [first, first, first, first];

  return (
    <div className="page-preview">
      <div className="practice-sheet" style={{ '--f': `${fontSize}in`, '--g': `${lineSize}in`, '--offset': `${offset}in` }}>
        {rows.map((name, i) => (
          <div className="practice-set" key={i}>
            <div className="practice-line top" />
            <div className="practice-line mid" />
            <div className="practice-line base" />
            <div className="practice-line desc" />
            <div className="practice-text">{name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}