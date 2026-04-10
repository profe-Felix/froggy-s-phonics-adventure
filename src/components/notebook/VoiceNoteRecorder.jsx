import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';

export default function VoiceNoteRecorder({ existingUrl, onSaved, onDelete }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localUrl, setLocalUrl] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);

  const start = async () => {
    chunksRef.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRef.current = new MediaRecorder(stream);
    mediaRef.current.ondataavailable = e => chunksRef.current.push(e.data);
    mediaRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      setLocalUrl(URL.createObjectURL(blob));
      uploadBlob(blob);
    };
    mediaRef.current.start();
    setRecording(true);
  };

  const stop = () => { mediaRef.current?.stop(); setRecording(false); };

  const uploadBlob = async (blob) => {
    setUploading(true);
    const file = new File([blob], 'voice_note.webm', { type: 'audio/webm' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUploading(false);
    onSaved(file_url);
  };

  const displayUrl = existingUrl || localUrl;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-2xl" style={{ background: '#1a1a2e', border: '1px solid #4338ca' }}>
      <p className="text-indigo-300 text-xs font-bold">🎙 Voice Note for this page</p>

      {displayUrl && (
        <div className="flex items-center gap-2">
          <audio controls src={displayUrl} className="flex-1 h-8" />
          {onDelete && (
            <button onClick={onDelete} className="text-red-400 text-xs font-bold hover:text-red-300">✕</button>
          )}
        </div>
      )}

      <button
        onClick={recording ? stop : start}
        disabled={uploading}
        className={`py-2 rounded-xl font-bold text-white text-sm transition-all ${recording ? 'bg-red-600 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-500'} disabled:opacity-50`}
      >
        {uploading ? '⏳ Saving…' : recording ? '⏹ Stop Recording' : displayUrl ? '🔄 Re-record' : '🎙 Record Voice Note'}
      </button>
    </div>
  );
}