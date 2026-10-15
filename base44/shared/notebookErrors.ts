// Preserve retry information across the notebook's message boundary.
export function notebookError(error, details = {}) {
  const status = Number(error?.status || error?.response?.status) || (/throttl|rate.limit/i.test(error?.message || '') ? 429 : 0);
  const headers = error?.response?.headers || error?.headers;
  const raw = headers?.get?.('retry-after') ?? headers?.['retry-after'];
  const delay = raw == null ? 0 : Number.isFinite(Number(raw)) ? Number(raw) * 1000 : Math.max(0, Date.parse(raw) - Date.now()) || 0;
  return { type: 'error', message: error?.message || 'Notebook connection interrupted', status, retry_after_ms: Math.max(delay, status === 429 ? 30000 : 0), ...details };
}