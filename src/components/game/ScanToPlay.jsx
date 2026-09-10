import { motion } from 'framer-motion';

// Shown when a barcode-logged-in student logs out. Instead of the class
// picker (which exposes every class photo), this just asks them to scan
// their QR code again — no way to reach another student's account.
export default function ScanToPlay({ error }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-sky-400 via-sky-200 to-green-300 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="bg-white/90 backdrop-blur rounded-[2.5rem] shadow-2xl ring-1 ring-white/60 px-8 py-12 text-center">
          <motion.div
            animate={{ y: [0, -12, 0], rotate: [0, -3, 3, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="text-7xl mb-4 drop-shadow-md"
          >
            🐸
          </motion.div>
          <h1 className="text-2xl font-extrabold text-slate-700 mb-2">
            Scan your QR code to play!
          </h1>
          {error ? (
            <p className="text-red-500 font-medium mt-4">{error}</p>
          ) : (
            <p className="text-slate-500 mt-2">Ask your teacher if you need a QR code.</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}