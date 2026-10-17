// Manual replacement port. Never claim "saved" using an in-memory-only queue.
export const NOTEBOOK_PERSISTENCE_READY = false;

/**
 * Future openNotebookPersistence({ workKey }).
 * IndexedDB outbox scoped to stable app/year/class/assignment/student identity.
 * Persist operations before network submission; remove only after durable ACK.
 * Preserve original IDs/pages through reload, orientation and context changes.
 * Keep handwriting history (strokes, erasures, clears, undo/redo) separate from
 * optional media. Never drop outstanding work on component unmount.
 */
export async function openNotebookPersistence() {
  throw new Error("NOTEBOOK_PERSISTENCE_NOT_INSTALLED: no drawing should be enabled.");
}