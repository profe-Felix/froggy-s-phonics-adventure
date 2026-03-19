export const ALL_PETS = [
  { id: 'pet_frog',       name: 'Froggy',     bg: '#bbf7d0', emoji: '🐸' },
  { id: 'pet_lion',       name: 'Leo',        bg: '#fef3c7', emoji: '🦁' },
  { id: 'pet_tiger',      name: 'Stripes',    bg: '#fed7aa', emoji: '🐯' },
  { id: 'pet_dog',        name: 'Barkley',    bg: '#fde68a', emoji: '🐶' },
  { id: 'pet_cat',        name: 'Whiskers',   bg: '#fce7f3', emoji: '🐱' },
  { id: 'pet_bear',       name: 'Biscuit',    bg: '#e7c9a0', emoji: '🐻' },
  { id: 'pet_panda',      name: 'Bamboo',     bg: '#f0fdf4', emoji: '🐼' },
  { id: 'pet_fox',        name: 'Rusty',      bg: '#ffedd5', emoji: '🦊' },
  { id: 'pet_bunny',      name: 'Snowball',   bg: '#e0e7ff', emoji: '🐰' },
  { id: 'pet_horse',      name: 'Gallop',     bg: '#fef9c3', emoji: '🐴' },
  { id: 'pet_unicorn',    name: 'Sparkle',    bg: '#fae8ff', emoji: '🦄' },
  { id: 'pet_elephant',   name: 'Peanut',     bg: '#e9d5ff', emoji: '🐘' },
  { id: 'pet_giraffe',    name: 'Stretch',    bg: '#fef9c3', emoji: '🦒' },
  { id: 'pet_penguin',    name: 'Tuxedo',     bg: '#dbeafe', emoji: '🐧' },
  { id: 'pet_owl',        name: 'Hoot',       bg: '#ede9fe', emoji: '🦉' },
  { id: 'pet_dragon',     name: 'Ember',      bg: '#fecaca', emoji: '🐲' },
  { id: 'pet_koala',      name: 'Gumleaf',    bg: '#cffafe', emoji: '🐨' },
  { id: 'pet_monkey',     name: 'Bananas',    bg: '#fde68a', emoji: '🐵' },
  { id: 'pet_wolf',       name: 'Howler',     bg: '#e0e7ff', emoji: '🐺' },
  { id: 'pet_pig',        name: 'Oinks',      bg: '#fce7f3', emoji: '🐷' },
];

export function getMilestoneCount(studentData) {
  const totalMastered = Object.values(studentData?.mode_progress || {})
    .flatMap(m => m?.mastered_items || []).length;
  return Math.min(Math.floor(totalMastered / 5) + 1, ALL_PETS.length);
}

export function getRandomNewPets(unlockedPetIds, count = 3) {
  const owned = new Set(unlockedPetIds || []);
  const available = ALL_PETS.filter(p => !owned.has(p.id));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}