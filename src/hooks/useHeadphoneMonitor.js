import { useState, useRef, useEffect, useCallback } from 'react';

// useHeadphoneMonitor — live microphone playback through headphones (sidetone).
//
// "Voice monitoring" = the learner hears their own live microphone while
// reading. It is NOT speech recognition or grading. This hook adds a second
// audio branch (microphone → monitor gain → output) that is completely
// separate from the analyser (balloon/continuity) branch and from the
// MediaRecorder (saved audio). Changing the monitor volume never affects the
// continuity measurement or the recording.
//
// SESSION PERSISTENCE
//   Monitoring is session-based: once enabled it stays on across items. The
//   session intent (on/off) lives in sessionEnabledRef and survives the per-item
//   stream teardown. When a new mic stream attaches, if the session is "on" the
//   graph re-enables automatically — no re-tap needed.
//
// AUTO-ENABLE
//   If headphones are positively detected (label match) AND the student hasn't
//   explicitly decided yet (sessionEnabledRef === null), monitoring turns on by
//   itself. Once the student taps Enable or Stop, their choice is respected for
//   the rest of the session.
//
// ROUTING (platform-aware, best-effort)
//   • Desktop Chrome / Edge — AudioContext.setSinkId binds playback to the
//     headphone device. Falls back to default destination if setSinkId fails
//     (e.g. iframe speaker-selection blocked).
//   • Safari / iPadOS / Firefox — setSinkId unavailable; the OS routes to
//     headphones whenever connected, so audioCtx.destination already goes to
//     the headphones. We connect to the default destination + "Use headphones"
//     reminder.
//
// STREAM REUSE
//   attachStream(stream) wires the graph from an EXISTING MediaStream (the
//   useLiveVoice mic stream, or the recording stream). No duplicate getUserMedia.

const HEADPHONE_LABEL_RE = /\b(headphones?|airpods?|earbuds?|earphones?|earpods?|headset|buds)\b/i;

function isHeadphoneLabel(label) {
  if (!label) return false;
  return HEADPHONE_LABEL_RE.test(label);
}

function detectSinkSupport() {
  if (typeof AudioContext !== 'undefined' &&
      typeof AudioContext.prototype.setSinkId === 'function') {
    return 'audioContext';
  }
  return 'default';
}

async function findHeadphoneOutput() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const real = devices.filter(d => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
  const match = real.find(d => isHeadphoneLabel(d.label));
  return match ? { deviceId: match.deviceId, label: match.label } : null;
}

export function useHeadphoneMonitor() {
  // outputStatus: 'idle' | 'checking' | 'verified' | 'available' | 'unsupported'
  const [outputStatus, setOutputStatus] = useState('idle');
  const [monitoring, setMonitoring] = useState(false);
  const [monitorVolume, setMonitorVolume] = useState(0.3);

  const sinkModeRef = useRef(detectSinkSupport());
  const monitorCtxRef = useRef(null);
  const monitorSourceRef = useRef(null);
  const monitorGainRef = useRef(null);
  const sinkDeviceIdRef = useRef(null);
  const streamRef = useRef(null);
  const volumeRef = useRef(0.3);
  const genRef = useRef(0);
  const mountedRef = useRef(true);
  // Session intent: null = undecided, true = on, false = off. Survives stream
  // teardown so monitoring persists across items without re-tapping.
  const sessionEnabledRef = useRef(null);

  useEffect(() => { volumeRef.current = monitorVolume; }, [monitorVolume]);

  const teardownGraph = useCallback(() => {
    // Disconnect source/gain but KEEP the AudioContext alive across items so
    // it stays resumed. Closing it on every detach would re-create a suspended
    // context that needs a fresh user gesture to resume — that's why monitoring
    // had to be re-enabled each item even though the session intent persisted.
    if (monitorSourceRef.current) { try { monitorSourceRef.current.disconnect(); } catch {} monitorSourceRef.current = null; }
    if (monitorGainRef.current) { try { monitorGainRef.current.disconnect(); } catch {} monitorGainRef.current = null; }
  }, []);

  // Ramp the monitor gain up or down and set the session intent + monitoring flag.
  const setEnabled = useCallback((on) => {
    sessionEnabledRef.current = on;
    const gain = monitorGainRef.current;
    const ctx = monitorCtxRef.current;
    if (on) {
      if (gain && ctx) {
        const now = ctx.currentTime;
        const v = Math.max(0, Math.min(1, volumeRef.current));
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(v, now + 0.08);
      }
      setMonitoring(true);
    } else {
      if (gain && ctx) {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.05);
      }
      setMonitoring(false);
    }
  }, []);

  const buildGraph = useCallback((stream) => {
    // Disconnect any old source/gain, but reuse the AudioContext if it exists
    // so it stays resumed across items (see teardownGraph).
    if (monitorSourceRef.current) { try { monitorSourceRef.current.disconnect(); } catch {} monitorSourceRef.current = null; }
    if (monitorGainRef.current) { try { monitorGainRef.current.disconnect(); } catch {} monitorGainRef.current = null; }
    if (!stream) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!monitorCtxRef.current) monitorCtxRef.current = new AC();
    const ctx = monitorCtxRef.current;
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(ctx.destination);
    monitorSourceRef.current = source;
    monitorGainRef.current = gain;
  }, []);

  // Silent output check (informational). Auto-enables on first headphone detection.
  const checkOutput = useCallback(async () => {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
      setOutputStatus('unsupported');
      return;
    }
    setOutputStatus('checking');
    try {
      const found = await findHeadphoneOutput();
      if (!mountedRef.current) return;
      if (found) {
        sinkDeviceIdRef.current = found.deviceId;
        setOutputStatus('verified');
        // Auto-enable the first time headphones are detected, if the student
        // hasn't explicitly decided yet and a graph exists to play through.
        if (sessionEnabledRef.current === null && monitorGainRef.current) {
          setEnabled(true);
        }
      } else {
        setOutputStatus('available');
      }
    } catch {
      if (mountedRef.current) setOutputStatus('available');
    }
  }, [setEnabled]);

  const attachStream = useCallback(async (stream) => {
    streamRef.current = stream;
    if (!stream) return;
    buildGraph(stream);
    // Make sure the (reused) context is running before restoring the gain,
    // otherwise the ramp is scheduled on a suspended context and stays silent.
    const ctx = monitorCtxRef.current;
    if (ctx && ctx.state === 'suspended') { try { await ctx.resume(); } catch {} }
    // Restore the session: if it was on, re-enable immediately.
    if (sessionEnabledRef.current === true) {
      setEnabled(true);
    } else {
      setMonitoring(false);
    }
    checkOutput();
  }, [buildGraph, setEnabled, checkOutput]);

  // detachStream: tear down the graph but PRESERVE the session intent so
  // monitoring resumes on the next attachStream. No audio plays while detached.
  const detachStream = useCallback(() => {
    streamRef.current = null;
    setMonitoring(false);
    teardownGraph();
  }, [teardownGraph]);

  // Start monitoring (explicit user gesture). Best-effort setSinkId bind.
  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) { setOutputStatus('unsupported'); return; }
    if (!streamRef.current) return;
    genRef.current += 1;
    const myGen = genRef.current;
    const ctx = monitorCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch {} }
    if (myGen !== genRef.current) return;

    let bound = false;
    if (sinkModeRef.current === 'audioContext') {
      try {
        const found = await findHeadphoneOutput();
        if (myGen !== genRef.current) return;
        if (found) {
          sinkDeviceIdRef.current = found.deviceId;
          await ctx.setSinkId(found.deviceId);
          bound = true;
        }
      } catch { /* fall back to default destination */ }
    }
    if (myGen !== genRef.current) return;

    setEnabled(true);
    setOutputStatus(bound ? 'verified' : 'available');
  }, [setEnabled]);

  const stop = useCallback(() => {
    genRef.current += 1;
    setEnabled(false);
  }, [setEnabled]);

  const setVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setMonitorVolume(clamped);
    volumeRef.current = clamped;
    if (sessionEnabledRef.current && monitorGainRef.current && monitorCtxRef.current) {
      const now = monitorCtxRef.current.currentTime;
      monitorGainRef.current.gain.cancelScheduledValues(now);
      monitorGainRef.current.gain.setTargetAtTime(clamped, now, 0.02);
    }
  }, []);

  useEffect(() => {
    const handler = () => { checkOutput(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }, [checkOutput]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      genRef.current += 1;
      teardownGraph();
      if (monitorCtxRef.current) { try { monitorCtxRef.current.close(); } catch {} monitorCtxRef.current = null; }
    };
  }, [teardownGraph]);

  return {
    outputStatus,
    monitoring,
    monitorVolume,
    checkOutput,
    attachStream,
    detachStream,
    start,
    stop,
    setVolume,
  };
}