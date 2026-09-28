// Activities available for table rotation assignment.
// Each id maps to a currentMode in LetterGame.jsx (or 'pathway' for the default level path).

export const ROTATION_ACTIVITIES = [
  { id: 'pathway', label: 'Pathway', icon: '🛤️', description: 'Lesson progression on the level path' },
  { id: 'book_reading', label: 'Book Reading', icon: '📚', description: 'Read assigned books' },
  { id: 'letter_tracing', label: 'Letter Tracing', icon: '✏️', description: 'Trace letters following pathways' },
  { id: 'letter_sounds', label: 'Letter Sounds', icon: '🔊', description: 'Match letters to their sounds' },
  { id: 'sight_words_easy', label: 'Sight Words', icon: '👀', description: 'Catch the word you hear' },
  { id: 'sight_words_spelling', label: 'Spell Sight Words', icon: '✍️', description: 'Build sight words letter by letter' },
  { id: 'spanish_reading', label: 'Spanish Reading', icon: '📖', description: 'Slide & read Spanish words' },
  { id: 'storybuilder', label: 'Story Builder', icon: '📝', description: 'Build stories with drawings' },
  { id: 'name_tracing', label: 'Name Tracing', icon: '🏷️', description: 'Trace your name' },
  { id: 'missing_letter', label: 'Missing Letter', icon: '🔤', description: 'Fill in missing letters' },
  { id: 'syllable_count', label: 'Syllable Count', icon: '🧮', description: 'Count syllables in words' },
  { id: 'number_hearing', label: 'Number Hearing', icon: '🔢', description: 'Listen and identify numbers' },
  { id: 'spelling', label: 'Spelling', icon: '🔡', description: 'Spell words from memory' },
  { id: 'phonics', label: 'Phonics', icon: '🎧', description: 'Fill missing sounds in words' },
  { id: 'sentences', label: 'Sentences', icon: '💬', description: 'Build sentences word by word' },
  { id: 'case_matching', label: 'Upper & Lowercase', icon: '🔄', description: 'Match uppercase with lowercase' },
  { id: 'word_builder', label: 'Word Builder', icon: '🏗️', description: 'Build words from syllables' },
];

// Distinct color schemes for up to 8 tables.
export const TABLE_COLORS = [
  { name: 'red',    bg: 'bg-red-100',     border: 'border-red-500',     text: 'text-red-700',     solid: 'bg-red-500',     hex: '#ef4444' },
  { name: 'blue',   bg: 'bg-blue-100',    border: 'border-blue-500',    text: 'text-blue-700',    solid: 'bg-blue-500',    hex: '#3b82f6' },
  { name: 'green',  bg: 'bg-green-100',   border: 'border-green-500',   text: 'text-green-700',   solid: 'bg-green-500',   hex: '#22c55e' },
  { name: 'amber',  bg: 'bg-amber-100',   border: 'border-amber-500',   text: 'text-amber-700',   solid: 'bg-amber-500',   hex: '#f59e0b' },
  { name: 'purple', bg: 'bg-purple-100',  border: 'border-purple-500',  text: 'text-purple-700',  solid: 'bg-purple-500',  hex: '#a855f7' },
  { name: 'pink',   bg: 'bg-pink-100',    border: 'border-pink-500',    text: 'text-pink-700',    solid: 'bg-pink-500',    hex: '#ec4899' },
  { name: 'teal',   bg: 'bg-teal-100',    border: 'border-teal-500',    text: 'text-teal-700',    solid: 'bg-teal-500',    hex: '#14b8a6' },
  { name: 'indigo', bg: 'bg-indigo-100',  border: 'border-indigo-500',  text: 'text-indigo-700',  solid: 'bg-indigo-500',  hex: '#6366f1' },
];