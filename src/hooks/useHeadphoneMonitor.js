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
// HOW IT ROUTES (platform-aware, best-effort)
//   • Desktop Chrome / Edge — AudioContext.setSinkId is supported. We try to
//     bind playback to a specific headphone device so audio goes to the
//     headphones, not desktop speakers. If setSinkId fails (e.g. inside an
//     iframe that blocks speaker-selection) we fall back to the default
//     destination.
//   • Safari / iPadOS / Firefox — setSinkId is unavailable, but it isn't
//     needed: the OS routes audio to headphones whenever they are connected,
//     so audioCtx.destination already goes to the headphones. We connect to
//     the default destination and trust OS routing, with a "Use headphones"
//     reminder. This is exactly what the reference sidetone test does and it
//     works on iPad.
//
// THE GATE
//   Monitoring defaults to OFF and only activates on an explicit "Enable
//   monitoring" tap. Connecting headphones never auto-activates. We never
//   block activation with a hard error — if we can positively detect
//   headphones we bind to them ('verified'); otherwise we still allow
//   activation with a "Use headphones" reminder ('available'). The only
//   hard 'unsupported' state is when enumerateDevices itself is unavailable.
//
// STREAM REUSE
//   attachStream(stream) wires the monitoring graph from an EXISTING
//   MediaStream (the useLiveVoice mic stream, or the recording stream). No
//   duplicate getUserMedia calls. If no stream is attached, monitoring stays
//   off (no mic to play back).

// Headphone-like output labels. Narrow: matches head-worn / ear-worn audio,
// NOT "Built-in Output", "Speakers", or a generic "Bluetooth Speaker".
const HEADPHONE_LABEL_RE = /\b(headphones?|airpods?|earbuds?|earphones?|earpods?|headset|buds)\b/i;

function isHeadphoneLabel(label) {
  if (!label) return false;
  return HEADPHONE_LABEL_RE.test(label);
}

// Feature-detect AudioContext.setSinkId (Chrome/Edge desktop). Everything
// else (Safari/iPad/Firefox) uses the default destination + OS routing.
function detectSinkSupport() {
  if (typeof AudioContext !== 'undefined' &&
      typeof AudioContext.prototype.setSinkId === 'function') {
    return 'audioContext';
  }
  return 'default';
}

// Find a headphone output device. Returns { deviceId, label } | null.
// Requires mic permission already granted so labels are populated.
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
  const enabledRef = useRef(false);
  const volumeRef = useRef(0.3);
  const genRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => { volumeRef.current = monitorVolume; }, [monitorVolume]);

  const teardownGraph = useCallback(() => {
    if (monitorSourceRef.current) { try { monitorSourceRef.current.disconnect(); } catch {} monitorSourceRef.current = null; }
    if (monitorGainRef.current) { try { monitorGainRef.current.disconnect(); } catch {} monitorGainRef.current = null; }
    if (monitorCtxRef.current) { try { monitorCtxRef.current.close(); } catch {} monitorCtxRef.current = null; }
  }, []);

  // Build the monitoring graph from a shared stream. Gain starts at ZERO.
  const buildGraph = useCallback((stream) => {
    teardownGraph();
    if (!stream) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    monitorCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = 0; // muted until explicitly enabled
    source.connect(gain);
    gain.connect(ctx.destination); // OS routes to headphones; setSinkId binds when available
    monitorSourceRef.current = source;
    monitorGainRef.current = gain;
  }, [teardownGraph]);

  // Silent output check (informational — never blocks activation).
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
      } else {
        setOutputStatus('available');
      }
    } catch {
      if (mountedRef.current) setOutputStatus('available');
    }
  }, []);

  const attachStream = useCallback((stream) => {
    streamRef.current = stream;
    if (!stream) return;
    buildGraph(stream);
    checkOutput();
  }, [buildGraph, checkOutput]);

  const detachStream = useCallback(() => {
    streamRef.current = null;
    enabledRef.current = false;
    setMonitoring(false);
    teardownGraph();
  }, [teardownGraph]);

  // Start monitoring (explicit user gesture). Best-effort setSinkId bind;
  // falls back to default destination. Never blocks.
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
      } catch {
        // setSinkId failed (e.g. iframe speaker-selection blocked) — fall back
        // to the default destination. Monitoring still works.
      }
    }
    if (myGen !== genRef.current) return;

    const gain = monitorGainRef.current;
    if (!gain) return;
    const now = ctx.currentTime;
    const v = Math.max(0, Math.min(1, volumeRef.current));
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(v, now + 0.08);
    enabledRef.current = true;
    setMonitoring(true);
    setOutputStatus(bound ? 'verified' : 'available');
  }, []);

  const stop = useCallback(() => {
    genRef.current += 1;
    const gain = monitorGainRef.current;
    const ctx = monitorCtxRef.current;
    if (gain && ctx) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.05);
    }
    enabledRef.current = false;
    setMonitoring(false);
  }, []);

  const setVolume = useCallback((v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setMonitorVolume(clamped);
    volumeRef.current = clamped;
    if (enabledRef.current && monitorGainRef.current && monitorCtxRef.current) {
      const now = monitorCtxRef.current.currentTime;
      monitorGainRef.current.gain.cancelScheduledValues(now);
      monitorGainRef.current.gain.setTargetAtTime(clamped, now, 0.02);
    }
  }, []);

  // devicechange: refresh status (informational). Don't hard-stop — the OS
  // handles rerouting when headphones are unplugged.
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
      enabledRef.current = false;
      teardownGraph();
    };
  }, [teardownGraph]);

  return {
    outputStatus,      // 'idle' | 'checking' | 'verified' | 'available' | 'unsupported'
    monitoring,        // bool — live playback currently active
    monitorVolume,     // 0..1
    checkOutput,       // silent re-check (no playback)
    attachStream,      // (stream) — wire graph from existing mic stream
    detachStream,      // () — recording stopped; mute + teardown
    start,             // () — explicit enable (best-effort route bind)
    stop,              // () — mute + clear enabled
    setVolume,         // (0..1) — monitor gain only
  };
}