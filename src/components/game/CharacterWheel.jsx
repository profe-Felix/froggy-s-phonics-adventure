import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { getCharacters } from '@/lib/characters';

const SPIN_COST = 100;
const SEGMENTS = 6;

// Character wheel: spend SPIN_COST coins to spin for a random character you
// don't own yet. The unlocked character is granted as soon as the wheel lands.
export default function CharacterWheel({ studentData, onSpend, onUnlock, onClose }) {
  const coins = studentData?.coins || 0;
  const unlocked = studentData?.unlocked_characters || [];
  const [characters, setCharacters] = useState([]);
  const [segments, setSegments] = useState([]);
  const [allUnlocked, setAllUnlocked] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const canvasRef = useRef(null);
  const rotRef = useRef(0);
  const animRef = useRef(null);
  const imgsRef = useRef([]);

  useEffect(() => {
    let alive = true;
    getCharacters().then((all) => {
      if (!alive) return;
      setCharacters(all);
      const locked = all.filter((c) => !unlocked.includes(c.id));
      if (locked.length === 0) { setAllUnlocked(true); return; }
      const segs = [];
      for (let i = 0; i < SEGMENTS; i++) segs.push(locked[i % locked.length]);
      setSegments(segs);
      const loaded = new Array(segs.length);
      let done = 0;
      segs.forEach((s, i) => {
        const im = new Image();
        im.onload = im.onerror = () => {
          loaded[i] = im;
          done++;
          if (done === segs.length) draw(rotRef.current);
        };
        im.src = s.url;
      });
      imgsRef.current = loaded;
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = (rot) => {
    const canvas = canvasRef.current;
    if (!canvas || !segments.length) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const cx = size / 2, cy = size / 2, r = size / 2 - 4;
    const count = segments.length;
    const arc = (2 * Math.PI) / count;
    const colors = ['#f9a8d4', '#86efac', '#fde68a', '#a5f3fc', '#c4b5fd', '#fed7aa'];
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < count; i++) {
      const start = (i / count) * 2 * Math.PI - Math.PI / 2 + (rot * Math.PI) / 180;
      const end = start + arc;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
      const mid = start + arc / 2;
      const ir = r * 0.62;
      const ix = cx + Math.cos(mid) * ir - 22;
      const iy = cy + Math.sin(mid) * ir - 22;
      const img = imgsRef.current[i];
      ctx.save();
      ctx.beginPath();
      ctx.arc(ix + 22, iy + 22, 22, 0, 2 * Math.PI);
      ctx.clip();
      if (img && img.complete && img.naturalWidth) ctx.drawImage(img, ix, iy, 44, 44);
      else { ctx.fillStyle = '#ffffffaa'; ctx.fillRect(ix, iy, 44, 44); }
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  useEffect(() => {
    if (segments.length) draw(rotRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  const spin = () => {
    if (spinning || winner || !segments.length || coins < SPIN_COST) return;
    setSpinning(true);
    onSpend(SPIN_COST);
    const winIdx = Math.floor(Math.random() * segments.length);
    const winChar = segments[winIdx];
    const count = segments.length;
    const segDeg = 360 / count;
    const segMid = (winIdx / count) * 360 + segDeg / 2;
    const target = 5 * 360 + ((360 - segMid) % 360);
    const startRot = rotRef.current;
    const dur = 4000;
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const animate = (now) => {
      const t = Math.min((now - t0) / dur, 1);
      const cur = startRot + target * ease(t);
      rotRef.current = cur;
      draw(cur);
      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        setWinner(winChar);
        onUnlock(winChar.id);
      }
    };
    animRef.current = requestAnimationFrame(animate);
  };

  const canAfford = coins >= SPIN_COST;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget && !spinning) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-4 mx-4 max-w-sm w-full relative"
      >
        <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-2xl font-black text-amber-600">🎯 Character Wheel</h2>
        <p className="text-sm text-gray-500 font-bold text-center">
          Spend {SPIN_COST} coins to spin for a new character!
        </p>
        <div className="flex items-center gap-1.5 bg-amber-100 px-3 py-1 rounded-full text-amber-800 font-black text-sm">
          🪙 {coins} coins
        </div>

        {allUnlocked ? (
          <p className="text-center font-black text-green-600 py-8">🎉 You've collected all the characters!</p>
        ) : (
          <>
            <div className="relative">
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10"
                style={{ width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '22px solid #ef4444' }}
              />
              <canvas ref={canvasRef} width={280} height={280} className="rounded-full border-4 border-amber-200 shadow-lg" />
            </div>

            {!winner ? (
              <button
                onClick={spin}
                disabled={spinning || !canAfford}
                className={`w-full py-3 rounded-2xl font-black text-lg shadow-lg transition ${spinning ? 'bg-gray-200 text-gray-400' : canAfford ? 'bg-amber-500 text-white hover:bg-amber-600 active:scale-95' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
              >
                {spinning ? '🌀 Spinning…' : canAfford ? `🎯 SPIN (${SPIN_COST} 🪙)` : `Need ${SPIN_COST} 🪙`}
              </button>
            ) : (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-full flex flex-col items-center gap-3"
              >
                <img src={winner.url} alt="new character" className="w-28 h-28 rounded-2xl border-4 border-amber-300 shadow-lg object-cover" />
                <p className="text-xl font-black text-gray-800">New character unlocked!</p>
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-2xl bg-green-500 text-white font-black text-lg shadow hover:bg-green-600 active:scale-95"
                >
                  🎉 Awesome!
                </button>
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}