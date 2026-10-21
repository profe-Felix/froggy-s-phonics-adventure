import { DEFAULT_MAP } from './config.js';

export class MapError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function validateMap(raw = DEFAULT_MAP) {
  if (!raw) throw new MapError('This trail is not available.', 404);
  if (!/^[a-z0-9-]{1,60}$/.test(raw.id || '') || !/^[a-zA-Z0-9._-]{1,60}$/.test(raw.revision || ''))
    throw new MapError('Invalid map identity.');
  if (!Array.isArray(raw.levels) || raw.levels.length !== 200 ||
      !Array.isArray(raw.sections) || raw.sections.length !== 10)
    throw new MapError('A map must have 200 levels and 10 sections.');
  const levels = raw.levels.map((level, i) => {
    if (level.number !== i + 1 || typeof level.title !== 'string' || !level.title.trim() || level.title.length > 100)
      throw new MapError('Levels must be ordered 1–200 and have a title.');
    if (!['preview_confirmation', 'lesson_completion'].includes(level.requirement?.type))
      throw new MapError('Unknown completion requirement.');
    if (level.requirement.type === 'lesson_completion' &&
        !/^[a-zA-Z0-9_:-]{1,160}$/.test(level.requirement.lessonId || ''))
      throw new MapError('A lesson requirement needs a valid lesson ID.');
    const destination = level.destination || null;
    if (destination && (typeof destination !== 'string' ||
        !/^\/(?:LetterGame|AlphabetChart|BookReading|DailyFluency|BookComprehension|SpanishReading)(?:\?|$)/.test(destination) ||
        /[\\\r\n]/.test(destination) || destination.length > 1000))
      throw new MapError('Use a supported activity inside this app.');
    if (destination && [...destination.matchAll(/\{([^}]+)\}/g)].some(match =>
        !['studentId', 'className', 'number', 'schoolYear'].includes(match[1])))
      throw new MapError('Unknown student placeholder in activity destination.');
    return { number: level.number, title: level.title.trim(),
      description: String(level.description || '').slice(0, 400), destination,
      requirement: { type: level.requirement.type,
        label: String(level.requirement.label || 'Check completion').slice(0, 100),
        ...(level.requirement.type === 'lesson_completion' ? { lessonId: level.requirement.lessonId } : {}) } };
  });
  return { id: raw.id, revision: raw.revision, title: String(raw.title || 'Learning trail').slice(0, 100),
    sections: raw.sections.map(name => String(name).slice(0, 80)), levels };
}
export function studentScope(student, map) {
  if (!student?.id || !Number.isInteger(student.student_number) || student.student_number < 1 ||
      student.student_number > 30 || !student.class_name || !student.school_year)
    throw new MapError('Select an existing student with a class and school year.', 403);
  return { student_id: student.id, class_name: student.class_name, school_year: student.school_year,
    map_id: map.id, map_revision: map.revision };
}
export function progressFromAttempts(attempts, scope, count = 200) {
  const completed = new Set(attempts.filter(row => row.status === 'completed' &&
    Object.entries(scope).every(([key, value]) => row[key] === value) &&
    Number.isInteger(row.level_number) && row.level_number >= 1 && row.level_number <= count
  ).map(row => row.level_number));
  let completedCount = 0;
  // A stray future receipt must never open a gap in the path.
  while (completed.has(completedCount + 1) && completedCount < count) completedCount++;
  return { completedCount, completedLevels: Array.from({ length: completedCount }, (_, i) => i + 1),
    currentLevel: completedCount < count ? completedCount + 1 : null };
}
export function levelState(number, progress) {
  return number <= progress.completedCount ? 'completed' : number === progress.currentLevel ? 'current' : 'locked';
}
export function assertOpenLevel(number, progress, map) {
  if (!Number.isInteger(number) || number < 1 || number > map.levels.length)
    throw new MapError('Unknown level.');
  if (levelState(number, progress) === 'locked') throw new MapError('Finish the current level first.', 409);
  return map.levels[number - 1];
}
export function assertAttempt(attempt, scope, number, now = Date.now()) {
  if (!attempt || !Object.entries(scope).every(([key, value]) => attempt[key] === value) ||
      attempt.level_number !== number) throw new MapError('This practice attempt belongs to a different student or level.', 403);
  if (attempt.status !== 'completed' && (!Number.isFinite(Date.parse(attempt.expires_at)) || Date.parse(attempt.expires_at) <= now))
    throw new MapError('This practice expired. Open the level again.', 409);
}
export function assertRequirement(level, body, lessonRows = []) {
  if (level.requirement.type === 'preview_confirmation') {
    if (body.confirmed !== true) throw new MapError('Confirm that you tried this preview activity.');
  } else if (!lessonRows.some(row => row.lesson_id === level.requirement.lessonId && row.completed === true)) {
    throw new MapError('Finish the assigned lesson before unlocking the next level.', 409);
  }
}
