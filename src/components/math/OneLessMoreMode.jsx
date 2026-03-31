import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { base44 } from '@/api/base44Client';
import OneLessMoreSpinner from './OneLessMoreSpinner';
import SimpleWritingCanvas from './SimpleWritingCanvas';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
let cloneCounter = 0;
const CS = 26; // draggable cube size

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

// Ten-frame ghost-slot display: fluid width, two rows of 10
function DisplayCubes({ count }) {
  const SLOT_H = 24;
  const FilledCube = () => (
    <div style={{ flex: 1, height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 3, right: 0, height: 5, background: '#4a6fc7', clipPath: 'polygon(0 100%, 3px 0, 100% 0, calc(100% - 3px) 100%)', borderTop: '1px solid #1e3a8a' }} />
      <div style={{ position: 'absolute', top: 5, left: 0, right: 3, bottom: 0, background: '#2d4fa1', border: '1px solid #1e3a8a', borderRadius: 1 }} />
      <div style={{ position: 'absolute', top: 5, right: 0, width: 3, bottom: 0, background: '#1e3a8a', borderRadius: '0 1px 1px 0' }} />
    </div>
  );
  const GhostSlot = () => (
    <div style={{ flex: 1, height: '100%' }}
      className="rounded border border-dashed border-blue-300 bg-blue-100/40" />
  );
  const row1Count = Math.min(count, 10);
  const row2Count = Math.max(0, count - 10);
  return (
    <div className="flex flex-col w-full" style={{ gap: 8 }}>
      <div className="flex gap-0.5 w-full" style={{ height: SLOT_H }}>
        {Array.from({ length: 10 }).map((_, i) =>
          i < row1Count ? <FilledCube key={i} /> : <GhostSlot key={i} />
        )}
      </div>
      <div className="flex gap-0.5 w-full" style={{ height: SLOT_H }}>
        {Array.from({ length: 10 }).map((_, i) =>
          i < row2Count ? <FilledCube key={i} /> : <GhostSlot key={i} />
        )}
      </div>
    </div>
  );
}

// Cube for the bank — drag to clone
function BankCube({ index }) {
  return (
    <Draggable draggableId={`bank-src-${index}`} index={index}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
          style={{ ...provided.draggableProps.style, opacity: snapshot.isDragging ? 0.7 : 1, touchAction: 'none' }}
          className="flex-shrink-0 cursor-grab">
          <div style={{ width: CS, height: CS, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 3, right: 0, height: 5, background: '#4a6fc7', clipPath: 'polygon(0 100%, 3px 0, 100% 0, calc(100% - 3px) 100%)', borderTop: '1px solid #1e3a8a' }} />
            <div style={{ position: 'absolute', top: 5, left: 0, right: 3, bottom: 0, background: '#2d4fa1', border: '1px solid #1e3a8a', borderRadius: 1 }} />
            <div style={{ position: 'absolute', top: 5, right: 0, width: 3, bottom: 0, background: '#1e3a8a', borderRadius: '0 1px 1px 0' }} />
          </div>
        </div>
      )}
    </Draggable>
  );
}

// Cube placed in the built zone — green, reorderable
function BuiltCube({ draggableId, index, useFlex }) {
  return (
    <Draggable draggableId={draggableId} index={index}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
          style={{ ...provided.draggableProps.style, opacity: snapshot.isDragging ? 0.7 : 1, flex: useFlex ? 1 : undefined, height: '100%', touchAction: 'none' }}
          className="cursor-grab">
          <div style={{ width: useFlex ? '100%' : CS, height: '100%', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: 3, right: 0, height: 5, background: '#4ade80', clipPath: 'polygon(0 100%, 3px 0, 100% 0, calc(100% - 3px) 100%)', borderTop: '1px solid #166534' }} />
            <div style={{ position: 'absolute', top: 5, left: 0, right: 3, bottom: 0, background: '#16a34a', border: '1px solid #166534', borderRadius: 1 }} />
            <div style={{ position: 'absolute', top: 5, right: 0, width: 3, bottom: 0, background: '#166534', borderRadius: '0 1px 1px 0' }} />
          </div>
        </div>
      )}
    </Draggable>
  );
}

// Fixed bank of 5 cubes — dragging from here CLONES into built
const BANK_CUBES = Array.from({ length: 5 }, (_, i) => i);

export default function OneLessMoreMode({ studentNumber, className: classProp, onBack }) {
  const [roundKey, setRoundKey] = useState(0);
  const [startNumber, setStartNumber] = useState(() => Math.floor(Math.random() * 17) + 2);
  const [spinDone, setSpinDone] = useState(false);
  const [spinResult, setSpinResult] = useState(null);
  const [targetNumber, setTargetNumber] = useState(null);

  const [built, setBuilt] = useState([]);

  const [startWritePhase, setStartWritePhase] = useState('write');
  const [startWritten, setStartWritten] = useState(null);
  const [startStrokes, setStartStrokes] = useState(null);

  const [resultWritePhase, setResultWritePhase] = useState('write');
  const [resultWritten, setResultWritten] = useState(null);
  const [resultStrokes, setResultStrokes] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const resetRound = () => {
    setStartNumber(Math.floor(Math.random() * 17) + 2);
    setSpinDone(false);
    setSpinResult(null);
    setTargetNumber(null);
    setBuilt([]);
    setStartWritePhase('write');
    setStartWritten(null);
    setStartStrokes(null);
    setResultWritePhase('write');
    setResultWritten(null);
    setResultStrokes(null);
    setSaving(false);
    setSaved(false);
    setRoundKey(k => k + 1);
  };

  const handleSpinResult = (result) => {
    setSpinResult(result);
    setSpinDone(true);
    setTargetNumber(result === 'more' ? startNumber + 1 : startNumber - 1);
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination } = result;

    if (source.droppableId === 'bank' && destination.droppableId === 'built') {
      const newId = `built-${++cloneCounter}`;
      setBuilt(prev => {
        const next = [...prev];
        next.splice(destination.index, 0, newId);
        return next;
      });
      return;
    }

    if (source.droppableId === 'built' && destination.droppableId === 'built') {
      setBuilt(prev => {
        const next = [...prev];
        const [item] = next.splice(source.index, 1);
        next.splice(destination.index, 0, item);
        return next;
      });
      return;
    }

    if (source.droppableId === 'built' && destination.droppableId === 'bank') {
      setBuilt(prev => prev.filter((_, i) => i !== source.index));
      return;
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
            <div className="bg-sky-50 rounded-xl p-3 border border-sky-200 w-full overflow-hidden">
              <DisplayCubes count={startNumber} />
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
                className={`text-3xl font-bold px-4 py-2 rounded-xl ${startWritten === startNumber ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
                {startWritten} {startWritten === startNumber ? '✓' : '✗'}
                {startWritten !== startNumber && <span className="text-base ml-1 text-gray-400">(was {startNumber})</span>}
              </motion.div>
            )}
          </div>

          {/* CENTER — Spinner */}
          <div className="bg-white rounded-3xl p-4 shadow-xl flex flex-col items-center gap-3">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Spin!</p>
            <OneLessMoreSpinner key={`spinner-${roundKey}`} onResult={handleSpinResult} />
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
              {/* Built zone — ten-frame grid with ghost slots, fluid width */}
              <div>
                <p className="text-xs text-gray-400 font-semibold mb-1">Your build ({built.length} cubes)</p>
                {/* Row 1: slots 0-9 */}
                <Droppable droppableId="built" direction="horizontal">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex gap-0.5 p-1.5 rounded-xl border-2 transition-colors ${snapshot.isDraggingOver ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
                      style={{ height: CS + 12 }}
                    >
                      {Array.from({ length: 10 }).map((_, i) => {
                        const id = built[i];
                        if (id) return <BuiltCube key={id} draggableId={id} index={i} useFlex />;
                        return <div key={`ghost-${i}`} style={{ flex: 1, height: '100%' }} className="rounded border border-dashed border-gray-300 bg-gray-200/50" />;
                      })}
                      <div style={{ display: 'none' }}>{provided.placeholder}</div>
                    </div>
                  )}
                </Droppable>
                {/* Row 2: slots 10-19 */}
                <div className="flex gap-0.5 p-1.5 rounded-xl border border-dashed border-gray-200 bg-gray-50 mt-2" style={{ height: CS + 12 }}>
                  {Array.from({ length: 10 }).map((_, i) => {
                    const id = built[10 + i];
                    if (id) {
                      return (
                        <div key={id} style={{ flex: 1, height: '100%', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 0, left: 3, right: 0, height: 5, background: '#4ade80', clipPath: 'polygon(0 100%, 3px 0, 100% 0, calc(100% - 3px) 100%)', borderTop: '1px solid #166534' }} />
                          <div style={{ position: 'absolute', top: 5, left: 0, right: 3, bottom: 0, background: '#16a34a', border: '1px solid #166534', borderRadius: 1 }} />
                          <div style={{ position: 'absolute', top: 5, right: 0, width: 3, bottom: 0, background: '#166534', borderRadius: '0 1px 1px 0' }} />
                        </div>
                      );
                    }
                    return <div key={`ghost2-${i}`} style={{ flex: 1, height: '100%' }} className="rounded border border-dashed border-gray-300 bg-gray-200/50" />;
                  })}
                </div>
              </div>

              {/* Bank — fixed cubes, drag = clone */}
              <Droppable droppableId="bank" direction="horizontal">
                {(provided, snapshot) => (
                  <div>
                    <p className="text-xs text-gray-400 font-semibold mb-1">Cube bank — drag to build</p>
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex gap-1 p-2 rounded-xl border-2 transition-colors ${snapshot.isDraggingOver ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}
                    >
                      {BANK_CUBES.map((_, i) => <BankCube key={i} index={i} />)}
                      {provided.placeholder}
                    </div>
                    <p className="text-xs text-gray-300 mt-1 text-center">Drag back to remove</p>
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            {spinDone && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-gray-400">Write how many you built:</p>
                <SimpleWritingCanvas key={`result-${roundKey}`} onDone={(strokes) => { setResultStrokes(strokes); setResultWritePhase('enter'); }} />
              </div>
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
              <button onClick={resetRound}
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