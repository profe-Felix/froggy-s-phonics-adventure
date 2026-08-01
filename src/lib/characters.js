// Character assets live in a public Supabase bucket under images/Characters/
// as Character_0001.png, Character_0002.png, … The public bucket blocks LIST
// requests, so we discover the available set by HEAD-probing a generous range
// once, then cache the result in memory + localStorage for a day.
const BASE = 'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/images/Characters';
const CACHE_KEY = 'character-list-v1';
const CACHE_TTL = 86_400_000; // 1 day
const PROBE_MAX = 120;

export function charUrl(id) {
  return `${BASE}/Character_${id}.png`;
}

let memCache = null;

export async function getCharacters() {
  if (memCache) return memCache;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Date.now() - p.t < CACHE_TTL && Array.isArray(p.ids) && p.ids.length) {
        memCache = p.ids.map((i) => ({ id: String(i).padStart(4, '0'), url: charUrl(String(i).padStart(4, '0')) }));
        return memCache;
      }
    }
  } catch {}
  const found = [];
  const batch = 25;
  for (let s = 1; s <= PROBE_MAX; s += batch) {
    const tasks = [];
    for (let i = s; i < Math.min(s + batch, PROBE_MAX + 1); i++) {
      const id = String(i).padStart(4, '0');
      tasks.push((async () => {
        try { const r = await fetch(charUrl(id), { method: 'HEAD' }); if (r.ok) found.push(i); } catch {}
      })());
    }
    await Promise.all(tasks);
  }
  found.sort((a, b) => a - b);
  memCache = found.map((i) => { const id = String(i).padStart(4, '0'); return { id, url: charUrl(id) }; });
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), ids: found })); } catch {}
  return memCache;
}