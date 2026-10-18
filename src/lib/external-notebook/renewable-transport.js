// Native notebook transport. No Base44 entity calls or automatic retries here.
// Commit switches credentials only: it is NOT a save, ready, or navigation ACK.
// Invalidate the old channel before commit, then obtain a NEW ready/hydration.
export async function createNotebookRenewableTransport({
  session, signal, fetchImpl = globalThis.fetch,
  WebSocketImpl = globalThis.WebSocket, urlApi = URL,
} = {}) {
  const apiRoot = "/api/notebook";
  const copy = value => JSON.parse(JSON.stringify(value));
  const positive = value => Number.isSafeInteger(value) && value > 0;
  const text = value => typeof value === "string" && value.length > 0;
  const problem = (message, status = 409) => Object.assign(new Error(message), { status });

  if (typeof fetchImpl !== "function" || typeof WebSocketImpl !== "function" ||
      typeof urlApi.createObjectURL !== "function" || typeof urlApi.revokeObjectURL !== "function") {
    throw new Error("Notebook networking and page image support are required.");
  }

  function validate(value) {
    if (value?.contractVersion !== 1 || !["student", "teacher"].includes(value.role) ||
        !text(value.accessToken) || !positive(value.expiresAtMs) || value.expiresAtMs <= Date.now() ||
        !text(value.classId) || !text(value.workbookId) ||
        value.workbook?.id !== value.workbookId || !positive(value.workbook.pageCount) ||
        !["assessment", "lesson"].includes(value.kind) || !text(value.sourceId) ||
        typeof value.canWrite !== "boolean" ||
        (value.role === "student" && (!positive(value.studentNumber) || value.studentNumber > 100))) {
      throw problem("A complete unexpired notebook session is required.", 401);
    }

    const origin = new URL(value.backendOrigin);

    if (origin.protocol !== "https:" || origin.origin !== value.backendOrigin) {
      throw problem("The notebook backend must be an exact HTTPS origin.", 400);
    }

    const pages = value.allowedPages;

    if (pages !== null && (!Array.isArray(pages) || !pages.length || pages.length > 2000 ||
        new Set(pages).size !== pages.length ||
        pages.some(page => !positive(page) || page > value.workbook.pageCount))) {
      throw problem("The notebook page grant is invalid.", 400);
    }
  }

  validate(session);

  function lease(value) {
    return {
      session: copy(value),
      controller: new AbortController(),
      sockets: new Set(),
    };
  }

  let active = lease(session), closed = false, staged = null;
  const imageUrls = new Set();

  function stop(value) {
    value.controller.abort();

    for (const socket of value.sockets) socket.close();

    value.sockets.clear();

    // Existing image leases belong to the view, not this credential lifetime.
  }

  function ensure(value = active) {
    if (closed || signal?.aborted) {
      throw problem("The notebook connection is closed.", 408);
    }

    if (value !== active || value.controller.signal.aborted) {
      throw problem("The notebook connection changed; local work is retained.", 408);
    }

    if (Date.now() >= value.session.expiresAtMs) {
      throw problem("Notebook authorization expired; local work and page images are retained.", 401);
    }

    return value;
  }

  function address(path, value, image = false) {
    const origin = value.session.backendOrigin;
    const url = new URL(path, origin);

    const prefix = image
      ? `${apiRoot}/workbooks/${encodeURIComponent(value.session.workbookId)}/`
      : `${apiRoot}/`;

    if (url.origin !== origin || url.username || url.password || !url.pathname.startsWith(prefix)) {
      throw problem("Refusing a notebook request outside its authorized destination.", 400);
    }

    return url;
  }

  async function authorized(value, url, options) {
    ensure(value);

    const response = await fetchImpl(url.href, {
      ...options,
      credentials: "omit",
      redirect: "error",
      signal: value.controller.signal,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${value.session.accessToken}`,
      },
    });

    ensure(value);
    return response;
  }

  async function requestFor(value, path, body) {
    ensure(value);

    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
      throw problem("A relative notebook API path is required.", 400);
    }

    const response = await authorized(value, address(apiRoot + path, value), {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      ...(body === undefined ? {} : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });

    let data;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    ensure(value);

    if (!response.ok) {
      // Do not expose server response bodies or credentials in transport errors.
      throw problem("The notebook request was rejected; local work is retained.", response.status);
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw problem("Invalid notebook server response.", 502);
    }

    return data;
  }

  function close() {
    if (closed) return;

    closed = true;
    signal?.removeEventListener("abort", close);
    staged?.cancel();
    stop(active);

    for (const url of imageUrls) urlApi.revokeObjectURL(url);

    imageUrls.clear();
  }

  signal?.addEventListener("abort", close, { once: true });

  if (signal?.aborted) close();

  return {
    request(path, body) {
      return requestFor(active, path, body);
    },

    async openSocket({
      classId, studentNumber, clientId, onMessage, onClose, onError,
    } = {}) {
      const value = ensure();

      if (classId !== value.session.classId ||
          (value.session.role === "student" && studentNumber !== value.session.studentNumber)) {
        throw problem("This socket does not match the authorized class and student.", 403);
      }

      const grant = await requestFor(value, "/realtime-ticket", {
        classId,
        studentNumber,
        clientId,
        role: value.session.role,
      });

      ensure(value);

      if (grant.path !== `${apiRoot}/live` ||
          typeof grant.ticket !== "string" || !/^[a-f0-9]{64}$/.test(grant.ticket)) {
        throw problem("Invalid notebook socket ticket.", 502);
      }

      const url = address(grant.path, value);
      url.protocol = "wss:";
      url.searchParams.set("ticket", grant.ticket);

      const socket = new WebSocketImpl(url.href);
      value.sockets.add(socket);

      socket.onmessage = event => {
        if (closed || value !== active) return;

        try {
          ensure(value);

          const message = JSON.parse(event.data);

          if (!message || typeof message.type !== "string") {
            throw problem("Invalid socket message.", 502);
          }

          Promise.resolve(onMessage?.(message)).catch(reason => {
            if (!closed && value === active) onError?.(reason);
            socket.close();
          });
        } catch (reason) {
          onError?.(reason);
          socket.close();
        }
      };

      socket.onerror = () => {
        if (!closed && value === active) {
          onError?.(problem("The notebook live connection was interrupted.", 503));
        }

        socket.close();
      };

      socket.onclose = event => {
        value.sockets.delete(socket);

        // An obsolete connection must not report errors into its replacement.
        if (!closed && value === active) onClose?.(event);
      };

      return socket;
    },

    async loadImage(path) {
      const value = ensure();

      const response = await authorized(
        value,
        address(path, value, true),
        { cache: "default" }
      );

      if (!response.ok) {
        throw problem("The notebook page image could not load.", response.status);
      }

      const blob = await response.blob();

      ensure(value);

      if (!blob.type.startsWith("image/")) {
        throw problem("The workbook did not return an image.", 502);
      }

      const url = urlApi.createObjectURL(blob);
      imageUrls.add(url);

      return {
        url,
        release() {
          if (imageUrls.delete(url)) urlApi.revokeObjectURL(url);
        },
      };
    },

    prepareSession(next, { isCurrent = () => true } = {}) {
      if (closed || signal?.aborted) {
        throw problem("The notebook connection is closed.", 408);
      }

      if (staged) {
        throw problem("Another notebook connection is already prepared.");
      }

      if (typeof isCurrent !== "function") {
        throw problem("A current-handoff guard is required.");
      }

      const candidate = copy(next), previous = active;

      validate(candidate);

      for (const name of [
        "backendOrigin", "role", "classId", "workbookId",
        "studentNumber", "kind", "sourceId",
      ]) {
        if (candidate[name] !== previous.session[name]) {
          throw problem("Renewal cannot change the notebook identity or destination.");
        }
      }

      if (candidate.workbook.pageCount !== previous.session.workbook.pageCount ||
          candidate.accessToken === previous.session.accessToken ||
          candidate.expiresAtMs <= previous.session.expiresAtMs ||
          candidate.expiresAtMs <= Date.now() + 5000) {
        throw problem("Renewal needs a fresh session with a usable lifetime.");
      }

      let status = "prepared";

      const prepared = {
        commit() {
          if (status === "committed") return !closed;
          if (status !== "prepared") return false;

          if (closed || signal?.aborted || active !== previous || !isCurrent() ||
              candidate.expiresAtMs <= Date.now() + 5000) {
            prepared.cancel();
            return false;
          }

          active = lease(candidate);
          status = "committed";
          staged = null;

          stop(previous);
          return true;
        },

        cancel() {
          if (status !== "prepared") return;

          status = "cancelled";

          if (staged === prepared) staged = null;
        },
      };

      staged = prepared;
      return prepared;
    },

    close,
  };
}
