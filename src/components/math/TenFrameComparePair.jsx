import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import SimpleWritingCanvas from './SimpleWritingCanvas';

// ── seeded RNG (same as TenFrameCompareStudentLesson) ──
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededInt(seedStr, min, max) {
  return Math.floor(mulberry32(hashString(seedStr))() * (max - min + 1)) + min;
}
function seededShuffle(arr, seed) {
  const a = [...arr]; let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = ((s ^ (s << 13)) ^ (s >> 7) ^ (s << 17)) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Ten Frame display ──
function Frame10({ value, seed }) {
  const positions = Array.from({ length: 10 }, (_, i) => i);
  const shuffled = seededShuffle(positions, seed);
  const filled = new Set(shuffled.slice(0, value));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, border: '3px solid #1f2937', borderRadius: 10, padding: 6, background: '#fff' }}>
      {positions.map(i => (
        <div key={i} style={{ width: 36, height: 36, border: '2px solid #9ca3af', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, boxSizing: 'border-box' }}>
          {filled.has(i) && <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#111827' }} />}
        </div>
      ))}
    </div>
  );
}

function DoubleTenFrame({ value, seedBase }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      <Frame10 value={Math.min(value, 10)} seed={seedBase + 11} />
      <Frame10 value={Math.max(0, value - 10)} seed={seedBase + 29} />
    </div>
  );
}

// ── DIGIT PAD (same as BuildSection in RollCompareSolo) ──
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function DigitEntry({ targetNumber, label, locked, onDone }) {
  const [step, setStep] = useState('write'); // write | type | done
  const [drawnUrl, setDrawnUrl] = useState(null);
  const [typed, setTyped] = useState('');

  const handleCanvasDone = (strokes, url) => { setDrawnUrl(url); setStep('type'); setTyped(''); };
  const handleDigit = (d) => { if (typed.length < 2) setTyped(t => t + String(d)); };
  const handleUndo = () => setTyped(t => t.slice(0, -1));
  const handleTypeSubmit = () => {
    if (parseInt(typed) === targetNumber) { setStep('done'); onDone(); }
    else { setStep('write'); setDrawnUrl(null); setTyped(''); }
  };

  return (
    <div className={`bg-white rounded-2xl p-4 shadow-lg ${locked ? 'opacity-50 pointer-events-none' : ''}`}>
      <p className="text-xs font-bold text-gray-400 uppercase mb-2">{label} — write {targetNumber}</p>

      {step === 'write' && <SimpleWritingCanvas onDone={handleCanvasDone} />}

      {step === 'type' && drawnUrl && (
        <>
          <img src={drawnUrl} alt="written" className="rounded-xl border-2 border-indigo-200 w-full mb-3" style={{ height: 80, objectFit: 'contain', background: '#f8fbff' }} />
          <p className="text-xs font-bold text-gray-400 text-center mb-2">Now type it:</p>
          <div className={`w-14 h-14 rounded-2xl border-4 flex items-center justify-center text-2xl font-bold mx-auto mb-2
            ${typed ? 'border-sky-400 bg-white text-sky-700' : 'border-dashed border-sky-300 bg-sky-50 text-sky-200'}`}>
            {typed || '?'}
          </div>
          <div className="grid grid-cols-5 gap-1 mb-2">
            {DIGITS.map(d => (
              <motion.button key={d} whileTap={{ scale: 0.85 }}
                onClick={() => handleDigit(d)} disabled={typed.length >= 2}
                className="h-9 rounded-xl bg-white shadow text-base font-bold text-indigo-700 border-2 border-indigo-200 disabled:opacity-40">
                {d}
              </motion.button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleUndo} disabled={!typed}
              className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold disabled:opacity-30">⌫</button>
            <button onClick={handleTypeSubmit} disabled={!typed}
              className="flex-1 py-2 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-30">✓</button>
          </div>
        </>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center gap-1 text-green-600 font-bold mt-2">
          <span className="text-3xl">✅</span>
          <span>{targetNumber} — done!</span>
        </div>
      )}
    </div>
  );
}

// ── Comparison sentence ──
const LABEL_MAP = { is_greater_than: 'is greater than', is_less_than: 'is less than', is_equal_to: 'is equal to' };

function ComparePhase({ myNumber, theirNumber, onNext }) {
  const [placed, setPlaced] = useState(null);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const dropRef = useRef(null);

  const correct = myNumber > theirNumber ? 'is_greater_than' : myNumber < theirNumber ? 'is_less_than' : 'is_equal_to';

  const handlePlace = (value) => {
    if (placed) return;
    setPlaced(LABEL_MAP[value]);
    setResult(value === correct ? 'correct' : 'wrong');
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-lg mt-3">
      <p className="text-xs font-bold text-gray-400 uppercase text-center mb-3">Complete the sentence</p>
      <div className="flex flex-wrap items-center justify-center gap-2 text-lg font-black text-gray-800 mb-4">
        <span className="bg-blue-100 px-2 py-1 rounded-lg">{myNumber}</span>
        <div ref={dropRef}
          onClick={() => { if (!placed && selected) handlePlace(selected); }}
          className={`min-w-[120px] h-10 rounded-xl border-4 border-dashed flex items-center justify-center font-black text-xs transition-all
            ${placed
              ? (result === 'correct' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-400 bg-red-50 text-red-600')
              : selected ? 'border-indigo-400 bg-indigo-50 text-indigo-500 cursor-pointer' : 'border-gray-300 bg-gray-50 text-gray-400'}`}>
          {placed || (selected ? 'tap to place' : 'drag or tap')}
        </div>
        <span className="bg-orange-100 px-2 py-1 rounded-lg">{theirNumber}</span>
      </div>

      {!placed && (
        <div className="flex flex-wrap gap-2 justify-center mb-2">
          {['is_greater_than', 'is_less_than', 'is_equal_to'].map(v => (
            <button key={v}
              onClick={() => { setSelected(v); handlePlace(v); }}
              className={`px-3 py-2 rounded-xl font-black text-sm shadow transition-all
                ${selected === v ? 'bg-indigo-700 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
              {LABEL_MAP[v]}
            </button>
          ))}
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className={`rounded-xl p-3 text-center mt-2 ${result === 'correct' ? 'bg-green-50 border-2 border-green-400' : 'bg-red-50 border-2 border-red-300'}`}>
          <p className="font-black text-lg">{result === 'correct' ? '🎉 Correct!' : '🤔 Not quite…'}</p>
          {result === 'wrong' && <p className="text-sm text-gray-500 mt-1">Answer: <strong>{LABEL_MAP[correct]}</strong></p>}
          <button onClick={onNext} className="mt-3 bg-indigo-600 text-white font-black px-5 py-2 rounded-xl shadow">
            🔄 New Round
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ── Main pair game ──
async function fetchOrCreateGame(className, playerNumber, partnerNumber) {
  // Always look for a game where this pair is involved
  const all = await base44.entities.RollComparePairGame.filter({ class_name: className });
  const p1 = Math.min(playerNumber, partnerNumber);
  const p2 = Math.max(playerNumber, partnerNumber);
  return all.find(g => g.player1_number === p1 && g.player2_number === p2) || null;
}

export default function TenFrameComparePair({ className, studentNumber, onBack }) {
  const [partnerNumber, setPartnerNumber] = useState(null);
  const [myNumber, setMyNumber] = useState(null);   // randomly assigned each round
  const [theirNumber, setTheirNumber] = useState(null);
  const [myWriteDone, setMyWriteDone] = useState(false);
  const [roundKey, setRoundKey] = useState(0);

  // Generate a new round with random numbers 0-20
  const newRound = () => {
    const a = Math.floor(Math.random() * 21);
    let b = Math.floor(Math.random() * 21);
    // make 70% chance they're different
    if (Math.random() < 0.7 && b === a) b = a < 20 ? a + 1 : a - 1;
    setMyNumber(a);
    setTheirNumber(b);
    setMyWriteDone(false);
    setRoundKey(k => k + 1);
  };

  // Partner selection screen
  if (!partnerNumber) {
    const NUMBERS = Array.from({ length: 30 }, (_, i) => i + 1).filter(n => n !== studentNumber);
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-400 to-teal-600 flex flex-col items-center justify-center p-6 gap-5">
        <button onClick={onBack} className="self-start text-white/80 hover:text-white font-bold">← Back</button>
        <div className="text-5xl">🟦</div>
        <h2 className="text-2xl font-black text-white">Ten Frame Compare — Partners</h2>
        <p className="text-white/80">Student #{studentNumber} — Who are you playing with?</p>
        <div className="grid grid-cols-6 gap-2 w-full max-w-md">
          {NUMBERS.map(n => (
            <motion.button key={n} whileTap={{ scale: 0.9 }}
              onClick={() => { setPartnerNumber(n); newRound(); }}
              className="w-12 h-12 bg-white text-teal-700 font-bold text-lg rounded-xl shadow">
              {n}
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  const mySeedBase = hashString(`me-${myNumber}-${roundKey}`);
  const theirSeedBase = hashString(`them-${theirNumber}-${roundKey}`);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-teal-100" style={{ boxSizing: 'border-box' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-teal-600 text-white">
        <button onClick={onBack} className="text-white/80 hover:text-white font-bold">← Back</button>
        <h1 className="font-black text-lg flex-1 text-center">🟦 Ten Frame Compare</h1>
        <span className="text-sm font-bold text-white/80">vs #{partnerNumber}</span>
      </div>

      <div className="p-4 max-w-2xl mx-auto" key={roundKey}>
        <p className="text-center text-teal-700 font-bold text-lg mb-4">Round — Compare your numbers!</p>

        {/* Two ten-frame cards side by side */}
        <div className="flex gap-4 justify-center mb-5 flex-wrap">
          {/* My card */}
          <div className="bg-white rounded-2xl p-4 shadow-lg flex flex-col items-center gap-3" style={{ minWidth: 200 }}>
            <p className="font-black text-teal-700 text-sm uppercase">My Number</p>
            <DoubleTenFrame value={myNumber} seedBase={mySeedBase} />
          </div>

          {/* Their card */}
          <div className="bg-white rounded-2xl p-4 shadow-lg flex flex-col items-center gap-3" style={{ minWidth: 200 }}>
            <p className="font-black text-orange-600 text-sm uppercase">#{partnerNumber}'s Number</p>
            <DoubleTenFrame value={theirNumber} seedBase={theirSeedBase} />
          </div>
        </div>

        {/* Write & verify MY number first */}
        {!myWriteDone && (
          <DigitEntry
            key={`write-${roundKey}`}
            label="First: write your number"
            targetNumber={myNumber}
            locked={false}
            onDone={() => setMyWriteDone(true)}
          />
        )}

        {/* Write their number second */}
        {myWriteDone && (
          <>
            <DigitEntry
              key={`write-their-${roundKey}`}
              label="Now write their number"
              targetNumber={theirNumber}
              locked={false}
              onDone={() => {}}
            />
            <ComparePhase
              key={`compare-${roundKey}`}
              myNumber={myNumber}
              theirNumber={theirNumber}
              onNext={newRound}
            />
          </>
        )}
      </div>
    </div>
  );
}