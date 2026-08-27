// The current active school year. Change this when a new school year starts.
// Format: "YY-YY" e.g. "26-27" for the 2026-2027 school year.
// New students are tagged with this year, and logins filter by it so the
// same class+number in different years never collide.
export const ACTIVE_SCHOOL_YEAR = '26-27';

// Today's date as YYYY-MM-DD in the USER'S LOCAL timezone (not UTC).
// Book-reading sessions are keyed by date, so the student and the teacher must
// agree on what "today" is. Using UTC (toISOString) meant a student recording
// at 7pm Central stamped the next UTC day, and the teacher reviewing "today"
// (also UTC) didn't see it — recordings looked like they never saved. Local
// date keeps both sides on the same calendar day.
export function todayLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}