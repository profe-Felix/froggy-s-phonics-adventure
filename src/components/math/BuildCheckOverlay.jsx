import { motion } from 'framer-motion';

function Cookie({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="18" fill="#c8854a" stroke="#8B5E3C" strokeWidth="1.5"/>
      <ellipse cx="13" cy="14" rx="3.5" ry="2.5" fill="#3b1f09" transform="rotate(-10 13 14)"/>
      <ellipse cx="26" cy="12" rx="3" ry="2" fill="#3b1f09" transform="rotate(5 26 12)"/>
      <ellipse cx="10" cy="26" rx="2.5" ry="2" fill="#3b1f09" transform="rotate(-15 10 26)"/>
      <ellipse cx="24" cy="28" rx="3.5" ry="2.5" fill="#3b1f09" transform="rotate(8 24 28)"/>
      <ellipse cx="19" cy="21" rx="3" ry="2" fill="#3b1f09" transform="rotate(-5 19 21)"/>
    </svg>
  );
}

function MiniTenFrame({ count, overlayColor }) {
  return (
    <div className="relative rounded-xl overflow-hidden">
      <div className="flex flex-col gap-2 p-2">
        {[0, 1].map(frame => (
          <div key={frame} className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(5, 28px)' }}>
            {Array.from({ length: 10 }).map((_, cell) => {
              const idx = frame * 10 + cell;
              const filled = idx < count;
              return filled ? (
                <div key={cell} style={{ width: 28, height: 28 }} className="flex items-center justify-center">
                  <Cookie size={26} />
                </div>
              ) : (
                <div key={cell} style={{ width: 28, height: 28 }}
                  className="rounded border border-dashed border-amber-200 bg-amber-100/30" />
              );
            })}
          </div>
        ))}
      </div>
      {/* Semi-transparent overlay */}
      <div className={`absolute inset-0 rounded-xl ${overlayColor}`} />
    </div>
  );
}

export default function BuildCheckOverlay({ studentCount, targetCount, onTryAgain }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-3xl p-5 shadow-xl mb-4">
      <p className="text-center text-lg font-black text-red-600 mb-1">Oops! Wrong number of cookies</p>
      <p className="text-center text-sm text-gray-500 mb-4">
        You built <span className="font-black text-red-600">{studentCount}</span> but needed <span className="font-black text-green-600">{targetCount}</span>
      </p>
      <div className="flex gap-4 justify-center flex-wrap">
        {/* Student's wrong answer */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-bold text-red-500 uppercase">Yours: {studentCount}</span>
          <MiniTenFrame count={studentCount} overlayColor="bg-red-500/20" />
        </div>
        {/* Correct answer */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-bold text-green-600 uppercase">Correct: {targetCount}</span>
          <MiniTenFrame count={targetCount} overlayColor="bg-green-500/20" />
        </div>
      </div>
      <div className="flex justify-center mt-4">
        <motion.button whileTap={{ scale: 0.95 }} onClick={onTryAgain}
          className="bg-amber-500 text-white font-black text-lg px-6 py-3 rounded-2xl shadow-lg">
          🔄 Try Again
        </motion.button>
      </div>
    </motion.div>
  );
}