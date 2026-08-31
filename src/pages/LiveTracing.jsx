import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lock, Unlock, X, Radio, Users, PenLine } from 'lucide-react';
import { useLiveTracingBroadcast } from '@/hooks/useLiveTracingBroadcast';
import TracingModelCanvas from '@/components/live/TracingModelCanvas';

const ALL_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const SPANISH_EXTRA = ['ñ'];

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Standalone live letter-tracing session. A teacher picks a set of letters,
// starts a session, and shares a QR code. Students join by code (no class
// number or login required) — built for classes that haven't been set up yet.
export default function LiveTracing() {
  const [session, setSession] = useState(null);
  const sessionRef = useRef(session);
  const [picked, setPicked] = useState(['o', 'i', 'a']);
  const [currentLetter, setCurrentLetter] = useState('o');
  const [starting, setStarting] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => { sessionRef.current = session; }, [session]);

  // Real-time subscription to the active session.
  useEffect(() => {
    if (!session?.id) return;
    const unsub = base44.entities.LiveTracingSession.subscribe((event) => {
      if (event.data?.id !== session.id) return;
      if (event.type === 'delete' || !event.data?.active) {
        setSession(null);
        return;
      }
      setSession(prev => prev ? {
        ...event.data,
        // Preserve the teacher's local controls (phase/current_letter are
        // driven from this tab; realtime echoes could lag behind).
        phase: prev.phase,
        current_letter: prev.current_letter,
      } : event.data);
    });
    return unsub;
  }, [session?.id]);

  // Heartbeat — keep the session's updated_date fresh so students know it's live.
  useEffect(() => {
    if (!session?.id || !session?.active) return;
    let cancelled = false;
    const heartbeat = async () => {
      if (cancelled) return;
      try {
        const s = sessionRef.current;
        if (!s?.id) return;
        await base44.entities.LiveTracingSession.update(s.id, {
          active: true,
          phase: s.phase || 'watch',
          current_letter: s.current_letter || '',
        });
      } catch {}
    };
    heartbeat();
    const interval = setInterval(heartbeat, 15000);
    const onVis = () => { if (document.visibilityState === 'visible') heartbeat(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [session?.id, session?.active]);

  const { send, clear: clearBroadcast } = useLiveTracingBroadcast(session?.id);

  const toggleLetter = (l) => {
    setPicked(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);
  };

  const startSession = async () => {
    if (!picked.length) return;
    setStarting(true);
    let code = genCode();
    try {
      const existing = await base44.entities.LiveTracingSession.filter({ code, active: true });
      if (existing?.length) code = genCode();
    } catch {}

    // Deactivate any leftover standalone tracing sessions.
    try {
      const stale = await base44.entities.LiveTracingSession.filter({ active: true });
      await Promise.all((stale || []).map(s => base44.entities.LiveTracingSession.update(s.id, { active: false }).catch(() => {})));
    } catch {}

    const created = await base44.entities.LiveTracingSession.create({
      code,
      letters: picked,
      current_letter: picked[0],
      phase: 'watch',
      active: true,
      started_at: new Date().toISOString(),
      broadcast_state: {},
    });
    setSession(created);
    setCurrentLetter(picked[0]);
    setStarting(false);
  };

  const updateSession = async (patch) => {
    if (!session?.id) return;
    setSession(prev => prev ? { ...prev, ...patch } : prev);
    try { await base44.entities.LiveTracingSession.update(session.id, patch); } catch {}
  };

  const pickLetter = (l) => {
    setCurrentLetter(l);
    clearBroadcast();
    updateSession({ current_letter: l, phase: 'watch' });
  };

  const setPhase = (p) => {
    if (p === 'try') clearBroadcast();
    updateSession({ phase: p });
  };

  const endSession = async () => {
    await updateSession({ active: false });
    setSession(null);
    setShowQR(false);
  };

  // ---------- SETUP SCREEN ----------
  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Link to="/Lessons" className="text-indigo-600 hover:underline font-bold text-sm">
              <ArrowLeft className="w-4 h-4 inline mr-1" /> Lessons
            </Link>
            <h1 className="text-3xl font-black text-gray-800 flex items-center gap-2">
              <PenLine className="w-7 h-7 text-indigo-500" /> Live Tracing
            </h1>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 p-6 space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Pick the letters for this session
              </label>
              <p className="text-xs text-gray-400 mb-3">
                Students will join by QR code — no class number or login needed. Great for classes that aren't set up yet.
              </p>
              <div className="grid grid-cols-9 gap-2">
                {ALL_LETTERS.concat(SPANISH_EXTRA).map(l => (
                  <button
                    key={l}
                    onClick={() => toggleLetter(l)}
                    className={`h-10 rounded-lg font-bold text-lg transition ${
                      picked.includes(l)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-indigo-700 border border-indigo-100 hover:bg-indigo-50'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">{picked.length} letter(s) selected</p>
            </div>

            <Button
              onClick={startSession}
              disabled={!picked.length || starting}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-black text-lg py-3"
            >
              <Radio className="w-5 h-5 mr-2" />
              {starting ? 'Starting…' : 'Start Live Tracing'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- LIVE CONTROL SCREEN ----------
  const phase = session.phase || 'watch';
  const isLocked = phase === 'watch';
  const joinUrl = `${window.location.origin}/LiveTracingStudent?code=${session.code}`;

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center gap-2 text-indigo-400 font-black shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" /> LIVE
          </span>
          <h1 className="text-base font-bold truncate">Live Tracing</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowQR(v => !v)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700"
          >
            <Users className="w-4 h-4" /> Join
          </button>
          <button
            onClick={() => setPhase(isLocked ? 'try' : 'watch')}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold border transition ${
              isLocked
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-green-500/20 text-green-300 border-green-500/40 hover:bg-green-500/30'
            }`}
            title={isLocked ? 'Students locked — tap to release' : 'Students released — tap to lock'}
          >
            {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            {isLocked ? 'Locked' : 'Released'}
          </button>
          <button
            onClick={endSession}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold bg-red-500/90 hover:bg-red-500 text-white"
          >
            <X className="w-4 h-4" /> End
          </button>
        </div>
      </div>

      {/* Letter picker — visible in both phases */}
      <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800 shrink-0">
        <div className="flex flex-wrap gap-2 justify-center max-w-3xl mx-auto">
          {session.letters?.map(l => (
            <button
              key={l}
              onClick={() => pickLetter(l)}
              className={`h-11 w-11 rounded-lg font-bold text-xl transition ${
                currentLetter === l
                  ? 'bg-indigo-600 text-white ring-2 ring-indigo-300'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 min-h-0 overflow-auto bg-slate-900">
        {isLocked ? (
          <TracingModelCanvas
            key={currentLetter}
            step={{ config: { targets: [currentLetter] } }}
            send={send}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="text-9xl font-black text-indigo-400">{currentLetter.toUpperCase()}</div>
            <div className="text-lg font-bold text-slate-300">Students are tracing this letter on their own devices.</div>
            <div className="text-xs text-slate-500">Tap a letter above to switch · tap “Locked” to model it again.</div>
          </div>
        )}
      </div>

      {/* QR + join code popover */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
            <div className="text-gray-800 font-bold text-sm flex items-center gap-1.5">
              <Users className="w-4 h-4" /> Students join
            </div>
            <div className="bg-white p-1 rounded-xl">
              <QRCodeSVG value={joinUrl} size={180} />
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400 font-bold">OR enter code</div>
              <div className="text-3xl font-black text-gray-800 tracking-widest">{session.code}</div>
            </div>
            <div className="text-xs text-gray-400 text-center">No class number or login needed</div>
            <button onClick={() => setShowQR(false)} className="mt-1 px-4 h-9 rounded-lg bg-slate-800 text-white text-xs font-bold">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}