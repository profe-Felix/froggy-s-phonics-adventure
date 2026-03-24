import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import TenFrame from './TenFrame';
import { Shuffle, RotateCcw, Play, Settings } from 'lucide-react';

export default function BingoTeacher({ game, onUpdate }) {
  const [showSettings, setShowSettings] = useState(false);
  const [minVal, setMinVal] = useState(game?.min_number ?? 10);
  const [maxVal, setMaxVal] = useState(game?.max_number ?? 20);

  const calledNumbers = game?.called_numbers || [];
  const currentNumber = game?.current_number;

  const allNumbers = [];
  for (let n = (game?.min_number ?? 10); n <= (game?.max_number ?? 20); n++) allNumbers.push(n);
  const remaining = allNumbers.filter(n => !calledNumbers.includes(n));

  const callNext = async () => {
    if (remaining.length === 0) return;
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    const updated = await base44.entities.MathBingoGame.update(game.id, {
      current_number: pick,
      called_numbers: [...calledNumbers, pick],
      is_active: true,
    });
    onUpdate(updated);
  };

  const resetGame = async () => {
    const updated = await base44.entities.MathBingoGame.update(game.id, {
      current_number: null,
      called_numbers: [],
      is_active: false,
    });
    onUpdate(updated);
  };

  const saveSettings = async () => {
    const updated = await base44.entities.MathBingoGame.update(game.id, {
      min_number: minVal,
      max_number: maxVal,
      current_number: null,
      called_numbers: [],
    });
    onUpdate(updated);
    setShowSettings(false);
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6 max-w-lg mx-auto">
      <h2 className="text-2xl font-bold text-white">🎱 Bingo — Teacher View</h2>

      {/* Current number */}
      <div className="bg-white rounded-2xl shadow-xl p-6 flex flex-col items-center gap-3 w-full">
        {currentNumber ? (
          <>
            <div className="text-6xl font-black text-indigo-700">{currentNumber}</div>
            <TenFrame value={currentNumber} size="lg" />
          </>
        ) : (
          <div className="text-gray-400 text-xl py-4">No number called yet</div>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap justify-center">
        <Button
          onClick={callNext}
          disabled={remaining.length === 0}
          className="bg-green-500 hover:bg-green-600 text-white text-lg px-6 py-3 h-auto gap-2"
        >
          <Shuffle className="w-5 h-5" />
          Call Next ({remaining.length} left)
        </Button>
        <Button onClick={resetGame} variant="outline" className="gap-2 bg-white">
          <RotateCcw className="w-4 h-4" /> Reset
        </Button>
        <Button onClick={() => setShowSettings(v => !v)} variant="outline" className="gap-2 bg-white">
          <Settings className="w-4 h-4" /> Settings
        </Button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-white rounded-xl p-4 w-full shadow flex flex-col gap-3">
          <div className="font-semibold text-gray-700">Number Range</div>
          <div className="flex gap-4 items-center">
            <label className="text-sm text-gray-600">Min</label>
            <input type="number" value={minVal} onChange={e => setMinVal(+e.target.value)}
              className="w-20 border rounded px-2 py-1 text-center" />
            <label className="text-sm text-gray-600">Max</label>
            <input type="number" value={maxVal} onChange={e => setMaxVal(+e.target.value)}
              className="w-20 border rounded px-2 py-1 text-center" />
          </div>
          <Button onClick={saveSettings} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            Save & Reset Game
          </Button>
        </div>
      )}

      {/* Called numbers history */}
      {calledNumbers.length > 0 && (
        <div className="bg-white/20 rounded-xl p-4 w-full">
          <div className="text-white font-semibold mb-2">Called ({calledNumbers.length})</div>
          <div className="flex flex-wrap gap-2">
            {calledNumbers.map(n => (
              <span key={n} className={`px-3 py-1 rounded-full font-bold text-sm ${n === currentNumber ? 'bg-yellow-400 text-gray-900' : 'bg-white/80 text-gray-700'}`}>
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}