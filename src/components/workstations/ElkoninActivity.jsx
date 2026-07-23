import { useState, useEffect, useRef } from 'react';
import { markersToPretty } from '@/lib/markers';
import { syllabifyEs } from '@/lib/spanishSyllables';
import { resolveImageForWord, resolveSyllableAudio, resolveWordAudio } from '@/lib/supabaseStorage';

// Student activity: Elkonin boxes. Each syllable has a counter; tap to hear it.
// When every counter has been heard (or marked missing), the reveal button
// uncovers the picture and plays the whole word.
export default function ElkoninActivity({ words, behavior, media, index: controlledIndex, onIndexChange }) {
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

  const word = words[index] || '';
  const hideWord = !!behavior?.hideWord;
  const hideWordUI = !!behavior?.hideWordUI;

  useEffect(() => {
    let cancelled = false;
    const pretty = markersToPretty(word);
    setRevealed(false);
    const syls = syllabifyEs(pretty);
    setSyllables(syls);
    setHeard(new Array(syls.length).fill(false));
    setHasAudio(new Array(syls.length).fill(false));
    syllAudioRefs.current = new Array(syls.length).fill(null);
    wordAudioRef.current = null;

    resolveImageForWord(pretty, media.images).then((url) => { if (!cancelled) setImgUrl(url); });
    resolveWordAudio(pretty, media.wordAudio).then((url) => {
      if (cancelled || !url) return;
      const a = new Audio(url); a.preload = 'auto'; wordAudioRef.current = a;
    });
    syls.forEach((s, i) => {
      resolveSyllableAudio(pretty, s, i, media.syllableAudio).then((url) => {
        if (cancelled) return;
        if (url) {
          const a = new Audio(url); a.preload = 'auto'; syllAudioRefs.current[i] = a;
          setHasAudio((p) => { const n = [...p]; n[i] = true; return n; });
        } else {
          // No audio for this syllable → counts as already heard.
          setHeard((p) => { const n = [...p]; n[i] = true; return n; });
        }
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, rebuildKey]);

  const allHeard = heard.length > 0 && heard.every(Boolean);

  const onCounter = (i) => {
    if (!hasAudio[i]) return;
    const a = syllAudioRefs.current[i];
    if (!a) return;
    try { a.currentTime = 0; } catch {}
    a.play().catch(() => {});
    setHeard((p) => { if (p[i]) return p; const n = [...p]; n[i] = true; return n; });
  };

  const onReveal = () => {
    setRevealed(true);
    const a = wordAudioRef.current;
    if (a) { try { a.currentTime = 0; } catch {}; a.play().catch(() => {}); }
  };

  const go = (d) => setIdx((index + d + words.length) % words.length);
  const showNav = !controlled || !!onIndexChange;

  return (
    <div className="flex-1 flex flex-col items-center p-4 gap-4">
      <div className="w-full max-w-2xl flex items-center gap-2 flex-wrap justify-center">
        {showNav && !hideWordUI && (
          <select
            value={index}
            onChange={(e) => setIdx(+e.target.value)}
            className="px-3 py-2 rounded-lg border font-bold bg-white"
          >
            {words.map((w, i) => (<option key={i} value={i}>{w}</option>))}
          </select>
        )}
        {showNav && <button onClick={() => go(-1)} disabled={words.length <= 1} className="px-3 py-2 rounded-lg border font-bold bg-white disabled:opacity-50">◀</button>}
        {showNav && <button onClick={() => go(1)} disabled={words.length <= 1} className="px-3 py-2 rounded-lg border font-bold bg-white disabled:opacity-50">▶</button>}
        {showNav && <button onClick={() => { setRebuildKey((k) => k + 1); if (controlled) { onIndexChange && onIndexChange(0); } }} className="px-3 py-2 rounded-lg border font-bold bg-white">Reiniciar</button>}
        <button
          onClick={onReveal}
          disabled={!allHeard}
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

        {!hideWord && !hideWordUI && (
          <h2 className="text-center text-2xl font-bold mt-2">{markersToPretty(word)}</h2>
        )}

        <button
          onClick={onReveal}
          disabled={!allHeard}
          className="mt-3 w-full py-3 rounded-xl text-xl font-bold text-white disabled:opacity-40"
          style={{ background: allHeard ? '#2563eb' : '#9ca3af' }}
        >
          Destapar y escuchar
        </button>

        <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${syllables.length}, 1fr)` }}>
          {syllables.map((s, i) => (
            <div key={i} className="min-h-[84px] bg-white border-2 border-gray-900 rounded-lg flex items-center justify-center">
              <button
                onClick={() => onCounter(i)}
                title={`Escuchar: ${s}`}
                className="w-11 h-11 rounded-full border-2 border-gray-900 transition active:scale-95"
                style={{
                  background: !hasAudio[i] ? '#d1d5db' : (heard[i] ? '#10b981' : '#111827'),
                  cursor: hasAudio[i] ? 'pointer' : 'default',
                  opacity: hasAudio[i] ? 1 : 0.55,
                  borderColor: !hasAudio[i] ? '#9ca3af' : (heard[i] ? '#0f9a72' : '#111827'),
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