import { useState, useMemo } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { POWERFUL_WORD_PRESETS } from '@/components/workstations/powerfulWordPresets';
import BackButton from '@/components/ui/BackButton';

// Powerful Word — bilingual Spanish↔English flashcards.
// ?role=teacher  → preset picker + student QR
// ?preset=<id>   → which card set
// Students tap "Show"/"Hide" to reveal the English translation.
export default function PowerfulWord() {
  const params = new URLSearchParams(window.location.search);
  const isTeacher = params.get('role') === 'teacher';
  const [presetId, setPresetId] = useState(params.get('preset') || POWERFUL_WORD_PRESETS[0].id);
  const [showQr, setShowQr] = useState(false);

  const preset = useMemo(
    () => POWERFUL_WORD_PRESETS.find((p) => p.id === presetId) || POWERFUL_WORD_PRESETS[0],
    [presetId]
  );

  const studentUrl = `${window.location.origin}${window.location.pathname}?role=student&preset=${encodeURIComponent(presetId)}`;

  return (
    <div className="min-h-screen" style={{ background: '#fafbff', fontFamily: "'Andika', system-ui, sans-serif" }}>
      {isTeacher && (
        <div className="flex items-center gap-3 p-3 bg-white border-b sticky top-0 z-20 flex-wrap">
          <BackButton onClick={() => window.history.back()} />
          <h1 className="font-bold text-lg mr-2">Powerful Word · Teacher</h1>
          <select
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className="px-3 py-2 rounded-lg border font-bold"
          >
            {POWERFUL_WORD_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          <button
            onClick={() => setShowQr(true)}
            className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold"
          >
            📱 Student QR
          </button>
        </div>
      )}

      <div
        className="max-w-5xl mx-auto p-6 grid gap-6"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
      >
        {preset.pairs.map((pair, i) => (
          <FlashCard key={`${preset.id}-${i}`} pair={pair} />
        ))}
      </div>

      {showQr && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setShowQr(false)}
        >
          <div className="bg-white p-6 rounded-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold mb-3 text-lg">Student Link</p>
            <QRCodeCanvas value={studentUrl} size={240} />
            <p className="text-xs text-gray-500 mt-3 break-all max-w-xs">{studentUrl}</p>
            <button
              onClick={() => setShowQr(false)}
              className="mt-4 px-4 py-2 rounded-lg border font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FlashCard({ pair }) {
  const [hidden, setHidden] = useState(true);
  return (
    <div className="bg-white rounded-2xl p-10 border shadow flex flex-col gap-6 items-center text-center">
      <div className="font-bold" style={{ color: '#dc2626', fontSize: 'clamp(3rem,4vw,5rem)' }}>
        {pair.es}
      </div>
      <div
        className="rounded-xl p-5 flex items-center justify-center min-h-[3.2em]"
        style={{
          fontSize: 'clamp(3rem,4vw,5rem)',
          background: hidden ? '#f3f4f6' : '#dbeafe',
          color: hidden ? 'transparent' : '#1d4ed8',
          transition: 'background .15s, color .15s',
        }}
      >
        <span>{pair.en}</span>
      </div>
      <button
        onClick={() => setHidden((h) => !h)}
        className="px-5 py-2 rounded-full text-white font-bold"
        style={{ fontSize: 'clamp(1.2rem,1.5vw,2rem)', background: '#2563eb' }}
      >
        {hidden ? 'Show' : 'Hide'}
      </button>
    </div>
  );
}