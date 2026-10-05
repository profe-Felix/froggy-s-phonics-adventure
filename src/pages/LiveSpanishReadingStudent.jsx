import React from 'react';
import { useLiveSpanishReadingSession } from '@/hooks/useLiveSpanishReadingSession';
import { Loader2, Clock, CheckCircle2, Volume2 } from 'lucide-react';
import SlideToReadCanvas from '@/components/game/spanishReading/SlideToReadCanvas';
import HuntActivity from '@/components/activities/HuntActivity';

// Student view for the live small-group Spanish Reading session. Students
// access via their normal class+number URL params (e.g. ?class=Felix&number=2).
// The page auto-discovers the active session for their small group and follows
// along: every student sees the same item, practices on their own iPad, and
// the teacher controls when the group advances.
export default function LiveSpanishReadingStudent() {
  const urlParams = new URLSearchParams(window.location.search);
  const classFromUrl = urlParams.get('class') || urlParams.get('className');
  const numberFromUrl = urlParams.get('number') || urlParams.get('studentNumber');
  const studentNumber = numberFromUrl ? parseInt(numberFromUrl) : null;
  const className = classFromUrl || '';

  const validIdentity = !!className && Number.isInteger(studentNumber) && studentNumber > 0;
  const { session, loading } = useLiveSpanishReadingSession({
    className: validIdentity ? className : '',
    studentNumber: validIdentity ? studentNumber : null,
  });

  if (!validIdentity) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-center px-8">
          Missing class or number. Ask your teacher for the live reading link.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Clock className="w-16 h-16 mx-auto text-slate-500 mb-4 animate-pulse" />
          <p className="text-white text-xl font-bold">Waiting for your teacher</p>
          <p className="text-slate-400 mt-2">Your group hasn't started yet.</p>
        </div>
      </div>
    );
  }

  const items = session.items || [];
  const idx = Math.min(session.current_index || 0, items.length - 1);
  const current = items[idx];

  if (!current) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto text-green-400 mb-4" />
          <p className="text-white text-xl font-bold">All done! 🎉</p>
        </div>
      </div>
    );
  }

  // ── Blending mode: individual slider, teacher advances ──
  if (session.mode === 'blending') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 border-b border-slate-200 shrink-0">
          <Volume2 className="w-4 h-4 text-indigo-500" />
          <span className="text-xs sm:text-sm font-bold text-slate-700 flex-1 truncate">
            Slide to read · {idx + 1} / {items.length}
          </span>
          <span className="text-xs text-slate-400">Teacher leads</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <SlideToReadCanvas
            key={`${session.id}-${idx}`}
            text={current}
            itemType="word"
            micEnabled={false}
            recordingEnabled={false}
            groupMode
          />
        </div>
      </div>
    );
  }

  // ── Letter hunt mode: synced word, bigger text, teacher advances ──
  const targetLetter = session.config?.target_letter || '';
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 overflow-y-auto">
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-200 shrink-0">
        <span className="text-xs sm:text-sm font-bold text-slate-700 flex-1 truncate">
          Hunt the letter · {idx + 1} / {items.length}
        </span>
        {targetLetter && (
          <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 text-sm font-black">
            {targetLetter}
          </span>
        )}
      </div>
      <HuntActivity
        key={`${session.id}-${idx}`}
        config={{
          items: [current],
          target: targetLetter,
          huntType: 'phoneme',
        }}
        studentName={`Student ${studentNumber}`}
        externalAdvance
      />
    </div>
  );
}