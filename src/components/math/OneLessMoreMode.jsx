import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { base44 } from '@/api/base44Client';
import OneLessMoreSpinner from './OneLessMoreSpinner';
import SimpleWritingCanvas from './SimpleWritingCanvas';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function makeCubes(count, prefix) {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`);
}

function SingleDigitEntry({ onSubmit }) {
  const [built, setBuilt] = useState('');
  const [done, setDone] = useState(false);

  const handleDigit = (d) => {
    if (done || built.length >= 2) return;
    setBuilt(b => b + String(d));
  };

  const handleUndo = () => { if (!done) setBuilt(b => b.slice(0, -1)); };

  const handleSubmit = () => {
    if (!built || done) return;
    setDone(true);
    onSubmit(parseInt(built));
  };

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

function CubeBlock({ draggableId, index, color = 'blue' }) {
  const colors = {
    blue: { front: '#2d4fa1', top: '#4a6fc7', side: '#1e3a8a' },
    green: { front: '#166534', top: '#22c55e', side: '#14532d' },
  };
  const c = colors[color];
  return (
    <Draggable draggableId={draggableId} index={index}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
          style={{ ...provided.draggableProps.style, opacity: snapshot.isDragging ? 0.85 : 1 }}
          className="flex-shrink-0">
          <div style={{ width: 36, height: 36, position: 'relative', cursor: 'grab' }}>
            <div style={{ position: 'absolute', top: 0, left: 4, right: 0, height: 8, background: c.top, clipPath: 'polygon(0 100%, 4px 0, 100% 0, calc(100% - 4px) 100%)', borderTop: `1px solid ${c.side}` }} />
            <div style={{ position: 'absolute', top: 8, left: 0, right: 4, bottom: 0, background: c.front, border: `1.5px solid ${c.side}`, borderRadius: 2 }} />
            <div style={{ position: 'absolute', top: 8, right: 0, width: 4, bottom: 0, background: c.side, borderRadius: '0 2px 2px 0' }} />
          </div>
        </div>
      )}
    </Draggable>
  );
}

function CubeZone({ droppableId, cubes, label, placeholder, color, minHeight = 60 }) {
  return (
    <Droppable droppableId={droppableId} direction="horizontal">
      {(provided, snapshot) => (
        <div>
          {label && <p className="text-xs text-gray-400 font-semibold mb-1">{label}</p>}
          <div ref={provided.innerRef} {...provided.droppableProps}
            className={`flex flex-wrap gap-1 p-2 rounded-xl border-2 transition-colors ${snapshot.isDraggingOver ? 'border-indigo-400 bg-indigo-50' : 'border-dashed border-gray-300 bg-gray-50'}`}
            style={{ minHeight }}>
            {cubes.length === 0 && <p className="text-gray-300 text-xs self-center w-full text-center">{placeholder}</p>}
            {cubes.map((id, i) => <CubeBlock key={id} draggableId={id} index={i} color={color} />)}
            {provided.placeholder}
          </div>
        </div>
      )}
    </Droppable>
  );
}

function DisplayCubes({ count }) {
  const Cube = () => (
    <div style={{ width: 34, height: 34, position: 'relative', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 0, left: 4, right: 0, height: 7, background: '#4a6fc7', clipPath: 'polygon(0 100%, 4px 0, 100% 0, calc(100% - 4px) 100%)', borderTop: '1px solid #1e3a8a' }} />
      <div style={{ position: 'absolute', top: 7, left: 0, right: 4, bottom: 0, background: '#2d4fa1', border: '1.5px solid #1e3a8a', borderRadius: 2 }} />
      <div style={{ position: 'absolute', top: 7, right: 0, width: 4, bottom: 0, background: '#1e3a8a', borderRadius: '0 2px 2px 0' }} />
    </div>
  );
  const row1 = Math.min(count, 10);
  const row2 = Math.max(0, count - 10);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-0.5">{Array.from({ length: row1 }).map((_, i) => <Cube key={i} />)}</div>
      {row2 > 0 && <div className="flex flex-wrap gap-0.5">{Array.from({ length: row2 }).map((_, i) => <Cube key={i} />)}</div>}
    </div>
  );
}

export default function OneLessMoreMode({ studentNumber, className: classProp, onBack }) {
  const [startNumber] = useState(() => Math.floor(Math.random() * 17) + 2);
  const [spinDone, setSpinDone] = useState(false);
  const [spinResult, setSpinResult] = useState(null);
  const [targetNumber, setTargetNumber] = useState(null);

  const [bank, setBank] = useState(() => makeCubes(20, 'cube'));
  const [built, setBuilt] = useState([]);

  const [startWritePhase, setStartWritePhase] = useState('write'); // write | enter | done
  const [startWritten, setStartWritten] = useState(null);
  const [startStrokes, setStartStrokes] = useState(null);

  const [resultWritePhase, setResultWritePhase] = useState('write'); // write | enter | done
  const [resultWritten, setResultWritten] = useState(null);
  const [resultStrokes, setResultStrokes] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSpinResult = (result) => {
    setSpinResult(result);
    setSpinDone(true);
    const target = result === 'more' ? startNumber + 1 : startNumber - 1;
    setTargetNumber(target);
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.droppableId === destination.droppableId) {
      const list = source.droppableId === 'bank' ? [...bank] : [...built];
      const [item] = list.splice(source.index, 1);
      list.splice(destination.index, 0, item);
      if (source.droppableId === 'bank') setBank(list); else setBuilt(list);
    } else {
      const srcList = source.droppableId === 'bank' ? [...bank] : [...built];
      const dstList = destination.droppableId === 'bank' ? [...bank] : [...built];
      const [item] = srcList.splice(source.index, 1);
      dstList.splice(destination.index, 0, item);
      if (source.droppableId === 'bank') { setBank(srcList); setBuilt(dstList); }
      else { setBuilt(srcList); setBank(dstList); }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.OneLessMoreAttempt.create({
        student_number: studentNumber,
        class_name: classProp,
        starting_number: startNumber,
        spinner_result: spinResult,
        target_number: targetNumber,
        student_wrote_start: startWritten,
        student_wrote_result: resultWritten,
        is_correct_start: startWritten === startNumber,
        is_correct_result: resultWritten === targetNumber,
        start_strokes_data: startStrokes ? JSON.stringify(startStrokes) : null,
        result_strokes_data: resultStrokes ? JSON.stringify(resultStrokes) : null,
      });
    } catch (e) { console.error(e); }
    setSaving(false);
    setSaved(true);
  };

  const showResult = resultWritePhase === 'done' && resultWritten !== null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center py-6 px-3">
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="text-white/80 hover:text-white font-medium">← Back</button>
          <h1 className="text-xl font-bold text-white">🧊 1 More / 1 Less</h1>
          <span className="text-white/70 text-sm">#{studentNumber}</span>
        </div>

        <div className="grid grid-cols-3 gap-4 items-start">

          {/* LEFT — Starting number */}
          <div className="bg-white rounded-3xl p-4 shadow-xl flex flex-col items-center gap-3">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Starting</p>
            <div className="bg-sky-50 rounded-xl p-3 border border-sky-200 w-full flex justify-center">
              <DisplayCubes count={startNumber} />
            </div>

            {startWritePhase === 'write' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full flex flex-col items-center gap-2">
                <p className="text-xs text-gray-400">Write the number you see:</p>
                <SimpleWritingCanvas onDone={(strokes) => { setStartStrokes(strokes); setStartWritePhase('enter'); }} />
              </motion.div>
            )}
            {startWritePhase === 'enter' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full">
                <p className="text-xs text-gray-400 text-center mb-2">Now type it:</p>
                <SingleDigitEntry onSubmit={(n) => { setStartWritten(n); setStartWritePhase('done'); }} />
              </motion.div>
            )}
            {startWritePhase === 'done' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`text-3xl font-bold px-4 py-2 rounded-xl ${startWritten === startNumber ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
                {startWritten} {startWritten === startNumber ? '✓' : '✗'}
                {startWritten !== startNumber && <span className="text-base ml-1 text-gray-400">(was {startNumber})</span>}
              </motion.div>
            )}
          </div>

          {/* CENTER — Spinner */}
          <div className="bg-white rounded-3xl p-4 shadow-xl flex flex-col items-center gap-3">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Spin!</p>
            <OneLessMoreSpinner onResult={handleSpinResult} />
          </div>

          {/* RIGHT — Build area */}
          <div className={`bg-white rounded-3xl p-4 shadow-xl flex flex-col gap-3 transition-opacity ${spinDone ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide text-center">Build It!</p>

            {spinDone && (
              <div className={`text-center text-base font-bold px-3 py-1.5 rounded-xl ${spinResult === 'more' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                1 {spinResult === 'more' ? 'More ➕' : 'Less ➖'}
              </div>
            )}

            <DragDropContext onDragEnd={onDragEnd}>
              <CubeZone droppableId="built" cubes={built} label={`Your build (${built.length} cubes)`} placeholder="Drag cubes here…" color="green" minHeight={72} />
              <CubeZone droppableId="bank" cubes={bank} label="Cube bank" placeholder="" color="blue" minHeight={48} />
            </DragDropContext>

            {spinDone && resultWritePhase === 'write' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-2">
                <p className="text-xs text-gray-400">Write how many you built:</p>
                <SimpleWritingCanvas onDone={(strokes) => { setResultStrokes(strokes); setResultWritePhase('enter'); }} />
              </motion.div>
            )}
            {spinDone && resultWritePhase === 'enter' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <p className="text-xs text-gray-400 text-center mb-2">Now type it:</p>
                <SingleDigitEntry onSubmit={(n) => { setResultWritten(n); setResultWritePhase('done'); }} />
              </motion.div>
            )}
            {showResult && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className={`text-3xl font-bold text-center px-4 py-2 rounded-xl ${resultWritten === targetNumber ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
                {resultWritten} {resultWritten === targetNumber ? '✓' : '✗'}
                {resultWritten !== targetNumber && <span className="text-base ml-1 text-gray-400">(answer: {targetNumber})</span>}
              </motion.div>
            )}
          </div>
        </div>

        {showResult && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center gap-4 mt-6">
            {!saved ? (
              <button onClick={handleSave} disabled={saving}
                className="px-8 py-4 bg-white text-indigo-700 font-bold text-lg rounded-2xl hover:bg-indigo-50 shadow-lg disabled:opacity-50">
                {saving ? 'Saving…' : '💾 Save & Next'}
              </button>
            ) : (
              <button onClick={() => window.location.reload()}
                className="px-8 py-4 bg-indigo-600 text-white font-bold text-xl rounded-2xl hover:bg-indigo-700 active:scale-95 shadow-lg">
                Next Round 🎲
              </button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}