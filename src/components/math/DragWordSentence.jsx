import { useState, useRef } from 'react';
import { motion } from 'framer-motion';

const COMPARISON_LABELS = {
  is_greater_than: 'is greater than',
  is_less_than: 'is less than',
  is_equal_to: 'is equal to',
};

function DropZone({ filled, selected, onPlace, dropRef }) {
  return (
    <div
      ref={dropRef}
      onClick={() => { if (!filled && selected) onPlace(selected); }}
      className={`min-w-[130px] h-10 rounded-xl border-4 border-dashed flex items-center justify-center font-black text-sm transition-all
        ${filled ? 'border-indigo-500 bg-indigo-100 text-indigo-700'
          : selected ? 'border-indigo-400 bg-indigo-50 text-indigo-500 cursor-pointer'
          : 'border-gray-300 bg-gray-50 text-gray-400'}`}>
      {filled || (selected ? 'tap' : '—')}
    </div>
  );
}

function DragWord({ label, value, dropped, selected, onSelect, onDrop, dropRef }) {
  const handlePointerDown = (e) => {
    if (dropped) return;
    e.preventDefault();
    onSelect(value);

    const startX = e.clientX, startY = e.clientY;
    let moved = false;

    const clone = document.createElement('div');
    clone.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;padding:8px 12px;background:#4f46e5;color:white;font-weight:900;border-radius:12px;font-size:12px;white-space:nowrap;';
    clone.textContent = label;
    document.body.appendChild(clone);
    const move = (cx, cy) => { clone.style.left = (cx - clone.offsetWidth / 2) + 'px'; clone.style.top = (cy - 16) + 'px'; };
    move(e.clientX, e.clientY);

    const onMove = (ev) => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      if (Math.abs(cx - startX) > 6 || Math.abs(cy - startY) > 6) moved = true;
      move(cx, cy);
    };
    const onUp = (ev) => {
      const cx = ev.changedTouches ? ev.changedTouches[0].clientX : ev.clientX;
      const cy = ev.changedTouches ? ev.changedTouches[0].clientY : ev.clientY;
      clone.remove();
      if (!moved) {
        new Audio(`/audio/${value}.mp3`).play().catch(() => {});
      } else if (dropRef?.current) {
        const rect = dropRef.current.getBoundingClientRect();
        if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
          onDrop(value);
        }
      }
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{ touchAction: 'none', userSelect: 'none' }}
      className={`px-3 py-2 rounded-xl font-black text-sm select-none shadow-md transition-all cursor-grab flex items-center gap-1.5
        ${dropped ? 'opacity-30 cursor-not-allowed'
          : selected ? 'bg-white text-indigo-700 border-4 border-indigo-500'
          : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
    >
      {label}
    </div>
  );
}

export default function DragWordSentence({ studentNumber, teacherNumber, correctComparison, onComplete, disabled }) {
  const [placed, setPlaced] = useState(null);
  const [placedValue, setPlacedValue] = useState(null);
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const dropRef = useRef(null);
  const labelMap = { is_greater_than: 'is greater than', is_less_than: 'is less than', is_equal_to: 'is equal to' };

  const handlePlace = (value) => {
    if (placed || disabled) return;
    setPlaced(labelMap[value]);
    setPlacedValue(value);
    const correct = value === correctComparison;
    setResult(correct ? 'correct' : 'wrong');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-3xl p-5 shadow-xl"
    >
      <p className="text-sm font-bold text-gray-400 uppercase mb-4 text-center">Complete the sentence</p>
      <div className="flex flex-wrap items-center justify-center gap-2 text-lg font-black text-gray-800 mb-5">
        <span className="bg-amber-100 px-3 py-1.5 rounded-lg">{studentNumber}</span>
        <DropZone filled={placed} selected={selected} onPlace={(v) => { handlePlace(v); setSelected(null); }} dropRef={dropRef} />
        <span className="bg-orange-100 px-3 py-1.5 rounded-lg">{teacherNumber}</span>
      </div>
      <div className="flex flex-wrap gap-2 justify-center mb-4">
        <DragWord label="is greater than" value="is_greater_than" dropped={!!placed} selected={selected === 'is_greater_than'} onSelect={setSelected} onDrop={(v) => { handlePlace(v); setSelected(null); }} dropRef={dropRef} />
        <DragWord label="is less than" value="is_less_than" dropped={!!placed} selected={selected === 'is_less_than'} onSelect={setSelected} onDrop={(v) => { handlePlace(v); setSelected(null); }} dropRef={dropRef} />
        <DragWord label="is equal to" value="is_equal_to" dropped={!!placed} selected={selected === 'is_equal_to'} onSelect={setSelected} onDrop={(v) => { handlePlace(v); setSelected(null); }} dropRef={dropRef} />
      </div>
      <p className="text-center text-xs text-gray-400">🔊 tap to hear • drag or tap to place</p>

      {result && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mt-4 space-y-3"
        >
          {result === 'wrong' && (
            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-xl bg-red-100 border-2 border-red-400 text-center">
                <p className="text-lg font-black text-red-700">
                  ✗ {studentNumber} {placed} {teacherNumber}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-green-100 border-2 border-green-400 text-center">
                <p className="text-lg font-black text-green-700">
                  ✓ {studentNumber} {labelMap[correctComparison]} {teacherNumber}
                </p>
              </div>
            </div>
          )}
          {result === 'correct' && (
            <div className="p-4 rounded-2xl bg-green-100 text-center">
              <span className="text-3xl mr-2">🎉</span>
              <p className="text-xl font-black text-green-700 mt-2">{studentNumber} {placed} {teacherNumber}</p>
            </div>
          )}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { setSubmitted(true); onComplete(result === 'correct'); }}
            disabled={submitted}
            className={`w-full py-3 rounded-2xl font-black text-lg text-white shadow-lg ${submitted ? 'bg-gray-400 cursor-not-allowed' : result === 'correct' ? 'bg-green-600' : 'bg-indigo-600'}`}
          >
            ✓ {submitted ? 'Waiting...' : "I'm Ready"}
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );
}