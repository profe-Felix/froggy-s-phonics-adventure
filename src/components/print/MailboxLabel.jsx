// 0.9" × 2.0" vertical mailbox/cubby label: number on top, photo below.
// showPicture=false → number only (for labels that go behind a photo).
export default function MailboxLabel({ student, showPicture = true }) {
  const photo = student.photo_url;
  const number = student.student_number || '';
  const tokens = (student.name || '').trim().split(/\s+/).filter(Boolean);
  const first = tokens[0] || '';
  let last = '';
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i].replace(/\.$/, '').length > 1) { last = tokens[i].replace(/\.$/, ''); break; }
  }
  const initials = ((first[0] || '') + (last[0] || '')).toUpperCase();

  if (!showPicture) {
    return (
      <div
        className="border-2 border-black bg-white overflow-hidden flex items-center justify-center"
        style={{ width: '0.9in', height: '2.0in', breakInside: 'avoid', pageBreakInside: 'avoid' }}
      >
        <span className="font-bold text-black" style={{ fontSize: '24pt' }}>{number}</span>
      </div>
    );
  }

  return (
    <div
      className="border-2 border-black bg-white overflow-hidden flex flex-col"
      style={{ width: '0.9in', height: '2.0in', breakInside: 'avoid', pageBreakInside: 'avoid' }}
    >
      <div className="flex items-center justify-center border-b-2 border-black" style={{ height: '1.0in' }}>
        <span className="font-bold text-black" style={{ fontSize: '20pt' }}>{number}</span>
      </div>
      <div className="flex items-center justify-center overflow-hidden bg-slate-50" style={{ height: '1.0in' }}>
        {photo ? (
          <img src={photo} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-bold text-slate-300">{initials || '?'}</span>
        )}
      </div>
    </div>
  );
}