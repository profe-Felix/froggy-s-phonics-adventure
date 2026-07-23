// Color palette + mode metadata shared by the Lesson editor and the student Lesson map.

export const STEP_COLORS = {
  sky:    { bg: 'bg-sky-200',     ring: 'ring-sky-400',     text: 'text-sky-700',     solid: 'bg-sky-400' },
  pink:   { bg: 'bg-pink-200',    ring: 'ring-pink-400',    text: 'text-pink-700',    solid: 'bg-pink-400' },
  yellow: { bg: 'bg-yellow-200',  ring: 'ring-yellow-400',  text: 'text-yellow-700',  solid: 'bg-yellow-400' },
  green:  { bg: 'bg-green-200',   ring: 'ring-green-400',   text: 'text-green-700',   solid: 'bg-green-400' },
  orange: { bg: 'bg-orange-200',  ring: 'ring-orange-400',  text: 'text-orange-700',  solid: 'bg-orange-400' },
  purple: { bg: 'bg-purple-200',  ring: 'ring-purple-400',  text: 'text-purple-700',  solid: 'bg-purple-400' },
  blue:   { bg: 'bg-blue-200',    ring: 'ring-blue-400',    text: 'text-blue-700',    solid: 'bg-blue-400' },
  teal:   { bg: 'bg-teal-200',    ring: 'ring-teal-400',    text: 'text-teal-700',    solid: 'bg-teal-400' },
  rose:   { bg: 'bg-rose-200',    ring: 'ring-rose-400',    text: 'text-rose-700',    solid: 'bg-rose-400' },
  indigo: { bg: 'bg-indigo-200',  ring: 'ring-indigo-400',  text: 'text-indigo-700',  solid: 'bg-indigo-400' },
};

export const COLOR_KEYS = Object.keys(STEP_COLORS);

// Each mode maps to an existing activity component. defaultCompletion drives the
// editor's sensible default when a teacher picks the mode.
export const MODE_OPTIONS = [
  { value: 'letter_sounds',        label: 'Letter Sounds',      emoji: '🔤', defaultCompletion: 'mastery', defaultTarget: 3 },
  { value: 'sight_words_easy',      label: 'Sight Words',       emoji: '👁️', defaultCompletion: 'view',    defaultTarget: 1 },
  { value: 'sight_words_spelling',  label: 'Spell Sight Words', emoji: '✏️', defaultCompletion: 'mastery', defaultTarget: 3 },
  { value: 'spelling',              label: 'Spelling Words',    emoji: '🧩', defaultCompletion: 'view',    defaultTarget: 1 },
  { value: 'case_matching',         label: 'Upper & Lowercase', emoji: '🔠', defaultCompletion: 'mastery', defaultTarget: 3 },
  { value: 'letter_tracing',        label: 'Letter Tracing',    emoji: '✍️', defaultCompletion: 'view',    defaultTarget: 1 },
  { value: 'phonics',               label: 'Phonics Cloze',     emoji: '👂', defaultCompletion: 'view',    defaultTarget: 1 },
  { value: 'sentences',             label: 'Sentences',         emoji: '📝', defaultCompletion: 'view',    defaultTarget: 1 },
  { value: 'spanish_reading',       label: 'Spanish Reading',   emoji: '📖', defaultCompletion: 'view',    defaultTarget: 1 },
  { value: 'storybuilder',          label: 'Story Builder',    emoji: '🎨', defaultCompletion: 'view',    defaultTarget: 1 },
  { value: 'book_reading',          label: 'Book Reading',     emoji: '📚', defaultCompletion: 'view',    defaultTarget: 1 },
  { value: 'number_hearing',        label: 'Number Hearing',    emoji: '🔢', defaultCompletion: 'view',    defaultTarget: 1 },
];

export const MODE_BY_VALUE = Object.fromEntries(MODE_OPTIONS.map(m => [m.value, m]));

export function colorOf(key) {
  return STEP_COLORS[key] || STEP_COLORS.sky;
}