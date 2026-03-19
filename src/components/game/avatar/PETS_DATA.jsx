// Each pet uses a DiceBear "adventurer" seed for a consistent illustrated character
// Seeds chosen to produce visually distinct, cute results
export const ALL_PETS = [
  { id: 'pet_frog',       name: 'Froggy',     bg: '#bbf7d0', seed: 'froggy-green' },
  { id: 'pet_bear',       name: 'Biscuit',    bg: '#fde68a', seed: 'bear-biscuit' },
  { id: 'pet_bunny',      name: 'Snowball',   bg: '#e0e7ff', seed: 'bunny-snowball' },
  { id: 'pet_cat',        name: 'Whiskers',   bg: '#fce7f3', seed: 'cat-whiskers' },
  { id: 'pet_dog',        name: 'Barkley',    bg: '#fed7aa', seed: 'dog-barkley' },
  { id: 'pet_dragon',     name: 'Ember',      bg: '#fecaca', seed: 'dragon-ember' },
  { id: 'pet_elephant',   name: 'Peanut',     bg: '#e9d5ff', seed: 'elephant-peanut' },
  { id: 'pet_fox',        name: 'Rusty',      bg: '#ffedd5', seed: 'fox-rusty' },
  { id: 'pet_giraffe',    name: 'Stretch',    bg: '#fef9c3', seed: 'giraffe-stretch' },
  { id: 'pet_hedgehog',   name: 'Prickle',    bg: '#d1fae5', seed: 'hedgehog-prickle' },
  { id: 'pet_koala',      name: 'Gumleaf',    bg: '#cffafe', seed: 'koala-gumleaf' },
  { id: 'pet_lion',       name: 'Mane',       bg: '#fef3c7', seed: 'lion-mane' },
  { id: 'pet_monkey',     name: 'Bananas',    bg: '#fde68a', seed: 'monkey-bananas' },
  { id: 'pet_owl',        name: 'Hoot',       bg: '#ede9fe', seed: 'owl-hoot' },
  { id: 'pet_panda',      name: 'Bamboo',     bg: '#f0fdf4', seed: 'panda-bamboo' },
  { id: 'pet_penguin',    name: 'Tuxedo',     bg: '#dbeafe', seed: 'penguin-tuxedo' },
  { id: 'pet_pig',        name: 'Oinks',      bg: '#fce7f3', seed: 'pig-oinks' },
  { id: 'pet_tiger',      name: 'Stripes',    bg: '#fef3c7', seed: 'tiger-stripes' },
  { id: 'pet_unicorn',    name: 'Sparkle',    bg: '#fae8ff', seed: 'unicorn-sparkle' },
  { id: 'pet_wolf',       name: 'Howler',     bg: '#e0e7ff', seed: 'wolf-howler' },
];

export function getPetImageUrl(pet) {
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(pet.seed)}&backgroundColor=${pet.bg.replace('#', '')}`;
}

// Returns how many pets should be unlocked based on mastered items
export function getMilestoneCount(studentData) {
  const totalMastered = Object.values(studentData?.mode_progress || {})
    .flatMap(m => m?.mastered_items || []).length;
  // 1 pet per 5 mastered items, plus 1 at the start (so kids start with Froggy free)
  return Math.min(Math.floor(totalMastered / 5) + 1, ALL_PETS.length);
}

// Returns a random pet the student doesn't own yet
export function getRandomNewPets(unlockedPetIds, count = 3) {
  const owned = new Set(unlockedPetIds || []);
  const available = ALL_PETS.filter(p => !owned.has(p.id));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}