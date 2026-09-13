import { appParams } from '@/lib/app-params';

// Shared upload logic: saves a recording blob to R2 and stores the public URL
// in the Lesson entity's step.config.demos[word]. Used by both the
// BlendingDemoRecorderView (video model step) and the PracticeSubstep
// (teacher "Save model" button on the practice step).
//
// Calls the r2Video backend function directly via fetch (not base44.functions.invoke)
// so it works from any browser without a platform login — teachers only need
// the ?role=teacher URL parameter. The function uses asServiceRole to update
// the Lesson entity server-side.
async function invokeR2Video(payload) {
  const { appId } = appParams;
  const url = `${window.location.origin}/api/apps/${appId}/functions/r2Video`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `r2Video failed: ${res.status}`);
  }
  return res.json();
}

export async function uploadBlendingDemo(blob, word, lessonId, stepIndex) {
  if (!blob || !lessonId || stepIndex == null) return null;

  const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
  const key = `blending-demos/${word}.${ext}`;
  const presignRes = await invokeR2Video({
    action: 'presign',
    key,
    contentType: blob.type || 'video/webm',
  });
  if (!presignRes?.uploadUrl) throw new Error('No upload URL returned');

  const uploadRes = await fetch(presignRes.uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': blob.type || 'video/webm' },
  });
  if (!uploadRes.ok) throw new Error('Upload to R2 failed');

  await invokeR2Video({
    action: 'save_demo',
    lessonId,
    stepIndex,
    word,
    publicUrl: presignRes.publicUrl,
  });

  return presignRes.publicUrl;
}