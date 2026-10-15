import { base44 } from '@/api/base44Client';
import { projectPage, recoverLegacy } from '@/components/notebook/notebookOperations';
const clients=new Map();
const opPrefix='notebook-operation-';

class SharedNotebookClient {
  constructor(context,teacher) {
    this.context=context; this.teacher=teacher; this.listeners=new Set(); this.serverPages=new Map(); this.pending=new Map(); this.waiters=new Map(); this.writer=0; this.connected=false;
    this.state={session:null,pages:{},status:'Connecting to shared notebook…',error:'',ready:false,writer:0};
    let id=sessionStorage.getItem('notebook-connection-id');
    if(!id){id=crypto.randomUUID();sessionStorage.setItem('notebook-connection-id',id);} this.clientId=`${id}-${teacher?'teacher':'student'}`;
    this.recoveryConnections=new Map();
    this.lastOpen=0; this.lastJoin=0;
    this.openPayload={type:'open',...context};
    this.connectRegistry();
    this.scheduleRetry();
    this.online=()=>this.retry(); window.addEventListener('online',this.online);
  }
  connectRegistry() {
    const id=sessionStorage.getItem('notebook-connection-id')||crypto.randomUUID();
    this.registry=base44.actors.NotebookRegistry(`notebook-${this.context.assignment_id}-${this.context.student_number}-${this.context.school_year}`).connect({id});
    this.registryReady=false;
    this.registrySub=this.registry.subscribe(msg=>{
      if(msg.type==='registry_ready'){this.registryReady=true;this.lastOpen=Date.now();this.registry.send(this.openPayload);}
      if(msg.type==='document'&&!this.room) this.open(msg);
      if(msg.type==='error') this.fail(msg.message);
    });
  }
  scheduleRetry() {
    if(this.timer){clearTimeout(this.timer);this.timer=null;}
    // The connection already handles transport backoff. Retry a small handshake,
    // not a full-workbook read, and never close a connection that is still opening.
    this.timer=setTimeout(()=>{this.timer=null;this.retry();},10000);
  }
  fail(message) {this.state={...this.state,error:message};this.notify();}
  open(msg) {
    this.session=msg.session; this.roomId=msg.room_id;
    // Each change has its own recovery key: two tabs cannot overwrite a queue.
    const prefix=`${opPrefix}${this.roomId}-`;
    for(let i=0;i<localStorage.length;i++) {
      const key=localStorage.key(i);
      if(key?.startsWith(prefix)) {
        const operation=JSON.parse(localStorage.getItem(key));
        if(operation?.op_id && operation.teacher === this.teacher) this.pending.set(operation.op_id,operation);
      }
    }
    this.room=base44.actors.NotebookRoom(this.roomId).connect({id:this.clientId});
    this.roomReady=false;
    this.sub=this.room.subscribe(message=>this.receive(message));
    this.registrySub.unsubscribe(); this.registry.close();
  }
  join() {
    if(!this.roomReady||Date.now()-this.lastJoin<10000)return;
    this.lastJoin=Date.now();
    this.room.send({type:'join',room_id:this.roomId,session_id:this.session.id,page:this.page||1,teacher:this.teacher});
  }
  receive(msg) {
    if(msg.type==='ready') {this.connected=false;this.roomReady=true;this.lastJoin=0;this.join();}
    if(msg.type==='joined') {this.writer=msg.seat;this.connected=true;this.state={...this.state,session:msg.session,ready:true,writer:this.writer,error:''};this.retry();}
    if(msg.type==='page') {
      const old=this.serverPages.get(msg.page);
      if(old&&old.sharedRevision>msg.data.sharedRevision) return;
      this.serverPages.set(msg.page,msg.data); this.recover(msg.page,msg.data);
    }
    if(msg.type==='ack') {
      this.pending.delete(msg.op_id);localStorage.removeItem(`${opPrefix}${this.roomId}-${msg.op_id}`);
    }
    if(msg.type==='flushed') {this.waiters.get(msg.request_id)?.(true);this.waiters.delete(msg.request_id);}
    if(msg.type==='error') {this.fail(msg.message);if(msg.request_id){this.waiters.get(msg.request_id)?.(false);this.waiters.delete(msg.request_id);}}
    this.notify();
  }
  recover(page,data) {
    const key=`notebook-draft-${this.session.id}-${page}`;
    const saved=localStorage.getItem(key); if(!saved) return;
    if(this.recovered?.has(key)) return;
    const changes=recoverLegacy(data,saved);
    this.recovered ||= new Set();
    // Remove the old snapshot ONLY once every missing change has a durable local queue entry.
    const durable = changes.map(change => this.enqueue(page,change)).every(Boolean);
    if(durable){this.recovered.add(key);localStorage.removeItem(key);}
  }
  notify() {
    const pages={}; const strokes={...(this.state.session?.strokes_by_page||{})};
    for(const [page,data] of this.serverPages) {
      pages[page]=projectPage(data,[...this.pending.values()].filter(op=>op.page===page),this.writer,this.teacher);
      strokes[page]=JSON.stringify(pages[page]);
    }
    const status=this.pending.size?'Saving changes…':this.connected?'Saved to shared notebook':'Reconnecting — keeping your changes';
    this.state={...this.state,pages,session:this.state.session?{...this.state.session,strokes_by_page:strokes}:null,status};
    for(const listener of this.listeners) listener(this.state);
  }
  enqueue(page,change) {
    if(!this.roomId) throw new Error('Wait for your notebook to connect before drawing');
    const operation={type:'operation',op_id:crypto.randomUUID(),page,change,client_id:this.clientId,teacher:this.teacher};
    let durable=true;
    try { localStorage.setItem(`${opPrefix}${this.roomId}-${operation.op_id}`,JSON.stringify(operation)); }
    catch {durable=false;this.fail('Device recovery storage is unavailable. Keep this notebook open until saving is confirmed.');}
    this.pending.set(operation.op_id,operation); this.notify();
    if(this.connected) this.room.send(operation);
    return durable;
  }
  pageChanged(page) {this.page=page;if(this.connected)this.room.send({type:'page',page});}
  retry() {
    if(!this.room) {
      if(this.registryReady&&Date.now()-this.lastOpen>=10000) {
        this.lastOpen=Date.now();this.registry.send(this.openPayload);
      }
      this.scheduleRetry();
      return;
    }
    if(!this.connected){this.join();this.scheduleRetry();return;}
    for(const op of this.pending.values()) {
      if(op.client_id===this.clientId) {this.room.send(op);continue;}
      let recovery=this.recoveryConnections.get(op.client_id);
      if(!recovery) {
        recovery={connection:base44.actors.NotebookRoom(this.roomId).connect({id:op.client_id}),ready:false};
        this.recoveryConnections.set(op.client_id,recovery);
        const join=()=>recovery.connection.send({type:'join',room_id:this.roomId,session_id:this.session.id,page:op.page,teacher:this.teacher});
        recovery.subscription=recovery.connection.subscribe(msg=>{
          if(msg.type==='ready')join();
          else if(msg.type==='joined'){recovery.ready=true;this.retry();}
          else this.receive(msg);
        });
      }
      if(recovery.ready)recovery.connection.send(op);
    }
    this.scheduleRetry();
  }
  async flush() {
    const deadline=Date.now()+15000;
    this.retry();
    // Wait for acknowledgements; the scheduled retry handles lost messages.
    // Resending every 100ms queues duplicate work while the server is saving.
    while((this.pending.size||!this.connected) && Date.now()<deadline) {await new Promise(resolve=>setTimeout(resolve,100));}
    if(this.pending.size||!this.connected) {this.fail('Changes are kept on this device but not confirmed saved yet. Keep the notebook open and retry.');return false;}
    const request_id=crypto.randomUUID();
    return await new Promise(resolve=>{
      const timer=setTimeout(()=>{this.waiters.delete(request_id);resolve(false);},12000);
      this.waiters.set(request_id,ok=>{clearTimeout(timer);resolve(ok);});this.room.send({type:'flush',request_id});
    });
  }
  release(listener) {
    this.listeners.delete(listener);
    // Keep pending changes alive across lesson unmounts; do not tie saving to the canvas lifetime.
    setTimeout(()=>{
      if(this.listeners.size||this.pending.size||this.waiters.size)return;
      for(const recovery of this.recoveryConnections.values()){recovery.subscription?.unsubscribe();recovery.connection.close();}
      clearTimeout(this.timer);window.removeEventListener('online',this.online);this.sub?.unsubscribe();this.room?.close();this.registrySub?.unsubscribe();this.registry?.close();clients.delete(this.key);
    },30000);
  }
}
export function getSharedNotebook(context,teacher=false) {
  const key=JSON.stringify({...context,teacher});
  if(!clients.has(key)){const client=new SharedNotebookClient(context,teacher);client.key=key;clients.set(key,client);}return clients.get(key);
}