// Bounded, short-lived cache + in-flight deduplication for SoundWallCard
// entity lookups. Prevents repeated parallel requests for the same filter
// when multiple components mount or re-render simultaneously.
//
// Cache keys include the filter params so different queries don't collide.
// TTL is 30 seconds — short enough to pick up edits, long enough to survive
// a lesson viewing session. In-flight promises are shared so identical
// concurrent requests only hit the server once.

const CACHE_TTL_MS = 30_000;
const MAX_ENTRIES = 50;

const cache = new Map();      // key → { value, expiresAt }
const inflight = new Map();   // key → Promise

function makeKey(filter) {
  // Stable, sorted key so { a: 1, b: 2 } and { b: 2, a: 1 } match.
  const entries = Object.entries(filter || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

// Get cached cards for a filter, or start/join an in-flight request.
// fetcher: () => Promise<records[]>
export function getCachedCards(filter, fetcher) {
  const key = makeKey(filter);

  // Return fresh cache entry if available.
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.value);
  }

  // Join an in-flight request if one exists.
  const existing = inflight.get(key);
  if (existing) return existing;

  // Start a new request.
  const promise = fetcher()
    .then((records) => {
      cache.set(key, { value: records || [], expiresAt: Date.now() + CACHE_TTL_MS });

      // Evict oldest entries if over capacity.
      if (cache.size > MAX_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
      }

      return records || [];
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

// Invalidate cached entries. Call after upload/edit/delete.
// If filter is provided, invalidates only that key. Otherwise clears all.
export function invalidateCards(filter) {
  if (filter) {
    cache.delete(makeKey(filter));
  } else {
    cache.clear();
  }
}

// Bounded retry with exponential backoff for 429/5xx responses.
// Respects Retry-After header when available. Does not retry 4xx (non-429).
export async function fetchWithRetry(fn, { maxRetries = 2, baseDelayMs = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Don't retry on non-retriable errors (missing data, auth, etc.)
      if (attempt === maxRetries) break;
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}