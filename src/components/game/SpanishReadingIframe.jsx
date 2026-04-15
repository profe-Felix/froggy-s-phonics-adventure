import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export default function SpanishReadingIframe({ studentNumber, className, onBack }) {
  useEffect(() => {
    const handler = async (event) => {
      if (!event.data) return;

      try {
        // New format: iframe sends raw recording blob + session metadata
        if (event.data.type === 'uploadRecording') {
          const { blobArrayBuffer, mimeType, sessionMeta } = event.data;

          if (!blobArrayBuffer || !sessionMeta) {
            console.warn('[SpanishReadingIframe] missing uploadRecording payload');
            return;
          }

          let recordingUrl = null;

          try {
            const ext =
              mimeType?.includes('mp4') ? 'mp4' :
              mimeType?.includes('ogg') ? 'ogg' :
              'webm';

            const file = new File(
              [blobArrayBuffer],
              `spanish_reading_${Date.now()}_s${sessionMeta.student_number || 0}.${ext}`,
              { type: mimeType || 'video/webm' }
            );

            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            recordingUrl = file_url || null;
          } catch (uploadErr) {
            console.warn('[SpanishReadingIframe] upload failed', uploadErr);
          }

          await base44.entities.SpanishReadingSession.create({
            ...sessionMeta,
            recording_url: recordingUrl,
          });

          console.log('[SpanishReadingIframe] session saved with recording', {
            ...sessionMeta,
            recording_url: recordingUrl,
          });
          return;
        }

        // Backward compatibility for old v2 page
        if (event.data.type === 'saveSpanishSession') {
          const data = event.data.data;
          await base44.entities.SpanishReadingSession.create(data);
          console.log('[SpanishReadingIframe] legacy session saved', data);
        }
      } catch (err) {
        console.warn('[SpanishReadingIframe] failed to save session', err);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const src = `/spanish-reading/index.html?number=${studentNumber || 0}&class=${encodeURIComponent(className || '')}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-100 border-b shrink-0">
        <button
          onClick={onBack}
          className="text-sm font-bold text-gray-600 hover:text-gray-900"
        >
          ← Back to Modes
        </button>
        <span className="text-sm font-semibold text-gray-700">📖 Spanish Reading</span>
      </div>
      <iframe
        src={src}
        className="flex-1 w-full border-0"
        title="Spanish Reading Game"
        allow="microphone"
      />
    </div>
  );
}