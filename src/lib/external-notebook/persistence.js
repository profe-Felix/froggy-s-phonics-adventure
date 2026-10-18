// Verified together with the engine, transport, offline queue and recovery.
export const NOTEBOOK_PERSISTENCE_READY = true;

export async function openNotebookPersistence({ workKey } = {}) {
  if (typeof workKey !== 'string' || !workKey.trim()) {
    throw new Error('A stable notebook work key is required.');
  }
  if (typeof indexedDB === 'undefined') {
    throw new Error('Browser storage is unavailable. Drawing must stay disabled.');
  }

  const db = await new Promise((resolve, reject) => {
    let abandoned = false;
    const request = indexedDB.open('base44-native-notebook-outbox-v1', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('outbox', {
        keyPath: 'sequence', autoIncrement: true,
      });
      store.createIndex('workKey', 'workKey');
      store.createIndex('operationKey', ['workKey', 'operationId'], { unique: true });
    };
    request.onerror = () => reject(request.error || new Error('Cannot open notebook storage.'));
    request.onblocked = () => {
      abandoned = true;
      reject(new Error('Notebook storage is blocked by another tab. Keep existing work open.'));
    };
    request.onsuccess = () => {
      if (abandoned) { request.result.close(); return; }
      resolve(request.result);
    };
  });

  let closed = false;
  db.onversionchange = () => { closed = true; db.close(); };

  function transact(mode, action) {
    if (closed) return Promise.reject(new Error('Notebook storage is closed.'));
    return new Promise((resolve, reject) => {
      let result;
      let failure;
      const tx = db.transaction('outbox', mode);
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || tx.error || new Error('Notebook storage transaction failed.'));
      tx.onerror = () => { failure = failure || tx.error; };
      const fail = error => { failure = error; tx.abort(); };
      try {
        action(tx.objectStore('outbox'), value => { result = value; }, fail);
      } catch (error) {
        fail(error);
      }
    });
  }

  return {
    async enqueue(operation) {
      const serialized = JSON.stringify(operation);
      if (!serialized) throw new Error('A drawing operation is required.');
      const copy = JSON.parse(serialized);
      if (!copy || typeof copy.id !== 'string' || !copy.id.trim() ||
          !Number.isInteger(copy.page) || copy.page < 1 ||
          !['stroke', 'erase', 'pixelErase', 'clear', 'undo', 'redo'].includes(copy.kind)) {
        throw new Error('The drawing operation has an invalid ID, page, or kind.');
      }
      return transact('readwrite', (store, done, fail) => {
        const lookup = store.index('operationKey').get([workKey, copy.id]);
        lookup.onsuccess = () => {
          const existing = lookup.result;
          if (existing) {
            if (existing.serialized !== serialized) {
              fail(new Error('An operation ID was reused for different work. Nothing was overwritten.'));
              return;
            }
            done(existing.sequence);
            return;
          }
          const added = store.add({
            workKey, operationId: copy.id, operation: copy,
            serialized, queuedAt: Date.now(),
          });
          added.onsuccess = () => done(added.result);
        };
      });
    },

    listPending() {
      return transact('readonly', (store, done) => {
        const request = store.index('workKey').getAll(workKey);
        request.onsuccess = () => done(request.result);
      });
    },

    countPending() {
      return transact('readonly', (store, done) => {
        const request = store.index('workKey').count(workKey);
        request.onsuccess = () => done(request.result);
      });
    },

    acknowledge({ operationIds, revision } = {}) {
      if (!Array.isArray(operationIds) ||
          operationIds.some(id => typeof id !== 'string' || !id.trim()) ||
          !Number.isInteger(revision) || revision < 0) {
        return Promise.reject(new Error('A valid durable server acknowledgement is required.'));
      }
      // Call only with IDs explicitly acknowledged by the authenticated server.
      // Sending, disconnecting, pausing, or changing pages is NOT an ACK.
      return transact('readwrite', store => {
        for (const id of new Set(operationIds)) {
          const lookup = store.index('operationKey').getKey([workKey, id]);
          lookup.onsuccess = () => {
            if (lookup.result !== undefined) store.delete(lookup.result);
          };
        }
      });
    },

    async close({ keepOutbox = true } = {}) {
      if (keepOutbox !== true) throw new Error('Closing cannot delete unsent notebook work.');
      if (!closed) { closed = true; db.close(); }
    },
  };
}