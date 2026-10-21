import { useState, useEffect, useMemo, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { base44 } from '@/api/base44Client';
import { FLUENCY_PRESETS } from '@/components/workstations/fluencyPresets';
import BackButton from '@/components/ui/BackButton';
import FluencyGrid from '@/components/workstations/FluencyGrid';
import CurriculumFluencyBuilder from '@/components/workstations/CurriculumFluencyBuilder';
import { latestFluencyWriter } from '@/lib/literacy/fluencySync.mjs';
import { onlyO } from '@/lib/literacy/fluencyDisplay.mjs';

// Real curriculum presets live in Supabase Storage (public bucket). Fetched at
// load; the local FLUENCY_PRESETS is the fallback if the fetch fails.
const SUPABASE_PRESETS_URL =
  'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/fluency/presets.json';

const genCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

export default function FluencyTable() {
  return <FluencySessionTable />;
}

function FluencySessionTable() {
  const params = new URLSearchParams(window.location.search);
  const isTeacher = params.get('role') === 'teacher';
  const [presets, setPresets] = useState(() => FLUENCY_PRESETS.filter(p => !onlyO(p.content)));
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const sessionRef = useRef(null);
  sessionRef.current = session;
  const pendingPatch = useRef(null);
  const writer = useMemo(() => latestFluencyWriter(
    ({ id, patch }) => base44.entities.FluencySession.update(id, patch), setSyncError
  ), []);
  const updateControls = patch => {
    if (!isTeacher || !session) return;
    const next = { ...sessionRef.current, ...patch };
    sessionRef.current = next;
    setSession(next);
    const value = { id: session.id, patch: {
      preset_id: next.preset_id, preset_data: next.preset_data || {},
      seed: next.seed, active_row: next.active_row, active_cell: next.active_cell ?? 0,
      sweep_start_at: next.sweep_start_at,
    }};
    pendingPatch.current = value;
    writer.enqueue(value);
  };
  const presetParam = params.get('preset');
  const [lobbyPreset, setLobbyPreset] = useState(
    presetParam && FLUENCY_PRESETS.some((p) => p.id === presetParam) ? presetParam : FLUENCY_PRESETS[0].id
  );
  const [lobbyMode, setLobbyMode] = useState('manual'); // 'manual' | 'curriculum'
  const unsubRef = useRef(null);

  // Pull the real curriculum from Supabase Storage; fall back to local presets.
  // Abort after 3s so a slow/hanging fetch doesn't disrupt the page late.
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    fetch(`${SUPABASE_PRESETS_URL}?t=${Date.now()}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((obj) => {
        if (!obj) return;
        const arr = Object.entries(obj).map(([id, p]) => ({ id, ...p })).filter(p => !onlyO(p.content));
        if (arr.length) {
          setPresets(arr);
          if (presetParam && arr.some((p) => p.id === presetParam)) setLobbyPreset(presetParam);
        }
      })
      .catch(() => {});
    return () => { clearTimeout(timeout); controller.abort(); };
  }, []);

  useEffect(() => () => { if (unsubRef.current) unsubRef.current(); }, []);

  const subscribeTo = (id) => {
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = base44.entities.FluencySession.subscribe((ev) => {
      if (ev.data?.id !== id) return;
      if (ev.type === 'delete') setSession(null);
      else if (!(isTeacher && writer.isPending())) setSession(previous => ({ ...previous, ...ev.data }));
    });
  };
  useEffect(() => {
    if (!session?.id || isTeacher) return;
    let alive = true, busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const fresh = await base44.entities.FluencySession.get(session.id);
        if (alive) setSession(fresh);
      } catch (error) { if (alive) setSyncError(error); }
      finally { busy = false; }
    };
    const timer = setInterval(refresh, 2000);
    window.addEventListener('focus', refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [session?.id, isTeacher]);

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

  // A curriculum-built session carries its generated preset on the session
  // record itself (preset_data), so students render the same table without
  // needing it in the Supabase presets file. Manual sessions fall back to the
  // presets list by id.
  const preset = useMemo(
    () => session?.preset_data?.id
      ? session.preset_data
      : presets.find((p) => p.id === (session?.preset_id || lobbyPreset)) || presets[0],
    [session, presets, lobbyPreset]
  );

  const startSession = async (curriculum) => {
    const code = genCode();
    const preset_id = curriculum ? curriculum.preset_id : lobbyPreset;
    const preset_data = curriculum ? curriculum.preset_data : presets.find(p => p.id === lobbyPreset);
    if (!preset_data?.content?.length) { setSyncError(new Error('Choose a fluency preset with content.')); return; }
    if (onlyO(preset_data.content)) { setSyncError(new Error('Choose a later lesson with more than just “o”.')); return; }
    const created = await base44.entities.FluencySession.create({
      code, preset_id, preset_data, seed: Date.now(), active_row: 0, active_cell: 0, sweep_start_at: '',
    });
    setSession(created);
    subscribeTo(created.id);
  };

  // Any participant (teacher or student) starts a row's synced sweep.
  // Apply changes to local session state immediately so the teacher's own
  // screen updates without waiting on the realtime subscription — previously
  // shuffle / preset-change relied solely on the subscription, so a delayed
  // or missed event made the page look frozen and forced a refresh.
  const onPlayRow = (r) => {
    updateControls({ active_row: r, active_cell: r * preset.cols, sweep_start_at: new Date().toISOString() });
  };

  const changePreset = (id) => {
    setLobbyPreset(id);
    const next = presets.find(p => p.id === id);
    if (!next?.content?.length) { setSyncError(new Error('That preset has no fluency content.')); return; }
    if (onlyO(next.content)) return;
    updateControls({ preset_id: id, preset_data: next, active_row: 0, active_cell: 0, sweep_start_at: '' });
  };

  const shuffle = () => {
    const seed = Date.now();
    updateControls({ seed, active_row: 0, active_cell: 0, sweep_start_at: '' });
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
            {syncError && <p role="alert" className="text-amber-800">{syncError.message}</p>}
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setLobbyMode('manual')}
                className={`px-4 py-2 rounded-lg font-bold text-sm transition ${lobbyMode === 'manual' ? 'bg-emerald-600 text-white' : 'bg-white border text-slate-600'}`}
              >
                Manual presets
              </button>
              <button
                onClick={() => setLobbyMode('curriculum')}
                className={`px-4 py-2 rounded-lg font-bold text-sm transition ${lobbyMode === 'curriculum' ? 'bg-emerald-600 text-white' : 'bg-white border text-slate-600'}`}
              >
                📚 Curriculum builder
              </button>
            </div>
            {lobbyMode === 'manual' ? (
              <div className="flex flex-col gap-3 w-full max-w-md">
                <label className="font-bold">Choose a word set</label>
                <select
                  value={lobbyPreset}
                  onChange={(e) => setLobbyPreset(e.target.value)}
                  className="px-3 py-2 rounded-lg border font-bold"
                >
                  {presets.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
                <button onClick={() => startSession()} className="px-4 py-3 rounded-xl bg-emerald-600 text-white font-bold">
                  Start live session
                </button>
              </div>
            ) : (
              <CurriculumFluencyBuilder onStart={startSession} />
            )}
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
        {syncError && <div role="alert" className="text-amber-800 bg-amber-50 p-2">
          The latest highlight could not sync.
          {isTeacher && <button className="underline ml-2" onClick={() => pendingPatch.current && writer.enqueue(pendingPatch.current)}>Retry sync</button>}
        </div>}
        <FluencyGrid
          preset={preset}
          seed={session.seed}
          activeRow={session.active_row}
          sweepStartAt={session.sweep_start_at}
          onPlayRow={onPlayRow}
          activeCell={session.active_cell ?? 0}
          onSelectCell={index => updateControls({ active_cell: index, sweep_start_at: '' })}
          interactive={isTeacher}
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