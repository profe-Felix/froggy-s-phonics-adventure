// Manual replacement port. This is intentionally NOT a pretend drawing engine.
export const NOTEBOOK_ENGINE_READY = false;

/**
 * Future mountNotebook({ element, role, context, session, transport, persistence }).
 * Must return { flush(): Promise<boolean>, updateContext(next): Promise<void>,
 * close({ keepOutbox: true }): Promise<void> }.
 * Rendering, normalized ink, erasers, undo/redo and read-only replay live here.
 * close() must never clear unacknowledged local work.
 * Both student and teacher components use this one implementation.
 */
export async function mountNotebook() {
  throw new Error("NOTEBOOK_ENGINE_NOT_INSTALLED: keep the external notebook disabled.");
}