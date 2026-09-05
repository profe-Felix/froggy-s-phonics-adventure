import { Image } from '@/components/ui/image';
import AutofitName from '@/components/AutofitName';

export default function TableTag({ student }) {
  const name = student.student_name || '—';
  const photo = student.photo_url;
  const number = student.class_number || student.barcode_number || '';

  const tokens = (student.student_name || '').trim().split(/\s+/).filter(Boolean);
  const first = tokens[0] || '';
  let last = '';
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i].replace(/\.$/, '').length > 1) { last = tokens[i].replace(/\.$/, ''); break; }
  }
  const initials = ((first[0] || '') + (last[0] || '')).toUpperCase();

  return (
    <div
      className="tag-font border-2 border-black bg-white overflow-hidden flex"
      style={{ width: '3in', height: '0.9in', breakInside: 'avoid', pageBreakInside: 'avoid' }}
    >
      <div className="flex items-center justify-center border-r-2 border-black" style={{ width: '0.7in' }}>
        <span className="font-bold text-black" style={{ fontSize: '18pt' }}>{number}</span>
      </div>
      <div
        className="border-r-2 border-black flex items-center justify-center overflow-hidden bg-slate-50 shrink-0"
        style={{ width: '0.9in', height: '0.9in' }}
      >
        {photo ? (
          <Image src={photo} alt={name} fittingType="fill" className="w-full h-full" />
        ) : (
          <span className="text-lg font-bold text-slate-300">{initials || '?'}</span>
        )}
      </div>
      <div className="flex-1 min-w-0 px-1">
        <AutofitName first={first} last={last} maxFontSize={20} minFontSize={7} />
      </div>
    </div>
  );
}