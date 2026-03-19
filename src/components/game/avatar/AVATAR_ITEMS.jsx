// All unlockable avatar items
// milestone: function(studentData) => boolean

export const AVATAR_ITEMS = [
  // HATS
  { id: 'hat_none', slot: 'hat', label: 'No Hat', emoji: '', unlocked: () => true },
  { id: 'hat_party', slot: 'hat', label: 'Party Hat', emoji: '🎉', unlocked: (s) => totalMastered(s) >= 3, hint: 'Master 3 items' },
  { id: 'hat_cowboy', slot: 'hat', label: 'Cowboy Hat', emoji: '🤠', unlocked: (s) => totalMastered(s) >= 8, hint: 'Master 8 items' },
  { id: 'hat_wizard', slot: 'hat', label: 'Wizard Hat', emoji: '🧙', unlocked: (s) => totalMastered(s) >= 15, hint: 'Master 15 items' },
  { id: 'hat_crown', slot: 'hat', label: 'Crown', emoji: '👑', unlocked: (s) => totalMastered(s) >= 25, hint: 'Master 25 items' },
  { id: 'hat_tophat', slot: 'hat', label: 'Top Hat', emoji: '🎩', unlocked: (s) => totalCorrect(s) >= 100, hint: '100 correct answers' },

  // OUTFITS
  { id: 'outfit_none', slot: 'outfit', label: 'Default', emoji: '👕', unlocked: () => true },
  { id: 'outfit_star', slot: 'outfit', label: 'Star Shirt', emoji: '⭐', unlocked: (s) => modesUnlocked(s) >= 2, hint: 'Unlock 2 game modes' },
  { id: 'outfit_rainbow', slot: 'outfit', label: 'Rainbow', emoji: '🌈', unlocked: (s) => modesUnlocked(s) >= 3, hint: 'Unlock 3 game modes' },
  { id: 'outfit_cape', slot: 'outfit', label: 'Hero Cape', emoji: '🦸', unlocked: (s) => modesUnlocked(s) >= 4, hint: 'Unlock 4 game modes' },
  { id: 'outfit_space', slot: 'outfit', label: 'Space Suit', emoji: '🚀', unlocked: (s) => totalCorrect(s) >= 200, hint: '200 correct answers' },

  // ACCESSORIES
  { id: 'acc_none', slot: 'accessory', label: 'None', emoji: '', unlocked: () => true },
  { id: 'acc_glasses', slot: 'accessory', label: 'Glasses', emoji: '👓', unlocked: (s) => totalAttempts(s) >= 20, hint: '20 attempts' },
  { id: 'acc_sunglasses', slot: 'accessory', label: 'Sunglasses', emoji: '😎', unlocked: (s) => totalCorrect(s) >= 50, hint: '50 correct answers' },
  { id: 'acc_flower', slot: 'accessory', label: 'Flower', emoji: '🌸', unlocked: (s) => totalMastered(s) >= 5, hint: 'Master 5 items' },
  { id: 'acc_medal', slot: 'accessory', label: 'Medal', emoji: '🏅', unlocked: (s) => totalMastered(s) >= 20, hint: 'Master 20 items' },
];

// Helper functions to compute milestones from studentData
function totalMastered(s) {
  const mp = s?.mode_progress || {};
  return Object.values(mp).reduce((sum, m) => sum + (m?.mastered_items?.length || 0), 0);
}
function totalCorrect(s) {
  const mp = s?.mode_progress || {};
  return Object.values(mp).reduce((sum, m) => sum + (m?.total_correct || 0), 0);
}
function totalAttempts(s) {
  const mp = s?.mode_progress || {};
  return Object.values(mp).reduce((sum, m) => sum + (m?.total_attempts || 0), 0);
}
function modesUnlocked(s) {
  const mp = s?.mode_progress || {};
  return Object.values(mp).filter(m => m?.unlocked).length;
}

export function getUnlockedItems(studentData) {
  return AVATAR_ITEMS.filter(item => item.unlocked(studentData));
}

export function getDefaultCosmetics() {
  return { hat: 'hat_none', outfit: 'outfit_none', accessory: 'acc_none' };
}