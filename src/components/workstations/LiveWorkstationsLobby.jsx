import { useState, useEffect } from 'react';
import BackButton from '@/components/ui/BackButton';

const ACTIVITIES = [
  { id: 'syllable_blender', label: 'Syllable Blender', emoji: '📦' },
  { id: 'fluency_table', label: 'Fluency Table', emoji: '📖' },
];

// Teacher pre-session lobby: pick the starting activity + preset, then start.
export default function LiveWorkstationsLobby({ presets, onStart }) {
  const [activity, setActivity] = useState('syllable_blender');
  const presetList = activity === 'fluency_table'
    ? presets.fluency_table.map((p) => ({ id: p.id, label: p.title }))
    : Object.entries(presets.syllable_blender).map(([id, p]) => ({ id, label: p.label || id }));
  const [presetId, setPresetId] = useState(() => presetList[0]?.id || '');
  useEffect(() => { setPresetId(presetList[0]?.id || ''); }, [activity, presetList.length]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f7f8fc' }}>
      <div className="flex items-center gap-3 p-3 bg-white border-b sticky top-0 z-20">
        <BackButton onClick={() => window.history.back()} />
        <h1 className="font-bold text-lg">Live Workstations — New Session</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        <div className="flex flex-col gap-3 w-full max-w-md">
          <label className="font-bold">Starting activity</label>
          <select value={activity} onChange={(e) => setActivity(e.target.value)} className="px-3 py-2 rounded-lg border font-bold bg-white">
            {ACTIVITIES.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.label}</option>)}
          </select>
          <label className="font-bold">Preset</label>
          <select value={presetId} onChange={(e) => setPresetId(e.target.value)} className="px-3 py-2 rounded-lg border font-bold bg-white">
            {presetList.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <button onClick={() => onStart(activity, presetId)} className="px-4 py-3 rounded-xl bg-emerald-600 text-white font-bold">
            Start live session
          </button>
        </div>
      </div>
    </div>
  );
}