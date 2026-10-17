// One cache per authorized transport. Never share it across students/logins.
// Only explicitly requested pages load. There is no whole-workbook download.
// Every acquired image must be released when its view stops using it.

export function createNotebookPageImages({ transport, maxEntries = 4 } = {}) {
  if (!transport || typeof transport.loadImage !== "function") {
    throw new Error("An authorized notebook image transport is required.");
  }
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 16) {
    throw new Error("The page image cache must hold between 1 and 16 images.");
  }

  const entries = new Map();
  let clock = 0;
  let closed = false;

  function dispose(entry) {
    if (!entry.resource) return;
    const resource = entry.resource;
    entry.resource = null;
    resource.release();
  }

  function makeRoom() {
    if (entries.size < maxEntries) return;
    let oldest = null;
    for (const entry of entries.values()) {
      if (entry.refs === 0 && entry.resource &&
          (!oldest || entry.used < oldest.used)) {
        oldest = entry;
      }
    }
    if (!oldest) {
      const error = new Error(
        "Page images are still in use or loading. Release an unused image before opening another."
      );
      error.code = "NOTEBOOK_IMAGE_CACHE_BUSY";
      throw error;
    }
    entries.delete(oldest.key);
    dispose(oldest);
  }

  async function acquire(workbook, page, { thumbnail = false } = {}) {
    if (closed) throw new Error("The notebook image cache is closed.");
    if (!workbook || typeof workbook.id !== "string" || !workbook.id ||
        !Number.isInteger(workbook.pageCount) ||
        !Number.isInteger(workbook.processedPages) ||
        !Number.isInteger(page) || page < 1 || page > workbook.pageCount ||
        page > workbook.processedPages || workbook.status !== "ready" ||
        typeof thumbnail !== "boolean") {
      throw new Error("A prepared workbook page is required.");
    }

    const rendition = thumbnail ? "thumbnails" : "pages";
    const template = thumbnail
      ? workbook.thumbnailUrlTemplate : workbook.pageUrlTemplate;
    const expected = "/api/notebook/workbooks/" +
      encodeURIComponent(workbook.id) + "/" + rendition + "/{page}.jpg";
    if (template !== expected) {
      throw new Error("The workbook image URL does not match the notebook API.");
    }
    const path = template.replace("{page}", String(page));
    const key = JSON.stringify([workbook.id, rendition, page, path]);
    let entry = entries.get(key);

    if (!entry) {
      makeRoom();
      entry = {
        key, refs: 0, used: ++clock, resource: null, loading: null,
      };
      entries.set(key, entry);
      entry.loading = Promise.resolve().then(() => {
        if (closed) throw new Error("The notebook image cache is closed.");
        return transport.loadImage(path);
      }).then(resource => {
        if (!resource || typeof resource.url !== "string" || !resource.url ||
            typeof resource.release !== "function") {
          throw new Error("The notebook image transport returned an invalid image.");
        }
        if (closed) {
          resource.release();
          throw new Error("The notebook image cache is closed.");
        }
        entry.resource = resource;
        return resource;
      }).catch(error => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      });
    }

    entry.refs++;
    entry.used = ++clock;
    let resource;
    try {
      resource = await entry.loading;
      if (closed) throw new Error("The notebook image cache is closed.");
    } catch (error) {
      entry.refs--;
      throw error;
    }

    let released = false;
    return {
      url: resource.url,
      release() {
        if (released) return;
        released = true;
        entry.refs--;
        entry.used = ++clock;
      },
    };
  }

  function close() {
    if (closed) return;
    closed = true;
    for (const entry of entries.values()) dispose(entry);
    entries.clear();
  }

  return { acquire, close };
}
