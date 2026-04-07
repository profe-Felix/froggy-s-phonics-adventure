import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import SimpleWritingCanvas from './SimpleWritingCanvas';

const CS = 26;
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function SingleDigitEntry({ onSubmit }) {
  const [built, setBuilt] = useState('');
  const [done, setDone] = useState(false);
  const handleDigit = (d) => { if (!done && built.length < 2) setBuilt(b => b + String(d)); };
  const handleUndo = () => { if (!done) setBuilt(b => b.slice(0, -1)); };
  const handleSubmit = () => { if (!built || done) return; setDone(true); onSubmit(parseInt(built)); };
  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className={`w-16 h-16 rounded-2xl border-4 flex items-center justify-center text-3xl font-bold
        ${done ? 'border-green-400 bg-green-50 text-green-700' : built ? 'border-sky-400 bg-white text-sky-700' : 'border-dashed border-sky-300 bg-sky-50 text-sky-200'}`}>
        {built || '?'}
      </div>
      <div className="grid grid-cols-5 gap-1.5 w-full">
        {DIGITS.map(d => (
          <motion.button key={d} whileTap={{ scale: 0.85 }}
            onClick={() => handleDigit(d)}
            disabled={done || built.length >= 2}
            className="h-10 rounded-xl bg-white shadow text-lg font-bold text-indigo-700 border-2 border-indigo-200 hover:border-indigo-400 disabled:opacity-40">
            {d}
          </motion.button>
        ))}
      </div>
      <div className="flex gap-2 w-full">
        <button onClick={handleUndo} disabled={done || !built}
          className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 font-bold disabled:opacity-30">⌫</button>
        <button onClick={handleSubmit} disabled={done || !built}
          className="flex-1 py-2 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-30 hover:bg-indigo-700">✓</button>
      </div>
    </div>
  );
}



export default function OneLessMoreLessonStudent({ studentNumber, className: classProp, onBack }) {
  const [roundKey, setRoundKey] = useState(null);
  const [builtCount, setBuiltCount] = useState(0);
  const [startWritePhase, setStartWritePhase] = useState('write');
  const [startWritten, setStartWritten] = useState(null);
  const [startStrokes, setStartStrokes] = useState(null);
  const [resultWritePhase, setResultWritePhase] = useState('write');
  const [resultWritten, setResultWritten] = useState(null);
  const [resultStrokes, setResultStrokes] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: games = [] } = useQuery({
    queryKey: ['olm-lesson', classProp],
    queryFn: () => base44.entities.OneLessMoreGame.filter({ class_name: classProp, is_active: true }),
    refetchInterval: 2000,
  });

  const game = games[0] || null;

  useEffect(() => {
    if (!game) return;
    const key = `${game.id}-${game.round_number}`;
    if (key !== roundKey) {
      setRoundKey(key);
      setBuiltCount(0);
      setStartWritePhase('write');
      setStartWritten(null);
      setStartStrokes(null);
      setResultWritePhase('write');
      setResultWritten(null);
      setResultStrokes(null);
      setSaved(false);
    }
  }, [game?.id, game?.round_number]);

  const handleSave = async () => {
    if (!game) return;
    setSaving(true);
    try {
      await base44.entities.OneLessMoreAttempt.create({
        student_number: studentNumber,
        class_name: classProp,
        starting_number: game.current_number,
        spinner_result: game.spinner_result,
        target_number: game.target_number,
        student_wrote_start: startWritten,
        student_wrote_result: resultWritten,
        is_correct_start: startWritten === game.current_number,
        is_correct_result: resultWritten === game.target_number,
        start_strokes_data: startStrokes ? JSON.stringify(startStrokes) : null,
        result_strokes_data: resultStrokes ? JSON.stringify(resultStrokes) : null,
      });
    } catch (e) { console.error(e); }
    setSaving(false);
    setSaved(true);
  };

  const showResult = resultWritePhase === 'done' && resultWritten !== null;

  if (!game || game.status === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center justify-center gap-4 p-6">
        <button onClick={onBack} className="text-white/70 self-start hover:text-white text-sm">← Back</button>
        <div className="text-5xl animate-bounce">🧊</div>
        <p className="text-white text-xl font-bold">Waiting for the teacher to start…</p>
        <p className="text-white/60 text-sm">{classProp} — #{studentNumber}</p>
      </div>
    );
  }

  if (game.status === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center justify-center gap-4 p-6">
        <button onClick={onBack} className="text-white/70 self-start hover:text-white text-sm">← Back</button>
        <div className="text-5xl">🎉</div>
        <p className="text-white text-2xl font-bold">Lesson done! Great work!</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center py-6 px-3">
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="text-white/80 hover:text-white font-medium">← Back</button>
          <h1 className="text-xl font-bold text-white">🧊 1 More / 1 Less</h1>
          <span className="text-white/70 text-sm">#{studentNumber} · Round {game.round_number}</span>
        </div>

        <div className="grid grid-cols-3 gap-4 items-start">

          {/* LEFT — Starting number */}
          <div className="bg-white rounded-3xl p-4 shadow-xl flex flex-col items-center gap-3">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Starting</p>
            <div className="bg-sky-50 rounded-xl p-3 border border-sky-200 w-full overflow-hidden">
              {/* Ten-frame display */}
              {(() => {
                const count = game.current_number;
                const SLOT_H = 24;
                const FilledSlot = (i) => (
                  <div key={i} style={{ flex: 1, height: '100%', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 0, left: 3, right: 0, height: 5, background: '#4a6fc7', clipPath: 'polygon(0 100%, 3px 0, 100% 0, calc(100% - 3px) 100%)', borderTop: '1px solid #1e3a8a' }} />
                    <div style={{ position: 'absolute', top: 5, left: 0, right: 3, bottom: 0, background: '#2d4fa1', border: '1px solid #1e3a8a', borderRadius: 1 }} />
                    <div style={{ position: 'absolute', top: 5, right: 0, width: 3, bottom: 0, background: '#1e3a8a', borderRadius: '0 1px 1px 0' }} />
                  </div>
                );
                const GhostSlot = (i) => <div key={`g${i}`} style={{ flex: 1, height: '100%' }} className="rounded border border-dashed border-blue-300 bg-blue-100/40" />;
                const r1 = Math.min(count, 10), r2 = Math.max(0, count - 10);
                return (
                  <div className="flex flex-col w-full" style={{ gap: 8 }}>
                    <div className="flex gap-0.5 w-full" style={{ height: SLOT_H }}>{Array.from({ length: 10 }).map((_, i) => i < r1 ? FilledSlot(i) : GhostSlot(i))}</div>
                    <div className="flex gap-0.5 w-full" style={{ height: SLOT_H }}>{Array.from({ length: 10 }).map((_, i) => i < r2 ? FilledSlot(i + 10) : GhostSlot(i + 10))}</div>
                  </div>
                );
              })()}
            </div>

            <div className="w-full flex flex-col items-center gap-2">
              <p className="text-xs text-gray-400">Write the number you see:</p>
              <SimpleWritingCanvas key={`start-${roundKey}`} onDone={(strokes) => { setStartStrokes(strokes); setStartWritePhase('enter'); }} />
            </div>
            {startWritePhase === 'enter' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full">
                <p className="text-xs text-gray-400 text-center mb-2">Now type it:</p>
                <SingleDigitEntry onSubmit={(n) => { setStartWritten(n); setStartWritePhase('done'); }} />
              </motion.div>
            )}
            {startWritePhase === 'done' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`text-3xl font-bold px-4 py-2 rounded-xl ${startWritten === game.current_number ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
                {startWritten} {startWritten === game.current_number ? '✓' : '✗'}
                {startWritten !== game.current_number && <span className="text-base ml-1 text-gray-400">(was {game.current_number})</span>}
              </motion.div>
            )}
          </div>

          {/* CENTER — Spinner result from teacher */}
          <div className="bg-white rounded-3xl p-4 shadow-xl flex flex-col items-center gap-3">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Spin!</p>
            <div className="flex-1 flex items-center justify-center py-8">
              <AnimatePresence mode="wait">
                <motion.div key={game.round_number}
                  initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }}
                  className={`text-2xl font-bold px-6 py-4 rounded-2xl text-center ${game.spinner_result === 'more' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                  1 {game.spinner_result === 'more' ? 'More ➕' : 'Less ➖'}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* RIGHT — Build area */}
          <div className="bg-white rounded-3xl p-4 shadow-xl flex flex-col gap-3">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide text-center">Build It!</p>
            <div className={`text-center text-base font-bold px-3 py-1.5 rounded-xl ${game.spinner_result === 'more' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
              1 {game.spinner_result === 'more' ? 'More ➕' : 'Less ➖'}
            </div>

            {/* Cube tray */}
            <div>
              <p className="text-xs text-gray-400 font-semibold mb-1">Your build ({builtCount} cubes)</p>
              {[0, 1].map(row => (
                <div key={row} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2, height: CS + 4, marginBottom: 4 }}>
                  {Array.from({ length: 10 }).map((_, col) => {
                    const idx = row * 10 + col;
                    const filled = idx < builtCount;
                    return filled ? (
                      <button key={col} onClick={() => setBuiltCount(c => Math.max(0, c - 1))}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', position: 'relative', height: CS }}>
                        <div style={{ position: 'absolute', top: 0, left: 3, right: 0, height: 5, background: '#4ade80', clipPath: 'polygon(0 100%, 3px 0, 100% 0, calc(100% - 3px) 100%)', borderTop: '1px solid #166534' }} />
                        <div style={{ position: 'absolute', top: 5, left: 0, right: 3, bottom: 0, background: '#16a34a', border: '1px solid #166534', borderRadius: 1 }} />
                        <div style={{ position: 'absolute', top: 5, right: 0, width: 3, bottom: 0, background: '#166534' }} />
                      </button>
                    ) : (
                      <div key={col} style={{ height: CS }} className="rounded border border-dashed border-green-200 bg-green-100/30" />
                    );
                  })}
                </div>
              ))}
              <p className="text-xs text-gray-300 text-center">Tap cube to remove</p>
            </div>

            {/* Tap buttons */}
            <div className="flex gap-2 justify-center">
              {[1, 5, 10].map(n => (
                <motion.button key={n} whileTap={{ scale: 0.85 }}
                  onClick={() => setBuiltCount(c => Math.min(c + n, 20))}
                  className="flex-1 py-2 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold border-2 border-blue-300">
                  +{n}
                </motion.button>
              ))}
            </div>

            {/* Writing */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-gray-400">Write how many you built:</p>
              <SimpleWritingCanvas key={`result-${roundKey}`} onDone={(strokes) => { setResultStrokes(strokes); setResultWritePhase('enter'); }} />
            </div>
            {resultWritePhase === 'enter' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <p className="text-xs text-gray-400 text-center mb-2">Now type it:</p>
                <SingleDigitEntry onSubmit={(n) => { setResultWritten(n); setResultWritePhase('done'); }} />
              </motion.div>
            )}
            {showResult && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`text-3xl font-bold text-center px-4 py-2 rounded-xl ${resultWritten === game.target_number ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
                {resultWritten} {resultWritten === game.target_number ? '✓' : '✗'}
                {resultWritten !== game.target_number && <span className="text-base ml-1 text-gray-400">(answer: {game.target_number})</span>}
              </motion.div>
            )}
          </div>
        </div>

        {showResult && !saved && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center mt-6">
            <button onClick={handleSave} disabled={saving}
              className="px-8 py-4 bg-white text-indigo-700 font-bold text-lg rounded-2xl hover:bg-indigo-50 shadow-lg disabled:opacity-50">
              {saving ? 'Saving…' : '💾 Save'}
            </button>
          </motion.div>
        )}
        {saved && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center mt-6">
            <div className="px-8 py-4 bg-green-500 text-white font-bold text-lg rounded-2xl shadow-lg">
              ✓ Saved — waiting for next round…
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}