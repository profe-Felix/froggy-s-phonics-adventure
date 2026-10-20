import { useEffect, useState } from 'react';
import { parseLessonRange } from '@/lib/literacy/dailyFluency.mjs';

// Keep the incomplete "7-" draft in the input. Only normalize after a
// complete value, never round-trip every keystroke through parseInt.
export default function LessonRangeInput({ value, onChange, ...props }) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!focused) setDraft(value); }, [value, focused]);
  const commit = text => {
    const parsed = parseLessonRange(text);
    setError(parsed ? '' : 'Enter a lesson or an ascending range, for example 7-8.');
    if (parsed) onChange(parsed);
  };
  return <><input {...props} type="text" inputMode="text" value={draft}
    aria-invalid={!!error} onFocus={() => setFocused(true)}
    onChange={event => {
      setDraft(event.target.value); setError('');
      const parsed = parseLessonRange(event.target.value);
      if (parsed) onChange(parsed);
    }}
    onBlur={() => { commit(draft); setFocused(false); }}
    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(draft); } }} />
    {error && <span role="alert" className="block text-xs text-red-700 mt-1">{error}</span>}</>;
}
