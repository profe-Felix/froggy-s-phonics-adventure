// "Match overlap" visual for the letter-recognition tester.
// After a single-letter guess, renders the drawn stroke ANISOTROPICALLY STRETCHED
// over each top-ranked template, so you can see exactly how the recognizer deforms
// the drawing onto each candidate — indigo = your stretched stroke, gray = the
// template's taught pathway. The ×sx / ×sy labels are the per-axis scale factors
// the recognizer applied; "aspect capped" means the stretch hit the ASP_CAP clamp
// (the distortion was extreme enough to be clamped — the case to watch for h/v/z).

import { overlapAlignment } from '@/lib/letterRecognize';

const pathD = (pts) =>
  pts.length < 2 ? '' : pts.map((p, i) => `${i ? 'L' : 'M'}${(p.x * 300).toFixed(1)},${(p.y * 375).toFixed(1)}`).join(' ');

const GUIDES = [
  { y: 0.10, color: '#cbd5e1', dash: null },
  { y: 0.367, color: '#cbd5e1', dash: '6 5' },
  { y: 0.633, color: '#cbd5e1', dash: null },
  { y: 0.90, color: '#fca5a5', dash: '6 5' },
];

export default function MatchOverlap({ segment, templates }) {
  if (!segment || !segment.ranked || !segment.ranked.length || !segment.strokesPx || !templates || !templates.length) return null;
  const drawnPx = segment.strokesPx;
  const top = segment.ranked.slice(0, 4);

  return (
    <div className="w-full max-w-sm mt-3">
      <div className="text-[11px] font-semibold text-slate-500 mb-1.5 leading-snug">
        Match overlap — your stroke (indigo) stretched over each template (gray)
      </div>
      <div className="grid grid-cols-2 gap-2">
        {top.map((r) => {
          const tpl = templates.find((t) => t.letter === r.letter);
          if (!tpl) return null;
          const ov = overlapAlignment(drawnPx, tpl);
          if (!ov) return null;
          const win = r === segment.ranked[0];
          const stretch = `×${ov.sx.toFixed(2)} ×${ov.sy.toFixed(2)}`;
          return (
            <div
              key={r.letter}
              className={`rounded-lg border p-1.5 ${win ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'}`}
            >
              <div className="flex items-center justify-between mb-0.5 px-0.5">
                <span className={`text-sm font-bold ${win ? 'text-indigo-600' : 'text-slate-600'}`}>
                  {r.letter}
                  {win ? ' ✓' : ''}
                </span>
                <span className="text-[10px] text-slate-400 tabular-nums">{r.confidence}%</span>
              </div>
              <svg viewBox="0 0 300 375" className="w-full aspect-[4/5] rounded bg-white">
                {GUIDES.map((g, i) => (
                  <line
                    key={i}
                    x1="0"
                    y1={g.y * 375}
                    x2="300"
                    y2={g.y * 375}
                    stroke={g.color}
                    strokeWidth="1.5"
                    strokeDasharray={g.dash || undefined}
                    opacity="0.7"
                  />
                ))}
                {ov.template.map((s, i) => (
                  <path
                    key={`t${i}`}
                    d={pathD(s)}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.55"
                  />
                ))}
                {ov.aligned.map((s, i) => (
                  <path
                    key={`a${i}`}
                    d={pathD(s)}
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
              <div className="flex items-center justify-between mt-0.5 px-0.5">
                <span className="text-[9px] text-slate-400 tabular-nums">{stretch}</span>
                {ov.capped && <span className="text-[9px] font-bold text-amber-500">aspect capped</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}