import { useCallback, useState } from 'react';
import { addStroke, clearPage, eraseAt, undoStroke } from '@/components/book/teacherInk';

// Teacher-only ink state. Lives in sessionStorage on this device only — it is
// never written to Base44 entities, never attached to student sessions, and
// never broadcast to student screens.
const STORE_KEY = 'teacher-ink:v1';
function load() {
  try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || '{}') || {}; } catch { return {}; }
}
function save(state) {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* quota: keep in memory */ }
}

export const INK_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#111827'];

export default function useTeacherInk() {
  const [strokes, setStrokes] = useState(load);
  const [tool, setTool] = useState(null); // null | 'pen' | 'highlight' | 'erase'
  const [color, setColor] = useState(INK_COLORS[0]);

  const update = useCallback((fn) => {
    setStrokes((prev) => {
      const next = fn(prev);
      if (next !== prev) save(next);
      return next;
    });
  }, []);

  return {
    strokes, tool, setTool, color, setColor,
    add: useCallback((key, stroke) => update((s) => addStroke(s, key, stroke)), [update]),
    erase: useCallback((key, pt) => update((s) => eraseAt(s, key, pt)), [update]),
    undo: useCallback((key) => update((s) => undoStroke(s, key)), [update]),
    clear: useCallback((key) => update((s) => clearPage(s, key)), [update]),
  };
}
