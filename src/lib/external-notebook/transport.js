// Manual replacement port. No Base44 entity/Actor call belongs in a stroke loop.
export const NOTEBOOK_TRANSPORT_READY = false;

/**
 * Future createNotebookTransport({ session, signal }).
 * Student API requests use scoped access tokens; sockets use scoped tickets.
 * Recover/reconcile after reconnect, use operation IDs for idempotency, and
 * preserve original assignment/page IDs when acknowledging queued work.
 * Page assets are shared high-resolution images, not full-PDF downloads.
 * Implement authenticated image fetching/cache here (ordinary img tags cannot
 * send Authorization headers). Keep tokens out of normal URLs.
 * Teacher preview snapshots are batched; history is loaded only on demand.
 */
export async function createNotebookTransport() {
  throw new Error("NOTEBOOK_TRANSPORT_NOT_INSTALLED: no network connection was attempted.");
}