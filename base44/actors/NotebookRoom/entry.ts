import { Actor } from 'base44:runtime/actors';
import { legacyPage, snapshot, applyOperation } from '../../shared/notebookModel.ts';

export default class NotebookRoom extends Actor {
  users = new Map(); pages = new Map(); dirty = new Set(); chain = Promise.resolve(); session = null;
  async handleStart() {
    const state = await this.storage.get('session');
    this.session = state || null;
    this.users = new Map(await this.storage.get('seats') || []);
    this.dirty = new Set(await this.storage.get('dirty') || []);
    this.pages = new Map();
    if (this.dirty.size) await this.schedule('mirror',Date.now()+1500);
  }
  async writeBlob(key, value) {
    const json=JSON.stringify(value);
    if(json.length<60000){await this.storage.put(key,value);return;}
    const chunks=Math.ceil(json.length/60000);
    for(let i=0;i<chunks;i++)await this.storage.put(`${key}:chunk:${i}`,json.slice(i*60000,(i+1)*60000));
    await this.storage.put(key,{chunkCount:chunks});
  }
  async readBlob(key) {
    const value=await this.storage.get(key);
    if(!value?.chunkCount)return value;
    const chunks=await Promise.all(Array.from({length:value.chunkCount},(_,i)=>this.storage.get(`${key}:chunk:${i}`)));
    return JSON.parse(chunks.join(''));
  }
  async handleConnect(conn) { conn.send({type:'ready'}); }
  async handleClose() {}
  async handleMessage(conn, msg) {
    this.chain = this.chain.catch(() => {}).then(async () => {
      try {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'join') {
          if (typeof msg.session_id !== 'string' || typeof msg.room_id !== 'string' || msg.room_id !== this.instanceId) throw new Error('Invalid notebook');
          const record = await this.client.asServiceRole.entities.NotebookSession.get(msg.session_id);
          if (!record || record.collaboration_room_id !== msg.room_id || (this.session && this.session.id !== record.id)) throw new Error('Notebook selection does not match');
          this.session = this.session ? {...record,strokes_by_page:this.session.strokes_by_page} : record;
          await this.storage.put('session',this.session);
          let user = this.users.get(conn.id);
          if (!user) user = {seat:Math.max(0,...[...this.users.values()].map(u=>u.seat))+1,role:'student'};
          user.role = 'student';
          if (msg.teacher === true) {
            if (conn.identity.type !== 'authenticated') throw new Error('Sign in to leave teacher feedback');
            const me = await this.client.asServiceRole.entities.User.get(conn.identity.userId);
            if (!me || !['admin','user'].includes(me.role)) throw new Error('Teacher access required');
            user.role = 'teacher';
          }
          this.users.set(conn.id,user); await this.storage.put('seats',[...this.users]);
          conn.send({type:'joined',seat:user.seat,session:this.session});
          await this.sendPage(conn,Number(msg.page)||1);
        } else {
          const user = this.users.get(conn.id);
          if (!user || !this.session) throw new Error('Notebook is still connecting');
          if (msg.type === 'page') await this.sendPage(conn,Number(msg.page));
          else if (msg.type === 'operation') await this.change(conn,user,msg);
          else if (msg.type === 'flush') {
            await this.mirror(); conn.send({type:'flushed',request_id:msg.request_id});
          }
        }
      } catch (error) { conn.send({type:'error',message:error.message,op_id:msg?.op_id,request_id:msg?.request_id}); }
    });
    await this.chain;
  }
  async loadPage(number) {
    const max = 10000;
    if (!Number.isInteger(number) || number < 1 || number > max) throw new Error('Invalid page');
    if (this.pages.has(number)) return this.pages.get(number);
    const meta = await this.storage.get(`page:${number}`);
    let page;
    if (!meta) {
      page = legacyPage(this.session.strokes_by_page?.[String(number)],number,this.session.id);
      const duplicates = await this.client.asServiceRole.entities.NotebookSession.filter({assignment_id:this.session.assignment_id,class_name:this.session.class_name,student_number:this.session.student_number,school_year:this.session.school_year},'created_date',50);
      const signatures = new Set(snapshot(page).strokes.map(s=>JSON.stringify([s.pts,s.color,s.tool,s.size])));
      for (const other of (Array.isArray(duplicates) ? duplicates : duplicates.items)) {
        if (other.id === this.session.id || !other.strokes_by_page?.[number]) continue;
        const extra = snapshot(legacyPage(other.strokes_by_page[number],number,other.id));
        for (const stroke of extra.strokes) {
          const signature = JSON.stringify([stroke.pts,stroke.color,stroke.tool,stroke.size]);
          if (signatures.has(signature)) continue;
          signatures.add(signature);
          page.events.push({stroke:{...stroke,id:`recovered-${other.id}-${page.events.length}`},writer:0,role:'student',active:true,seq:page.events.length});
        }
      }
      // Legacy work remains untouched. Persist a durable baseline once.
      for (let i=0;i<page.events.length;i++) await this.writeBlob(`base:${number}:${i}`,page.events[i]);
      await this.storage.put(`page:${number}`,{baseCount:page.events.length,count:0});
      page.applied = new Set(); page.count=0; page.baseCount=page.events.length;
    } else {
      page={events:[],notes:[],revision:0,applied:new Set(),count:meta.count,baseCount:meta.baseCount};
      for(let start=0;start<meta.baseCount;start+=50) page.events.push(...await Promise.all(Array.from({length:Math.min(50,meta.baseCount-start)},(_,i)=>this.readBlob(`base:${number}:${start+i}`))));
      for(let bucket=0;bucket<Math.ceil(meta.count/100);bucket++) {
        const ids=(await this.storage.get(`index:${number}:${bucket}`)||[]).slice(0,Math.min(100,meta.count-bucket*100));
        const operations=await Promise.all(ids.map(id=>this.readBlob(`op:${id}`)));
        for(const item of operations) {
          const next=applyOperation(page,item.change,item.writer,item.role);
          page={...page,...next}; page.applied.add(item.id);
        }
      }
    }
    this.pages.set(number,page); return page;
  }
  async sendPage(conn, number) { const page=await this.loadPage(number); conn.send({type:'page',page:number,data:snapshot(page)}); }
  async change(conn,user,msg) {
    if (typeof msg.op_id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(msg.op_id) || !msg.change || JSON.stringify(msg.change).length > 600000) throw new Error('Invalid notebook change');
    const page=await this.loadPage(Number(msg.page));
    if (page.applied.has(msg.op_id)) {
      this.dirty.add(Number(msg.page)); await this.storage.put('dirty',[...this.dirty]);
      await this.schedule('mirror',Date.now()+1500);
      conn.send({type:'ack',op_id:msg.op_id}); await this.sendPage(conn,Number(msg.page)); return;
    }
    const next=applyOperation(page,msg.change,user.seat,user.role);
    const bucket=Math.floor(page.count/100);
    const index=(await this.storage.get(`index:${msg.page}:${bucket}`)||[]).slice(0,page.count%100);
    await this.writeBlob(`op:${msg.op_id}`,{id:msg.op_id,change:msg.change,writer:user.seat,role:user.role});
    await this.storage.put(`index:${msg.page}:${bucket}`,[...index,msg.op_id]);
    this.dirty.add(Number(msg.page)); await this.storage.put('dirty',[...this.dirty]);
    await this.storage.put(`page:${msg.page}`,{baseCount:page.baseCount,count:page.count+1});
    const committed={...next,applied:new Set([...page.applied,msg.op_id]),count:page.count+1,baseCount:page.baseCount};
    this.pages.set(Number(msg.page),committed);
    this.dirty.add(Number(msg.page)); await this.storage.put('dirty',[...this.dirty]);
    await this.schedule('mirror',Date.now()+1500);
    this.broadcast({type:'page',page:Number(msg.page),data:snapshot(committed)});
    conn.send({type:'ack',op_id:msg.op_id});
  }
  async mirror() {
    if (!this.session || !this.dirty.size) return;
    const set={last_active:new Date().toISOString()};
    for (const number of this.dirty) set[`strokes_by_page.${number}`]=JSON.stringify(snapshot(await this.loadPage(number)));
    await this.client.asServiceRole.entities.NotebookSession.updateMany({id:this.session.id},{$set:set});
    this.dirty.clear(); await this.storage.put('dirty',[]);
  }
  async handleWake(key) {
    if (key !== 'mirror') return;
    this.chain=this.chain.catch(()=>{}).then(async()=>{
      try { await this.mirror(); } catch { await this.schedule('mirror',Date.now()+15000); }
    });
    await this.chain;
  }
}