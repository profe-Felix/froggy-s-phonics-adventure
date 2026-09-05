import { cn } from '@/lib/utils';

function splitName(name) {
  const tokens = (name || '').trim().split(/\s+/).filter(Boolean);
  const first = tokens[0] || '';
  let last = '';
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i].replace(/\.$/, '').length > 1) { last = tokens[i].replace(/\.$/, ''); break; }
  }
  return { first, last };
}

// A single square seat on the carpet grid. Tap to seat the selected student
// or to pick up the seated student.
export default function CarpetCell({ seat, student, isSelected, onClick }) {
  const photo = student?.photo_url;
  const name = student?.name;
  const { first, last } = splitName(name);
  const displayName = first || last || '';
  const initials = name
    ? name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : '';

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative aspect-square border-2 rounded-lg overflow-hidden cursor-pointer transition-all bg-white',
        isSelected ? 'border-indigo-500 ring-2 ring-indigo-300 z-10' : 'border-slate-300 hover:border-slate-400',
        !student && 'bg-slate-50'
      )}
    >
      {student ? (
        photo ? (
          <img src={photo} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-100">
            <span className="text-lg font-bold text-slate-400">{initials || '?'}</span>
          </div>
        )
      ) : (
        <div className="w-full h-full" />
      )}

      {student && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate text-center">
          {displayName}
        </div>
      )}
    </div>
  );
}