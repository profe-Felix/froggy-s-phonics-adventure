import Barcode from '@/components/Barcode';

// Standard ID badge card: photo, name, 4 info rows with separator lines,
// and a CODE39 barcode at the bottom. Fixed 2.3" × 3.3" so 3×3 fit on a
// letter sheet. Matches the original PrintPro card layout.
export default function IdCard({ student }) {
  const name = student.name || '—';
  const number = student.barcode_number || String(student.student_number).padStart(6, '0');
  const tokens = (student.name || '').trim().split(/\s+/).filter(Boolean);
  const first = tokens[0] || '';
  let last = '';
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i].replace(/\.$/, '').length > 1) { last = tokens[i].replace(/\.$/, ''); break; }
  }
  const initials = ((first[0] || '') + (last[0] || '')).toUpperCase();

  const rows = [
    ['GRADE', student.grade || ''],
    ['HOMEROOM', student.homeroom || student.class_name || ''],
    ['TEACHER', student.teacher_name || student.class_name || ''],
    ['SITE', student.site || ''],
  ].filter(([, v]) => v);

  return (
    <div
      className="border border-slate-300 bg-white overflow-hidden flex flex-col"
      style={{ width: '2.3in', height: '3.3in', breakInside: 'avoid', pageBreakInside: 'avoid' }}
    >
      {/* Photo */}
      <div className="flex justify-center pt-1.5">
        <div className="w-[0.7in] h-[0.7in] rounded overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
          {student.photo_url ? (
            <img src={student.photo_url} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg font-bold text-slate-400">{initials || '?'}</span>
          )}
        </div>
      </div>

      {/* Name */}
      <div className="px-1.5 mt-1 text-center">
        <div className="text-[13px] font-extrabold text-slate-900 leading-tight break-words">{name}</div>
      </div>

      {/* Info rows with separator lines */}
      <div className="mt-1.5 border-t border-slate-200">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-1 px-2 py-0.5 border-b border-slate-200">
            <span className="text-[7px] uppercase tracking-wider text-slate-400">{label}</span>
            <span className="text-[10px] font-bold text-slate-900 text-right truncate">{value}</span>
          </div>
        ))}
      </div>

      {/* Barcode fills remaining space */}
      <div className="flex-1 flex flex-col items-center justify-end pb-1.5 px-1.5">
        <Barcode value={number} />
        <span className="text-[9px] font-mono tracking-widest text-slate-800 mt-0.5">{number}</span>
      </div>
    </div>
  );
}