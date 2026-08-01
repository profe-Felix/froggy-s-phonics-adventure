import { base44 } from '@/api/base44Client';

// Lessons live as a JSON file in Supabase public storage so they can be updated
// from a local script (overwrite the file) without logging into the app.
//
// Upload to:  <supabase-project>/storage/v1/object/public/images/lessons/lessons.json
// Shape:      { "lessons": [ { id, lesson_number, class_name, title, subtitle,
//                             active, steps: [...] }, ... ] }
//   - or a bare top-level array.
//   - `id` is optional (defaults to `lesson-<lesson_number>`); it must be stable
//     across updates because student progress (LessonProgress) is keyed on it.
//   - `active` defaults to true; set false to hide a lesson.
//
// If the fetch fails (file not uploaded yet, bad path, network), we fall back
// to the Base44 Lesson entity so the app never breaks during the transition.
const LESSONS_URL =
  'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-lessons/lessons.json';

function normalize(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((l) => ({
      ...l,
      id: l.id || `lesson-${l.lesson_number}`,
      active: l.active !== false,
    }))
    .filter((l) => l.active);
}

export async function fetchLessons() {
  try {
    const res = await fetch(LESSONS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`lessons http ${res.status}`);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : data.lessons || [];
    const out = normalize(arr);
    if (out.length) return out;
    // Empty file = no lessons authored yet upstream; fall back so a half-uploaded
    // file doesn't blank the app.
    throw new Error('lessons empty');
  } catch (e) {
    const list = await base44.entities.Lesson.filter({ active: true });
    return normalize(list);
  }
}