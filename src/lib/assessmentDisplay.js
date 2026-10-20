import { notebookBase44 as realtimeClient } from '@/api/base44Client';

// The same proven same-origin actor transport as the native notebook, but a
// separate display-only room. The entity path remains the durable fallback.
export function openAssessmentDisplay(sessionId, role, onDisplay = () => {}) {
  let room, subscription, timer, closed = false, joined = false, pending = null;
  let lastMessage = Date.now();
  const send = data => {
    try { if (!closed && room) room.send(data); }
    catch { joined = false; }
  };
  const connect = () => {
    if (closed) return;
    subscription?.unsubscribe();
    room?.close();
    joined = false;
    try {
      room = realtimeClient.actors.AssessmentDisplay(`assessment:${sessionId}`).connect({ id: crypto.randomUUID() });
      subscription = room.subscribe(message => {
        if (closed) return;
        lastMessage = Date.now();
        if (message.type === 'ready') {
          joined = false;
          send({ type: 'join', sessionId, role });
        }
        if (message.type === 'joined') {
          joined = true;
          if (pending && pending.sync_seq > (Number(message.broadcast_state?.sync_seq) || 0)) {
            send({ type: 'display', broadcast_state: pending });
          }
        }
        if (message.type === 'ack' && pending?.sync_seq <= message.sync_seq) pending = null;
        if (role === 'student' && ['joined', 'display'].includes(message.type) && message.broadcast_state) {
          onDisplay(message.broadcast_state);
        }
      });
    } catch { joined = false; }
  };
  connect();
  timer = setInterval(() => {
    if (closed) return;
    if (!joined || Date.now() - lastMessage > 25000) { connect(); lastMessage = Date.now(); }
    else if (joined) {
      send({ type: 'ping' });
      if (role === 'teacher' && pending) send({ type: 'display', broadcast_state: pending });
    }
  }, 10000);
  const resume = () => {
    if (closed || document.visibilityState === 'hidden') return;
    if (joined) send({ type: 'sync' });
    else connect();
  };
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', resume);
  return {
    publish(state) {
      if (closed || role !== 'teacher') return;
      pending = state;
      if (joined) send({ type: 'display', broadcast_state: state });
    },
    close() {
      closed = true;
      clearInterval(timer);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
      subscription?.unsubscribe();
      room?.close();
    },
  };
}
