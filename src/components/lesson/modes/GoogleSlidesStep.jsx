import { useState } from 'react';
import { Check } from 'lucide-react';

// Student-facing Google Slides step. Embeds a Google Slides presentation via
// its publish-to-web embed URL in an iframe. The student watches the slides
// and taps "Done" to complete the step. For interleaving with activities, the
// teacher creates separate slides steps (e.g. slides 1-3, then an activity,
// then slides 4-6) — each step is one embed URL.
export default function GoogleSlidesStep({ onComplete, stepConfig, title }) {
  const [done, setDone] = useState(false);
  const url = stepConfig?.slidesUrl || '';

  if (!url) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-900 text-white/60 p-8 text-center gap-2">
        <p className="text-lg font-bold">No slides assigned</p>
        <p className="text-sm opacity-60">Ask your teacher for help.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="flex-1 min-h-0 p-2">
        <iframe
          src={url}
          className="w-full h-full rounded-xl border-0"
          allowFullScreen
          title={title || 'Google Slides'}
        />
      </div>
      <div className="p-3 flex justify-center shrink-0">
        <button
          onClick={() => {
            if (done) return;
            setDone(true);
            onComplete?.();
          }}
          disabled={done}
          className="px-6 py-3 rounded-2xl bg-green-500 text-white font-black inline-flex items-center gap-2 disabled:opacity-60 hover:bg-green-600"
        >
          <Check className="w-5 h-5" /> {done ? 'Done!' : "I'm done watching"}
        </button>
      </div>
    </div>
  );
}