import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { base44 } from '@/api/base44Client';
import OneLessMoreSpinner from './OneLessMoreSpinner';
import SimpleWritingCanvas from './SimpleWritingCanvas';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
let cloneCounter = 0;
const BANK_SIZE = 10;
const CUBE_SIZE = 52; // big enough for a finger

function SingleDigitEntry({ onSubmit }) {
  const [built, setBuilt] = useState('');
  const [done, setDone] = useState(false);
  const handleDigit = (d) => { if (done || built.length >= 2) return; setBuilt(b => b + String(d)); };
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
            className="h-12 rounded-xl bg-white shadow text-xl font-bold text-indigo-700 border-2 border-indigo-200 disabled:opacity-40">
            {d}
          </motion.button>
        ))}
      </div>
      <div className="flex gap-2 w-full">
        <button onClick={handleUndo} disabled={done || !built}
          className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold text-lg disabled:opacity-30">⌫</button>
        <button onClick={handleSubmit} disabled={done || !built}
          className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold text-lg disabled:opacity-30">✓</button>
      </div>
    </div>
  );
}

// A single 3D-style cube — blue (bank) or green (built)
function Cube({ color = 'blue', style = {} }) {
  const colors = color === 'green'
    ? { top: '#4ade80', topDark: '#166534', front: '#16a34a', side: '#166534' }
    : { top: '#60a5fa', topDark: '#1e3a8a', front: '#2d4fa1', side: '#1e3a8a' };
  return (
    <div style={{ width: CUBE_SIZE, height: CUBE_SIZE, position: 'relative', flexShrink: 0, ...style }}>
      <div style={{ position: 'absolute', top: 0, left: 5, right: 0, height: 10, background: colors.top, clipPath: 'polygon(0 100%, 5px 0, 100% 0, calc(100% - 5px) 100%)', borderTop: `1px solid ${colors.topDark}` }} />
      <div style={{ position: 'absolute', top: 10, left: 0, right: 5, bottom: 0, background: colors.front, border: `1px solid ${colors.topDark}`, borderRadius: 3 }} />
      <div style={{ position: 'absolute', top: 10, right: 0, width: 5, bottom: 0, background: colors.side, borderRadius: '0 3px 3px 0' }} />
    </div>
  );
}

function BankCube({ index }) {
  return (
    <Draggable draggableId={`bank-${index}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={{
            ...provided.draggableProps.style,
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            opacity: snapshot.isDragging ? 0.6 : 1,
          }}
        >
          <Cube color="blue" />
        </div>
      )}
    </Draggable>
  );
}

function BuiltCube({ id, index }) {
  return (
    <Draggable draggableId={id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={{
            ...provided.draggableProps.style,
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            opacity: snapshot.isDragging ? 0.6 : 1,
          }}
        >
          <Cube color="green" />
        </div>
      )}
    </Draggable>
  );
}

// Displays ten-frame for starting number (read-only)
function DisplayCubes({ count }) {
  const row1 = Math.min(count, 10);
  const row2 = Math.max(0, count - 10);
  const SlotH = 22;
  const FilledSlot = (i) => (
    <div key={i} style={{ flex: 1, height: SlotH, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 3, right: 0, height: 5, background: '#60a5fa', clipPath: 'polygon(0 100%, 3px 0, 100% 0, calc(100% - 3px) 100%)', borderTop: '1px solid #1e3a8a' }} />
      <div style={{ position: 'absolute', top: 5, left: 0, right: 3, bottom: 0, background: '#2d4fa1', border: '1px solid #1e3a8a', borderRadius: 1 }} />
      <div style={{ position: 'absolute', top: 5, right: 0, width: 3, bottom: 0, background: '#1e3a8a' }} />
    </div>
  );
  const Ghost = (i) => <div key={`g${i}`} style={{ flex: 1, height: SlotH }} className="rounded border border-dashed border-blue-200 bg-blue-50" />;
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex gap-0.5">{Array.from({ length: 10 }).map((_, i) => i < row1 ? FilledSlot(i) : Ghost(i))}</div>
      <div className="flex gap-0.5">{Array.from({ length: 10 }).map((_, i) => i < row2 ? FilledSlot(i + 10) : Ghost(i + 10))}</div>
    </div>
  );
}

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
    setSpinDone(false); setSpinResult(null); setTargetNumber(null);
    setBuilt([]); cloneCounter = 0;
    setStartWritePhase('write'); setStartWritten(null); setStartStrokes(null);
    setResultWritePhase('write'); setResultWritten(null); setResultStrokes(null);
    setSaving(false); setSaved(false);
    setRoundKey(k => k + 1);
  };

  const handleSpinResult = (result) => {
    setSpinResult(result);
    setSpinDone(true);
    setTargetNumber(result === 'more' ? startNumber + 1 : startNumber - 1);
  };

  const onDragStart = () => {
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
  };

  const onDragEnd = (result) => {
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.droppableId === 'bank' && destination.droppableId === 'built') {
      const newId = `built-${++cloneCounter}`;
      setBuilt(prev => { const next = [...prev]; next.splice(destination.index, 0, newId); return next; });
    } else if (source.droppableId === 'built' && destination.droppableId === 'built') {
      setBuilt(prev => { const next = [...prev]; const [item] = next.splice(source.index, 1); next.splice(destination.index, 0, item); return next; });
    } else if (source.droppableId === 'built' && destination.droppableId === 'bank') {
      setBuilt(prev => prev.filter((_, i) => i !== source.index));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.OneLessMoreAttempt.create({
        student_number: studentNumber, class_name: classProp,
        starting_number: startNumber, spinner_result: spinResult, target_number: targetNumber,
        student_wrote_start: startWritten, student_wrote_result: resultWritten,
        is_correct_start: startWritten === startNumber, is_correct_result: resultWritten === targetNumber,
        start_strokes_data: startStrokes ? JSON.stringify(startStrokes) : null,
        result_strokes_data: resultStrokes ? JSON.stringify(resultStrokes) : null,
      });
    } catch (e) { console.error(e); }
    setSaving(false); setSaved(true);
  };

  const showResult = resultWritePhase === 'done' && resultWritten !== null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-400 to-indigo-500 flex flex-col items-center py-4 px-3"
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
      <div className="w-full max-w-2xl flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-white/80 hover:text-white font-medium">← Back</button>
          <h1 className="text-xl font-bold text-white">🧊 1 More / 1 Less</h1>
          <span className="text-white/70 text-sm">#{studentNumber}</span>
        </div>

        {/* Row 1: Starting number + Spinner side by side */}
        <div className="grid grid-cols-2 gap-3">
          {/* Starting number */}
          <div className="bg-white rounded-3xl p-4 shadow-xl flex flex-col items-center gap-3">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Starting #</p>
            <div className="bg-sky-50 rounded-xl p-2 border border-sky-200 w-full">
              <DisplayCubes count={startNumber} />
            </div>
            <div className="w-full flex flex-col items-center gap-1">
              <p className="text-xs text-gray-400">Write the number:</p>
              <SimpleWritingCanvas key={`start-${roundKey}`} onDone={(strokes) => { setStartStrokes(strokes); setStartWritePhase('enter'); }} />
            </div>
            {startWritePhase === 'enter' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full">
                <p className="text-xs text-gray-400 text-center mb-1">Now type it:</p>
                <SingleDigitEntry onSubmit={(n) => { setStartWritten(n); setStartWritePhase('done'); }} />
              </motion.div>
            )}
            {startWritePhase === 'done' && (
              <div className={`text-3xl font-bold px-4 py-2 rounded-xl ${startWritten === startNumber ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
                {startWritten} {startWritten === startNumber ? '✓' : '✗'}
                {startWritten !== startNumber && <div className="text-sm text-gray-400">(was {startNumber})</div>}
              </div>
            )}
          </div>

          {/* Spinner */}
          <div className="bg-white rounded-3xl p-4 shadow-xl flex flex-col items-center gap-3">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Spin!</p>
            <OneLessMoreSpinner key={`spinner-${roundKey}`} onResult={handleSpinResult} />
          </div>
        </div>

        {/* Row 2: Build area — full width, big cubes */}
        <div className={`bg-white rounded-3xl p-4 shadow-xl flex flex-col gap-4 transition-opacity ${spinDone ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Build It!</p>
            {spinDone && (
              <div className={`text-base font-bold px-3 py-1 rounded-xl ${spinResult === 'more' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                1 {spinResult === 'more' ? 'More ➕' : 'Less ➖'}
              </div>
            )}
          </div>

          <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
            {/* Built tray */}
            <div>
              <p className="text-xs text-gray-400 font-semibold mb-2">Your build — {built.length} cube{built.length !== 1 ? 's' : ''}</p>
              <Droppable droppableId="built" direction="horizontal">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`rounded-2xl border-2 p-3 transition-colors min-h-[72px] flex flex-wrap gap-2 ${snapshot.isDraggingOver ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
                    style={{ touchAction: 'none' }}
                  >
                    {built.map((id, i) => <BuiltCube key={id} id={id} index={i} />)}
                    {built.length === 0 && !snapshot.isDraggingOver && (
                      <p className="text-gray-300 text-sm self-center mx-auto">Drag cubes here</p>
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>

            {/* Bank */}
            <Droppable droppableId="bank" direction="horizontal">
              {(provided, snapshot) => (
                <div>
                  <p className="text-xs text-gray-400 font-semibold mb-2">Cube bank — drag to tray ↑  drag back to remove</p>
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`rounded-2xl border-2 p-3 transition-colors flex flex-wrap gap-2 ${snapshot.isDraggingOver ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}
                    style={{ touchAction: 'none' }}
                  >
                    {Array.from({ length: BANK_SIZE }).map((_, i) => <BankCube key={i} index={i} />)}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Write result */}
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
              className={`text-3xl font-bold text-center px-4 py-3 rounded-xl ${resultWritten === targetNumber ? 'text-green-600 bg-green-50' : 'text-red-500 bg-red-50'}`}>
              {resultWritten} {resultWritten === targetNumber ? '✓' : '✗'}
              {resultWritten !== targetNumber && <div className="text-base text-gray-400">(answer: {targetNumber})</div>}
            </motion.div>
          )}
        </div>

        {/* Save / Next */}
        {showResult && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center gap-4 pb-8">
            {!saved ? (
              <button onClick={handleSave} disabled={saving}
                className="px-8 py-4 bg-white text-indigo-700 font-bold text-lg rounded-2xl shadow-lg disabled:opacity-50">
                {saving ? 'Saving…' : '💾 Save & Next'}
              </button>
            ) : (
              <button onClick={resetRound}
                className="px-8 py-4 bg-indigo-600 text-white font-bold text-xl rounded-2xl shadow-lg">
                Next Round 🎲
              </button>
            )}
          </motion.div>
        )}

      </div>
    </div>
  );
}