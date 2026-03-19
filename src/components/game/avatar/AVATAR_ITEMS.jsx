// Each item maps to DiceBear "adventurer" style parameters
// https://www.dicebear.com/styles/adventurer

export const AVATAR_ITEMS = [
  // --- HATS (map to hair param — long styles look like hats/crowns) ---
  { id: 'hat_none',    slot: 'hat', label: 'None',       params: {},                                        unlockRequirement: null },
  { id: 'hat_crown',  slot: 'hat', label: 'Crown',       params: { hair: 'short17', hairColor: 'f9c23c' }, unlockRequirement: { type: 'mastered', count: 5 },  hint: 'Master 5 letters' },
  { id: 'hat_beanie', slot: 'hat', label: 'Beanie',      params: { hair: 'short14', hairColor: 'b83c6f' }, unlockRequirement: { type: 'mastered', count: 10 }, hint: 'Master 10 letters' },
  { id: 'hat_cap',    slot: 'hat', label: 'Cap',         params: { hair: 'short09', hairColor: '3b82f6' }, unlockRequirement: { type: 'mastered', count: 15 }, hint: 'Master 15 letters' },
  { id: 'hat_star',   slot: 'hat', label: 'Star Hair',   params: { hair: 'short01', hairColor: 'fbbf24' }, unlockRequirement: { type: 'mastered', count: 20 }, hint: 'Master 20 letters' },
  { id: 'hat_fancy',  slot: 'hat', label: 'Fancy',       params: { hair: 'long19', hairColor: '7c3aed' },  unlockRequirement: { type: 'mastered', count: 26 }, hint: 'Master all 26 letters!' },

  // --- OUTFITS (clothing + clothingColor) ---
  { id: 'outfit_default',   slot: 'outfit', label: 'Default',     params: { clothing: 'shirt01', clothingColor: '6ee7b7' }, unlockRequirement: null },
  { id: 'outfit_red',       slot: 'outfit', label: 'Red Shirt',   params: { clothing: 'shirt02', clothingColor: 'ef4444' }, unlockRequirement: { type: 'correct', count: 10 },  hint: 'Get 10 correct answers' },
  { id: 'outfit_blue',      slot: 'outfit', label: 'Blue Shirt',  params: { clothing: 'shirt03', clothingColor: '3b82f6' }, unlockRequirement: { type: 'correct', count: 25 },  hint: 'Get 25 correct answers' },
  { id: 'outfit_stripes',   slot: 'outfit', label: 'Stripes',     params: { clothing: 'shirt04', clothingColor: '8b5cf6' }, unlockRequirement: { type: 'correct', count: 50 },  hint: 'Get 50 correct answers' },
  { id: 'outfit_hoodie',    slot: 'outfit', label: 'Hoodie',      params: { clothing: 'shirt05', clothingColor: 'f97316' }, unlockRequirement: { type: 'correct', count: 100 }, hint: 'Get 100 correct answers' },
  { id: 'outfit_gold',      slot: 'outfit', label: 'Gold',        params: { clothing: 'shirt06', clothingColor: 'f59e0b' }, unlockRequirement: { type: 'modes', count: 3 },      hint: 'Unlock 3 game modes' },

  // --- ACCESSORIES (glasses / features) ---
  { id: 'acc_none',     slot: 'accessory', label: 'None',       params: {},                                                         unlockRequirement: null },
  { id: 'acc_glasses',  slot: 'accessory', label: 'Glasses',    params: { accessories: 'variant01', accessoriesColor: '1e293b' },   unlockRequirement: { type: 'correct', count: 20 }, hint: 'Get 20 correct answers' },
  { id: 'acc_sunglasses',slot:'accessory', label: 'Sunglasses', params: { accessories: 'variant02', accessoriesColor: '111827' },   unlockRequirement: { type: 'mastered', count: 12 }, hint: 'Master 12 letters' },
  { id: 'acc_round',    slot: 'accessory', label: 'Round Glasses',params:{ accessories: 'variant03', accessoriesColor: '7c3aed' },  unlockRequirement: { type: 'correct', count: 75 }, hint: 'Get 75 correct answers' },
  { id: 'acc_freckles', slot: 'accessory', label: 'Freckles',   params: { features: 'freckles' },                                   unlockRequirement: { type: 'modes', count: 2 }, hint: 'Unlock 2 game modes' },
  { id: 'acc_blush',    slot: 'accessory', label: 'Blush',      params: { features: 'blush' },                                      unlockRequirement: { type: 'correct', count: 5 }, hint: 'Get 5 correct answers' },
];

export const getDefaultCosmetics = () => ({
  hat: 'hat_none',
  outfit: 'outfit_default',
  accessory: 'acc_none',
});

// Build a DiceBear URL from cosmetic selections + optional seed
export function buildAvatarUrl(cosmetics = {}, seed = 'froggy') {
  const params = new URLSearchParams({ seed });
  
  // Merge params from each cosmetic slot
  for (const slotKey of ['hat', 'outfit', 'accessory']) {
    const itemId = cosmetics[slotKey];
    const item = AVATAR_ITEMS.find(i => i.id === itemId);
    if (item?.params) {
      for (const [k, v] of Object.entries(item.params)) {
        params.set(k, v);
      }
    }
  }

  return `https://api.dicebear.com/7.x/adventurer/svg?${params.toString()}`;
}

// --- Progress helpers ---
function getTotalMastered(studentData) {
  return Object.values(studentData?.mode_progress || {})
    .flatMap(m => m?.mastered_items || []).length;
}
function getTotalCorrect(studentData) {
  return Object.values(studentData?.mode_progress || {})
    .reduce((sum, m) => sum + (m?.total_correct || 0), 0);
}
function getUnlockedModes(studentData) {
  return Object.values(studentData?.mode_progress || {})
    .filter(m => m?.unlocked).length;
}

export function getUnlockedItems(studentData) {
  return AVATAR_ITEMS.filter(item => {
    if (!item.unlockRequirement) return true;
    const { type, count } = item.unlockRequirement;
    if (type === 'mastered') return getTotalMastered(studentData) >= count;
    if (type === 'correct')  return getTotalCorrect(studentData) >= count;
    if (type === 'modes')    return getUnlockedModes(studentData) >= count;
    return false;
  });
}