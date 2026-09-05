import Barcode from '@/components/Barcode';

export default function IdCard({ student }) {
  const name = student.student_name || student.name || '—';
  const number = student.barcode_number || '000000';
  const photo = student.photo_url;
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const grade = student.grade;
  const homeroom = student.homeroom;
  const teacher = student.teacher_name;
  const site = student.site;

  return (
    <div className="id-card relative flex flex-col bg-white border border-slate-300 rounded-md overflow-hidden shadow-sm">
      <div className="flex justify-center pt-2">
        <div className="w-[0.65in] h-[0.65in] rounded overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
          {photo ? (
            <img src={photo} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg font-bold text-slate-400">{initials || '?'}</span>
          )}
        </div>
      </div>

      <div className="px-2 mt-2 text-center">
        <div className="text-[15px] font-extrabold text-slate-900 leading-tight break-words">{name}</div>
      </div>

      <div className="px-2 mt-2 space-y-1.5">
        {grade && (
          <div className="flex items-baseline justify-between gap-1 border-b border-slate-100 pb-1">
            <span className="text-[8px] uppercase tracking-wider text-slate-400">Grade</span>
            <span className="text-[13px] font-bold text-slate-900">{grade}</span>
          </div>
        )}
        {homeroom && (
          <div className="flex items-baseline justify-between gap-1 border-b border-slate-100 pb-1">
            <span className="text-[8px] uppercase tracking-wider text-slate-400">Homeroom</span>
            <span className="text-[13px] font-bold text-slate-900">{homeroom}</span>
          </div>
        )}
      </div>

      {(teacher || site) && (
        <div className="px-2 mt-1.5 space-y-0.5">
          {teacher && (
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-[7px] uppercase tracking-wider text-slate-400">Teacher</span>
              <span className="text-[9px] font-medium text-slate-700 text-right truncate">{teacher}</span>
            </div>
          )}
          {site && (
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-[7px] uppercase tracking-wider text-slate-400">Site</span>
              <span className="text-[9px] font-medium text-slate-700 text-right truncate">{site}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex-1" />

      <div className="w-full px-1.5 pb-1.5 flex flex-col items-center">
        <Barcode value={number} />
        <span className="text-[10px] font-mono tracking-widest text-slate-800 mt-0.5">{number}</span>
      </div>
    </div>
  );
}