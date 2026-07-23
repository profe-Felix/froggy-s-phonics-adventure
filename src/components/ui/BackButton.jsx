import { ChevronLeft } from 'lucide-react';

// Compact, clearly-pressable icon back button (no text). 40px circle with a
// border + tint so it reads as a real button, not dead space. tone matches the
// header it sits in.
const TONES = {
  indigo: 'text-indigo-200 hover:bg-indigo-500/25 border-indigo-400/40',
  teal: 'text-teal-200 hover:bg-teal-500/25 border-teal-400/40',
  violet: 'text-violet-200 hover:bg-violet-500/25 border-violet-400/40',
};

export default function BackButton({ onClick, tone = 'indigo', className = '', ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back"
      className={`flex items-center justify-center w-10 h-10 rounded-full border bg-white/5 active:scale-90 transition shrink-0 touch-manipulation select-none ${TONES[tone] || TONES.indigo} ${className}`}
      {...rest}
    >
      <ChevronLeft className="w-6 h-6 pointer-events-none" strokeWidth={2.5} />
    </button>
  );
}