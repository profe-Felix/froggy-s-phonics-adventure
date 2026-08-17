import React, { useState } from 'react';
import { Camera, Link2, Trash2, Upload } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// Lets a teacher attach a photo to a student so non-readers can log in by
// picture instead of number. The photo can be uploaded directly, or pasted
// as a URL (e.g. copied from the PrintPro ID-card app, where photos are
// stored as public Base44 media URLs).
export default function StudentPhotoEditor({ student, onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [error, setError] = useState('');

  const save = async (photo_url) => {
    setError('');
    try {
      await base44.entities.Student.update(student.id, { photo_url });
      onUpdate({ ...student, photo_url });
    } catch (e) {
      setError(e.message || 'Could not save photo');
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (file_url) await save(file_url);
    } catch (e) {
      setError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handlePasteUrl = async () => {
    const u = urlInput.trim();
    if (!/^https?:\/\//.test(u)) { setError('Enter a valid http(s) URL'); return; }
    await save(u);
    setUrlInput('');
    setShowUrl(false);
  };

  const handleClear = async () => {
    await save('');
  };

  return (
    <div className="flex items-center gap-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
      <div className="shrink-0">
        {student.photo_url ? (
          <img src={student.photo_url} alt="Student" className="w-16 h-16 rounded-full object-cover border-2 border-amber-300" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-amber-100 border-2 border-dashed border-amber-300 flex items-center justify-center text-amber-400">
            <Camera className="w-7 h-7" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
          <Camera className="w-4 h-4" /> Login photo
        </p>
        <p className="text-xs text-amber-700/70 mb-2">Shown on the login tile so non-readers can find themselves by picture.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold cursor-pointer hover:bg-amber-600">
            <Upload className="w-3.5 h-3.5" />
            {uploading ? 'Uploading…' : 'Upload'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={e => handleFile(e.target.files?.[0])}
            />
          </label>
          <button
            onClick={() => setShowUrl(v => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-amber-700 text-xs font-bold border border-amber-300 hover:bg-amber-50"
          >
            <Link2 className="w-3.5 h-3.5" /> Paste URL
          </button>
          {student.photo_url && (
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-red-500 text-xs font-bold border border-red-200 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          )}
        </div>
        {showUrl && (
          <div className="flex items-center gap-2 mt-2">
            <input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="Paste photo URL (e.g. from PrintPro)"
              className="flex-1 min-w-0 border border-amber-300 rounded-lg px-2 py-1 text-xs"
              autoFocus
            />
            <button onClick={handlePasteUrl} className="bg-amber-500 text-white rounded-lg px-3 py-1 text-xs font-bold">Save</button>
          </div>
        )}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    </div>
  );
}