import { appParams } from '@/lib/app-params';

// Shared upload logic: saves a recording blob to R2 and stores the public URL
// in the Lesson entity's step.config.demos[word]. Used by both the
// BlendingDemoRecorderView (video model step) and the PracticeSubstep
// (teacher "Save model" button on the practice step).
//
// Sends the video as multipart form-data to the r2Video backend function,
// which uploads to R2 server-side (avoids browser CORS on R2) and saves the
// demo URL into the Lesson in one call. Works from any browser without a
// platform login — teachers only need ?role=teacher.
async function invokeR2VideoUpload(blob, word, lessonId, stepIndex) {
  const { appId } = appParams;
  const url = `${window.location.origin}/api/apps/${appId}/functions/r2Video`;
  const form = new FormData();
  form.append('file', blob, `${word}.webm`);
  form.append('lessonId', lessonId);
  form.append('stepIndex', String(stepIndex));
  form.append('word', word);
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `r2Video failed: ${res.status}`);
  }
  return res.json();
}

export async function uploadBlendingDemo(blob, word, lessonId, stepIndex) {
  if (!blob || !lessonId || stepIndex == null) return null;
  const result = await invokeR2VideoUpload(blob, word, lessonId, stepIndex);
  return result?.publicUrl || null;
}