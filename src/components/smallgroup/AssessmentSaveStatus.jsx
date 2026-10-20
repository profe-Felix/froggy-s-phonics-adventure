import React from 'react';

export default function AssessmentSaveStatus({ status, onRetry }) {
  return (
    <div role={status.error ? 'alert' : 'status'} aria-live="polite"
      className={`px-4 py-2 text-sm flex items-center justify-between gap-3 ${status.error ? 'bg-amber-100 text-amber-950' : 'bg-emerald-50 text-emerald-900'}`}>
      <span>{status.error || (status.pending ? 'Saving student attempt…' : 'Student attempts saved')}</span>
      {status.error && <button type="button" onClick={onRetry} className="underline font-bold shrink-0">Retry save</button>}
    </div>
  );
}
