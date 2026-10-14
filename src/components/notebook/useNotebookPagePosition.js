import { useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
export default function useNotebookPagePosition(latestSessionRef,currentPageRef,setSession) {
  const pending=useRef(null); const running=useRef(null);
  return useCallback((sessionId,page)=>{
    if(!sessionId)return Promise.resolve();
    pending.current={sessionId,page};
    if(running.current)return running.current;
    running.current=(async()=>{
      while(pending.current){
        const item=pending.current;pending.current=null;
        const last_active=new Date().toISOString();
        await base44.entities.NotebookSession.update(item.sessionId,{current_page:item.page,last_active});
        if(latestSessionRef.current?.id===item.sessionId){
          const next={...latestSessionRef.current,current_page:currentPageRef.current,last_active};
          latestSessionRef.current=next;setSession(next);
        }
      }
    })().finally(()=>{running.current=null;});
    return running.current;
  },[latestSessionRef,currentPageRef,setSession]);
}