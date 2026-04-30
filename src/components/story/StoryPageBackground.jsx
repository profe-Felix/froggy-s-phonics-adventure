export default function StoryPageBackground({ template, width, height }) {
  switch (template) {
    case 'lined': {
      const lineCount = 14;
      const lineSpacing = height / (lineCount + 1);
      return (
        <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={width} height={height}>
          {Array.from({ length: lineCount }, (_, i) => (
            <line key={i} x1={30} y1={(i + 1) * lineSpacing} x2={width - 10} y2={(i + 1) * lineSpacing} stroke="#aaaadd" strokeWidth="1" />
          ))}
          <line x1={52} y1={0} x2={52} y2={height} stroke="#ffaaaa" strokeWidth="1.5" />
        </svg>
      );
    }
    case 'half_image_top': {
      const midY = height / 2;
      return (
        <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={width} height={height}>
          <rect x={0} y={0} width={width} height={midY} fill="#f0f0f0" stroke="#cccccc" strokeWidth="1" />
          <text x={width / 2} y={midY / 2 + 10} textAnchor="middle" fill="#aaaaaa" fontSize={Math.max(8, 14 * width / 500)}>Draw here</text>
          {Array.from({ length: 7 }, (_, i) => (
            <line key={i} x1={30} y1={midY + (i + 1) * (midY / 8)} x2={width - 10} y2={midY + (i + 1) * (midY / 8)} stroke="#aaaadd" strokeWidth="1" />
          ))}
          <line x1={52} y1={midY} x2={52} y2={height} stroke="#ffaaaa" strokeWidth="1.5" />
        </svg>
      );
    }
    case 'half_image_bottom': {
      const midY = height / 2;
      return (
        <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={width} height={height}>
          {Array.from({ length: 7 }, (_, i) => (
            <line key={i} x1={30} y1={(i + 1) * (midY / 8)} x2={width - 10} y2={(i + 1) * (midY / 8)} stroke="#aaaadd" strokeWidth="1" />
          ))}
          <line x1={52} y1={0} x2={52} y2={midY} stroke="#ffaaaa" strokeWidth="1.5" />
          <rect x={0} y={midY} width={width} height={midY} fill="#f0f0f0" stroke="#cccccc" strokeWidth="1" />
          <text x={width / 2} y={midY + midY / 2 + 10} textAnchor="middle" fill="#aaaaaa" fontSize={Math.max(8, 14 * width / 500)}>Draw here</text>
        </svg>
      );
    }
    case 'border':
      return (
        <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={width} height={height}>
          <rect x={10} y={10} width={width - 20} height={height - 20} fill="none" stroke="#4338ca" strokeWidth="3" rx={8} />
          <rect x={18} y={18} width={width - 36} height={height - 36} fill="none" stroke="#818cf8" strokeWidth="1" rx={5} />
        </svg>
      );
    case 'story_web': {
      const cx = width / 2, cy = height / 2;
      const scale = width / 500;
      return (
        <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} width={width} height={height}>
          <circle cx={cx} cy={cy} r={50 * scale} fill="#f0f0ff" stroke="#818cf8" strokeWidth="1.5" />
          <text x={cx} y={cy + 5} textAnchor="middle" fill="#818cf8" fontSize={12 * scale}>Topic</text>
          {[0, 60, 120, 180, 240, 300].map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            const nx = cx + 130 * scale * Math.cos(rad), ny = cy + 130 * scale * Math.sin(rad);
            return (
              <g key={i}>
                <line x1={cx + 50 * scale * Math.cos(rad)} y1={cy + 50 * scale * Math.sin(rad)} x2={nx} y2={ny} stroke="#c4b5fd" strokeWidth="1" />
                <circle cx={nx} cy={ny} r={35 * scale} fill="#fdf4ff" stroke="#a78bfa" strokeWidth="1.5" />
              </g>
            );
          })}
        </svg>
      );
    }
    default:
      return null;
  }
}