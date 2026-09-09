import { format, parseISO } from 'date-fns';

// Convert minutes-from-midnight to a readable 12h time, e.g. 750 -> "12:30 pm".
export function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Convert an <input type="time"> value ("HH:MM") to minutes from midnight.
export function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Format an ISO date ("YYYY-MM-DD") as a long readable weekday + date.
export function formatLongDate(iso) {
  try {
    return format(parseISO(iso), 'EEEE, MMMM d');
  } catch {
    return iso;
  }
}

// Build a Google Calendar "add event" link for a booked slot. Uses local
// time (no Z) so Google interprets it in the parent's own timezone.
export function buildCalendarUrl({ date, startMinutes, durationMin, teacherName, studentName }) {
  const pad = (n) => String(n).padStart(2, '0');
  const localFmt = (d) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const start = new Date(`${date}T00:00:00`);
  start.setMinutes(startMinutes);
  const end = new Date(start.getTime() + durationMin * 60000);
  const text = `Parent-Teacher Conference${studentName ? ` — ${studentName}` : ''}`;
  const details = `Conference with ${teacherName || 'your teacher'}`;
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&dates=${localFmt(start)}/${localFmt(end)}&details=${encodeURIComponent(details)}`;
}

// Generate a short unique join code for a conference QR link.
export function generateCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}