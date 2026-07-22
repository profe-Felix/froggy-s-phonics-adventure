// Per-student language dimension for the literacy games.
// Mirrors the schoolYear pattern: a constant default + a helper that reads
// the active language off the student record, so every game can branch on it.

export const DEFAULT_LANGUAGE = 'es';

export const LANGUAGES = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

// Active language for a student record (falls back to the app default).
export function getLanguage(studentData) {
  return studentData?.language || DEFAULT_LANGUAGE;
}

// When locked (default), students can't change their own language on the
// landing page — only a teacher can flip it from the dashboard.
export function isLanguageLocked(studentData) {
  return studentData?.language_locked !== false;
}