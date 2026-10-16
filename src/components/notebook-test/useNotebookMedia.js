import { useCallback, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

// Test-only hook — references TestNotebookSession instead of NotebookSession.
export default function useNotebookMediaTest(sessionId, latestSessionRef, setSession) {
  const chain = useRef(Promise.resolve());
  useEffect(() => {
    if (!sessionId) return;
    return base44.entities.TestNotebookSession.subscribe(event => {
      if ((event.id || event.data?.id) !== sessionId || !event.data) return;
      const media = {};
      for (const key of ['voice_notes_by_page', 'recordings_by_page']) if (key in event.data) media[key] = event.data[key];
      if (!Object.keys(media).length) return;
      const next = { ...latestSessionRef.current, ...media }; latestSessionRef.current = next; setSession(next);
    });
  }, [sessionId]);
  return useCallback((id, mutate) => {
    chain.current = chain.current.catch(() => {}).then(async () => {
      const active = latestSessionRef.current; if (active?.id !== id) return;
      const before = active.voice_notes_by_page || {}; const after = mutate({ ...before }); const set = {}, unset = {};
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (before[key] === after[key]) continue;
        if (key in after) set[`voice_notes_by_page.${key}`] = after[key]; else unset[`voice_notes_by_page.${key}`] = '';
      }
      if (Object.keys(set).length || Object.keys(unset).length) await base44.entities.TestNotebookSession.updateMany({ id }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) });
      if (latestSessionRef.current?.id === id) {
        const next = { ...latestSessionRef.current, voice_notes_by_page: { ...latestSessionRef.current.voice_notes_by_page, ...after } };
        for (const key of Object.keys(unset)) delete next.voice_notes_by_page[key.slice('voice_notes_by_page.'.length)];
        latestSessionRef.current = next; setSession(next);
      }
    }); return chain.current;
  }, [latestSessionRef, setSession]);
}