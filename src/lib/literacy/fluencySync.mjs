export function fluencyScope(step, stepIndex) {
  return JSON.stringify([Number(stepIndex), step?.config || {}]);
}

export function matchingFluency(state, step, stepIndex) {
  return state?.type === 'fluency' && state.scope === fluencyScope(step, stepIndex)
    && Array.isArray(state.preset?.content) && state.preset.content.length > 0
    && Number.isInteger(state.seed) && Number.isInteger(state.preset.rows)
    && state.preset.rows > 0 && Number.isInteger(state.preset.cols) && state.preset.cols > 0;
}

// Only one write is in flight. Intermediate rapid clicks can be coalesced, but
// an older response can never overwrite the final selection in the database.
export function latestFluencyWriter(write, onError = () => {}) {
  let pending = null, running = false;
  async function flush() {
    if (running) return;
    running = true;
    while (pending) {
      const value = pending;
      pending = null;
      try { await write(value); onError(null); }
      catch (error) { onError(error); }
    }
    running = false;
  }
  return {
    enqueue(value) { pending = value; void flush(); },
    isPending() { return running || pending !== null; },
  };
}
