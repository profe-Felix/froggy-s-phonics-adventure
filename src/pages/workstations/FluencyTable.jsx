import { useState, useEffect, useMemo, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { base44 } from '@/api/base44Client';
import { FLUENCY_PRESETS } from '@/components/workstations/fluencyPresets';
import BackButton from '@/components/ui/BackButton';
import FluencyGrid from '@/components/workstations/FluencyGrid';

// Real curriculum presets live in Supabase Storage (public bucket). Fetched at
// load; the local FLUENCY_PRESETS is the fallback if the fetch fails.
const SUPABASE_PRESETS_URL =
  'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/fluency/presets.json';

const genCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

export default function FluencyTable() {
  const params = new URLSearchParams(window.location.search);
  const isTeacher = params.get('role') === 'teacher';
  const [presets, setPresets] = useState(FLUENCY_PRESETS);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [showQr, setShowQr] = useState(false);
  const presetParam = params.get('preset');
  const [lobbyPreset, setLobbyPreset] = useState(
    presetParam && FLUENCY_PRESETS.some((p) => p.id === presetParam) ? presetParam : FLUENCY_PRESETS[0].id
  );
  const unsubRef = useRef(null);

  // Pull the real curriculum from Supabase Storage; fall back to local presets.
  useEffect(() => {
    fetch(SUPABASE_PRESETS_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((obj) => {
        if (!obj) return;
        const arr = Object.entries(obj).map(([id, p]) => ({ id, ...p }));
        if (arr.length) {
          setPresets(arr);
          if (presetParam && arr.some((p) => p.id === presetParam)) setLobbyPreset(presetParam);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => () => { if (unsubRef.current) unsubRef.current(); }, []);

  const subscribeTo = (id) => {
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = base44.entities.FluencySession.subscribe((ev) => {
      if (ev.data?.id !== id) return;
      if (ev.type === 'delete') setSession(null);
      else setSession(ev.data);
    });
  };

  const loadByCode = async (code) => {
    const found = await base44.entities.FluencySession.filter({ code });
    if (found.length) {
      setSession(found[0]);
      subscribeTo(found[0].id);
    } else {
      alert('No session found for that code.');
    }
    setLoading(false);
  };

  useEffect(() => {
    const code = params.get('code');
    if (!code) { setLoading(false); return; }
    loadByCode(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preset = useMemo(
    () => presets.find((p) => p.id === (session?.preset_id || lobbyPreset)) || presets[0],
    [session, presets, lobbyPreset]
  );

  const startSession = async () => {
    const code = genCode();
    const created = await base44.entities.FluencySession.create({
      code, preset_id: lobbyPreset, seed: Date.now(), active_row: 0, sweep_start_at: '',
    });
    setSession(created);
    subscribeTo(created.id);
  };

  // Any participant (teacher or student) starts a row's synced sweep.
  const onPlayRow = (r) => {
    if (!session) return;
    base44.entities.FluencySession.update(session.id, {
      active_row: r,
      sweep_start_at: new Date().toISOString(),
    });
  };

  const changePreset = (id) => {
    setLobbyPreset(id);
    if (session) base44.entities.FluencySession.update(session.id, {
      preset_id: id, active_row: 0, sweep_start_at: '',
    });
  };

  const shuffle = () => {
    if (session) base44.entities.FluencySession.update(session.id, {
      seed: Date.now(), active_row: 0, sweep_start_at: '',
    });
  };

  const studentUrl = `${window.location.origin}${window.location.pathname}?role=student&code=${session?.code || ''}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    if (isTeacher) {
      return (
        <div className="min-h-screen flex flex-col" style={{ background: '#fafbff' }}>
          <div className="flex items-center gap-3 p-3 bg-white border-b">
            <BackButton onClick={() => window.history.back()} />
            <h1 className="font-bold text-lg">Fluency Table — New Session</h1>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            <div className="flex flex-col gap-3 w-full max-w-md">
              <label className="font-bold">Choose a word set</label>
              <select
                value={lobbyPreset}
                onChange={(e) => setLobbyPreset(e.target.value)}
                className="px-3 py-2 rounded-lg border font-bold"
              >
                {presets.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <button onClick={startSession} className="px-4 py-3 rounded-xl bg-emerald-600 text-white font-bold">
                Start live session
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#fafbff' }}>
        <div className="flex items-center gap-3 p-3 bg-white border-b">
          <BackButton onClick={() => window.history.back()} />
          <h1 className="font-bold text-lg">Join Fluency Table</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            className="px-4 py-3 rounded-xl border font-bold text-center text-2xl tracking-widest w-48"
          />
          <button
            onClick={() => joinCode && loadByCode(joinCode)}
            className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-bold"
          >
            Join
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#fafbff', fontFamily: "'Andika', system-ui, sans-serif" }}>
      <div className="flex items-center gap-3 p-3 bg-white border-b sticky top-0 z-20 flex-wrap">
        <BackButton onClick={() => window.history.back()} />
        <h1 className="font-bold text-lg mr-2">{preset.title}</h1>
        <span className="px-3 py-1 rounded-lg bg-indigo-100 text-indigo-700 font-bold tracking-widest">{session.code}</span>
        {isTeacher && (
          <>
            <select
              value={session.preset_id}
              onChange={(e) => changePreset(e.target.value)}
              className="px-3 py-2 rounded-lg border font-bold"
            >
              {presets.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <button onClick={shuffle} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold">🔀 Shuffle</button>
            <button onClick={() => setShowQr(true)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold">📱 Student QR</button>
          </>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <FluencyGrid
          preset={preset}
          seed={session.seed}
          activeRow={session.active_row}
          sweepStartAt={session.sweep_start_at}
          onPlayRow={onPlayRow}
        />
      </div>

      {showQr && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowQr(false)}>
          <div className="bg-white p-6 rounded-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold mb-3 text-lg">Student Link · Code {session.code}</p>
            <QRCodeCanvas value={studentUrl} size={240} />
            <p className="text-xs text-gray-500 mt-3 break-all max-w-xs">{studentUrl}</p>
            <button onClick={() => setShowQr(false)} className="mt-4 px-4 py-2 rounded-lg border font-bold">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}