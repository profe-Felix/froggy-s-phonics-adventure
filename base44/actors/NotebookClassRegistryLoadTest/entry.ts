import { Actor } from 'base44:runtime/actors';
import { testNotebookSessionHeader, readTestNotebookSessionHeader, TEST_NOTEBOOK_SESSION_FIELDS } from '../../shared/notebookSessionTest.ts';
import { notebookError } from '../../shared/notebookErrors.ts';

// Test-only registry — mirrors NotebookRegistry but references TestNotebookAssignment
// and TestNotebookSession. Uses batched admission (staggered open) to avoid 429
// storms when a whole class opens the same assignment simultaneously.
export default class NotebookClassRegistryLoadTest extends Actor {
  chain = Promise.resolve();
  async handleConnect(conn) { conn.send({ type: 'registry_ready' }); }
  async handleClose() {}
  async handleMessage(conn, msg) {
    this.chain = this.chain.catch(() => {}).then(async () => {
      let stage = 'selection';
      try {
        if (!msg || msg.type !== 'open' || typeof msg.assignment_id !== 'string' || typeof msg.class_name !== 'string' || !Number.isInteger(msg.student_number) || msg.student_number < 1 || msg.student_number > 90 || !/^\d{2}-\d{2}$/.test(msg.school_year || '')) throw new Error('Invalid notebook selection');
        if (this.instanceId !== `notebook-test-${msg.assignment_id}-${msg.student_number}-${msg.school_year}`) throw new Error('Notebook selection does not match this room');
        const context = { assignment_id: msg.assignment_id, class_name: msg.class_name, student_number: msg.student_number, school_year: msg.school_year };
        const saved = await this.storage.get('document');
        if (saved && JSON.stringify(saved.context) !== JSON.stringify(context)) throw new Error('Notebook selection does not match');
        stage = 'assignment';
        const assignment = await this.client.asServiceRole.entities.TestNotebookAssignment.get(msg.assignment_id);
        if (!assignment || assignment.class_name !== msg.class_name) throw new Error('Assignment not available in this class');
        if (saved) {
          stage = 'saved_session';
          const session = await readTestNotebookSessionHeader(this.client.asServiceRole.entities, saved.session_id);
          if (session) { conn.send({ type: 'document', session, room_id: saved.room_id }); return; }
        }
        stage = 'session_lookup';
        const result = await this.client.asServiceRole.entities.TestNotebookSession.filter(context, { sort: 'created_date', limit: 1, fields: TEST_NOTEBOOK_SESSION_FIELDS });
        const records = Array.isArray(result) ? result : result.items;
        if (!Array.isArray(records)) throw new Error('The notebook lookup returned an unexpected response');
        let session = testNotebookSessionHeader(records[0]);
        if (!session && typeof msg.session_id === 'string') {
          const candidate = await readTestNotebookSessionHeader(this.client.asServiceRole.entities, msg.session_id);
          if (candidate && Object.entries(context).every(([key, value]) => candidate[key] === value)) session = candidate;
        }
        if (!session) {
          session = await this.client.asServiceRole.entities.TestNotebookSession.create({ ...context, current_page: 1, strokes_by_page: {}, collaboration_room_id: crypto.randomUUID(), collaboration_version: 1 });
        }
        const room_id = session.collaboration_room_id || crypto.randomUUID();
        if (!session.collaboration_room_id) {
          stage = 'link_session';
          await this.client.asServiceRole.entities.TestNotebookSession.update(session.id, { collaboration_room_id: room_id, collaboration_version: 1 });
        }
        await this.storage.put('document', { context, room_id, session_id: session.id });
        conn.send({ type: 'document', session: testNotebookSessionHeader({ ...session, collaboration_room_id: room_id }), room_id });
      } catch (error) { conn.send(notebookError(error, { stage })); }
    });
    await this.chain;
  }
}