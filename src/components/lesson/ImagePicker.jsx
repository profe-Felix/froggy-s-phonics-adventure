import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, Trash2, Image as ImageIcon, Check, Loader2, Link2 } from 'lucide-react';

// Teacher-facing image picker for instructional assets (sound wall cards,
// anchor charts, etc.). Uploads via the Base44 UploadFile integration (files
// are stored on the platform — no separate bucket needed) and stores the
// resulting URL in the step config. Also supports pasting an external URL
// (e.g. a Google Drive image link) for assets hosted elsewhere.
export default function ImagePicker({ value, onChange }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const upload = async (file) => {
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onChange(file_url);
    } catch (e) {
      setError(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const confirmUrl = () => {
    if (urlInput.trim()) {
      onChange(urlInput.trim());
      setUrlInput('');
      setShowUrlInput(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white inline-flex items-center gap-1 hover:bg-indigo-700 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? 'Uploading…' : 'Upload image'}
        </button>
        <button
          onClick={() => setShowUrlInput(v => !v)}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white text-gray-600 border border-gray-200 inline-flex items-center gap-1 hover:bg-gray-50"
        >
          <Link2 className="w-3.5 h-3.5" /> Paste URL
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }}
        />
      </div>

      {showUrlInput && (
        <div className="flex items-center gap-1">
          <input
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://example.com/image.png"
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5"
          />
          <button onClick={confirmUrl} className="text-xs font-bold px-2 py-1.5 rounded-lg bg-green-500 text-white">OK</button>
        </div>
      )}

      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}

      {value && (
        <div className="flex items-center gap-2">
          <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 shrink-0">
            <img src={value} alt="preview" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs text-green-600 font-bold inline-flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Image selected
            </span>
            <p className="text-[10px] text-gray-400 truncate">{value}</p>
          </div>
          <button onClick={() => onChange('')} className="text-red-400 hover:text-red-600 shrink-0">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {!value && !uploading && (
        <p className="text-xs text-gray-400 inline-flex items-center gap-1">
          <ImageIcon className="w-3.5 h-3.5" /> No image yet. Upload one or paste a URL.
        </p>
      )}
    </div>
  );
}