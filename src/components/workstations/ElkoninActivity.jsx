import { useState, useEffect, useRef } from 'react';
import { markersToPretty } from '@/lib/markers';
import { syllabifyEs } from '@/lib/spanishSyllables';
import { resolveImageForWord, resolveSyllableAudio, resolveWordAudio } from '@/lib/supabaseStorage';
import { playTts } from '@/lib/audio';
import { createElkoninPromptQueue } from '@/lib/literacy/elkoninPromptQueue.mjs';

// Student activity: Elkonin boxes. Each syllable has a counter; tap to hear it.
// When every counter has actually finished playing, the reveal button
// uncovers the picture and plays the whole word.
export default function ElkoninActivity({ words, media, index: controlledIndex, onIndexChange }) {
  const controlled = controlledIndex !== undefined;
  const [localIndex, setLocalIndex] = useState(0);
  const [rebuildKey, setRebuildKey] = useState(0);
  const index = controlled ? (controlledIndex || 0) : localIndex;
  const setIdx = (i) => {
    if (controlled) { onIndexChange && onIndexChange(i); }
    else setLocalIndex(i);
  };
  const [syllables, setSyllables] = useState([]);
  const [heard, setHeard] = useState([]);
  const [hasAudio, setHasAudio] = useState([]);
  const [revealed, setRevealed] = useState(false);
  const [imgUrl, setImgUrl] = useState(null);
  const syllAudioRefs = useRef([]);
  const wordAudioRef = useRef(null);
  const promptRef = useRef(null);
  const [audioError, setAudioError] = useState('');
  const [speaking, setSpeaking] = useState(null);
  const [wordReady, setWordReady] = useState(false);
  const queueRef = useRef(createElkoninPromptQueue());
  const lookupsRef = useRef({ word: Promise.resolve(), syllables: [] });
  const [pendingCounters, setPendingCounters] = useState([]);

  const word = words[index] || '';

  useEffect(() => {
    let cancelled = false;
    queueRef.current.stop();
    queueRef.current = createElkoninPromptQueue();
    setPendingCounters([]);
    const pretty = markersToPretty(word);
    setRevealed(false);
    setImgUrl(null);
    setAudioError('');
    setSpeaking(null);
    setWordReady(false);
    const syls = syllabifyEs(pretty);
    setSyllables(syls);
    setHeard(new Array(syls.length).fill(false));
    setHasAudio(new Array(syls.length).fill(false));
    syllAudioRefs.current = new Array(syls.length).fill(null);
    wordAudioRef.current = null;

    resolveImageForWord(pretty, media.images).then((url) => { if (!cancelled) setImgUrl(url); })
      .catch(() => { if (!cancelled) setImgUrl(null); });
    lookupsRef.current.word = resolveWordAudio(pretty, media.wordAudio).then((url) => {
      if (cancelled) return;
      if (url) { const a = new Audio(url); a.preload = 'auto'; wordAudioRef.current = a; }
      setWordReady(true);
    }).catch(() => { if (!cancelled) setWordReady(true); });
    lookupsRef.current.syllables = syls.map((s, i) =>
      resolveSyllableAudio(pretty, s, i, media.syllableAudio).then((url) => {
        if (cancelled) return;
        if (url) {
          const a = new Audio(url); a.preload = 'auto'; syllAudioRefs.current[i] = a;
        }
        // Missing recordings are playable through TTS, never "already heard".
        setHasAudio((p) => { const n = [...p]; n[i] = true; return n; });
      }).catch(() => {
        if (!cancelled) setHasAudio(p => { const n = [...p]; n[i] = true; return n; });
      })
    );
    return () => {
      cancelled = true;
      queueRef.current.stop();
      promptRef.current?.abort();
      syllAudioRefs.current.forEach(a => a?.pause());
      wordAudioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, index, rebuildKey]);

  const allHeard = heard.length > 0 && heard.every(Boolean);

  const runPrompt = (i = null) => new Promise(resolve => {
    promptRef.current?.abort();
    const owner = new AbortController();
    promptRef.current = owner;
    setAudioError('');
    const settle = value => { clearTimeout(timeout); resolve(value); };
    const timeout = setTimeout(() => { failed(); owner.abort(); }, 45000);
    owner.signal.addEventListener('abort', () => settle(false), { once: true });
    const finished = () => {
      if (owner.signal.aborted || promptRef.current !== owner) return;
      setSpeaking(null);
      if (i !== null) setHeard(p => { const n = [...p]; n[i] = true; return n; });
      settle(true);
    };
    const text = i === null ? markersToPretty(word) : syllables[i];
    const failed = () => {
      if (owner.signal.aborted || promptRef.current !== owner) return;
      setSpeaking(null);
      setAudioError('No se pudo reproducir el audio. Toca para intentarlo otra vez.');
      settle(false);
    };
    const start = async () => {
    // A tap during lookup is retained, not discarded because audio isn't ready.
    await (i === null ? lookupsRef.current.word : lookupsRef.current.syllables[i]);
    if (owner.signal.aborted) return;
    setSpeaking(i === null ? 'word' : i);
    const recording = i === null ? wordAudioRef.current : syllAudioRefs.current[i];
    const fallback = () => playTts(text, 'es', 0.85, '', finished, { signal: owner.signal, onError: failed });
    let started = false;
    try {
      if (recording) {
        let recordingStarted = false;
        recording.currentTime = 0;
        recording.onended = finished;
        recording.onerror = () => {
          if (recordingStarted && !owner.signal.aborted) void fallback().then(ok => { if (!ok) failed(); });
        };
        owner.signal.addEventListener('abort', () => recording.pause(), { once: true });
        await recording.play();
        recordingStarted = true;
        started = true;
      } else started = await fallback();
    } catch { started = await fallback(); }
    if (!started && !owner.signal.aborted) {
      failed();
    }
    };
    void start().catch(failed);
  });

  const playPrompt = (i = null) => {
    const queue = queueRef.current;
    const key = i === null ? 'word' : `syllable:${i}`;
    if (queue.has(key)) return;
    if (i !== null) setPendingCounters(p => [...p, i]);
    void queue.enqueue(key, () => runPrompt(i)).catch(() => {
      if (queueRef.current === queue) setAudioError('No se pudo reproducir el audio. Inténtalo otra vez.');
    }).finally(() => {
      if (queueRef.current === queue && i !== null) {
        setPendingCounters(p => p.filter(counter => counter !== i));
      }
    });
  };

  const onReveal = () => {
    setRevealed(true);
    void playPrompt();
  };

  const go = (d) => setIdx((index + d + words.length) % words.length);
  const showNav = !controlled || !!onIndexChange;

  return (
    <div className="flex-1 flex flex-col items-center p-4 gap-4">
      <div className="w-full max-w-2xl flex items-center gap-2 flex-wrap justify-center">
        {showNav && (
          <select
            aria-label="Elegir número de palabra"
            value={index}
            onChange={(e) => setIdx(+e.target.value)}
            className="px-3 py-2 rounded-lg border font-bold bg-white"
          >
            {words.map((_, i) => (<option key={i} value={i}>Palabra {i + 1}</option>))}
          </select>
        )}
        {showNav && <button onClick={() => go(-1)} disabled={words.length <= 1} className="px-3 py-2 rounded-lg border font-bold bg-white disabled:opacity-50">◀</button>}
        {showNav && <button onClick={() => go(1)} disabled={words.length <= 1} className="px-3 py-2 rounded-lg border font-bold bg-white disabled:opacity-50">▶</button>}
        {showNav && <button onClick={() => { setRebuildKey((k) => k + 1); if (controlled) { onIndexChange && onIndexChange(0); } }} className="px-3 py-2 rounded-lg border font-bold bg-white">Reiniciar</button>}
        <button
          onClick={onReveal}
          disabled={!allHeard || !wordReady}
          className="px-4 py-2 rounded-lg font-bold text-white disabled:opacity-40"
          style={{ background: allHeard ? '#2563eb' : '#9ca3af' }}
        >
          Destapar y escuchar palabra
        </button>
      </div>

      <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <div className="relative border-2 border-gray-900 rounded-xl overflow-hidden" style={{ background: '#fafafa' }}>
          <img
            src={imgUrl || 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="270"><rect width="100%" height="100%" fill="#fafafa"/></svg>')}
            alt=""
            className="block w-full h-[270px] object-contain"
          />
          <div
            className="absolute inset-0 transition-opacity duration-200"
            style={{ background: '#e5e7eb', opacity: revealed ? 0 : 1, pointerEvents: revealed ? 'none' : 'auto' }}
          />
        </div>

        {audioError && <p role="alert" className="text-sm text-red-700 mt-2">{audioError}</p>}

        <button
          onClick={onReveal}
          disabled={!allHeard || !wordReady}
          className="mt-3 w-full py-3 rounded-xl text-xl font-bold text-white disabled:opacity-40"
          style={{ background: allHeard ? '#2563eb' : '#9ca3af' }}
        >
          Destapar y escuchar
        </button>

        <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${syllables.length}, 1fr)` }}>
          {syllables.map((s, i) => (
            <div key={i} className="min-h-[84px] bg-white border-2 border-gray-900 rounded-lg flex items-center justify-center">
              <button
                onClick={() => { void playPrompt(i); }}
                title={`Escuchar sílaba ${i + 1}`}
                aria-label={`Escuchar sílaba ${i + 1}`}
                aria-busy={speaking === i || pendingCounters.includes(i)}
                className="w-11 h-11 rounded-full border-2 border-gray-900 transition active:scale-95"
                style={{
                  background: !hasAudio[i] ? '#d1d5db' : (heard[i] ? '#10b981' : '#111827'),
                  cursor: 'pointer',
                  opacity: 1,
                  borderColor: pendingCounters.includes(i) ? '#f59e0b' : (!hasAudio[i] ? '#9ca3af' : (heard[i] ? '#0f9a72' : '#111827')),
                  boxShadow: pendingCounters.includes(i) ? '0 0 0 3px #fef3c7' : 'none',
                }}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-center mt-3">
          <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="w-[82%] h-6" aria-hidden="true">
            <defs>
              <marker id="sbArrow" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
                <polygon points="0 0, 6 3, 0 6" fill="#111827" />
              </marker>
            </defs>
            <line x1="0" y1="3" x2="100" y2="3" stroke="#111827" strokeWidth="1.2" markerEnd="url(#sbArrow)" />
          </svg>
        </div>
        <p className="text-xs text-gray-500 mt-1 text-center">
          Pulsa cada círculo para escuchar las sílabas. Cuando todos estén escuchados, podrás destapar la imagen.
        </p>
      </div>
    </div>
  );
}