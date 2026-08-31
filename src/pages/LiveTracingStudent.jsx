import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Lock, Unlock, CheckCircle2, Radio, PenLine } from 'lucide-react';
import { useLiveTracingBroadcast } from '@/hooks/useLiveTracingBroadcast';
import { useMergedWaypoints } from '@/hooks/useMergedWaypoints';
import TracingMirrorCanvas from '@/components/live/TracingMirrorCanvas';
import LiveTracingProgression from '@/components/live/LiveTracingProgression';
import LiveTracingGrid from '@/components/live/LiveTracingGrid';

// Student side of a standalone live tracing session. Joins by code (from a
// QR deep link ?code=XXXX) — no class number or login required. Watches the
// teacher's live pen during the "watch" phase, then traces the current letter
// on their own device during the "try" phase.
export default function LiveTracingStudent() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = (urlParams.get('code') || '').toUpperCase();

  const [session, setSession] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [ended, setEnded] = useState(false);
  const [activeLetter, setActiveLetter] = useState(null);
  const [letterProgress, setLetterProgress] = useState({});
  const [completedLetters, setCompletedLetters] = useState(new Set());
  const waypoints = useMergedWaypoints();

  // Resolve the session by code, then subscribe for live updates. Reset all
  // state when the code changes (re-scan / refresh) so a stale "ended" or
  // "not found" from a previous session doesn't bleed into the new one.
  useEffect(() => {
    setSession(null);
    setNotFound(false);
    setEnded(false);
    setActiveLetter(null);
    setLetterProgress({});
    setCompletedLetters(new Set());
    if (!code) { setNotFound(true); return; }
    let alive = true;
    const resolve = async () => {
      try {
        const list = await base44.entities.LiveTracingSession.filter({ code, active: true });
        if (!alive) return;
        const s = (list || [])[0];
        if (!s) { setNotFound(true); return; }
        setSession(s);
      } catch {
        setNotFound(true);
      }
    };
    resolve();
    return () => { alive = false; };
  }, [code]);

  // Real-time subscription once we have the session id.
  useEffect(() => {
    if (!session?.id) return;
    const unsub = base44.entities.LiveTracingSession.subscribe((event) => {
      if (event.data?.id !== session.id) return;
      if (event.type === 'delete' || !event.data?.active) { setEnded(true); return; }
      setSession(event.data);
    });
    return unsub;
  }, [session?.id]);

  // Polling safety net — catch up if the realtime subscription missed a phase
  // or letter change (backgrounded tab, transient disconnect). Also detects a
  // stale/ended session so the student isn't left on a dead screen.
  useEffect(() => {
    if (!session?.id) return;
    let alive = true;
    const tick = async () => {
      try {
        const s = await base44.entities.LiveTracingSession.get(session.id);
        if (!alive || !s) return;
        const lastUpdate = s.updated_date || s.started_at;
        const stale = !lastUpdate || Date.now() - new Date(lastUpdate).getTime() > 90 * 1000;
        if (!s.active || stale) { setEnded(true); return; }
        setSession(s);
      } catch (err) {
        // 404 = session was deleted by the teacher → session is over.
        if (err?.status === 404) setEnded(true);
      }
    };
    tick();
    const iv = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(iv); };
  }, [session?.id]);

  const { broadcast } = useLiveTracingBroadcast(session?.id);

  if (notFound && !session) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <PenLine className="w-16 h-16 text-indigo-400" />
        <h2 className="text-2xl font-black text-gray-800">Session not found</h2>
        <p className="text-gray-500 max-w-xs">Check the code with your teacher and try again.</p>
        <Link to="/" className="px-6 py-3 bg-indigo-500 text-white rounded-xl font-bold hover:bg-indigo-600">Back to Home</Link>
      </div>
    );
  }

  if (ended) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle2 className="w-16 h-16 text-green-500" />
        <h2 className="text-2xl font-black text-gray-800">All done! 🎉</h2>
        <p className="text-gray-500">Your teacher ended the session.</p>
        <Link to="/" className="px-6 py-3 bg-indigo-500 text-white rounded-xl font-bold hover:bg-indigo-600">Back to Home</Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-6xl animate-bounce">🐸</div>
      </div>
    );
  }

  const phase = session.phase || 'watch';

  // ---------- WATCH PHASE — live mirror of the teacher's pen ----------
  if (phase === 'watch') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <div className="flex items-center justify-center gap-2 text-indigo-400 font-black text-sm py-2">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" /> LIVE with your teacher
        </div>
        <div className="flex-1 min-h-0">
          <TracingMirrorCanvas broadcast={broadcast} />
        </div>
      </div>
    );
  }

  // ---------- TRY PHASE — full Letter Tracing game from the session letters ----------
  const letters = Array.isArray(session.letters)
    ? session.letters.filter(l => waypoints[l])
    : [];

  if (!letters.length) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <PenLine className="w-16 h-16 text-indigo-400" />
        <p className="text-gray-500">Waiting for your teacher to set letters…</p>
      </div>
    );
  }

  // Tracing a specific letter — staged progression.
  if (activeLetter) {
    return (
      <div className="relative min-h-screen bg-slate-50">
        <div className="fixed top-0 inset-x-0 bg-green-600 text-white text-center py-2 text-sm font-black z-[60] flex items-center justify-center gap-2">
          <Unlock className="w-4 h-4" /> Trace the letter on your iPad!
        </div>
        <div className="pt-12 pb-6 flex flex-col items-center">
          <LiveTracingProgression
            key={activeLetter}
            letter={activeLetter}
            letterData={waypoints[activeLetter]}
            lang="es"
            silent
            initialProgress={letterProgress[activeLetter]}
            onProgressChange={(p) => {
              setLetterProgress(prev => ({ ...prev, [activeLetter]: p }));
              if (p.mastered) setCompletedLetters(prev => new Set(prev).add(activeLetter));
            }}
            onBack={() => setActiveLetter(null)}
          />
        </div>
      </div>
    );
  }

  // Letter selection grid — generated from the teacher's session letters.
  return (
    <LiveTracingGrid
      letters={letters}
      letterProgress={letterProgress}
      completedLetters={completedLetters}
      onPick={setActiveLetter}
    />
  );
}