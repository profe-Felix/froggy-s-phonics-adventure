const database = () => new Promise((resolve, reject) => {
  const request = indexedDB.open("native-notebook-recording-drafts", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "key" });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(Error("Recording recovery storage is unavailable. Keep this page open."));
});
export async function draftStorage(mode, key, value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", mode === "get" ? "readonly" : "readwrite");
      const store = tx.objectStore("drafts");
      const req = mode === "get" ? store.get(key) : mode === "delete" ? store.delete(key) : store.put({ ...value, key });
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(Error("Recording recovery storage could not be updated. Keep this page open."));
      tx.onabort = tx.onerror;
    });
  } finally { db.close(); }
}
