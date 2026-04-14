import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function SpanishReadingGame({ onBack, studentNumber, className: classNameProp }) {
  const iframeRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const handleMessage = async (event) => {
      if (event.data?.type !== 'SPANISH_READING_RECORDING') return;
      const { blob, listName } = event.data;
      if (!blob || !studentNumber || !classNameProp) return;

      setSaving(true);
      const file = new File([blob], 'reading.webm', { type: 'video/webm' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.SpanishReadingSession.create({
        student_number: studentNumber,
        class_name: classNameProp,
        list_name: listName || 'Unknown',
        recording_url: file_url,
        reviewed: false,
      });
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [studentNumber, classNameProp]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Minimal header */}
      <div className="flex items-center gap-3 px-3 py-2 bg-indigo-600 shrink-0">
        <button
          onClick={onBack}
          className="text-white/80 hover:text-white font-bold text-sm"
        >
          ← Back
        </button>
        <span className="text-white font-black text-sm flex-1 text-center">📖 Spanish Reading</span>
        {saving && <span className="text-yellow-200 text-xs font-bold">⏳ Saving…</span>}
        {saved && <span className="text-green-300 text-xs font-bold">✅ Saved!</span>}
      </div>

      {/* The original game, unchanged, in an iframe */}
      <iframe
        ref={iframeRef}
        src="/spanish-reading/index.html"
        className="flex-1 w-full border-none"
        allow="microphone; camera; display-capture"
        title="Spanish Reading Game"
      />
    </div>
  );
}