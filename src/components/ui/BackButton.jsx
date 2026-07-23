import { ChevronLeft } from 'lucide-react';

// A back button with a real touch target (44px) so it's easy to tap on phones,
// including under a notch. `tone` matches the page's header color theme.
const TONES = {
  indigo: 'text-indigo-300 hover:text-white',
  teal: 'text-teal-300 hover:text-white',
  violet: 'text-violet-300 hover:text-white',
};

export default function BackButton({ onClick, label = 'Back', tone = 'indigo', className = '', ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 min-h-[44px] min-w-[44px] px-2.5 py-2 rounded-xl font-bold text-sm shrink-0 touch-manipulation select-none active:scale-95 transition ${TONES[tone] || TONES.indigo} ${className}`}
      {...rest}
    >
      <ChevronLeft className="w-6 h-6 shrink-0" strokeWidth={2.5} />
      {label && <span>{label}</span>}
    </button>
  );
}