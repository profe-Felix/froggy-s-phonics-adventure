import React from 'react';
import { Check } from 'lucide-react';

// Static "Done" bar for open-ended activities that don't report progress.
// Tapping it marks the lesson step complete (view-once) and shows the
// completion overlay — it does NOT navigate away.
export default function StepDoneBar({ onDone, label = 'Done' }) {
  return (
    <div className="shrink-0 flex justify-center py-2 bg-white border-t">
      <button
        onClick={onDone}
        className="px-6 py-2 bg-green-500 text-white font-black rounded-2xl shadow hover:bg-green-600 inline-flex items-center gap-2"
      >
        <Check className="w-5 h-5" /> {label}
      </button>
    </div>
  );
}