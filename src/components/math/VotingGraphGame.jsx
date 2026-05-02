import React, { useState, useRef, useEffect } from 'react';

// ── Preset categories ──────────────────────────────────────────────
const PRESETS = [
  {
    id: 'pets',
    label: 'Favorite Pet',
    question: '¿What is your favorite pet?',
    categories: [
      { label: 'Dog', emoji: '🐶' },
      { label: 'Cat', emoji: '🐱' },
      { label: 'Fish', emoji: '🐠' },
    ],
  },
  {
    id: 'food',
    label: 'Favorite Food',
    question: 'What is your favorite food?',
    categories: [
      { label: 'Pizza', emoji: '🍕' },
      { label: 'Tacos', emoji: '🌮' },
      { label: 'Sushi', emoji: '🍣' },
    ],
  },
  {
    id: 'season',
    label: 'Favorite Season',
    question: 'What is your favorite season?',
    categories: [
      { label: 'Summer', emoji: '☀️' },
      { label: 'Fall', emoji: '🍂' },
      { label: 'Winter', emoji: '❄️' },
      { label: 'Spring', emoji: '🌸' },
    ],
  },
  {
    id: 'sport',
    label: 'Favorite Sport',
    question: 'What is your favorite sport?',
    categories: [
      { label: 'Soccer', emoji: '⚽' },
      { label: 'Basketball', emoji: '🏀' },
      { label: 'Baseball', emoji: '⚾' },
    ],
  },
  {
    id: 'color',
    label: 'Favorite Color',
    question: 'What is your favorite color?',
    categories: [
      { label: 'Red', emoji: '🔴' },
      { label: 'Blue', emoji: '🔵' },
      { label: 'Green', emoji: '🟢' },
      { label: 'Yellow', emoji: '🟡' },
    ],
  },
  {
    id: 'fruit',
    label: 'Favorite Fruit',
    question: 'What is your favorite fruit?',
    categories: [
      { label: 'Apple', emoji: '🍎' },
      { label: 'Banana', emoji: '🍌' },
      { label: 'Strawberry', emoji: '🍓' },
    ],
  },
];

const BAR_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899'];
const BAR_LIGHT = ['#fee2e2', '#dbeafe', '#dcfce7', '#fef3c7', '#f3e8ff', '#fce7f3'];

// ── Random graph generator ─────────────────────────────────────────
function generateRandomGraph(categoryCount, maxVal = 30) {
  return Array.from({ length: categoryCount }, () => Math.floor(Math.random() * maxVal) + 1);
}

// ── Bar Graph Display ─────────────────────────────────────────────
function BarGraph({ categories, counts, onIncrement, onDecrement, maxVal, readOnly = false }) {
  const max = Math.max(...counts, maxVal, 1);
  const yTicks = [];
  // Smart tick spacing
  const tickStep = max <= 10 ? 1 : max <= 20 ? 2 : max <= 30 ? 5 : 10;
  for (let i = 0; i <= max; i += tickStep) yTicks.push(i);
  if (yTicks[yTicks.length - 1] < max) yTicks.push(max);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0 gap-1">
        {/* Y-axis */}
        <div className="flex flex-col-reverse justify-between items-end pr-1 text-xs font-bold text-gray-500 shrink-0" style={{ minWidth: 28 }}>
          {yTicks.map(t => (
            <span key={t}>{t}</span>
          ))}
        </div>

        {/* Grid lines + bars */}
        <div className="flex-1 flex flex-col relative">
          {/* Horizontal grid lines */}
          <div className="absolute inset-0 flex flex-col-reverse pointer-events-none">
            {yTicks.map((t, i) => (
              <div key={t} className="absolute w-full border-t border-gray-200"
                style={{ bottom: `${(t / (yTicks[yTicks.length - 1] || 1)) * 100}%` }} />
            ))}
          </div>

          {/* Bars */}
          <div className="flex-1 flex items-end gap-2 px-1 pb-0 relative z-10">
            {categories.map((cat, i) => {
              const pct = counts[i] / (yTicks[yTicks.length - 1] || 1);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <span className="text-xs font-black text-gray-600">{counts[i]}</span>
                  <div
                    className="w-full rounded-t-lg transition-all duration-300 relative group"
                    style={{ height: `${Math.max(pct * 100, counts[i] > 0 ? 4 : 0)}%`, background: BAR_COLORS[i % BAR_COLORS.length], minHeight: counts[i] > 0 ? 6 : 0 }}
                  >
                    {!readOnly && (
                      <div className="absolute inset-0 flex flex-col">
                        <button
                          onClick={() => onDecrement && onDecrement(i)}
                          className="flex-1 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-black hover:bg-black/20 transition-opacity"
                          title="Remove 1"
                        >
                          −
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X-axis line */}
      <div className="h-0.5 bg-gray-700 ml-7" />

      {/* X-axis labels */}
      <div className="flex gap-2 ml-8 mt-1">
        {categories.map((cat, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <span className="text-2xl">{cat.emoji}</span>
            <span className="text-xs font-bold text-gray-700 text-center leading-tight">{cat.label}</span>
            {!readOnly && (
              <button
                onClick={() => onIncrement(i)}
                className="mt-1 w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-lg shadow hover:scale-110 active:scale-95 transition-all"
                style={{ background: BAR_COLORS[i % BAR_COLORS.length] }}
              >
                +
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Preset Editor (for custom categories) ─────────────────────────
function PresetEditor({ onConfirm, onCancel }) {
  const [question, setQuestion] = useState('');
  const [cats, setCats] = useState([
    { label: '', emoji: '⭐' },
    { label: '', emoji: '🌙' },
    { label: '', emoji: '☀️' },
  ]);
  const emojiOptions = ['🐶','🐱','🐠','🐭','🐦','🦋','🌺','🌵','🍎','🍌','🍕','🌮','⚽','🏀','❄️','☀️','🌸','🍂','🔴','🔵','🟢','🟡','⭐','🌙','🏠','🚗','✈️','🎵','📚','🎨'];
  return (
    <div className="bg-white rounded-2xl p-4 shadow-xl flex flex-col gap-3 max-w-sm w-full">
      <h3 className="font-black text-gray-800 text-lg">Custom Graph</h3>
      <input
        value={question}
        onChange={e => setQuestion(e.target.value)}
        placeholder="Question (e.g. What is your favorite…)"
        className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm font-bold focus:border-blue-400 outline-none"
      />
      {cats.map((cat, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={cat.emoji}
            onChange={e => setCats(prev => prev.map((c, j) => j === i ? { ...c, emoji: e.target.value } : c))}
            className="text-xl border-2 border-gray-200 rounded-lg p-1"
          >
            {emojiOptions.map(em => <option key={em} value={em}>{em}</option>)}
          </select>
          <input
            value={cat.label}
            onChange={e => setCats(prev => prev.map((c, j) => j === i ? { ...c, label: e.target.value } : c))}
            placeholder={`Category ${i + 1}`}
            className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-1.5 text-sm font-bold focus:border-blue-400 outline-none"
          />
          {cats.length > 2 && (
            <button onClick={() => setCats(prev => prev.filter((_, j) => j !== i))} className="text-red-400 font-black text-lg">✕</button>
          )}
        </div>
      ))}
      {cats.length < 6 && (
        <button onClick={() => setCats(prev => [...prev, { label: '', emoji: '⭐' }])}
          className="text-sm font-bold text-blue-500 hover:text-blue-700">+ Add category</button>
      )}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 rounded-xl border-2 border-gray-200 font-bold text-gray-600 text-sm">Cancel</button>
        <button
          onClick={() => {
            if (cats.some(c => !c.label.trim())) return;
            onConfirm({ question: question || 'What is your favorite?', categories: cats.map(c => ({ ...c, label: c.label.trim() })) });
          }}
          className="flex-1 py-2 rounded-xl bg-blue-500 text-white font-black text-sm shadow">
          Start Graph
        </button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function VotingGraphGame({ onBack, teacherMode = false }) {
  const urlParams = new URLSearchParams(window.location.search);
  const isTeacher = teacherMode || urlParams.get('mathlessons') === '1' || urlParams.get('teacher') === '1';

  const [screen, setScreen] = useState('presets'); // 'presets' | 'graph' | 'randomGraph' | 'customEditor'
  const [activePreset, setActivePreset] = useState(null);
  const [counts, setCounts] = useState([]);
  const [randomCounts, setRandomCounts] = useState([]);
  const [randomCats, setRandomCats] = useState([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const selectPreset = (preset) => {
    setActivePreset(preset);
    setCounts(new Array(preset.categories.length).fill(0));
    setScreen('graph');
  };

  const handleIncrement = (i) => {
    setCounts(prev => prev.map((v, j) => j === i ? v + 1 : v));
  };

  const handleDecrement = (i) => {
    setCounts(prev => prev.map((v, j) => j === i ? Math.max(0, v - 1) : v));
  };

  const handleReset = () => {
    setCounts(new Array(activePreset.categories.length).fill(0));
    setShowResetConfirm(false);
  };

  const generateRandom = () => {
    // Use a nice preset for the random graph
    const preset = PRESETS[Math.floor(Math.random() * PRESETS.length)];
    const newCounts = generateRandomGraph(preset.categories.length, 30);
    setRandomCats(preset.categories);
    setRandomCounts(newCounts);
    setScreen('randomGraph');
  };

  // ── Preset selection screen ──────────────────────────────────────
  if (screen === 'presets') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-100 to-blue-100 flex flex-col">
        <div className="bg-green-600 text-white flex items-center gap-3 px-4 py-3">
          {onBack && <button onClick={onBack} className="font-bold text-sm opacity-80 hover:opacity-100">← Back</button>}
          <h1 className="flex-1 text-center font-black text-lg">📊 Voting Graph</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center gap-4">
          <p className="text-sm font-bold text-gray-600 text-center">Choose a topic to graph as a class, or build a custom one!</p>

          <div className="grid grid-cols-2 gap-3 w-full max-w-md">
            {PRESETS.map(preset => (
              <button key={preset.id} onClick={() => selectPreset(preset)}
                className="bg-white rounded-2xl p-4 shadow flex flex-col items-center gap-2 hover:shadow-lg hover:scale-102 active:scale-98 transition-all border-2 border-transparent hover:border-green-300">
                <div className="flex gap-1 text-2xl">
                  {preset.categories.slice(0, 3).map(c => <span key={c.label}>{c.emoji}</span>)}
                </div>
                <span className="font-black text-sm text-gray-800">{preset.label}</span>
                <span className="text-xs text-gray-400">{preset.categories.length} categories</span>
              </button>
            ))}

            {/* Custom */}
            <button onClick={() => setScreen('customEditor')}
              className="bg-white rounded-2xl p-4 shadow flex flex-col items-center gap-2 hover:shadow-lg hover:scale-102 active:scale-98 transition-all border-2 border-dashed border-blue-300 hover:border-blue-400">
              <span className="text-3xl">✏️</span>
              <span className="font-black text-sm text-blue-700">Custom</span>
              <span className="text-xs text-gray-400">Build your own</span>
            </button>
          </div>

          {/* Teacher-only: Random Graph button */}
          {isTeacher && (
            <div className="w-full max-w-md mt-2">
              <div className="border-t-2 border-dashed border-gray-300 my-2" />
              <p className="text-xs font-bold text-gray-400 text-center mb-2">🔒 TEACHER TOOLS</p>
              <button
                onClick={generateRandom}
                className="w-full py-3 rounded-2xl bg-purple-600 text-white font-black text-sm shadow hover:bg-purple-700 active:scale-98 transition-all"
              >
                🎲 Generate Random Graph (up to 30)
              </button>
              <p className="text-xs text-gray-400 text-center mt-1">Creates a pre-filled graph for analysis practice</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Custom editor screen ─────────────────────────────────────────
  if (screen === 'customEditor') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-100 to-blue-100 flex flex-col items-center justify-center p-4">
        <PresetEditor
          onConfirm={(custom) => {
            setActivePreset(custom);
            setCounts(new Array(custom.categories.length).fill(0));
            setScreen('graph');
          }}
          onCancel={() => setScreen('presets')}
        />
      </div>
    );
  }

  // ── Random graph screen (teacher only) ───────────────────────────
  if (screen === 'randomGraph') {
    return (
      <div className="h-screen flex flex-col bg-gradient-to-b from-purple-50 to-white">
        <div className="bg-purple-600 text-white flex items-center gap-3 px-4 py-3">
          <button onClick={() => setScreen('presets')} className="font-bold text-sm opacity-80">← Back</button>
          <h1 className="flex-1 text-center font-black text-base">📊 Random Graph</h1>
          <button
            onClick={generateRandom}
            className="bg-white/20 rounded-lg px-3 py-1 text-sm font-bold hover:bg-white/30">
            🎲 New
          </button>
        </div>
        <div className="flex-1 p-4 flex flex-col min-h-0">
          <div className="bg-white rounded-2xl shadow-xl flex-1 p-4 min-h-0">
            <BarGraph
              categories={randomCats}
              counts={randomCounts}
              readOnly={true}
              maxVal={30}
            />
          </div>
          <div className="mt-3 bg-purple-50 rounded-xl p-3 text-center text-sm font-bold text-purple-700">
            Use this graph to ask questions: Which has the most? The least? How many more?
          </div>
        </div>
      </div>
    );
  }

  // ── Live voting graph screen ─────────────────────────────────────
  const maxCount = Math.max(...counts, 5);

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-green-50 to-white">
      <div className="bg-green-600 text-white flex items-center gap-3 px-4 py-3">
        <button onClick={() => setScreen('presets')} className="font-bold text-sm opacity-80">← Back</button>
        <h1 className="flex-1 text-center font-black text-base truncate">{activePreset?.question || 'Vote!'}</h1>
        {showResetConfirm ? (
          <div className="flex items-center gap-1">
            <span className="text-xs opacity-80">Reset?</span>
            <button onClick={handleReset} className="bg-red-500 rounded px-2 py-1 text-xs font-black">Yes</button>
            <button onClick={() => setShowResetConfirm(false)} className="bg-white/20 rounded px-2 py-1 text-xs font-black">No</button>
          </div>
        ) : (
          <button onClick={() => setShowResetConfirm(true)} className="bg-white/20 rounded-lg px-2 py-1 text-xs font-bold">🔄 Reset</button>
        )}
      </div>

      <div className="flex-1 p-3 flex flex-col min-h-0 gap-2">
        {/* Total votes badge */}
        <div className="flex justify-center gap-3">
          <span className="bg-green-100 text-green-700 font-black text-sm rounded-full px-4 py-1">
            Total votes: {counts.reduce((a, b) => a + b, 0)}
          </span>
        </div>

        {/* Graph */}
        <div className="bg-white rounded-2xl shadow-xl flex-1 p-4 min-h-0">
          <BarGraph
            categories={activePreset.categories}
            counts={counts}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
            maxVal={maxCount}
          />
        </div>

        <p className="text-center text-xs text-gray-400 font-bold">
          Tap <span className="text-green-600">+</span> to add a vote · hover bar to remove
        </p>
      </div>
    </div>
  );
}