import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Shared audio recorder hook with pause/resume/re-record support.
 *
 * Usage:
 *   const { state, startRecording, pauseRecording, resumeRecording, stopRecording, audioUrl, durationMs, reset } = useAudioRecorder();
 *   state: 'idle' | 'recording' | 'paused' | 'stopped'
 */
export default function useAudioRecorder() {
  const [state, setState] = useState('idle'); // idle | starting | recording | paused | stopped
  const [audioUrl, setAudioUrl] = useState(null);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const startTimeRef = useRef(0);
  const accumulatedRef = useRef(0);
  const timerRef = useRef(null);
  const blobRef = useRef(null);
  const recordingStartWallTimeRef = useRef(0);
  const stopResolveRef = useRef(null);
  // Guards against double-tap: while true, a second startRecording call is
  // ignored so the first stream isn't orphaned (which leaves the mic on).
  const startingRef = useRef(false);
  // Generation counter — bumped on reset/cancel. startRecording captures the
  // value before awaiting getUserMedia and checks it after; if it changed,
  // the start was cancelled (student navigated away) so we abort cleanly.
  const genRef = useRef(0);

  const [elapsed, setElapsed] = useState(0);

  const tickTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setElapsed(accumulatedRef.current + (Date.now() - startTimeRef.current));
    }, 100);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // Tear down any existing stream/recorder so a fresh start never orphans the
  // previous mic (which would keep the Safari tab mic icon on permanently).
  const cleanupExisting = useCallback(() => {
    stopTimer();
    genRef.current += 1; // cancel any in-flight startRecording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* already stopped */ }
    }
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    chunksRef.current = [];
    blobRef.current = null;
  }, [stopTimer]);

  const startRecording = useCallback(async () => {
    // Double-tap guard: if a start is already in flight (mic warming up),
    // ignore the second tap entirely. Returns false so the caller knows the
    // start was skipped and shouldn't fire side effects (laser tracker, etc).
    if (startingRef.current) return false;
    startingRef.current = true;

    // Clean up any leftover stream from a previous/aborted session first.
    cleanupExisting();

    setError(null);
    accumulatedRef.current = 0;
    setElapsed(0);
    setAudioUrl(null);
    blobRef.current = null;
    // Show a "starting" state immediately so the UI can display a warming-up
    // indicator and hide the Record button (preventing further taps).
    setState('starting');

    try {
      const myGen = genRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Cancelled while waiting for mic permission (student navigated away)?
      if (genRef.current !== myGen) {
        stream.getTracks().forEach(t => t.stop());
        startingRef.current = false;
        return false;
      }
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stopTimer();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setDurationMs(accumulatedRef.current);
        setState('stopped');
        streamRef.current?.getTracks().forEach(t => t.stop());
        if (stopResolveRef.current) {
          const resolve = stopResolveRef.current;
          stopResolveRef.current = null;
          resolve(blob);
        }
      };

      mr.start(100);
      const now = Date.now();
      startTimeRef.current = now;
      recordingStartWallTimeRef.current = now;
      tickTimer();
      setState('recording');
      return true;
    } catch (e) {
      // Mic permission denied or hardware error — reset to idle so the
      // student can try again, and re-throw so the caller can show a toast.
      cleanupExisting();
      setState('idle');
      setError(e);
      throw e;
    } finally {
      startingRef.current = false;
    }
  }, [tickTimer, stopTimer, cleanupExisting]);

  // Also return false from the early-cancel path (genRef mismatch).
  // (The return false is implicit from the `return;` above, but let's be
  // explicit for clarity.)

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      accumulatedRef.current += Date.now() - startTimeRef.current;
      stopTimer();
      setState('paused');
    }
  }, [stopTimer]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      startTimeRef.current = Date.now();
      tickTimer();
      setState('recording');
    }
  }, [tickTimer]);

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === 'inactive') return Promise.resolve();
    if (mr.state === 'paused') {
      // Final accumulated is already saved
    } else {
      accumulatedRef.current += Date.now() - startTimeRef.current;
    }
    const p = new Promise((resolve) => { stopResolveRef.current = resolve; });
    mr.stop();
    return p;
  }, []);

  const reset = useCallback(() => {
    stopTimer();
    genRef.current += 1; // cancel any in-flight startRecording
    startingRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* already stopped */ }
    }
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    chunksRef.current = [];
    blobRef.current = null;
    accumulatedRef.current = 0;
    setElapsed(0);
    setAudioUrl(null);
    setDurationMs(0);
    setState('idle');
    setError(null);
  }, [stopTimer]);

  const getBlob = useCallback(() => blobRef.current, []);
  const getRecordingStartTime = useCallback(() => recordingStartWallTimeRef.current, []);

  // Unmount safety: stop the mic if the component unmounts mid-recording.
  // Without this, navigating away while recording leaves the stream active
  // and the Safari tab mic icon stays on permanently.
  useEffect(() => {
    return () => {
      stopTimer();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch { /* already stopped */ }
      }
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [stopTimer]);

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  };

  return {
    state,
    audioUrl,
    durationMs,
    elapsed,
    error,
    formatTime,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    reset,
    getBlob,
    getRecordingStartTime,
  };
}