import { cn } from '@/lib/utils';
import { parseName } from '@/lib/nameNormalize';
import { Sun, Moon, Star, Home, DoorOpen, UserCheck } from 'lucide-react';

// Row → partner icon: red=sun, green=moon, blue=moon(walkway), pink=sun, aqua=moon
const ROW_PARTNER_ICONS = [Sun, Moon, Moon, Sun, Moon];

function isImageUrl(s) {
  return typeof s === 'string' && (s.startsWith('http') || s.startsWith('/'));
}

export default function CarpetCell({
  seat,
  student,
  isSelected,
  onClick,
  showFullName,
  status,
  partnerInfo,
  partnerStudents,
  showPartners,
  rowIndex,
  onStatusChange,
}) {
  const photo = student?.photo_url;
  const name = student?.name;
  const { first, last } = parseName(name);
  const displayName = showFullName && first && last ? `${first} ${last}` : first || last || '';
  const initials = name
    ? name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : '';
  const partner = seat?.partner_label;
  const partnerIsImage = isImageUrl(partner);

  const isOut = status && status !== 'present';
  const statusLabel = status === 'absent' ? 'Absent' : status === 'stepped_out' ? 'Pulled' : '';

  // Partner icon: Star for trio third (temporary trio member), else Sun/Moon by row
  const isTrioThird = partnerInfo?.isTrio && partnerInfo?.isTemporary;
  const PartnerIconComp = isTrioThird ? Star : rowIndex != null ? ROW_PARTNER_ICONS[rowIndex] : null;
  const hasPartner = partnerInfo && partnerInfo.partnerIds && partnerInfo.partnerIds.length > 0;

  return (
    <div
      onClick={onClick}
      data-student-id={student?.id || ''}
      className={cn(
        'relative flex-1 aspect-square p-1 cursor-pointer transition-all',
        isSelected && 'z-20'
      )}
    >
      <div
        className={cn(
          'relative w-full h-full rounded-md overflow-hidden border',
          student ? 'bg-white border-slate-200' : 'bg-slate-100/50 border-transparent',
          isSelected ? 'ring-2 ring-primary' : '',
          isOut && 'opacity-40 grayscale'
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

        {isOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-500/40">
            <span className="text-[10px] font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
              {statusLabel}
            </span>
          </div>
        )}

        {student && !isOut && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate text-center">
            {displayName}
          </div>
        )}
      </div>

      {/* Status icon overlay — appears within the cell when selected (teaching carpet mode).
          Clicking an icon changes the student's status; clicking another student swaps. */}
      {isSelected && onStatusChange && student && (
        <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 rounded-md z-30 p-1">
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange('absent'); }}
            className={cn('p-1.5 rounded-md transition-colors', status === 'absent' ? 'bg-amber-500' : 'bg-white/90 hover:bg-white')}
            title="Absent (home)"
          >
            <Home className={cn('w-4 h-4', status === 'absent' ? 'text-white' : 'text-amber-600')} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange('stepped_out'); }}
            className={cn('p-1.5 rounded-md transition-colors', status === 'stepped_out' ? 'bg-blue-500' : 'bg-white/90 hover:bg-white')}
            title="Pulled out"
          >
            <DoorOpen className={cn('w-4 h-4', status === 'stepped_out' ? 'text-white' : 'text-blue-600')} />
          </button>
          {status !== 'present' && (
            <button
              onClick={(e) => { e.stopPropagation(); onStatusChange('present'); }}
              className="p-1.5 rounded-md bg-white/90 hover:bg-white transition-colors"
              title="Back (present)"
            >
              <UserCheck className="w-4 h-4 text-green-600" />
            </button>
          )}
        </div>
      )}

      {/* Partner icons: sun/moon/star, shown in partners mode */}
      {showPartners && student && !isOut && PartnerIconComp && (
        <div
          className={cn(
            'absolute top-0.5 left-0.5 z-10 flex items-center rounded-full p-1 shadow',
            partnerInfo?.isTemporary ? 'bg-orange-500' : 'bg-blue-600'
          )}
        >
          <PartnerIconComp className="w-5 h-5 text-white" />
        </div>
      )}

      {/* Manual partner label (setup mode only) */}
      {partner && !showPartners &&
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