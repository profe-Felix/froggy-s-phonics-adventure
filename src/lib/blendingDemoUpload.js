import { appParams } from '@/lib/app-params';

// Shared upload logic: saves an audio recording + slider animation data to R2
// and stores both in the Lesson entity's step.config.demos[word].
//
// Uses a playback system (audio + slider keyframes) instead of video files:
//   - Audio is tiny (a few seconds = ~50-200KB) so it fits through the backend
//     function payload limit (video was too large → 500 errors).
//   - Slider data is a small JSON array of {t, x, line} keyframes.
//   - No browser CORS issues (audio uploads server-side via the backend function).
//
// Sends audio + sliderData as multipart form-data to the r2Video backend function,
// which uploads to R2 and saves into the Lesson in one call. Works from any
// browser without a platform login — teachers only need ?role=teacher.
async function invokeR2VideoUpload(audioBlob, sliderData, word, lessonId, stepIndex) {
  const { appId } = appParams;
  const url = `${window.location.origin}/api/apps/${appId}/functions/r2Video`;
  const form = new FormData();
  form.append('file', audioBlob, `${word}.webm`);
  form.append('lessonId', lessonId);
  form.append('stepIndex', String(stepIndex));
  form.append('word', word);
  form.append('sliderData', JSON.stringify(sliderData || []));
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `r2Video failed: ${res.status}`);
  }
  return res.json();
}

// Called by BlendingDemoRecorderView and PracticeSubstep.
// `recording` is { audioBlob, sliderData } from SlideToReadCanvas.
export async function uploadBlendingDemo(recording, word, lessonId, stepIndex) {
  if (!recording || !lessonId || stepIndex == null) return null;
  const { audioBlob, sliderData } = recording;
  if (!audioBlob) return null;
  const result = await invokeR2VideoUpload(audioBlob, sliderData, word, lessonId, stepIndex);
  return result?.audioUrl || null;
}