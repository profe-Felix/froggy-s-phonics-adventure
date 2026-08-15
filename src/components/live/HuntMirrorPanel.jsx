import { useMemo } from 'react';
import { Lock } from 'lucide-react';
import { buildHunt } from '@/lib/activities/hunt';
import HuntSegments from '@/components/activities/HuntSegments';

// Student's read-only text-hunt mirror. Rebuilds the tappable segments from
// the broadcast text + hunt type and renders the teacher's live marks on top
// (green/red/amber), so students watch the teacher find targets in real time.
export default function HuntMirrorPanel({ broadcast }) {
  const has = broadcast?.type === 'hunt';
  const itemText = has ? broadcast.itemText : '';
  const huntType = has ? broadcast.huntType : 'phoneme';
  const target = has ? broadcast.target : '';
  const marks = has ? (broadcast.marks || {}) : {};

  const hunt = useMemo(() => buildHunt({ huntType, target }, itemText), [huntType, target, itemText]);
  const found = Object.values(marks).filter((v) => v === 'correct').length;

  return (
    <div className="flex flex-col gap-3 p-4 max-w-2xl mx-auto w-full">
      <div className="rounded-2xl bg-white border-2 border-slate-200 p-4 sm:p-6 shadow-sm">
        <div className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2">
          {hunt.typeDef.label}{hunt.typeDef.needsTarget ? ` · "${target}"` : ''}
        </div>
        <p className="text-lg sm:text-2xl font-bold text-slate-800 leading-relaxed min-h-[3rem]">
          {itemText
            ? <HuntSegments segments={hunt.segments} marks={marks} interactive={false} isSpaceHunt={hunt.type === 'space'} />
            : 'Waiting for your teacher…'}
        </p>
        {has && (
          <div className="mt-2 text-sm font-semibold text-slate-500">
            Found: <b className="text-green-600">{found}</b> / {hunt.correctCount}
          </div>
        )}
      </div>

      <div className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
        <Lock className="w-3.5 h-3.5" /> Watch your teacher — try it yourself when they say go
      </div>
    </div>
  );
}