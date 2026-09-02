import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const BUBBLES = [
  { pos: 'top-10 left-8', s: 56 },
  { pos: 'top-1/4 right-12', s: 84 },
  { pos: 'bottom-20 left-16', s: 70 },
  { pos: 'bottom-1/3 right-10', s: 48 },
  { pos: 'top-1/2 left-1/4', s: 40 },
];

// Shared student-facing login shell. Used by both Letter Games and Math Games
// so the two entry points look identical — only the icon, title, subtitle, and
// toggle differ. Children render inside the white card (class grid or number grid).
export default function StudentLoginShell({
  icon,
  title,
  titleFrom,
  titleTo,
  subtitle,
  toggleTo,
  toggleLabel,
  toggleEmoji,
  toggleTextClass,
  toggleBorderClass,
  loading = false,
  children,
}) {
  const navigate = useNavigate();
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-sky-400 via-sky-200 to-green-300 flex items-center justify-center p-4 sm:p-6">
      {/* decorative floating bubbles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {BUBBLES.map((b, i) => (
          <motion.div
            key={i}
            className={`absolute ${b.pos} rounded-full bg-white/25 blur-[1px]`}
            style={{ width: `${b.s}px`, height: `${b.s}px` }}
            animate={{ y: [0, -14, 0] }}
            transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </div>

      {/* toggle to the other subject (only when provided) */}
      {toggleTo && (
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={() => navigate(toggleTo)}
            className={`bg-white/90 hover:bg-white ${toggleTextClass} font-bold text-sm px-5 py-2.5 rounded-full shadow-lg border ${toggleBorderClass} transition-all hover:scale-105`}
          >
            {toggleEmoji} {toggleLabel} →
          </button>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
        className="relative z-10 w-full max-w-3xl"
      >
        <div className="bg-white/90 backdrop-blur rounded-[2.5rem] shadow-2xl ring-1 ring-white/60 px-6 py-8 sm:px-12 sm:py-12">
          {/* Hero */}
          <div className="text-center mb-5 sm:mb-6">
            <motion.div
              animate={{ y: [0, -12, 0], rotate: [0, -3, 3, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="text-7xl sm:text-8xl mb-3 drop-shadow-md"
            >
              {icon}
            </motion.div>
            <h1 className="text-xl sm:text-4xl font-extrabold tracking-tight leading-none whitespace-nowrap">
              <span
                style={{
                  backgroundImage: `linear-gradient(to right, ${titleFrom}, ${titleTo})`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {title}
              </span>
            </h1>
            <p className="mt-1.5 sm:mt-2 text-base sm:text-xl text-slate-500 font-medium">
              {subtitle}
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-10 h-10 border-4 border-green-200 border-t-green-500 rounded-full animate-spin"></div>
            </div>
          ) : (
            children
          )}
        </div>
      </motion.div>
    </div>
  );
}