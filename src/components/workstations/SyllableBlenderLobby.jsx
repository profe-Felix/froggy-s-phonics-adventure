import { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import BackButton from '@/components/ui/BackButton';

// Teacher lobby: pick a preset, then open the activity here or share a student QR.
export default function SyllableBlenderLobby({ presets }) {
  const keys = Object.keys(presets);
  const [selected, setSelected] = useState(keys[0] || '');
  const [showQr, setShowQr] = useState(false);
  const studentUrl = `${window.location.origin}${window.location.pathname}?preset=${encodeURIComponent(selected)}`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f7f8fc' }}>
      <div className="flex items-center gap-3 p-3 bg-white border-b sticky top-0 z-20">
        <BackButton onClick={() => window.history.back()} />
        <h1 className="font-bold text-lg">Syllable Blender — Elkonin Boxes</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        <div className="flex flex-col gap-3 w-full max-w-md">
          <label className="font-bold">Choose a preset</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="px-3 py-2 rounded-lg border font-bold bg-white"
          >
            {keys.map((k) => (
              <option key={k} value={k}>{presets[k].label || k}</option>
            ))}
          </select>
          <a href={studentUrl} className="px-4 py-3 rounded-xl bg-emerald-600 text-white font-bold text-center">
            Open activity on this device
          </a>
          <button onClick={() => setShowQr(true)} className="px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold">
            📱 Student QR
          </button>
        </div>
      </div>

      {showQr && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowQr(false)}>
          <div className="bg-white p-6 rounded-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold mb-3 text-lg">Student Link · {selected}</p>
            <QRCodeCanvas value={studentUrl} size={240} />
            <p className="text-xs text-gray-500 mt-3 break-all max-w-xs">{studentUrl}</p>
            <button onClick={() => setShowQr(false)} className="mt-4 px-4 py-2 rounded-lg border font-bold">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}