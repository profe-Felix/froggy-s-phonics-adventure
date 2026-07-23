import { useState, useEffect, useMemo, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { base44 } from '@/api/base44Client';
import BackButton from '@/components/ui/BackButton';
import LiveWorkstationsLobby from '@/components/workstations/LiveWorkstationsLobby';
import LiveTeacherPanel from '@/components/workstations/LiveTeacherPanel';
import LiveActivityView from '@/components/workstations/LiveActivityView';
import { FLUENCY_PRESETS } from '@/components/workstations/fluencyPresets';
import { SB_URL } from '@/lib/supabaseStorage';

const FLUENCY_PRESETS_URL = `${SB_URL}/storage/v1/object/public/app-presets/fluency/presets.json`;
const SB_PRESETS_URL = `${SB_URL}/storage/v1/object/public/app-presets/syllableblender/presets.json`;
const genCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

export default function LiveWorkstations() {
  const params = new URLSearchParams(window.location.search);
  const isTeacher = params.get('role') === 'teacher';
  const [fluencyPresets, setFluencyPresets] = useState(FLUENCY_PRESETS);
  const [sbPresets, setSbPresets] = useState({});
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [showQr, setShowQr] = useState(false);
  const unsubRef = useRef(null);

  useEffect(() => {
    Promise.all([
      fetch(FLUENCY_PRESETS_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(SB_PRESETS_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([fobj, sobj]) => {
      if (fobj) { const arr = Object.entries(fobj).map(([id, p]) => ({ id, ...p })); if (arr.length) setFluencyPresets(arr); }
      if (sobj) setSbPresets(sobj);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => () => { if (unsubRef.current) unsubRef.current(); }, []);

  const subscribe = (id) => {
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = base44.entities.WorkstationSession.subscribe((ev) => {
      if (ev.data?.id !== id) return;
      if (ev.type === 'delete') setSession(null);
      else setSession(ev.data);
    });
  };

  const loadByCode = async (code) => {
    const found = await base44.entities.WorkstationSession.filter({ code });
    if (found.length) { setSession(found[0]); subscribe(found[0].id); }
    else alert('No session found for that code.');
    setLoading(false);
  };

  useEffect(() => {
    const code = params.get('code');
    if (!code) { setLoading(false); return; }
    loadByCode(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const presets = useMemo(() => ({
    fluency_table: fluencyPresets,
    syllable_blender: sbPresets,
  }), [fluencyPresets, sbPresets]);

  const startSession = async (activity, presetId) => {
    const code = genCode();
    const created = await base44.entities.WorkstationSession.create({
      code, activity, preset_id: presetId, seed: Date.now(), settings: {},
    });
    setSession(created);
    subscribe(created.id);
  };

  const update = (partial) => {
    if (!session) return;
    base44.entities.WorkstationSession.update(session.id, partial);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (isTeacher && !session) return <LiveWorkstationsLobby presets={presets} onStart={startSession} />;

  if (!isTeacher && !session) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#f7f8fc' }}>
        <div className="flex items-center gap-3 p-3 bg-white border-b">
          <BackButton onClick={() => window.history.back()} />
          <h1 className="font-bold text-lg">Join Live Workstations</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            className="px-4 py-3 rounded-xl border font-bold text-center text-2xl tracking-widest w-48"
          />
          <button onClick={() => joinCode && loadByCode(joinCode)} className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-bold">Join</button>
        </div>
      </div>
    );
  }

  const studentUrl = `${window.location.origin}${window.location.pathname}?code=${session.code}`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f7f8fc' }}>
      <div className="flex items-center gap-3 p-3 bg-white border-b sticky top-0 z-20 flex-wrap">
        <BackButton onClick={() => window.history.back()} />
        <h1 className="font-bold text-lg">Live Workstations</h1>
        <span className="px-3 py-1 rounded-lg bg-indigo-100 text-indigo-700 font-bold tracking-widest">{session.code}</span>
        <span className="px-2 py-1 rounded bg-gray-100 text-xs font-bold">
          {session.activity === 'fluency_table' ? '📖 Fluency Table' : '📦 Syllable Blender'}
        </span>
        {isTeacher && <LiveTeacherPanel session={session} presets={presets} onUpdate={update} onShowQr={() => setShowQr(true)} />}
      </div>
      <LiveActivityView session={session} presets={presets} isTeacher={isTeacher} onUpdate={update} />
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