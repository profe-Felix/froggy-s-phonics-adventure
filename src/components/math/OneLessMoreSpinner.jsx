import React, { useState } from 'react';

// Spinner with arrow needle from center. 4 quadrants: More/Less/More/Less
export default function OneLessMoreSpinner({ onResult }) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(-45); // start pointing at top-left (More)
  const [result, setResult] = useState(null);

  const spin = () => {
    if (spinning || result) return;
    const extraDeg = Math.floor(Math.random() * 360);
    const totalSpin = 360 * (4 + Math.floor(Math.random() * 3)) + extraDeg;
    const newRotation = rotation + totalSpin;

    // Determine result: needle points up (0 deg = up after normalization)
    // Quadrants based on final angle: needle at 0°=top → which sector is at top?
    // Wheel sectors: TL=More(0-90), TR=Less(90-180), BR=More(180-270), BL=Less(270-360)
    // Needle points "up" — the sector under the top of the needle wins
    // Wheel rotates, needle is fixed pointing up
    // So sector at top = (-newRotation % 360 + 360) % 360
    const wheelAngle = ((newRotation % 360) + 360) % 360;
    // TL sector (0-90°) = More, TR (90-180) = Less, BR (180-270) = More, BL (270-360) = Less
    const spinResult = (wheelAngle < 90 || (wheelAngle >= 180 && wheelAngle < 270)) ? 'more' : 'less';

    setRotation(newRotation);
    setSpinning(true);

    setTimeout(() => {
      setSpinning(false);
      setResult(spinResult);
      onResult(spinResult);
    }, 2800);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: 220, height: 220 }}>
        {/* Spinning wheel */}
        <div
          style={{
            width: 220, height: 220, borderRadius: '50%',
            border: '4px solid #1e293b',
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? 'transform 2.8s cubic-bezier(0.15, 0.85, 0.3, 1)' : 'none',
            overflow: 'hidden',
            position: 'relative',
            cursor: result ? 'default' : 'pointer',
          }}
          onClick={spin}
        >
          <svg width="220" height="220" viewBox="0 0 220 220">
            {/* Top-left: More */}
            <path d="M110,110 L110,0 A110,110 0 0,0 0,110 Z" fill="#dbeafe"/>
            {/* Top-right: Less */}
            <path d="M110,110 L220,110 A110,110 0 0,0 110,0 Z" fill="#fce7f3"/>
            {/* Bottom-right: More */}
            <path d="M110,110 L110,220 A110,110 0 0,0 220,110 Z" fill="#dbeafe"/>
            {/* Bottom-left: Less */}
            <path d="M110,110 L0,110 A110,110 0 0,0 110,220 Z" fill="#fce7f3"/>
            {/* Dividers */}
            <line x1="110" y1="0" x2="110" y2="220" stroke="#1e293b" strokeWidth="2.5"/>
            <line x1="0" y1="110" x2="220" y2="110" stroke="#1e293b" strokeWidth="2.5"/>
            {/* Labels */}
            <text x="55" y="72" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#1e40af">1 More</text>
            <text x="165" y="72" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#9d174d">1 Less</text>
            <text x="165" y="158" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#1e40af">1 More</text>
            <text x="55" y="158" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#9d174d">1 Less</text>
          </svg>
        </div>

        {/* Fixed arrow needle in center — does NOT rotate */}
        <div style={{
          position: 'absolute', top: 0, left: 0, width: 220, height: 220,
          pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="220" height="220" viewBox="0 0 220 220" style={{ position: 'absolute' }}>
            {/* Arrow pointing up */}
            <polygon points="110,18 103,60 117,60" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1.5"/>
            <rect x="106" y="55" width="8" height="65" rx="4" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1"/>
            {/* Center circle */}
            <circle cx="110" cy="110" r="10" fill="#1e293b"/>
            <circle cx="110" cy="110" r="5" fill="#ffffff"/>
          </svg>
        </div>
      </div>

      {!result && !spinning && (
        <button
          onClick={spin}
          className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl text-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-lg"
        >
          🌀 Spin!
        </button>
      )}
      {spinning && <p className="text-lg font-bold text-indigo-600 animate-pulse">Spinning…</p>}
      {result && (
        <div className={`text-2xl font-bold px-6 py-3 rounded-xl shadow ${result === 'more' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
          1 {result === 'more' ? 'More ➕' : 'Less ➖'}
        </div>
      )}
    </div>
  );
}