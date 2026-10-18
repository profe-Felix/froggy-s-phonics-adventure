// Serialize listening prompts without dropping rapid taps or replaying a burst
// of identical taps. The owner stops current playback when it closes the queue.
export function createElkoninPromptQueue() {
  let active = true;
  let tail = Promise.resolve();
  const pending = new Map();
  return {
    has: key => pending.has(key),
    enqueue(key, play) {
      if (!active) return Promise.resolve(false);
      if (pending.has(key)) return pending.get(key);
      const result = tail.then(() => active ? play() : false);
      pending.set(key, result);
      const cleanup = () => { if (pending.get(key) === result) pending.delete(key); };
      result.then(cleanup, cleanup);
      tail = result.catch(() => false);
      return result;
    },
    stop() { active = false; },
  };
}
