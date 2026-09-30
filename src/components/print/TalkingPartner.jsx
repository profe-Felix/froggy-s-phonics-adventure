// Talking Partner print card — 3in × 2in.
// 2in square photo on the left, 1in number column on the right, with a thick
// colored border matching the student's class. Grid gap is 0.01in so cards
// nearly touch — just enough room for a precision paper-cutter blade.
const CLASS_BORDER = {
  Valero: '#7c3aed',      // purple
  Gutierrez: '#ec4899',   // pink
  Felix: '#16a34a',       // green
};
const DEFAULT_BORDER = '#334155'; // slate for any other class

export default function TalkingPartner({ student }) {
  const name = student.student_name || student.name || '—';
  const photo = student.photo_url;
  const number = student.class_number || student.student_number || student.barcode_number || '';
  const cls = student.class_name || '';
  const borderColor = CLASS_BORDER[cls] || DEFAULT_BORDER;

  const tokens = (name || '').trim().split(/\s+/).filter(Boolean);
  const first = tokens[0] || '';
  let last = '';
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i].replace(/\.$/, '').length > 1) { last = tokens[i].replace(/\.$/, ''); break; }
  }
  const initials = ((first[0] || '') + (last[0] || '')).toUpperCase();

  return (
    <div
      className="tag-font bg-white overflow-hidden flex"
      style={{
        width: '3in',
        height: '2in',
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
        border: `6px solid ${borderColor}`,
        boxSizing: 'border-box',
      }}
    >
      {/* Photo — 2in square */}
      <div
        className="flex items-center justify-center overflow-hidden shrink-0"
        style={{ width: '2in', height: '2in' }}
      >
        {photo ? (
          <img src={photo} alt={name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl font-bold text-slate-300">{initials || '?'}</span>
        )}
      </div>

      {/* Number column — 1in wide */}
      <div
        className="flex flex-col items-center justify-center shrink-0"
        style={{ width: '1in', height: '2in' }}
      >
        <span className="font-black text-black leading-none" style={{ fontSize: '42pt' }}>
          {number}
        </span>
      </div>
    </div>
  );
}