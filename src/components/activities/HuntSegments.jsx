// Shared renderer for hunt text ranges. Groups consecutive tappable ranges into
// inline-block "words" so the browser only wraps at word boundaries (never
// mid-word). Spaces are normal breakable separators, except in the space-hunt
// where each space is itself a tappable target (flanked by zero-width spaces so
// it can still wrap).
const statusClass = (st) => st === 'correct' ? 'bg-green-200 text-green-800'
  : st === 'wrong' ? 'bg-red-200 text-red-700'
  : st === 'missed' ? 'bg-amber-200 text-amber-800' : '';

export default function HuntSegments({ segments, marks = {}, onTap, interactive = false, isSpaceHunt = false }) {
  const out = [];
  let wordSpans = [];
  let k = 0;
  const flush = () => {
    if (wordSpans.length) {
      out.push(<span key={`w${k++}`} className="inline-block whitespace-nowrap">{wordSpans}</span>);
      wordSpans = [];
    }
  };

  segments.forEach((seg, i) => {
    if (seg.tap) {
      if (seg.text === ' ' && isSpaceHunt) {
        flush();
        const st = marks[seg.index];
        out.push(<span key={`z${k++}`}>{'\u200B'}</span>);
        out.push(
          <span
            key={i}
            onClick={onTap ? () => onTap(seg) : undefined}
            className={`inline-block min-w-[1em] py-0.5 rounded ${st ? 'border-2 ' + statusClass(st) : 'border-b-2 border-dashed border-slate-300'} ${interactive ? 'cursor-pointer hover:bg-slate-200 active:bg-slate-300' : ''}`}
          >&nbsp;</span>
        );
        out.push(<span key={`z2${k++}`}>{'\u200B'}</span>);
      } else {
        const st = marks[seg.index];
        wordSpans.push(
          <span
            key={i}
            onClick={onTap ? () => onTap(seg) : undefined}
            className={`${interactive ? 'cursor-pointer ' : ''}rounded px-1.5 py-0.5 leading-loose border-b border-dotted border-slate-300 ${st ? statusClass(st) : (interactive ? 'hover:bg-slate-200 active:bg-slate-300' : '')}`}
          >{seg.text}</span>
        );
      }
    } else {
      flush();
      out.push(' ');
    }
  });
  flush();
  return out;
}