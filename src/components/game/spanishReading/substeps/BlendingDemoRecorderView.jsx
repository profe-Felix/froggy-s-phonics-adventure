import React, { useState } from 'react';
import { Loader2, CheckCircle2, Video } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { SUBSTEP_COLORS as C } from './substepTheme';
import SlideToReadCanvas from '../SlideToReadCanvas';

// Teacher-only view shown in place of the video model substep when
// ?role=teacher is in the URL. The teacher records themselves sliding the
// slider and saying the sounds; the video uploads to R2 and the public URL
// is saved into the Lesson entity's step.config.demos[word].
//
// Props:
//   word      — the word to display and record a demo for
//   lessonId  — Lesson entity id (to update demos)
//   stepIndex — index of the blending_letters step in lesson.steps
//   existingUrl — current demo URL (if any), shown as a "play" option
//   onSaved   — optional callback after the demo is saved
export default function BlendingDemoRecorderView({ word, lessonId, stepIndex, existingUrl, onSaved }) {
  const [status, setStatus] = useState('idle'); // idle | uploading | saved | error
  const [savedUrl, setSavedUrl] = useState(existingUrl || '');

  const handleDemoRecorded = async (blob) => {
    if (!blob || !lessonId || stepIndex == null) return;
    setStatus('uploading');
    try {
      // 1. Presign an R2 upload URL via the r2Video backend function.
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const key = `blending-demos/${word}.${ext}`;
      const res = await base44.functions.invoke('r2Video', {
        action: 'presign',
        key,
        contentType: blob.type || 'video/webm',
      });
      if (!res?.uploadUrl) throw new Error('No upload URL returned');

      // 2. Upload the blob directly to R2.
      const uploadRes = await fetch(res.uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': blob.type || 'video/webm' },
      });
      if (!uploadRes.ok) throw new Error('Upload to R2 failed');

      // 3. Save the public URL into the Lesson entity's step config demos.
      const lesson = await base44.entities.Lesson.get(lessonId);
      const steps = Array.isArray(lesson.steps) ? [...lesson.steps] : [];
      const step = steps[stepIndex] || {};
      const config = { ...(step.config || {}) };
      const demos = { ...(config.demos || {}) };
      demos[word] = res.publicUrl;
      config.demos = demos;
      steps[stepIndex] = { ...step, config };
      await base44.entities.Lesson.update(lessonId, { steps });

      setSavedUrl(res.publicUrl);
      setStatus('saved');
      onSaved?.(res.publicUrl);
    } catch (e) {
      console.error('Demo upload failed:', e);
      setStatus('error');
      alert('Upload failed: ' + (e?.message || 'unknown error'));
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 px-2 py-2 w-full max-w-2xl mx-auto">
      {/* Word heading */}
      <div
        className="text-5xl sm:text-7xl font-black leading-none tracking-tight"
        style={{ color: C.text }}
      >
        {word}
      </div>

      {/* Status banner */}
      {status === 'uploading' && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-100 text-blue-700 font-bold text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Uploading demo…
        </div>
      )}
      {status === 'saved' && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-100 text-green-700 font-bold text-sm">
          <CheckCircle2 className="w-4 h-4" />
          Demo saved! Students will see this video.
        </div>
      )}
      {status === 'error' && (
        <div className="px-4 py-2 rounded-xl bg-red-100 text-red-700 font-bold text-sm">
          Upload failed — try again.
        </div>
      )}

      {/* Existing demo note */}
      {savedUrl && status === 'idle' && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/60 text-xs font-bold" style={{ color: C.muted }}>
          <Video className="w-3.5 h-3.5" />
          A demo exists — record again to replace it.
        </div>
      )}

      {/* Recording canvas — only show when not uploading/saved */}
      {status !== 'uploading' && (
        <div className="w-full rounded-2xl overflow-hidden shadow-lg" style={{ background: C.card }}>
          <SlideToReadCanvas
            text={word}
            theme="mint"
            demoMode
            onDemoRecorded={handleDemoRecorded}
          />
        </div>
      )}

      {/* After save, show the uploaded video for confirmation */}
      {status === 'saved' && savedUrl && (
        <div className="w-full rounded-2xl overflow-hidden shadow-lg" style={{ background: C.card }}>
          <video
            src={savedUrl}
            controls
            className="w-full max-h-[50vh] object-contain"
          />
        </div>
      )}
    </div>
  );
}