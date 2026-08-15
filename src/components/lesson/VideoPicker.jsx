import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Upload, Trash2, Film, Check, Loader2 } from 'lucide-react';

// Teacher-facing video picker for lesson video steps. Lists videos already in
// the R2 bucket, lets the teacher upload a new one (via presigned URL — the
// file goes straight to R2, not through the backend function), and select one
// for the step. The selected video key is stored in step.config.videoKey.
export default function VideoPicker({ value, onChange }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['r2-videos'],
    queryFn: async () => {
      const res = await base44.functions.invoke('r2Video', { action: 'list' });
      return res.data;
    },
  });
  const files = data?.files || [];

  const upload = async (file) => {
    if (!file) return;
    setError('');
    setUploading(true);
    setUploadPct(0);
    try {
      // Sanitize the filename and prefix with a timestamp to avoid collisions.
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `videos/${Date.now()}-${safe}`;
      const presignRes = await base44.functions.invoke('r2Video', {
        action: 'presign',
        key,
        contentType: file.type || 'video/mp4',
      });
      const { uploadUrl, publicUrl } = presignRes.data;

      // Upload directly to R2 with progress tracking via XHR.
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(file);
      });

      qc.invalidateQueries({ queryKey: ['r2-videos'] });
      onChange(publicUrl);
    } catch (e) {
      setError(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const remove = async (key) => {
    if (!confirm('Delete this video from the library? Lessons using it will lose playback.')) return;
    try {
      await base44.functions.invoke('r2Video', { action: 'delete', key });
      qc.invalidateQueries({ queryKey: ['r2-videos'] });
      if (selected?.key === key) onChange('');
    } catch (e) {
      setError(e?.message || 'Delete failed');
    }
  };

  const selected = files.find((f) => f.url === value);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white inline-flex items-center gap-1 hover:bg-indigo-700 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? `Uploading ${uploadPct}%` : 'Upload video'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }}
        />
        {selected && (
          <span className="text-xs text-green-600 font-bold inline-flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> {selected.key.split('/').pop()}
          </span>
        )}
      </div>

      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}

      {isLoading ? (
        <p className="text-xs text-gray-400">Loading video library…</p>
      ) : files.length === 0 && !uploading ? (
        <p className="text-xs text-gray-400">No videos yet. Upload one above.</p>
      ) : (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
          {files.map((f) => (
            <div key={f.key} className={`flex items-center gap-2 px-2 py-1.5 text-xs ${f.url === value ? 'bg-indigo-50' : 'bg-white hover:bg-gray-50'}`}>
              <Film className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <button onClick={() => onChange(f.url)} className="flex-1 text-left truncate font-bold text-gray-700">
                {f.key.split('/').pop()}
              </button>
              <span className="text-gray-400 shrink-0">{(f.size / 1048576).toFixed(1)} MB</span>
              <button onClick={() => remove(f.key)} className="text-red-400 hover:text-red-600 shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}