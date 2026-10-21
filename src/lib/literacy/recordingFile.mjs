export function recordingFile(blob, name = 'fluency-row', FileType = globalThis.File) {
  if (!blob?.size) throw new Error('The recording is empty. Please record again.');
  const mime = (blob.type || 'audio/webm').split(';')[0];
  const extension = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav' }[mime] || 'webm';
  return new FileType([blob], `${name}.${extension}`, { type: mime });
}
