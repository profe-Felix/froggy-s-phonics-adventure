import React from 'react';

// Renders linking cubes: first 10 in a row, overflow in a second row
// Each cube looks 3D with a slight bevel
export default function LinkingCubes({ count, color = '#2d4fa1', highlightLast = false }) {
  const row1 = Math.min(count, 10);
  const row2 = Math.max(0, count - 10);

  const Cube = ({ highlight }) => (
    <div
      className="relative flex-shrink-0"
      style={{ width: 36, height: 36 }}
    >
      {/* Top face */}
      <div style={{
        position: 'absolute', top: 0, left: 4, right: 0, height: 8,
        background: highlight ? '#7dd3fc' : '#4a6fc7',
        clipPath: 'polygon(0 100%, 4px 0, 100% 0, calc(100% - 4px) 100%)',
        borderTop: '1px solid #1e3a8a'
      }} />
      {/* Front face */}
      <div style={{
        position: 'absolute', top: 8, left: 0, right: 4, bottom: 0,
        background: highlight ? '#38bdf8' : color,
        border: '1.5px solid #1e3a8a',
        borderRadius: 2
      }} />
      {/* Right face */}
      <div style={{
        position: 'absolute', top: 8, right: 0, width: 4, bottom: 0,
        background: highlight ? '#0ea5e9' : '#1e3a8a',
        borderRadius: '0 2px 2px 0'
      }} />
      {/* Connector notch */}
      <div style={{
        position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
        width: 8, height: 4,
        background: highlight ? '#7dd3fc' : '#4a6fc7',
        border: '1px solid #1e3a8a',
        borderRadius: 1
      }} />
    </div>
  );

  return (
    <div className="flex flex-col gap-1">
      {/* Row 1: up to 10 */}
      <div className="flex gap-0.5">
        {Array.from({ length: row1 }).map((_, i) => (
          <Cube key={i} highlight={highlightLast && count <= 10 && i === row1 - 1} />
        ))}
      </div>
      {/* Row 2: overflow */}
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