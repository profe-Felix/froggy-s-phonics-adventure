// Inline SVG train art for the Syllable Train workstation.
// The original app used local PNGs (train.png, redtraincar.png, bluetraincar.png);
// those weren't hosted anywhere fetchable, so we draw the train with SVG instead
// — no asset upload or bucket needed.

export function TrainEngine({ size = { w: 120, h: 90 } }) {
  return (
    <svg viewBox="0 0 120 90" width={size.w} height={size.h} style={{ display: 'block' }}>
      {/* cowcatcher */}
      <polygon points="6,72 22,60 22,76" fill="#1f2937" />
      {/* main body */}
      <rect x="18" y="40" width="78" height="34" rx="6" fill="#374151" />
      {/* cab */}
      <rect x="58" y="18" width="38" height="30" rx="6" fill="#4b5563" />
      {/* cab window */}
      <rect x="66" y="24" width="22" height="16" rx="3" fill="#bfdbfe" />
      {/* chimney */}
      <rect x="34" y="14" width="12" height="16" rx="2" fill="#1f2937" />
      <rect x="31" y="12" width="18" height="5" rx="2" fill="#111827" />
      {/* boiler band */}
      <rect x="18" y="52" width="78" height="4" fill="#9ca3af" />
      {/* wheels */}
      <circle cx="34" cy="78" r="9" fill="#111827" />
      <circle cx="34" cy="78" r="4" fill="#6b7280" />
      <circle cx="82" cy="78" r="9" fill="#111827" />
      <circle cx="82" cy="78" r="4" fill="#6b7280" />
    </svg>
  );
}

export function TrainCar({ color = 'red', size = { w: 110, h: 60 } }) {
  const fill = color === 'red' ? '#ef4444' : '#3b82f6';
  const dark = color === 'red' ? '#b91c1c' : '#1d4ed8';
  return (
    <svg viewBox="0 0 110 60" width={size.w} height={size.h} style={{ display: 'block' }}>
      {/* coupler */}
      <rect x="0" y="38" width="8" height="4" fill="#9ca3af" />
      <rect x="102" y="38" width="8" height="4" fill="#9ca3af" />
      {/* body */}
      <rect x="6" y="8" width="98" height="36" rx="5" fill={fill} />
      {/* body shading */}
      <rect x="6" y="8" width="98" height="8" rx="5" fill="#ffffff" opacity="0.18" />
      <rect x="6" y="40" width="98" height="4" fill={dark} opacity="0.5" />
      {/* slats */}
      <rect x="24" y="12" width="3" height="28" fill="#ffffff" opacity="0.25" />
      <rect x="54" y="12" width="3" height="28" fill="#ffffff" opacity="0.25" />
      <rect x="84" y="12" width="3" height="28" fill="#ffffff" opacity="0.25" />
      {/* wheels */}
      <circle cx="28" cy="50" r="7" fill="#1f2937" />
      <circle cx="28" cy="50" r="3" fill="#6b7280" />
      <circle cx="82" cy="50" r="7" fill="#1f2937" />
      <circle cx="82" cy="50" r="3" fill="#6b7280" />
    </svg>
  );
}