import { Actor } from 'base44:runtime/actors';
import { notebookSessionHeader, readNotebookSessionHeader, NOTEBOOK_SESSION_FIELDS } from '../../shared/notebookSession.ts';

export default class NotebookRegistry extends Actor {
  chain = Promise.resolve();
  async handleConnect(conn) { conn.send({type:'registry_ready'}); }
  async handleClose() {}
  async handleMessage(conn, msg) {
    this.chain = this.chain.catch(() => {}).then(async () => {
      let stage = 'selection';
      try {
        if (!msg || msg.type !== 'open' || typeof msg.assignment_id !== 'string' || typeof msg.class_name !== 'string' || !Number.isInteger(msg.student_number) || msg.student_number < 1 || msg.student_number > 30 || !/^\d{2}-\d{2}$/.test(msg.school_year || '')) throw new Error('Invalid notebook selection');
        if (this.instanceId !== `notebook-${msg.assignment_id}-${msg.student_number}-${msg.school_year}`) throw new Error('Notebook selection does not match this room');
        const context = {assignment_id:msg.assignment_id,class_name:msg.class_name,student_number:msg.student_number,school_year:msg.school_year};
        const saved = await this.storage.get('document');
        if (saved && JSON.stringify(saved.context) !== JSON.stringify(context)) throw new Error('Notebook selection does not match');
        stage = 'assignment';
        const assignment = await this.client.asServiceRole.entities.DigitalNotebookAssignment.get(msg.assignment_id);
        if (!assignment || assignment.class_name !== msg.class_name) throw new Error('Assignment not available in this class');
        if (saved) {
          stage = 'saved_session';
          const session = await readNotebookSessionHeader(this.client.asServiceRole.entities, saved.session_id);
          if (session) { conn.send({type:'document',session,room_id:saved.room_id}); return; }
        }
        stage = 'session_lookup';
        const result = await this.client.asServiceRole.entities.NotebookSession.filter(context,'created_date',1,0,NOTEBOOK_SESSION_FIELDS);
        const records = Array.isArray(result) ? result : result.items;
        if (!Array.isArray(records)) throw new Error('The notebook lookup returned an unexpected response');
        let session = notebookSessionHeader(records[0]);
        if (!session && typeof msg.session_id === 'string') {
          const candidate = await readNotebookSessionHeader(this.client.asServiceRole.entities, msg.session_id);
          if (candidate && Object.entries(context).every(([key,value]) => candidate[key] === value)) session = candidate;
        }
        if (!session) session = await this.client.asServiceRole.entities.NotebookSession.create({...context,current_page:1,strokes_by_page:{}});
        const room_id = session.collaboration_room_id || crypto.randomUUID();
        await this.client.asServiceRole.entities.NotebookSession.update(session.id,{collaboration_room_id:room_id,collaboration_version:1});
        await this.storage.put('document',{context,room_id,session_id:session.id});
        conn.send({type:'document',session:notebookSessionHeader({...session,collaboration_room_id:room_id}),room_id});
      } catch (error) { conn.send({type:'error',message:error.message,stage}); }
    });
    await this.chain;
  }
}