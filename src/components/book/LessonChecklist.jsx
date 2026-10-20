import { useState } from 'react';
import { bookLessonTags } from '@/lib/book/lessonTags.mjs';

const LESSONS = Array.from({ length: 20 }, (_, i) => `L${i + 1}`);

export default function LessonChecklist({ value, onSave, label = 'Book lessons', disabled = false }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const tags = bookLessonTags({ lessons: value });
  const close = () => { if (!saving) setOpen(false); };
  const apply = async () => {
    setSaving(true);
    setError('');
    try { await onSave(draft); setOpen(false); }
    catch { setError('Could not finish saving. Please retry.'); }
    finally { setSaving(false); }
  };
  return (
    <div className="relative">
      <button type="button" aria-label={label} aria-expanded={open} disabled={disabled}
        className="rounded-lg border border-teal-700 bg-teal-950 px-2 py-1 text-xs font-bold text-white disabled:opacity-50"
        onClick={() => { setDraft(tags); setError(''); setOpen(v => !v); }}>
        {tags.length ? tags.join(', ') : 'No lesson'} ▾
      </button>
      {open && <>
        <div className="fixed inset-0 z-40" onClick={close} />
        <div role="dialog" aria-label={label} className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-teal-700 bg-teal-950 p-3 text-white shadow-xl">
          <p className="mb-2 text-xs text-teal-200">Optional: choose all lessons that use this book. No tags = module only.</p>
          <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto">
            {LESSONS.map(lesson => (
              <label key={lesson} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-teal-900">
                <input type="checkbox" checked={draft.includes(lesson)} disabled={saving}
                  onChange={e => setDraft(previous => e.target.checked ? [...previous, lesson] : previous.filter(v => v !== lesson))} />
                {lesson}
              </label>
            ))}
          </div>
          {error && <p role="alert" className="mt-2 text-xs text-red-200">{error}</p>}
          <div className="mt-3 flex items-center gap-2 text-xs">
            <button type="button" disabled={saving} onClick={() => setDraft([])} className="mr-auto text-teal-200">Clear</button>
            <button type="button" disabled={saving} onClick={close}>Cancel</button>
            <button type="button" disabled={saving} onClick={apply} className="rounded bg-teal-600 px-3 py-2 font-bold">{saving ? 'Saving…' : 'Apply'}</button>
          </div>
        </div>
      </>}
    </div>
  );
}
