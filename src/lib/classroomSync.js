// Shared by the public student pages. No credentials or roster are persisted.
export function errorStatus(error) {
  return Number(error?.response?.status ?? error?.status ?? error?.statusCode) || 0;
}

export function retryable(error) {
  const status = errorStatus(error);
  return !status || status === 408 || status === 429 || status >= 500;
}

export function retryDelay(error, attempt = 0) {
  const headers = error?.response?.headers || error?.headers;
  const raw = headers?.get?.('retry-after') ?? headers?.['retry-after'];
  const seconds = Number(raw);
  const fromHeader = raw == null ? 0 : Number.isFinite(seconds)
    ? seconds * 1000
    : Math.max(0, Date.parse(raw) - Date.now()) || 0;

  return Math.max(fromHeader, Math.min(30000, 1500 * 2 ** attempt)) +
    Math.floor(Math.random() * 800);
}

export const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let coolingUntil = 0;

// Retry idempotent reads/updates only. Do not wrap creates: an ambiguous
// timeout could otherwise create duplicate student or notebook records.
export async function requestWithRetry(operation, retries = 2) {
  for (let attempt = 0; ; attempt += 1) {
    if (coolingUntil > Date.now()) await wait(coolingUntil - Date.now());

    try {
      return await operation();
    } catch (error) {
      if (!retryable(error) || attempt >= retries) throw error;

      const delay = retryDelay(error, attempt);

      if (errorStatus(error) === 429) {
        coolingUntil = Math.max(coolingUntil, Date.now() + delay);
      }

      await wait(delay);
    }
  }
}

export function mergeAssessment(previous, incoming) {
  if (!incoming?.id) return previous;

  const next = { ...previous, ...incoming };

  if (incoming.broadcast_state !== undefined) {
    const oldSeq = Number(previous?.broadcast_state?.sync_seq) || 0;
    const newSeq = Number(incoming.broadcast_state?.sync_seq) || 0;

    if (previous && newSeq < oldSeq) {
      next.broadcast_state = previous.broadcast_state;
    }
  }

  return next;
}

export function assessmentItemStyle(type) {
  const letters = ['upper_names', 'lower_names', 'upper_sounds', 'lower_sounds'];

  return {
    fontFamily: letters.includes(type) ? "'Teachers', sans-serif" : "'Andika', sans-serif",
    fontWeight: 700,
    fontStyle: 'normal',
    fontSynthesis: 'none',
  };
}
