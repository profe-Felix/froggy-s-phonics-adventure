let current = null;
const listeners = new Set();
export const getNativeIdentity = () => current;
export function subscribeNativeIdentity(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function setNativeIdentity(value) { current = value; for (const listener of listeners) listener(); }
