import { cn } from '@/lib/utils';
import { parseName } from '@/lib/nameNormalize';

function isImageUrl(s) {
  return typeof s === 'string' && (s.startsWith('http') || s.startsWith('/'));
}

export default function CarpetCell({ seat, student, isSelected, onClick, showFullName }) {
  const photo = student?.photo_url;
  const name = student?.name;
  const { first, last } = parseName(name);
  const displayName = showFullName && first && last ? `${first} ${last}` : (first || last || '');
  const initials = name
    ? name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : '';
  const partner = seat?.partner_label;
  const partnerIsImage = isImageUrl(partner);

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative flex-1 aspect-square border-2 rounded-lg overflow-hidden cursor-pointer transition-all bg-white',
        isSelected
          ? 'border-primary ring-2 ring-primary ring-offset-1 z-10'
          : 'border-slate-300 hover:border-slate-400',
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

      {partner &&
        (partnerIsImage ? (
          <div className="absolute top-1 right-1 w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow z-10">
            <img src={partner} alt="partner" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="absolute top-1 right-1 bg-primary text-primary-foreground text-[10px] px-2 py-0.5 rounded-full max-w-[80%] truncate z-10">
            {partner}
          </div>
        ))}
    </div>
  );
}