import React from 'react';

// Cube component — 3D linking cube style
function Cube({ highlight, faded, onClick }) {
  return (
    <div
      className={`relative flex-shrink-0 select-none ${onClick ? 'cursor-pointer active:scale-90' : ''}`}
      style={{ width: 38, height: 38, transition: 'transform 0.1s' }}
      onClick={onClick}
    >
      {/* Top bevel */}
      <div style={{
        position: 'absolute', top: 0, left: 4, right: 0, height: 8,
        background: faded ? '#cbd5e1' : highlight ? '#7dd3fc' : '#4a6fc7',
        clipPath: 'polygon(0 100%, 4px 0, 100% 0, calc(100% - 4px) 100%)',
        borderTop: '1px solid #1e3a8a',
        opacity: faded ? 0.5 : 1,
      }} />
      {/* Front face */}
      <div style={{
        position: 'absolute', top: 8, left: 0, right: 4, bottom: 0,
        background: faded ? '#e2e8f0' : highlight ? '#38bdf8' : '#2d4fa1',
        border: `1.5px solid ${faded ? '#94a3b8' : '#1e3a8a'}`,
        borderRadius: 2,
        opacity: faded ? 0.5 : 1,
      }} />
      {/* Right side */}
      <div style={{
        position: 'absolute', top: 8, right: 0, width: 4, bottom: 0,
        background: faded ? '#94a3b8' : highlight ? '#0ea5e9' : '#1e3a8a',
        borderRadius: '0 2px 2px 0',
        opacity: faded ? 0.5 : 1,
      }} />
    </div>
  );
}

// Display-only linking cubes
export function LinkingCubesDisplay({ count, highlightLast }) {
  const row1 = Math.min(count, 10);
  const row2 = Math.max(0, count - 10);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-0.5">
        {Array.from({ length: row1 }).map((_, i) => (
          <Cube key={i} highlight={highlightLast && count <= 10 && i === row1 - 1} />
        ))}
      </div>
      {row2 > 0 && (
        <div className="flex gap-0.5">
          {Array.from({ length: row2 }).map((_, i) => (
            <Cube key={i} highlight={highlightLast && i === row2 - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// Interactive linking cubes — student builds by tapping + / - 
export function LinkingCubesInteractive({ count, onChange, max = 20, min = 0 }) {
  const row1 = Math.min(count, 10);
  const row2 = Math.max(0, count - 10);

  const addCube = () => { if (count < max) onChange(count + 1); };
  const removeCube = () => { if (count > min) onChange(count - 1); };

  return (
    <div className="flex flex-col items-start gap-3">
      {/* Cubes display */}
      <div className="flex flex-col gap-1 min-h-[42px]">
        {count === 0 && (
          <div className="text-gray-300 text-sm italic px-2 py-2">No cubes yet…</div>
        )}
        {row1 > 0 && (
          <div className="flex gap-0.5">
            {Array.from({ length: row1 }).map((_, i) => (
              <Cube key={i} />
            ))}
          </div>
        )}
        {row2 > 0 && (
          <div className="flex gap-0.5">
            {Array.from({ length: row2 }).map((_, i) => (
              <Cube key={i} />
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={removeCube}
          disabled={count <= min}
          className="w-12 h-12 rounded-full bg-red-100 text-red-600 text-2xl font-bold border-2 border-red-300 hover:bg-red-200 disabled:opacity-30 active:scale-90 transition-all"
        >−</button>
        <span className="text-2xl font-bold text-gray-700 w-12 text-center">{count}</span>
        <button
          onClick={addCube}
          disabled={count >= max}
          className="w-12 h-12 rounded-full bg-green-100 text-green-600 text-2xl font-bold border-2 border-green-300 hover:bg-green-200 disabled:opacity-30 active:scale-90 transition-all"
        >+</button>
      </div>
    </div>
  );
}

// Default export for backwards compatibility
export default function LinkingCubes({ count, highlightLast }) {
  return <LinkingCubesDisplay count={count} highlightLast={highlightLast} />;
}