import { base44 } from '@/api/base44Client';

// Shared upload logic: saves a recording blob to R2 and stores the public URL
// in the Lesson entity's step.config.demos[word]. Used by both the
// BlendingDemoRecorderView (video model step) and the PracticeSubstep
// (teacher "Save model" button on the practice step).
export async function uploadBlendingDemo(blob, word, lessonId, stepIndex) {
  if (!blob || !lessonId || stepIndex == null) return null;

  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const key = `blending-demos/${word}.${ext}`;
  const res = await base44.functions.invoke('r2Video', {
    action: 'presign',
    key,
    contentType: blob.type || 'video/webm',
  });
  if (!res?.uploadUrl) throw new Error('No upload URL returned');

  const uploadRes = await fetch(res.uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': blob.type || 'video/webm' },
  });
  if (!uploadRes.ok) throw new Error('Upload to R2 failed');

  const lesson = await base44.entities.Lesson.get(lessonId);
  const steps = Array.isArray(lesson.steps) ? [...lesson.steps] : [];
  const step = steps[stepIndex] || {};
  const config = { ...(step.config || {}) };
  const demos = { ...(config.demos || {}) };
  demos[word] = res.publicUrl;
  config.demos = demos;
  steps[stepIndex] = { ...step, config };
  await base44.entities.Lesson.update(lessonId, { steps });

  return res.publicUrl;
}