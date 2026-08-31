import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, X, Radio, Users, PenLine } from 'lucide-react';
import { useMergedWaypoints } from '@/hooks/useMergedWaypoints';
import LiveTracingGrid from '@/components/live/LiveTracingGrid';
import LiveTracingProgression from '@/components/live/LiveTracingProgression';

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
  const [starting, setStarting] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [activeLetter, setActiveLetter] = useState(null);
  const [letterProgress, setLetterProgress] = useState({});
  const [completedLetters, setCompletedLetters] = useState(new Set());
  const waypoints = useMergedWaypoints();
  const [presets, setPresets] = useState([]);
  const [saveName, setSaveName] = useState('');

  useEffect(() => { sessionRef.current = session; }, [session]);

  // Load saved selections. If a ?session=Name param is present, auto-apply it.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await base44.entities.LiveTracingPreset.list('-updated_date', 100);
        if (!alive) return;
        setPresets(list || []);
        const urlParams = new URLSearchParams(window.location.search);
        const wanted = (urlParams.get('session') || '').trim();
        if (wanted) {
          const match = (list || []).find(p => p.name.toLowerCase() === wanted.toLowerCase());
          if (match?.letters?.length) setPicked(match.letters);
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

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
        await base44.entities.LiveTracingSession.update(s.id, { active: true });
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

    // Each picked lowercase letter generates both its lowercase and
      // uppercase form, so students practice both cases.
    const letters = picked.flatMap(l => [l, l.toUpperCase()]);
    const created = await base44.entities.LiveTracingSession.create({
      code,
      letters,
      current_letter: picked[0],
      phase: 'try',
      active: true,
      started_at: new Date().toISOString(),
      broadcast_state: {},
    });
    setSession(created);
    setStarting(false);
  };

  const updateSession = async (patch) => {
    if (!session?.id) return;
    setSession(prev => prev ? { ...prev, ...patch } : prev);
    try { await base44.entities.LiveTracingSession.update(session.id, patch); } catch {}
  };

  const endSession = async () => {
    await updateSession({ active: false });
    setSession(null);
    setShowQR(false);
    setActiveLetter(null);
    setLetterProgress({});
    setCompletedLetters(new Set());
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

            {(presets.length > 0) && (
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Saved selections</label>
                <div className="flex flex-wrap gap-2">
                  {presets.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setPicked(p.letters || []); setSaveName(p.name); }}
                      className="px-3 h-9 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Save this selection for next time</label>
              <div className="flex gap-2">
                <input
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="e.g. Schwarz"
                  className="flex-1 h-10 px-3 rounded-lg border border-indigo-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <Button
                  onClick={async () => {
                    const name = saveName.trim();
                    if (!name || !picked.length) return;
                    try {
                      const existing = presets.find(p => p.name.toLowerCase() === name.toLowerCase());
                      if (existing) {
                        const updated = await base44.entities.LiveTracingPreset.update(existing.id, { letters: picked });
                        setPresets(prev => prev.map(p => p.id === existing.id ? { ...p, letters: picked } : p));
                      } else {
                        const created = await base44.entities.LiveTracingPreset.create({ name, letters: picked });
                        setPresets(prev => [created, ...prev]);
                      }
                    } catch {}
                  }}
                  disabled={!saveName.trim() || !picked.length}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
                >
                  Save
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Open with <code>?session={saveName.trim() || 'Name'}</code> in the URL to auto-load.</p>
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
  const joinUrl = `${window.location.origin}/LiveTracingStudent?code=${session.code}`;
  const letters = (session.letters || []).filter(l => waypoints[l]);

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
            onClick={endSession}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-bold bg-red-500/90 hover:bg-red-500 text-white"
          >
            <X className="w-4 h-4" /> End
          </button>
        </div>
      </div>

      {/* Body — same grid + staged progression as students, so the teacher can model */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeLetter ? (
          <div className="pt-4 pb-8 flex flex-col items-center bg-slate-50 min-h-full">
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
        ) : (
          <LiveTracingGrid
            letters={letters}
            letterProgress={letterProgress}
            completedLetters={completedLetters}
            onPick={setActiveLetter}
          />
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