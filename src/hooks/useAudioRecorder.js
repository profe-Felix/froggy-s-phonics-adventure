import { useState, useRef, useCallback } from 'react';

/**
 * Shared audio recorder hook with pause/resume/re-record support.
 *
 * Usage:
 *   const { state, startRecording, pauseRecording, resumeRecording, stopRecording, audioUrl, durationMs, reset } = useAudioRecorder();
 *   state: 'idle' | 'recording' | 'paused' | 'stopped'
 */
export default function useAudioRecorder() {
  const [state, setState] = useState('idle'); // idle | recording | paused | stopped
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

  const [elapsed, setElapsed] = useState(0);

  const tickTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setElapsed(accumulatedRef.current + (Date.now() - startTimeRef.current));
    }, 100);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    accumulatedRef.current = 0;
    setElapsed(0);
    setAudioUrl(null);
    blobRef.current = null;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    };

    mr.start(100);
    const now = Date.now();
    startTimeRef.current = now;
    recordingStartWallTimeRef.current = now;
    tickTimer();
    setState('recording');
  }, [tickTimer, stopTimer]);

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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (mediaRecorderRef.current.state === 'paused') {
        // Final accumulated is already saved
      } else {
        accumulatedRef.current += Date.now() - startTimeRef.current;
      }
      mediaRecorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    stopTimer();
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