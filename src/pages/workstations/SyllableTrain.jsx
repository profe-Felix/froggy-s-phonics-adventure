import { useState, useRef, useEffect, useCallback } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import BackButton from '@/components/ui/BackButton';
import { TrainEngine, TrainCar } from '@/components/workstations/TrainArt';

const MIN = 1;
const MAX = 12;

// Syllable Train — a drag-and-drop manipulative. Students build a train of
// red/blue cars on a rail (1–12 slots) by dragging from the color sources,
// and can rearrange or remove cars by dragging them. No data persistence —
// it's a free-play activity.
// ?role=teacher → slot controls + student QR
export default function SyllableTrain() {
  const params = new URLSearchParams(window.location.search);
  const isTeacher = params.get('role') === 'teacher';
  const [slotCount, setSlotCount] = useState(4);
  const [slots, setSlots] = useState(() => Array.from({ length: 4 }, () => null));
  const [dragging, setDragging] = useState(null); // { color, from }  from: -1 = source
  const [ghost, setGhost] = useState({ x: 0, y: 0, visible: false });
  const railRef = useRef(null);
  const [showQr, setShowQr] = useState(false);

  const changeCount = (delta) => {
    const n = Math.max(MIN, Math.min(MAX, slotCount + delta));
    setSlotCount(n);
    setSlots((prev) => {
      const next = [...prev];
      if (n > next.length) while (next.length < n) next.push(null);
      else next.length = n;
      return next;
    });
  };

  const beginDrag = (color, from, e) => {
    e.preventDefault();
    if (from >= 0) {
      setSlots((prev) => {
        const next = [...prev];
        next[from] = null;
        return next;
      });
    }
    setDragging({ color, from });
    setGhost({ x: e.clientX, y: e.clientY, visible: true });
  };

  // Document-level pointer tracking while dragging (so the ghost follows even
  // outside the rail).
  useEffect(() => {
    if (!dragging) return;
    const move = (e) => {
      e.preventDefault();
      setGhost({ x: e.clientX, y: e.clientY, visible: true });
    };
    const up = (e) => {
      const rail = railRef.current;
      let best = -1;
      let dist = Infinity;
      if (rail) {
        const slotEls = rail.querySelectorAll('[data-slot]');
        slotEls.forEach((el, i) => {
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const d = Math.abs(e.clientX - cx);
          if (d < dist) { dist = d; best = i; }
        });
      }
      const NEAR = 90; // px tolerance to count as "on the rail"
      setSlots((prev) => {
        const next = [...prev];
        if (dragging.from === -1) {
          // from source
          if (best >= 0 && dist < NEAR) {
            if (next[best] === null) {
              next[best] = dragging.color;
            } else if (next.length < MAX) {
              next.splice(best, 0, dragging.color);
            }
          }
          // else: dropped away → discard
        } else {
          // from an existing slot (already nulled on pickup)
          if (best >= 0 && dist < NEAR) {
            if (next[best] === null) {
              next[best] = dragging.color;
            } else {
              const tmp = next[best];
              next[best] = dragging.color;
              next[dragging.from] = tmp;
            }
          }
          // dropped away → car removed (stays null)
        }
        return next;
      });
      setDragging(null);
      setGhost((g) => ({ ...g, visible: false }));
    };
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
  }, [dragging]);

  const studentUrl = `${window.location.origin}${window.location.pathname}?role=student`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#fff' }}>
      <div className="flex items-center gap-3 p-3 bg-slate-100 border-b sticky top-0 z-20 flex-wrap">
        <BackButton onClick={() => window.history.back()} />
        <h1 className="font-bold text-lg mr-2">Syllable Train</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => changeCount(-1)} className="w-9 h-8 rounded-lg border-2 border-slate-300 bg-slate-50 text-blue-600 font-bold">−</button>
          <span className="font-bold text-sm">Slots: {slotCount}</span>
          <button onClick={() => changeCount(1)} className="w-9 h-8 rounded-lg border-2 border-slate-300 bg-slate-50 text-blue-600 font-bold">+</button>
        </div>
        {isTeacher && (
          <button onClick={() => setShowQr(true)} className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold">📱 Student QR</button>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8" style={{ touchAction: 'none' }}>
        <div ref={railRef} className="flex items-end justify-center" style={{ touchAction: 'none' }}>
          {/* Engine */}
          <div className="shrink-0 mr-[-40px]">
            <TrainEngine />
          </div>
          {/* Slots */}
          <div className="flex">
            {slots.map((color, i) => (
              <div
                key={i}
                data-slot
                className="relative rounded-xl border-2 border-dashed border-slate-300"
                style={{ width: 110, height: 60 }}
              >
                {color && (
                  <div
                    onPointerDown={(e) => beginDrag(color, i, e)}
                    className="absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing"
                    style={{ boxShadow: '0 3px 0 rgba(0,0,0,.15)', borderRadius: 12 }}
                  >
                    <TrainCar color={color} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sources */}
        <div className="flex gap-8">
          {['red', 'blue'].map((c) => (
            <div
              key={c}
              onPointerDown={(e) => beginDrag(c, -1, e)}
              className="cursor-grab active:cursor-grabbing"
              style={{ width: 110, height: 60, boxShadow: '0 3px 0 rgba(0,0,0,.15)', borderRadius: 12 }}
            >
              <TrainCar color={c} />
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-400 text-center max-w-md">
          Drag a car onto the rail to add it. Drag a car to another slot to move it, or drag it away to remove it.
        </p>
      </div>

      {/* Drag ghost */}
      {ghost.visible && dragging && (
        <div
          className="fixed pointer-events-none flex items-center justify-center z-50"
          style={{
            left: ghost.x, top: ghost.y, transform: 'translate(-50%,-50%)',
            width: 110, height: 60, opacity: 0.9,
          }}
        >
          <TrainCar color={dragging.color} />
        </div>
      )}

      {showQr && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowQr(false)}>
          <div className="bg-white p-6 rounded-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold mb-3 text-lg">Student Link</p>
            <QRCodeCanvas value={studentUrl} size={240} />
            <p className="text-xs text-gray-500 mt-3 break-all max-w-xs">{studentUrl}</p>
            <button onClick={() => setShowQr(false)} className="mt-4 px-4 py-2 rounded-lg border font-bold">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}