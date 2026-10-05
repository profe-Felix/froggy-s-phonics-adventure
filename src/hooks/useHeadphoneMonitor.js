import { useState, useRef, useEffect, useCallback } from 'react';

// useHeadphoneMonitor — safe live microphone playback through headphones.
//
// "Voice monitoring" (sidetone) = the learner hears their own live microphone
// while reading. It is NOT speech recognition or grading. This hook adds a
// second audio branch (microphone → monitor gain → output) that is completely
// separate from the analyser (balloon/continuity) branch and from the
// MediaRecorder (saved audio). Changing the monitor volume never affects the
// continuity measurement or the recording.
//
// HOW IT ROUTES (platform-aware)
//   • Desktop Chrome / Edge — AudioContext.setSinkId is supported. We bind
//     playback to a SPECIFIC verified headphone device so audio can never go
//     to the desktop speakers (which would cause feedback).
//   • Firefox — HTMLMediaElement.setSinkId is supported; we route through a
//     MediaStreamDestination → <audio> element and bind that to the headphone
//     device.
//   • Safari / iPadOS — setSinkId is NOT supported, but it isn't needed: iOS
//     routes audio to headphones at the OS level whenever they are connected,
//     so audioCtx.destination already goes to the headphones. We connect to
//     the default destination and trust OS routing, with a "Use headphones"
//     reminder. This is exactly what the reference sidetone test does and it
//     works on iPad.
//
// THE GATE (when monitoring may activate)
//   Monitoring defaults to OFF and only activates when:
//     1. A real (non-default, non-communications) audio output device whose
//        label matches a headphone pattern is visible via enumerateDevices
//        (Chrome/Firefox/iPad when labels are exposed), OR
//     2. setSinkId is unavailable (Safari/iPad) — in that case we cannot
//        positively detect headphones, so we allow activation with an explicit
//        tap and a "Use headphones" reminder, trusting iOS OS routing.
//   On platforms WITH setSinkId, no headphone output → 'not-detected' →
//   blocked (prevents desktop speaker feedback). On platforms WITHOUT
//   setSinkId, status is 'available' and activation is allowed.
//   The monitor gain is held at zero until the learner explicitly taps
//   "Enable monitoring". Connecting headphones never auto-activates.
//
// On headphone disconnect / device change / routing failure / unmount:
// monitoring is muted and the enabled state cleared. A fresh check and
// explicit activation are required before resuming.
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

// Feature-detect the sink-routing API.
// Returns 'audioContext' | 'mediaElement' | 'default'.
//   'audioContext' — AudioContext.setSinkId (Chrome/Edge desktop)
//   'mediaElement' — HTMLMediaElement.setSinkId (Firefox)
//   'default'      — neither (Safari/iPadOS); rely on OS-level routing
function detectSinkSupport() {
  if (typeof AudioContext !== 'undefined' &&
      typeof AudioContext.prototype.setSinkId === 'function') {
    return 'audioContext';
  }
  if (typeof HTMLMediaElement !== 'undefined' &&
      typeof HTMLMediaElement.prototype.setSinkId === 'function') {
    return 'mediaElement';
  }
  return 'default';
}

// Find a verified headphone output device. Returns { deviceId, label } | null.
// Requires mic permission already granted so labels are populated (the
// recording/voice hook owns the permission prompt; this step is silent).
async function findHeadphoneOutput() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const outputs = devices.filter(d => d.kind === 'audiooutput');
  // Real devices only — skip the 'default' / 'communications' pseudo-IDs.
  const real = outputs.filter(d => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
  // Headphone-like label required. Empty labels (no permission yet) → no match.
  const match = real.find(d => isHeadphoneLabel(d.label));
  return match ? { deviceId: match.deviceId, label: match.label } : null;
}

// Whether any real (non-default) audio output is visible at all. Used to tell
// "no real devices visible yet (no permission)" from "real devices but none
// are headphones".
async function hasAnyRealOutput() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const real = devices.filter(d => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
  return real.length > 0;
}

export function useHeadphoneMonitor() {
  // outputStatus: 'idle' | 'checking' | 'verified' | 'available' | 'not-detected' | 'unsupported' | 'error'
  const [outputStatus, setOutputStatus] = useState('idle');
  const [monitoring, setMonitoring] = useState(false);
  const [monitorVolume, setMonitorVolume] = useState(0.3);

  const sinkModeRef = useRef(detectSinkSupport());
  const monitorCtxRef = useRef(null);
  const monitorSourceRef = useRef(null);
  const monitorGainRef = useRef(null);
  const monitorDestRef = useRef(null);     // MediaStreamAudioDestinationNode (mediaElement mode)
  const monitorElRef = useRef(null);       // <audio> element (mediaElement mode)
  const sinkDeviceIdRef = useRef(null);
  const streamRef = useRef(null);
  const enabledRef = useRef(false);
  const volumeRef = useRef(0.3);
  const genRef = useRef(0);                 // cancels in-flight start() on stop/unmount
  const mountedRef = useRef(true);

  useEffect(() => { volumeRef.current = monitorVolume; }, [monitorVolume]);

  // ── Tear down the monitoring audio graph (keeps nothing connected). ──
  const teardownGraph = useCallback(() => {
    if (monitorSourceRef.current) {
      try { monitorSourceRef.current.disconnect(); } catch {}
      monitorSourceRef.current = null;
    }
    if (monitorGainRef.current) {
      try { monitorGainRef.current.disconnect(); } catch {}
      monitorGainRef.current = null;
    }
    if (monitorDestRef.current) {
      try { monitorDestRef.current.disconnect(); } catch {}
      monitorDestRef.current = null;
    }
    if (monitorElRef.current) {
      try { monitorElRef.current.pause(); } catch {}
      monitorElRef.current.srcObject = null;
      monitorElRef.current = null;
    }
    if (monitorCtxRef.current) {
      try { monitorCtxRef.current.close(); } catch {}
      monitorCtxRef.current = null;
    }
  }, []);

  // ── Build the monitoring graph from a shared stream. ──
  // Gain starts at ZERO. Nothing is heard until start() ramps it up.
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
    monitorSourceRef.current = source;
    monitorGainRef.current = gain;

    const mode = sinkModeRef.current;
    if (mode === 'mediaElement') {
      // gain → MediaStreamDestination → <audio>; routing via el.setSinkId.
      const dest = ctx.createMediaStreamDestination();
      gain.connect(dest);
      monitorDestRef.current = dest;
      const el = new Audio();
      el.srcObject = dest.stream;
      el.muted = false; // actual level controlled by the gain node
      monitorElRef.current = el;
    } else {
      // 'audioContext' and 'default' both play through ctx.destination.
      // On 'audioContext' we additionally call ctx.setSinkId on start().
      // On 'default' (Safari/iPad) iOS routes ctx.destination to headphones.
      gain.connect(ctx.destination);
    }
  }, [teardownGraph]);

  // ── Silent output check: enumerate + find headphone output. ──
  // Does NOT activate playback. Updates outputStatus only.
  const checkOutput = useCallback(async () => {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
      setOutputStatus('unsupported');
      return;
    }
    setOutputStatus('checking');
    try {
      const found = await findHeadphoneOutput();
      if (!mountedRef.current) return;
      const mode = sinkModeRef.current;
      if (found) {
        sinkDeviceIdRef.current = found.deviceId;
        setOutputStatus('verified');
      } else if (mode === 'default') {
        // Safari/iPad: setSinkId unavailable and we can't positively detect
        // headphones (iOS often doesn't expose output labels). Allow
        // activation with an explicit tap + "Use headphones" reminder,
        // trusting iOS OS-level routing to headphones.
        setOutputStatus('available');
      } else {
        // setSinkId available but no headphone output found.
        const any = await hasAnyRealOutput();
        if (!mountedRef.current) return;
        setOutputStatus(any ? 'not-detected' : 'checking');
      }
    } catch {
      if (mountedRef.current) setOutputStatus('error');
    }
  }, []);

  // ── Attach a shared mic stream (reuse — no new getUserMedia). ──
  const attachStream = useCallback((stream) => {
    streamRef.current = stream;
    if (!stream) return;
    // (Re)build the graph so it reads from the current stream. Gain stays 0.
    buildGraph(stream);
    // Re-check now that mic permission has likely been granted (labels
    // become visible), so we can verify headphones.
    checkOutput();
  }, [buildGraph, checkOutput]);

  // ── Detach the stream (recording stopped). Mutes & clears monitoring. ──
  const detachStream = useCallback(() => {
    streamRef.current = null;
    enabledRef.current = false;
    setMonitoring(false);
    teardownGraph();
  }, [teardownGraph]);

  // ── Internal: route to the verified device (if setSinkId) and ramp gain. ──
  const routeAndEnable = useCallback(async () => {
    const myGen = genRef.current;
    const ctx = monitorCtxRef.current;
    if (!ctx || !streamRef.current) return false;

    // Resume from this user gesture.
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch {}
    }
    if (myGen !== genRef.current) return false;

    const mode = sinkModeRef.current;

    if (mode === 'audioContext' || mode === 'mediaElement') {
      // Revalidate the headphone route — it may have changed.
      const found = await findHeadphoneOutput();
      if (myGen !== genRef.current) return false;
      if (!found) return false; // headphones no longer present → do NOT enable
      sinkDeviceIdRef.current = found.deviceId;
      try {
        if (mode === 'audioContext') {
          await ctx.setSinkId(found.deviceId);
        } else {
          const el = monitorElRef.current;
          if (!el) return false;
          await el.setSinkId(found.deviceId);
          await el.play().catch(() => {});
        }
      } catch {
        return false; // routing failed — do NOT enable
      }
      if (myGen !== genRef.current) return false;
    }
    // 'default' mode (Safari/iPad): no setSinkId, no positive detection —
    // connect to ctx.destination and trust iOS OS routing. Headphone reminder
    // is shown in the panel.

    // Ramp gain to the conservative volume.
    const gain = monitorGainRef.current;
    if (!gain) return false;
    const now = ctx.currentTime;
    const v = Math.max(0, Math.min(1, volumeRef.current));
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(v, now + 0.08);
    return true;
  }, []);

  // ── Start monitoring (explicit user gesture). ──
  // Revalidates the route (where detectable) before any sound is heard.
  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) { setOutputStatus('unsupported'); return; }
    if (!streamRef.current) return; // no mic stream to monitor
    genRef.current += 1; // cancel any previous in-flight start
    const myGen = genRef.current;
    setOutputStatus('checking');
    const ok = await routeAndEnable();
    if (!mountedRef.current) return;
    if (myGen !== genRef.current) return; // a later stop/start superseded us
    if (ok) {
      enabledRef.current = true;
      setMonitoring(true);
      // Set an honest post-enable status.
      const mode = sinkModeRef.current;
      if (mode === 'default') {
        setOutputStatus('available');
      } else {
        setOutputStatus('verified');
      }
    } else {
      enabledRef.current = false;
      setMonitoring(false);
      const found = await findHeadphoneOutput().catch(() => null);
      if (!mountedRef.current) return;
      const mode = sinkModeRef.current;
      if (mode === 'default') {
        setOutputStatus('available');
      } else {
        setOutputStatus(found ? 'error' : 'not-detected');
      }
    }
  }, [routeAndEnable]);

  // ── Stop monitoring: ramp gain to 0, clear enabled state. ──
  // Does NOT stop the shared stream tracks (recording/analyser still own them).
  const stop = useCallback(() => {
    genRef.current += 1; // cancel any in-flight start
    const gain = monitorGainRef.current;
    const ctx = monitorCtxRef.current;
    if (gain && ctx) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.05);
    }
    if (monitorElRef.current) { try { monitorElRef.current.pause(); } catch {} }
    enabledRef.current = false;
    setMonitoring(false);
  }, []);

  // ── Volume control (affects monitor gain ONLY). ──
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

  // ── devicechange: re-check; if monitoring active and route lost, stop. ──
  useEffect(() => {
    const handler = async () => {
      const mode = sinkModeRef.current;
      if (!enabledRef.current) {
        checkOutput();
        return;
      }
      // Monitoring is active.
      if (mode === 'default') {
        // Can't positively detect on Safari/iPad — just refresh status.
        checkOutput();
        return;
      }
      // setSinkId path: revalidate the route.
      const found = await findHeadphoneOutput().catch(() => null);
      if (!mountedRef.current) return;
      if (!found) {
        // Headphones gone — mute immediately, no speaker fallback.
        stop();
        setOutputStatus('not-detected');
      } else {
        sinkDeviceIdRef.current = found.deviceId;
        setOutputStatus('verified');
      }
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }, [checkOutput, stop]);

  // ── Unmount: cancel everything and tear down. ──
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
    outputStatus,      // 'idle' | 'checking' | 'verified' | 'available' | 'not-detected' | 'unsupported' | 'error'
    monitoring,        // bool — live playback currently active
    monitorVolume,     // 0..1
    sinkSupported: sinkModeRef.current !== 'default',
    checkOutput,       // silent re-check (no playback)
    attachStream,      // (stream) — wire graph from existing mic stream
    detachStream,      // () — recording stopped; mute + teardown
    start,             // () — explicit enable (revalidates where possible)
    stop,              // () — mute + clear enabled
    setVolume,         // (0..1) — monitor gain only
  };
}