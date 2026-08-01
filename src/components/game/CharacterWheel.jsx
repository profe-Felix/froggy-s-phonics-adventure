import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { getCharacters } from '@/lib/characters';

const SPIN_COST = 100;
const ITEM_H = 120;                  // tile height during spin — big & clear
const VISIBLE = 3;                    // 3 characters visible at a time
const WINDOW_H = ITEM_H * VISIBLE;
const RESULT_H = Math.round(ITEM_H * 2.5); // winner shown 2.5x bigger
const SPIN_MS = 5000;                 // starts fast, decelerates quickly so kids can see characters
const TREASURE_CHANCE = 0.05;         // rare physical-prize box
const REEL_LEN = 48;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Vertical slot-machine spinner: spend SPIN_COST coins for a slow spin that
// shows 3 characters at a time and lands on a random locked character (or a
// rare treasure box = physical prize). The winner is revealed 2.5x bigger.
export default function CharacterWheel({ studentData, onSpend, onUnlock, onClose }) {
  const coins = studentData?.coins || 0;
  const unlocked = studentData?.unlocked_characters || [];
  const [characters, setCharacters] = useState([]);
  const [allUnlocked, setAllUnlocked] = useState(false);
  const [reel, setReel] = useState([]);
  const [offset, setOffset] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const animRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getCharacters().then((all) => {
      if (!alive) return;
      setCharacters(all);
      const locked = all.filter((c) => !unlocked.includes(c.id));
      if (locked.length === 0) { setAllUnlocked(true); return; }
      setReel(buildIdleReel(locked));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildIdleReel(locked) {
    const sub = shuffle(locked).slice(0, Math.min(6, locked.length));
    const tiles = [];
    for (let i = 0; i < REEL_LEN; i++) tiles.push({ type: 'char', char: sub[i % sub.length] });
    return tiles;
  }

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  const canAfford = coins >= SPIN_COST;

  const spin = () => {
    if (spinning || winner || allUnlocked || !characters.length || !canAfford) return;
    onSpend(SPIN_COST);
    const locked = characters.filter((c) => !unlocked.includes(c.id));
    if (!locked.length) return;

    // Random subset so the reel never has to cycle all 186 characters.
    const subset = shuffle(locked).slice(0, Math.min(24, locked.length));
    const isTreasure = Math.random() < TREASURE_CHANCE;
    const winChar = subset[Math.floor(Math.random() * subset.length)];
    const winnerTile = isTreasure ? { type: 'treasure' } : { type: 'char', char: winChar };

    // Build the reel: random characters from the subset, a few treasure tiles
    // scattered for visual rarity, and the winner placed near the end.
    const tiles = [];
    for (let i = 0; i < REEL_LEN; i++) {
      tiles.push({ type: 'char', char: subset[Math.floor(Math.random() * subset.length)] });
    }
    for (let k = 0; k < 3; k++) {
      const idx = Math.floor(Math.random() * (REEL_LEN - 8));
      tiles[idx] = { type: 'treasure' };
    }
    const winIdx = REEL_LEN - 5;
    tiles[winIdx] = winnerTile;

    setReel(tiles);
    setWinner(null);
    setSpinning(true);

    // Land the winner on the CENTER visible row.
    const target = (winIdx - 1) * ITEM_H;
    startRef.current = null;
    const startOffset = 0;
    const easeOut = (t) => 1 - Math.pow(1 - t, 5); // starts fast, slows down quickly

    const animate = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const p = Math.min((ts - startRef.current) / SPIN_MS, 1);
      setOffset(startOffset + (target - startOffset) * easeOut(p));
      if (p < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setOffset(target);
        setSpinning(false);
        setWinner(winnerTile);
        if (winnerTile.type === 'char') onUnlock(winnerTile.char.id);
      }
    };
    animRef.current = requestAnimationFrame(animate);
  };

  const translateY = -offset;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget && !spinning) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-3 mx-4 w-full max-w-sm relative max-h-[92vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 z-10">
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-2xl font-black text-amber-600">🎯 Character Spin</h2>
        <p className="text-sm text-gray-500 font-bold text-center">
          Spend {SPIN_COST} coins to spin for a new character!
        </p>
        <div className="flex items-center gap-1.5 bg-amber-100 px-3 py-1 rounded-full text-amber-800 font-black text-sm">
          🪙 {coins} coins
        </div>

        {allUnlocked ? (
          <p className="text-center font-black text-green-600 py-8">🎉 You've collected all the characters!</p>
        ) : winner ? (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full flex flex-col items-center gap-3"
          >
            {winner.type === 'char' ? (
              <>
                <img
                  src={winner.char.url}
                  alt="new character"
                  style={{ width: RESULT_H, height: RESULT_H }}
                  className="rounded-2xl border-4 border-amber-300 shadow-lg object-cover"
                />
                <p className="text-xl font-black text-gray-800">New character unlocked!</p>
              </>
            ) : (
              <>
                <div
                  style={{ width: RESULT_H, height: RESULT_H }}
                  className="rounded-2xl border-4 border-yellow-400 shadow-lg bg-gradient-to-br from-yellow-200 to-amber-300 flex items-center justify-center"
                >
                  <span style={{ fontSize: 96 }}>🎁</span>
                </div>
                <p className="text-xl font-black text-gray-800">Treasure Box!</p>
                <p className="text-sm font-bold text-amber-600 text-center">
                  You won a special physical prize! 🎉
                </p>
              </>
            )}
            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-green-500 text-white font-black text-lg shadow hover:bg-green-600 active:scale-95"
            >
              🎉 Awesome!
            </button>
          </motion.div>
        ) : (
          <>
            {/* Slot window — 3 tiles visible, result lands on the bottom row */}
            <div className="relative" style={{ width: 240 }}>
              {/* pointer arrow at the bottom (result) row */}
              <div
                className="absolute z-20"
                style={{ top: ITEM_H + ITEM_H / 2, right: -6, transform: 'translateY(-50%)' }}
              >
                <div
                  style={{
                    width: 0, height: 0,
                    borderTop: '12px solid transparent',
                    borderBottom: '12px solid transparent',
                    borderRight: '18px solid #ef4444',
                  }}
                />
              </div>
              <div
                style={{
                  height: WINDOW_H,
                  overflow: 'hidden',
                  position: 'relative',
                  borderRadius: 20,
                  border: '4px solid #fcd34d',
                  background: 'rgba(252,211,77,0.08)',
                  boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.1)',
                }}
              >
                <div style={{ transform: `translateY(${translateY}px)`, willChange: 'transform' }}>
                  {reel.map((tile, i) => (
                    <div
                      key={i}
                      style={{ height: ITEM_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {tile.type === 'treasure' ? (
                        <div className="flex flex-col items-center justify-center" style={{ height: ITEM_H - 8 }}>
                          <span style={{ fontSize: 56 }}>🎁</span>
                          <span className="text-xs font-black text-amber-600">TREASURE</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center" style={{ height: ITEM_H - 8 }}>
                          <img
                            src={tile.char.url}
                            alt=""
                            style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 12, border: '2px solid #fde68a' }}
                          />
                          {tile.char.name && (
                            <span className="text-xs font-bold text-gray-600 mt-0.5 truncate max-w-[180px]">{tile.char.name}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* bottom result highlight band */}
                <div
                  className="absolute left-0 right-0 pointer-events-none"
                  style={{ top: ITEM_H, height: ITEM_H, boxShadow: 'inset 0 0 0 3px #ef4444', borderRadius: 12 }}
                />
              </div>
            </div>

            <button
              onClick={spin}
              disabled={spinning || !canAfford}
              className={`w-full py-3 rounded-2xl font-black text-lg shadow-lg transition ${spinning ? 'bg-gray-200 text-gray-400' : canAfford ? 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            >
              {spinning ? '🌀 Spinning…' : canAfford ? `🎯 SPIN (${SPIN_COST} 🪙)` : `Need ${SPIN_COST} 🪙`}
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}