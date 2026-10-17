// Keep disabled until native backend authorization and CORS are installed.
export const NOTEBOOK_TRANSPORT_READY = false;

export async function createNotebookTransport({ session, signal } = {}) {
  if (!session || typeof session.accessToken !== 'string' || !session.accessToken ||
      !Number.isFinite(session.expiresAtMs) || session.expiresAtMs <= Date.now() ||
      !['student', 'teacher'].includes(session.role)) {
    throw new Error('A valid, unexpired notebook session is required.');
  }
  const origin = new URL(session.backendOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== session.backendOrigin) {
    throw new Error('The notebook backend must be an exact HTTPS origin.');
  }

  const controller = new AbortController();
  const sockets = new Set();
  const imageUrls = new Set();
  let closed = false;
  const apiRoot = '/api/notebook';

  function close() {
    if (closed) return;
    closed = true;
    controller.abort();
    signal?.removeEventListener('abort', close);
    for (const socket of sockets) socket.close();
    sockets.clear();
    for (const url of imageUrls) URL.revokeObjectURL(url);
    imageUrls.clear();
  }
  signal?.addEventListener('abort', close, { once: true });
  if (signal?.aborted) close();

  function ensureSession() {
    if (closed) throw new Error('The notebook connection is closed.');
    if (Date.now() >= session.expiresAtMs) {
      close();
      throw new Error('The notebook session expired. Reconnect before sending more work.');
    }
  }

  async function fetchAuthorized(url, options = {}) {
    ensureSession();
    if (url.origin !== origin.origin || !url.pathname.startsWith(apiRoot + '/')) {
      throw new Error('Refusing to send notebook credentials outside the notebook API.');
    }
    return fetch(url.href, {
      ...options,
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        ...options.headers,
        Authorization: 'Bearer ' + session.accessToken,
      },
    });
  }

  async function request(path, body) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
      throw new Error('A relative notebook API path is required.');
    }
    const url = new URL(apiRoot + path, origin.origin);
    const response = await fetchAuthorized(url, {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(
        response.status === 401
          ? 'Notebook authorization expired or was rejected. Your local work is retained.'
          : typeof data?.error === 'string' ? data.error : 'Notebook request failed.'
      );
      error.status = response.status;
      throw error;
    }
    if (!data || typeof data !== 'object') throw new Error('Invalid notebook server response.');
    return data;
  }

  async function openSocket({ classId, studentNumber, clientId, onMessage, onClose, onError } = {}) {
    const grant = await request('/realtime-ticket', {
      classId, studentNumber, clientId, role: session.role,
    });
    ensureSession();
    if (grant.path !== '/api/notebook/live' ||
        typeof grant.ticket !== 'string' || !/^[a-f0-9]{64}$/.test(grant.ticket)) {
      throw new Error('Invalid notebook socket ticket.');
    }
    const url = new URL(grant.path, origin.origin);
    url.protocol = 'wss:';
    // Only the short-lived, single-use ticket goes in the socket URL.
    url.searchParams.set('ticket', grant.ticket);
    const socket = new WebSocket(url.href);
    sockets.add(socket);
    socket.onmessage = event => {
      try {
        ensureSession();
        const message = JSON.parse(event.data);
        if (!message || typeof message.type !== 'string') throw new Error('Invalid socket message.');
        Promise.resolve(onMessage?.(message)).catch(error => {
          onError?.(error);
          socket.close();
        });
      } catch (error) {
        onError?.(error);
        socket.close();
      }
    };
    socket.onerror = () => {
      onError?.(new Error('The notebook live connection was interrupted.'));
      socket.close();
    };
    socket.onclose = event => {
      sockets.delete(socket);
      onClose?.(event);
    };
    // The engine owns reconnection, rehydration, batching, and ACK handling.
    return socket;
  }

  async function loadImage(path) {
    const url = new URL(path, origin.origin);
    if (url.origin !== origin.origin ||
        !url.pathname.startsWith(apiRoot + '/workbooks/')) {
      throw new Error('The page image must come from the authorized workbook API.');
    }
    const response = await fetchAuthorized(url);
    if (!response.ok) throw new Error('The notebook page image could not load.');
    const blob = await response.blob();
    ensureSession();
    if (!blob.type.startsWith('image/')) throw new Error('The workbook did not return an image.');
    const imageUrl = URL.createObjectURL(blob);
    imageUrls.add(imageUrl);
    return {
      url: imageUrl,
      release() {
        if (imageUrls.delete(imageUrl)) URL.revokeObjectURL(imageUrl);
      },
    };
  }

  return { request, openSocket, loadImage, close };
}