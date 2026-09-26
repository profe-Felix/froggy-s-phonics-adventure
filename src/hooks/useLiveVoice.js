import { useEffect, useRef, useState, useCallback } from 'react';

// Live voice analysis hook — tracks microphone RMS level and voice continuity.
// Continuity rises smoothly when the student is speaking and drops when they pause,
// giving a 0-1 value that can drive visual feedback (ink fill, balloon, etc.).
//
// Ported from the blend-feedback prototypes. Adapted for app-wide use with:
// - Headphone detection (only starts monitoring if headphones are likely connected)
// - Toggle support (caller controls when to start/stop)
// - Frame-level continuity capture for replay

export function useLiveVoice() {
  const [state, setState] = useState('idle'); // idle | requesting | active | denied | error
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [continuity, setContinuity] = useState(0.08);
  const [hasHeardVoice, setHasHeardVoice] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [hasHeadphones, setHasHeadphones] = useState(false);

  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const frameRef = useRef(undefined);
  const continuityRef = useRef(0.08);
  const hasHeardVoiceRef = useRef(false);
  const mountedRef = useRef(true);
  const continuityHistoryRef = useRef([]);

  // Check for headphones by enumerating audio output devices
  const detectHeadphones = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      // If there's more than one audio output, headphones are likely connected
      // (built-in speakers + headphones). On mobile, the presence of a
      // non-default audiooutput usually means headphones/bluetooth.
      const hasMultiple = audioOutputs.length > 1;
      setHasHeadphones(hasMultiple);
      return hasMultiple;
    } catch {
      setHasHeadphones(false);
      return false;
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (frameRef.current !== undefined) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    stopAudio();
    continuityRef.current = 0.08;
    hasHeardVoiceRef.current = false;
    setVoiceLevel(0);
    setContinuity(0.08);
    setHasHeardVoice(false);
    setState('idle');
    continuityHistoryRef.current = [];
  }, [stopAudio]);

  const sampleVoice = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    let sumSquares = 0;
    for (const i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];

    const rms = Math.sqrt(sumSquares / samples.length);
    const normalizedLevel = Math.max(0, Math.min(1, (rms - 0.008) / 0.085));
    const isVoiced = rms > 0.012;
    const target = isVoiced ? 0.42 + normalizedLevel * 0.58 : 0.08;
    const smoothing = target > continuityRef.current ? 0.16 : 0.035;
    continuityRef.current += (target - continuityRef.current) * smoothing;

    if (isVoiced && !hasHeardVoiceRef.current) {
      hasHeardVoiceRef.current = true;
      setHasHeardVoice(true);
    }
    setVoiceLevel(normalizedLevel);
    setContinuity(continuityRef.current);

    // Capture continuity history for replay (timestamped)
    continuityHistoryRef.current.push({
      t: performance.now(),
      c: continuityRef.current,
      v: normalizedLevel,
    });

    frameRef.current = requestAnimationFrame(sampleVoice);
  }, []);

  const start = useCallback(async () => {
    stopAudio();
    setState('requesting');
    setErrorMessage('');
    continuityRef.current = 0.08;
    hasHeardVoiceRef.current = false;
    setContinuity(0.08);
    setHasHeardVoice(false);
    continuityHistoryRef.current = [{ t: performance.now(), c: 0.08, v: 0 }];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextConstructor();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;
      streamRef.current = stream;

      setState('active');
      frameRef.current = requestAnimationFrame(sampleVoice);
      return stream;
    } catch (err) {
      if (!mountedRef.current) return;
      if (err.name === 'NotAllowedError') {
        setState('denied');
        setErrorMessage('Microphone access was blocked');
      } else {
        setState('error');
        setErrorMessage(err.message || 'The microphone could not start');
      }
      return null;
    }
  }, [stopAudio, sampleVoice]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopAudio();
    };
  }, [stopAudio]);

  // Get the continuity history for replay capture
  const getContinuityHistory = useCallback(() => {
    return continuityHistoryRef.current;
  }, []);

  // Clear history (for new recording)
  const clearHistory = useCallback(() => {
    continuityHistoryRef.current = [];
  }, []);

  return {
    state,
    voiceLevel,
    continuity,
    hasHeardVoice,
    errorMessage,
    hasHeadphones,
    start,
    stop,
    detectHeadphones,
    getContinuityHistory,
    clearHistory,
  };
}