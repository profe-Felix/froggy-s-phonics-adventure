import { appParams } from '@/lib/app-params';

// Shared upload logic: saves an audio recording + slider animation data to R2
// and stores both in the Lesson entity's step.config.demos[word].
//
// Uses a BASE64 JSON approach to avoid both CORS issues and multipart crashes:
//   - Audio is small (~50-200KB), so base64 (~70-270KB) fits within the JSON payload limit
//   - No browser CORS issues (audio uploads server-side via the backend function)
//   - No multipart parsing (which was crashing the backend function)
//
// Works from any browser without a platform login — teachers only need ?role=teacher.

const FUNCTION_URL = `${window.location.origin}/api/apps/${appParams.appId}/functions/r2Video`;

async function callR2Video(payload) {
  const res = await fetch(FUNCTION_URL, {
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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      // Remove the data URL prefix (e.g. "data:audio/webm;base64,")
      const base64 = String(result).split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Called by BlendingDemoRecorderView and PracticeSubstep.
// `recording` is { audioBlob, sliderData } from SlideToReadCanvas.
export async function uploadBlendingDemo(recording, word, lessonId, stepIndex) {
  if (!recording || !lessonId || stepIndex == null) return null;
  const { audioBlob, sliderData } = recording;
  if (!audioBlob) return null;

  const contentType = (audioBlob.type || 'audio/webm').split(';')[0];
  const audioBase64 = await blobToBase64(audioBlob);

  const result = await callR2Video({
    action: 'upload_demo_b64',
    lessonId,
    stepIndex,
    word,
    audioBase64,
    contentType,
    sliderData: sliderData || [],
  });

  return result?.audioUrl || null;
}