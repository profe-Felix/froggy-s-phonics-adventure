// Seeded random — same seed = same collection
function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const EMOJI_SETS = [
  ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯'],
  ['🍎','🍊','🍋','🍇','🍓','🍑','🥝','🍍','🥭','🍒'],
  ['🧁','🍩','🍪','🎂','🍰','🍫','🍬','🍭','🍮','🍯'],
  ['🦋','🐝','🐛','🐞','🐜','🦗','🕷','🦟','🦠','🐌'],
  ['⭐','🌙','☀️','🌈','⚡','❄️','🌸','🌺','🌻','🌼'],
];

export function generateCollection(seed, count) {
  const rng = seededRng(seed);
  // Pick an emoji set
  const setIdx = Math.floor(rng() * EMOJI_SETS.length);
  const emojiPool = EMOJI_SETS[setIdx];
  const emojiIdx = Math.floor(rng() * emojiPool.length);
  const emoji = emojiPool[emojiIdx];

  // Place items scattered on a 360x440 canvas (lower half = scatter area)
  // Avoid clustering — divide into grid zones and randomize within
  const items = [];
  const cols = 6, rows = 4;
  const zones = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      zones.push({ r, c });
    }
  }
  // Shuffle zones
  for (let i = zones.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [zones[i], zones[j]] = [zones[j], zones[i]];
  }

  for (let i = 0; i < count; i++) {
    const zone = zones[i % zones.length];
    const zoneW = 360 / cols;
    const zoneH = 200 / rows;
    const x = zone.c * zoneW + rng() * (zoneW - 32) + 8;
    const y = zone.r * zoneH + rng() * (zoneH - 32) + 8;
    const rotation = (rng() - 0.5) * 40;
    items.push({ id: i, emoji, x, y, rotation });
  }
  return items;
}