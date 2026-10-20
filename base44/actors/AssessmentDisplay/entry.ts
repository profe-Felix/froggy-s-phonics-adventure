import { Actor } from "base44:runtime/actors";
import { assessmentDisplayKey, checkedDisplay } from "./model.js";

// Display only. Scores, recordings and durable recovery remain in the existing
// assessment entity. No notebook state or student work is read or changed.
export default class AssessmentDisplay extends Actor {
  roles = new Map();
  latest = null;
  initialized = false;
  chain = Promise.resolve();
  async handleStart() {
    this.roles = new Map(await this.storage.get("roles") || []);
    this.latest = await this.storage.get("display") || null;
  }
  async handleConnect(conn) { conn.send({ type: "ready" }); }
  async handleClose(conn) {
    this.roles.delete(conn.id);
    await this.storage.put("roles", [...this.roles]);
  }
  async handleTick() {}
  async handleMessage(conn, message) {
    this.chain = this.chain.catch(() => {}).then(async () => {
      try {
        if (message?.type === "join") {
          if (assessmentDisplayKey(message.sessionId) !== this.instanceId
            || !["teacher", "student"].includes(message.role)) throw new Error("Assessment mismatch.");
          if (!this.initialized) {
            const session = await this.client.asServiceRole.entities.SmallGroupAssessment.get(message.sessionId);
            if (!session) throw new Error("Assessment unavailable.");
            const saved = session.broadcast_state;
            if (Number(saved?.sync_seq) > (Number(this.latest?.sync_seq) || 0)) {
              this.latest = checkedDisplay(saved);
            }
            if (session.status === "completed") this.latest = {
              show_item: false, done: true, sync_seq: Number(this.latest?.sync_seq) || 0,
            };
            this.initialized = true;
          }
          // Preserve the app's existing open teacher-entry policy. Student
          // connections cannot send display commands through this channel.
          this.roles.set(conn.id, message.role);
          await this.storage.put("roles", [...this.roles]);
          conn.send({ type: "joined", broadcast_state: this.latest });
          return;
        }
        if (!this.roles.has(conn.id)) throw new Error("Join the assessment first.");
        if (message.type === "ping") { conn.send({ type: "pong" }); return; }
        if (message.type === "sync") {
          conn.send({ type: "display", broadcast_state: this.latest }); return;
        }
        if (message.type !== "display" || this.roles.get(conn.id) !== "teacher") throw new Error("Read-only display.");
        const next = checkedDisplay(message.broadcast_state);
        if (next.sync_seq > (Number(this.latest?.sync_seq) || 0)) {
          this.latest = next;
          this.broadcast({ type: "display", broadcast_state: next });
          // Notify immediately; durable recovery already exists in the entity.
          // This tiny snapshot also supports actor hibernation without scores.
          await this.storage.put("display", next);
        }
        conn.send({ type: "ack", sync_seq: next.sync_seq });
      } catch {
        conn.send({ type: "error", message: "Live display unavailable; saved assessment updates remain active." });
      }
    });
    return this.chain;
  }
}
