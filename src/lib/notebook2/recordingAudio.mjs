// Match the stable notebook: ask for microphone access directly in the tap
// handler, then do asynchronous storage/server preparation with the stream held.
export function requestMicrophone(mediaDevices = globalThis.navigator?.mediaDevices) {
  if (!mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot access the microphone. Open this notebook in Safari on an updated iPad and use the secure website address.');
  }
  return mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
}

export function createAudioRecorder(stream, Recorder = globalThis.MediaRecorder) {
  if (!Recorder) throw new Error('Audio recording is not supported. Open this notebook in Safari on an updated iPad.');
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
  const types = candidates.filter(type => {
    try { return Recorder.isTypeSupported?.(type); } catch { return false; }
  });
  let lastError;
  for (const type of [...types, null]) {
    try {
      return new Recorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 64000 });
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('This browser could not start an audio recorder.');
}

export function microphoneMessage(error) {
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)) {
    return 'Microphone access was blocked. Allow Microphone for this website in Safari’s website settings, then tap Record again. If this is a school-managed iPad, its microphone restrictions may need to be checked.';
  }
  if (['NotFoundError', 'DevicesNotFoundError'].includes(error?.name)) return 'No microphone was found. Check the iPad microphone or connected headset, then tap Record again.';
  if (['NotReadableError', 'TrackStartError', 'AbortError'].includes(error?.name)) return 'The microphone could not start. Close other recording or camera apps, then tap Record again.';
  return error?.response?.data?.error || error?.message || 'Recording could not start. Tap Record to try again.';
}
