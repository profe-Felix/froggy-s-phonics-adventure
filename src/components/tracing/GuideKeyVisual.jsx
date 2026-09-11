/**
 * GuideKeyVisual — a small left-edge grounding visual for handwriting guides.
 *
 * Shows colored zones (sky/grass/dirt) limited to a narrow chunk (saves ink
 * on printouts), a picket fence on the fence/dashed line, and two walking
 * figures showing capital (grass→sky) and lowercase (grass→fence) letter
 * heights with direction arrows.
 *
 * Renders an SVG <g> group — place it inside an <svg> element.
 */
export default function GuideKeyVisual({ skyY, fenceY, grassY, dirtY, width, opacity = 0.5 }) {
  const h = dirtY - skyY;
  const skyH = fenceY - skyY;
  const grassH = grassY - fenceY;
  const dirtH = dirtY - grassY;

  // --- Picket fence on the fence line ---
  const picketW = Math.max(1, width * 0.05);
  const picketH = h * 0.06;
  const picketGap = picketW * 0.7;
  const fenceStart = width * 0.07;
  const numPickets = 3;
  const pickets = [];
  for (let i = 0; i < numPickets; i++) {
    const px = fenceStart + i * (picketW + picketGap);
    pickets.push(
      <g key={`pk${i}`}>
        <rect x={px} y={fenceY - picketH} width={picketW} height={picketH} fill="#8d6e63" rx={picketW * 0.15} />
        <polygon points={`${px},${fenceY - picketH} ${px + picketW / 2},${fenceY - picketH - picketW * 0.5} ${px + picketW},${fenceY - picketH}`} fill="#8d6e63" />
      </g>
    );
  }
  const railX1 = fenceStart;
  const railX2 = fenceStart + (numPickets - 1) * (picketW + picketGap) + picketW;
  const railY = fenceY - picketH * 0.45;

  // --- Walking figures ---
  const figStart = width * 0.38;
  const figW = width * 0.20;
  const figGap = width * 0.05;
  const headR = Math.max(1, h * 0.020);
  const bodySW = Math.max(0.6, h * 0.009);
  const legSpread = figW * 0.35;

  // Capital figure (tall: head at sky, feet at grass)
  const capCx = figStart + figW / 2;
  const capHeadY = skyY + headR + h * 0.008;
  const capBodyTop = capHeadY + headR;
  const capBodyBot = grassY - h * 0.004;

  // Lowercase figure (short: head at fence, feet at grass)
  const lowCx = figStart + figW + figGap + figW / 2;
  const lowHeadY = fenceY + headR + h * 0.008;
  const lowBodyTop = lowHeadY + headR;
  const lowBodyBot = grassY - h * 0.004;

  // Arrow helper
  const arrowSW = Math.max(0.5, h * 0.006);
  const arrowHeadR = headR * 0.7;

  return (
    <g pointerEvents="none">
      {/* Background zones — only this left chunk (saves ink) */}
      <rect x={0} y={skyY} width={width} height={skyH} fill="#dceaf9" opacity={opacity} />
      <rect x={0} y={fenceY} width={width} height={grassH} fill="#e8f5e9" opacity={opacity} />
      <rect x={0} y={grassY} width={width} height={dirtH} fill="#f5ebe0" opacity={opacity} />

      {/* Picket fence on the fence line */}
      <line x1={railX1} y1={railY} x2={railX2} y2={railY} stroke="#8d6e63" strokeWidth={Math.max(0.8, picketW * 0.25)} opacity={0.75} />
      {pickets}

      {/* Capital figure (tall: grass→sky) */}
      <g opacity={0.78}>
        <circle cx={capCx} cy={capHeadY} r={headR} fill="#334155" />
        <line x1={capCx} y1={capBodyTop} x2={capCx} y2={capBodyBot} stroke="#334155" strokeWidth={bodySW} strokeLinecap="round" />
        <line x1={capCx} y1={capBodyBot} x2={capCx - legSpread} y2={grassY} stroke="#334155" strokeWidth={bodySW} strokeLinecap="round" />
        <line x1={capCx} y1={capBodyBot} x2={capCx + legSpread} y2={grassY} stroke="#334155" strokeWidth={bodySW} strokeLinecap="round" />
        {/* Height arrow: grass→sky (capital) */}
        <line x1={capCx + figW * 0.5} y1={grassY - h * 0.003} x2={capCx + figW * 0.5} y2={skyY + h * 0.015} stroke="#4a90e2" strokeWidth={arrowSW} strokeLinecap="round" />
        <polygon points={`${capCx + figW * 0.5},${skyY} ${capCx + figW * 0.5 - arrowHeadR},${skyY + arrowHeadR * 1.4} ${capCx + figW * 0.5 + arrowHeadR},${skyY + arrowHeadR * 1.4}`} fill="#4a90e2" />
      </g>

      {/* Lowercase figure (short: grass→fence) */}
      <g opacity={0.78}>
        <circle cx={lowCx} cy={lowHeadY} r={headR} fill="#334155" />
        <line x1={lowCx} y1={lowBodyTop} x2={lowCx} y2={lowBodyBot} stroke="#334155" strokeWidth={bodySW} strokeLinecap="round" />
        <line x1={lowCx} y1={lowBodyBot} x2={lowCx - legSpread} y2={grassY} stroke="#334155" strokeWidth={bodySW} strokeLinecap="round" />
        <line x1={lowCx} y1={lowBodyBot} x2={lowCx + legSpread} y2={grassY} stroke="#334155" strokeWidth={bodySW} strokeLinecap="round" />
        {/* Height arrow: grass→fence (lowercase) */}
        <line x1={lowCx + figW * 0.5} y1={grassY - h * 0.003} x2={lowCx + figW * 0.5} y2={fenceY + h * 0.015} stroke="#16a34a" strokeWidth={arrowSW} strokeLinecap="round" />
        <polygon points={`${lowCx + figW * 0.5},${fenceY} ${lowCx + figW * 0.5 - arrowHeadR},${fenceY + arrowHeadR * 1.4} ${lowCx + figW * 0.5 + arrowHeadR},${fenceY + arrowHeadR * 1.4}`} fill="#16a34a" />
      </g>
    </g>
  );
}