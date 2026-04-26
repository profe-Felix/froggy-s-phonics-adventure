import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

// ─── Constants ────────────────────────────────────────────────────────────────
const SUPABASE_PRESETS_URL =
  'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/wordbuilder/presets.json';

const DEFAULT_LETTERS = ['a','e','i','o','u'];
const DEFAULT_SYLL    = ['ma','me','mi','mo','mu'];
const DEFAULT_WORDS   = [];
const DEFAULT_PUNC    = ['¿','?','¡','!',',','.'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseList(raw) {
  if (!raw) return null;
  const lo = raw.toLowerCase();
  if (['','off','false','0','none'].includes(lo)) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function createTile(type, value) {
  return { id: Math.random().toString(36).slice(2), type, value };
}

function buildConfigFromParams(sp) {
  return {
    letters:   parseList(sp.get('letters'))   ?? DEFAULT_LETTERS,
    syllables: parseList(sp.get('syll'))       ?? DEFAULT_SYLL,
    words:     parseList(sp.get('words'))      ?? DEFAULT_WORDS,
    punc:      parseList(sp.get('punc'))       ?? DEFAULT_PUNC,
    images:    parseList(sp.get('imgs'))       ?? [],
    answers:   sp.get('answers') ? sp.get('answers').split('|').map(s => s.trim()) : null,
    numProblems: parseInt(sp.get('rows')) || parseInt(sp.get('problems')) || 1,
    trayColumns: parseInt(sp.get('cols')) || 0,
    toggles: {
      space:  !['0','off','false'].includes((sp.get('space')||'').toLowerCase()),
      caps:   !['0','off','false'].includes((sp.get('caps')||'').toLowerCase()),
      accent: !['0','off','false'].includes((sp.get('accent')||'').toLowerCase()),
      punc:   !['0','off','false'].includes((sp.get('punc')||'').toLowerCase()),
      images: !['0','off','false'].includes((sp.get('imgs')||'').toLowerCase()),
      write:  ['1','on','true'].includes((sp.get('write')||'').toLowerCase()),
    },
    prefillProblems: null,
    isStudent: sp.has('student'),
    presetId: sp.get('preset') || null,
  };
}

// ─── Preset loader ────────────────────────────────────────────────────────────
function usePreset(searchParams) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const presetId = searchParams.get('preset');
    if (!presetId) {
      setConfig(buildConfigFromParams(searchParams));
      return;
    }

    setLoading(true);

    fetch(SUPABASE_PRESETS_URL, { cache: 'no-store' })
      .then(r => r.json())
      .then(all => {
        const preset = all[presetId];

        if (!preset?.content) {
          setConfig(buildConfigFromParams(searchParams));
          return;
        }

        const c = preset.content;

        setConfig({
          letters:     c.letters   ?? parseList(searchParams.get('letters'))   ?? DEFAULT_LETTERS,
          syllables:   c.syllables ?? parseList(searchParams.get('syll'))       ?? DEFAULT_SYLL,
          words:       c.words     ?? parseList(searchParams.get('words'))      ?? DEFAULT_WORDS,
          punc:        c.punc      ?? parseList(searchParams.get('punc'))       ?? DEFAULT_PUNC,
          images:      c.images    ?? parseList(searchParams.get('imgs'))       ?? [],
          answers:     c.answers   ?? null,
          numProblems: c.rows ?? c.problems ?? (parseInt(searchParams.get('rows')) || 1),
          trayColumns: c.cols ?? c.trayColumns ?? (parseInt(searchParams.get('cols')) || 0),
          toggles: {
            space:  c.toggles?.space  !== false,
            caps:   c.toggles?.caps   !== false,
            accent: c.toggles?.accent !== false,
            punc:   c.toggles?.punc   !== false,
            images: c.toggles?.images !== false,
            write:  c.toggles?.write  === true,
          },
          prefillProblems: c.prefillRows ?? c.prefillProblems ?? null,
          isStudent: searchParams.has('student'),
          presetId,
        });
      })
      .catch(() => setConfig(buildConfigFromParams(searchParams)))
      .finally(() => setLoading(false));
  }, [searchParams.toString()]);

  return { config, loading };
}

// ─── Parse a prefill string into tiles ───────────────────────────────────────
function parsePrefillString(str, punc) {
  if (!str) return [];

  const out = [];
  let buf = '';

  for (const ch of [...str.replace(/ /g, '_')]) {
    if (ch === '_') {
      if (buf) {
        out.push(createTile('text', buf));
        buf = '';
      }
      out.push(createTile('space', ' '));
    } else if (punc.includes(ch)) {
      if (buf) {
        out.push(createTile('text', buf));
        buf = '';
      }
      out.push(createTile('punc', ch));
    } else {
      buf += ch;
    }
  }

  if (buf) out.push(createTile('text', buf));
  return out;
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
function launchConfetti() {
  const end = Date.now() + 1200;

  (function frame() {
    if (Date.now() > end) return;

    for (let i = 0; i < 5; i++) {
      const el = document.createElement('div');
      el.style.cssText =
        `position:fixed;left:${Math.random()*100}vw;top:-10px;width:9px;height:9px;background:hsl(${Math.random()*360},90%,60%);border-radius:50%;opacity:.9;z-index:9999;pointer-events:none`;

      document.body.appendChild(el);

      const a = el.animate(
        [
          { transform:'translateY(0)', opacity:1 },
          { transform:`translateY(${window.innerHeight+120}px)`, opacity:0 }
        ],
        { duration:700+Math.random()*500, easing:'ease-in' }
      );

      a.onfinish = () => el.remove();
    }

    requestAnimationFrame(frame);
  })();
}

// ─── Tray tile ────────────────────────────────────────────────────────────────
function TrayTile({
  tile,
  onDragStart,
  onTap,
  activeProblem,
  problems,
  onDropIntoProblem,
  onTapReplace
}) {
  const handleTap = () => {
    if (onTapReplace) {
      onTapReplace(tile);
    } else if (onTap) {
      onTap(tile);
    } else if (
      activeProblem !== null &&
      problems &&
      problems[activeProblem] &&
      onDropIntoProblem
    ) {
      const clone = { ...tile, id: Math.random().toString(36).slice(2) };
      onDropIntoProblem(activeProblem, problems[activeProblem].length, clone);
    }
  };

  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        onDragStart(tile);
      }}
      onClick={handleTap}
      className="select-none cursor-grab active:cursor-grabbing rounded-xl border-2 border-gray-800 bg-white flex items-center justify-center font-bold text-xl min-w-[44px] h-11 px-3 hover:bg-indigo-50 shadow-sm transition-colors"
      style={{ fontFamily: 'Andika, system-ui, sans-serif' }}
      title="Arrastra para mover o haz clic para colocar"
    >
      {tile.type === 'space' ? (
        <span className="w-5 h-0.5 bg-gray-400 block rounded pointer-events-none" />
      ) : tile.type === 'img' ? (
        <img
          src={tile.value}
          alt=""
          className="max-h-9 max-w-[80px] object-contain pointer-events-none"
        />
      ) : (
        tile.value
      )}
    </button>
  );
}
// ─── WriteTile in tray ────────────────────────────────────────────────────────
function WriteTile({
  dragRef,
  activeProblem,
  problems,
  onDropIntoProblem
}) {
  const [input, setInput] = useState('');
  const [tiles, setTiles] = useState([]);
  const inputRef = useRef(null);

  const handleAddWord = () => {
    if (!input.trim()) return;

    const newTile = createTile('text', input.trim());
    setTiles(prev => [...prev, newTile]);
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddWord();
    }
  };

  const handleDragStart = (e, tile) => {
    e.dataTransfer.effectAllowed = 'copy';
    dragRef.current = {
      tile: { ...tile, id: Math.random().toString(36).slice(2) },
      fromProblem: null
    };
  };

  const handleTileTap = (tile) => {
    if (activeProblem !== null && problems && problems[activeProblem]) {
      const clone = { ...tile, id: Math.random().toString(36).slice(2) };
      onDropIntoProblem(activeProblem, problems[activeProblem].length, clone);
    }
  };

  const handleRemoveTile = (idx) => {
    setTiles(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="escribe…"
          className="border-2 border-indigo-400 bg-indigo-50 rounded-xl px-2 h-11 outline-none font-bold text-base flex-1"
          onPointerDown={e => e.stopPropagation()}
        />

        <button
          onClick={handleAddWord}
          className="bg-indigo-600 text-white rounded-xl px-3 h-11 font-bold text-sm hover:bg-indigo-700 transition-colors shrink-0"
        >
          +
        </button>
      </div>

      {tiles.length > 0 && (
        <div className="flex flex-wrap gap-2 bg-indigo-50 rounded-xl p-2 border border-indigo-200">
          {tiles.map((t, idx) => (
            <button
              key={t.id}
              draggable
              onDragStart={(e) => handleDragStart(e, t)}
              onClick={() => handleTileTap(t)}
              onContextMenu={(e) => {
                e.preventDefault();
                handleRemoveTile(idx);
              }}
              className="rounded-xl border-2 border-gray-800 bg-white flex items-center justify-center font-bold text-base px-3 h-10 hover:bg-indigo-50 shadow-sm transition-colors cursor-grab active:cursor-grabbing"
              style={{ fontFamily: 'Andika, system-ui, sans-serif' }}
              title="Arrastra para mover o haz clic para colocar en el problema activo"
            >
              {t.value}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tool tiles ───────────────────────────────────────────────────────────────
function ToolTile({ label, title, dragRef, tileType, tileValue }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        dragRef.current = {
          tile: createTile(tileType, tileValue),
          fromProblem: null
        };
      }}
      title={title}
      className="cursor-grab rounded-xl border-2 border-gray-400 bg-gray-50 flex items-center justify-center w-11 h-11 text-lg font-black hover:bg-gray-100 select-none"
    >
      {label}
    </div>
  );
}

// ─── Palette card ─────────────────────────────────────────────────────────────
function PaletteCard({ title, cols, children }) {
  const gridStyle = cols > 0
    ? {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: '6px'
      }
    : {};

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm">
      <h2 className="text-sm font-black text-gray-600 mb-2 uppercase tracking-wide">
        {title}
      </h2>

      {cols > 0 ? (
        <div style={gridStyle}>{children}</div>
      ) : (
        <div className="flex flex-wrap gap-2">{children}</div>
      )}
    </div>
  );
}

// ─── Problem drop zone ────────────────────────────────────────────────────────
function ProblemZone({
  index,
  tiles,
  state,
  showResult,
  dragRef,
  hoverProblem,
  setHoverProblem,
  hoverIdx,
  setHoverIdx,
  accentCharIdx,
  setAccentCharIdx,
  swapMode,
  pendingRemove,
  setPendingRemove,
  onDrop,
  onTileDragStart,
  onRemoveTile,
  isActive,
  onActivate
}) {
  const ref = useRef(null);

  const clearHover = () => {
    setHoverProblem(null);
    setHoverIdx(null);
    setAccentCharIdx(null);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const d = dragRef.current;

    if (!d) {
      clearHover();
      return;
    }

    const children = [
      ...(ref.current?.querySelectorAll('[data-slottile]') || [])
    ];

    // Tools: highlight the tile being modified.
    // Accent tool also targets ONE vowel inside that tile.
    if (d.tile?.type === 'captool' || d.tile?.type === 'accenttool') {
      let hoveredIdx = null;
      let charIdx = null;

      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();

        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom &&
          (tiles[i]?.type === 'text' || tiles[i]?.type === 'write')
        ) {
          hoveredIdx = i;

          // Only accent tool needs a character target.
          if (d.tile?.type === 'accenttool') {
            const text = String(tiles[i]?.value || '');
            const chars = [...text];

            const vowelIndexes = chars
              .map((ch, idx) =>
                /[aeiouAEIOUáéíóúÁÉÍÓÚ]/.test(ch) ? idx : -1
              )
              .filter(idx => idx !== -1);

            if (vowelIndexes.length > 0) {
              const relativeX = Math.max(
                0,
                Math.min(rect.width, e.clientX - rect.left)
              );

              const approxIdx = Math.round(
                (relativeX / Math.max(rect.width, 1)) * (chars.length - 1)
              );

              charIdx = vowelIndexes.reduce((best, idx) => {
                return Math.abs(idx - approxIdx) < Math.abs(best - approxIdx)
                  ? idx
                  : best;
              }, vowelIndexes[0]);
            }
          }

          break;
        }
      }

      setHoverProblem(index);
      setHoverIdx(hoveredIdx);
      setAccentCharIdx(charIdx);
      return;
    }

    // Replace selected tile.
    if (pendingRemove !== null && d.fromProblem === null) {
      const targetIdx = tiles.findIndex(t => t.id === pendingRemove);
      setHoverProblem(index);
      setHoverIdx(targetIdx >= 0 ? targetIdx : null);
      return;
    }

    // Normal insert: calculate insert index.
    let insertIdx = tiles.length;

    if (children.length > 0) {
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        const midX = rect.left + rect.width / 2;

        // Same visual row and pointer is before this tile midpoint.
        if (
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom &&
          e.clientX < midX
        ) {
          insertIdx = i;
          break;
        }
      }
    }

    setHoverProblem(index);
    setHoverIdx(insertIdx);
  };

  const onDragLeave = (e) => {
    if (!ref.current?.contains(e.relatedTarget)) {
      clearHover();
    }
  };

  const onDrop_ = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const dropIdx =
      hoverProblem === index && hoverIdx !== null
        ? hoverIdx
        : -1;

    clearHover();
    onDrop(dropIdx);
    setPendingRemove(null);
  };

  let border = 'border-gray-300';
  let ring = '';

  if (showResult) {
    if (state === 'correct') {
      border = 'border-green-500';
      ring = 'ring-2 ring-green-400';
    } else if (state === 'incorrect') {
      border = 'border-red-500';
      ring = 'ring-2 ring-red-400';
    } else if (state === 'unanswered') {
      border = 'border-gray-300 border-dashed';
    }
  }

  const showHoverHere = hoverProblem === index;

  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-400 font-bold text-sm mt-3 w-5 shrink-0 text-right">
        {index + 1}.
      </span>

      <div
        ref={ref}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop_}
        onClick={() => onActivate(isActive ? null : index)}
        className={`flex-1 relative bg-white border-2 rounded-xl flex flex-wrap items-center min-h-[56px] px-3 py-2 gap-0 transition-all cursor-pointer ${
          isActive ? 'ring-2 ring-blue-400' : ''
        } ${border} ${ring}`}
      >
        {tiles.length === 0 && (
          <span className="text-gray-300 text-sm select-none pointer-events-none">
            Arrastra aquí…
          </span>
        )}

        {tiles.map((tile, i) => (
          <React.Fragment key={tile.id}>
            {showHoverHere &&
              hoverIdx === i &&
              hoverIdx !== null &&
              pendingRemove === null &&
              dragRef.current?.tile?.type !== 'captool' &&
              dragRef.current?.tile?.type !== 'accenttool' && (
                <div
                  className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 min-h-12 flex items-center"
                  style={{
                    minWidth:
                      dragRef.current?.tile?.type === 'text'
                        ? `${Math.max(String(dragRef.current.tile.value || '').length * 1.1, 3)}ch`
                        : '2rem'
                  }}
                />
              )}

            <InlineTile
              tile={tile}
              tileIdx={i}
              onDragStart={() => onTileDragStart(i, tile)}
              pendingRemove={pendingRemove}
              replaceIdx={showHoverHere ? hoverIdx : null}
              toolHover={
                showHoverHere &&
                (dragRef.current?.tile?.type === 'captool' ||
                  dragRef.current?.tile?.type === 'accenttool')
                  ? hoverIdx
                  : null
              }
              accentCharIdx={
                showHoverHere &&
                dragRef.current?.tile?.type === 'accenttool' &&
                hoverIdx === i
                  ? accentCharIdx
                  : null
              }
              swapMode={swapMode}
              onTap={() => {
                if (pendingRemove === tile.id) {
                  if (swapMode) {
                    onRemoveTile(i);
                    setPendingRemove(null);
                  } else {
                    setPendingRemove(null);
                  }
                } else {
                  setPendingRemove(tile.id);
                }
              }}
            />
          </React.Fragment>
        ))}

        {showHoverHere &&
          hoverIdx === tiles.length &&
          hoverIdx !== null &&
          pendingRemove === null &&
          dragRef.current?.tile?.type !== 'captool' &&
          dragRef.current?.tile?.type !== 'accenttool' && (
            <div
              className="rounded-lg border-2 border-dashed border-blue-400 bg-blue-50 px-1 py-0.5 h-12 flex items-center justify-center"
              style={{
                minWidth:
                  dragRef.current?.tile?.type === 'text'
                    ? `${Math.max(String(dragRef.current.tile.value || '').length * 1.1, 3)}ch`
                    : '2rem',
                fontSize: '0.75rem',
                color: '#60a5fa',
                fontWeight: 'bold'
              }}
            >
              ↓
            </div>
          )}
      </div>
    </div>
  );
}

function InlineTile({
  tile,
  onDragStart,
  pendingRemove,
  replaceIdx,
  tileIdx,
  onTap,
  swapMode,
  toolHover,
  accentCharIdx
}) {
  const isSelected = pendingRemove === tile.id;
  const isToolHighlight = toolHover === tileIdx;

  if (tile.type === 'space') {
    let bg = 'transparent';

    if (isSelected) {
      bg = swapMode
        ? 'rgba(156,163,175,0.25)'
        : 'rgba(239,68,68,0.15)';
    }

    if (isToolHighlight) {
      bg = 'rgba(59,130,246,0.20)';
    }

    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTap();
        }}
        data-slottile
        title={swapMode ? 'Tap again to delete' : 'Tap to replace'}
        className="inline-block transition-colors"
        style={{
          width: '0.55em',
          height: '1.5em',
          verticalAlign: 'baseline',
          flexShrink: 0,
          background: bg,
          borderRadius: '3px',
          border: isToolHighlight ? '1px solid #3b82f6' : 'none',
          cursor: 'pointer',
          padding: 0,
          margin: 0
        }}
      />
    );
  }

  if (tile.type === 'write' || tile.type === 'text' || tile.type === 'punc') {
    let color = '#1f2937';
    let bg = 'transparent';
    let outline = 'none';

    if (isSelected) {
      color = swapMode ? '#9ca3af' : '#ef4444';
      bg = swapMode ? 'rgba(156,163,175,0.15)' : 'rgba(239,68,68,0.10)';
    }

    if (isToolHighlight) {
      bg = 'rgba(59,130,246,0.20)';
      color = '#1d4ed8';
      outline = '2px solid rgba(59,130,246,0.55)';
    }

    const displayText =
      accentCharIdx !== null && tile.type === 'text'
        ? [...String(tile.value || '')].map((ch, idx) => (
            <span
              key={idx}
              style={{
                color: idx === accentCharIdx ? '#dc2626' : 'inherit',
                background:
                  idx === accentCharIdx
                    ? 'rgba(220,38,38,0.15)'
                    : 'transparent',
                borderRadius: idx === accentCharIdx ? '4px' : 0,
                padding: idx === accentCharIdx ? '0 1px' : 0
              }}
            >
              {ch}
            </span>
          ))
        : tile.value;

    return (
      <button
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          onDragStart();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onTap();
        }}
        data-slottile
        className="font-bold transition-colors cursor-grab active:cursor-grabbing rounded"
        style={{
          background: bg,
          outline,
          border: 'none',
          padding: 0,
          margin: 0,
          font: 'inherit',
          color,
          fontSize: '1.875rem',
          fontWeight: 'bold',
          verticalAlign: 'baseline',
          fontFamily: 'Andika, system-ui, sans-serif',
          lineHeight: 1.1
        }}
      >
        {displayText}
      </button>
    );
  }

  if (tile.type === 'img') {
    const isHighlighted = isToolHighlight;

    return (
      <img
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          onDragStart();
        }}
        onClick={(e) => e.stopPropagation()}
        data-slottile
        src={tile.value}
        alt=""
        className="max-h-10 max-w-[80px] object-contain cursor-pointer hover:opacity-70 rounded"
        style={{
          outline: isHighlighted ? '2px solid rgba(59,130,246,0.55)' : 'none',
          background: isHighlighted ? 'rgba(59,130,246,0.20)' : 'transparent',
          padding: isHighlighted ? '2px' : 0,
          margin: '0 3px'
        }}
      />
    );
  }

  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WordSentenceBuilder() {
  const [searchParams] = useSearchParams();
  const { config, loading } = usePreset(searchParams);

  const [problems, setProblems] = useState(() => [[]]);
  const [problemStates, setProblemStates] = useState(() => [null]);
  const [numProblems, setNumProblems] = useState(1);
  const [numProblemsInput, setNumProblemsInput] = useState(1);
  const [showResult, setShowResult] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [activeProblem, setActiveProblem] = useState(null);
  const [swapMode, setSwapMode] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(null);

  const dragRef = useRef(null);

  // IMPORTANT:
  // This used to be a ref. That was the reason the preview never appeared.
  // State forces React to re-render while dragging.
  const [hoverProblem, setHoverProblem] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  // Used only for the accent tool.
  // This tracks which vowel inside the word should turn red.
  const [accentCharIdx, setAccentCharIdx] = useState(null);

  useEffect(() => {
    if (!config) return;

    const np = config.numProblems || 1;
    setNumProblems(np);
    setNumProblemsInput(np);
    initProblems(np, config.prefillProblems, config.punc);
    setShowResult(false);
  }, [config]);

  function initProblems(np, prefill, punc) {
    const ps = Array.from({ length: np }, (_, i) => {
      const pre = prefill?.[i];

      if (!pre) return [];

      if (typeof pre === 'string') {
        return parsePrefillString(pre, punc || DEFAULT_PUNC);
      }

      if (Array.isArray(pre)) {
        return pre.flatMap(s =>
          typeof s === 'string'
            ? parsePrefillString(s, punc || DEFAULT_PUNC)
            : []
        );
      }

      return [];
    });

    setProblems(ps);
    setProblemStates(Array(np).fill(null));
  }

  function applyProblems() {
    const np = Math.max(1, Math.min(50, parseInt(numProblemsInput) || 1));

    setNumProblems(np);

    setProblems(prev => {
      const safe = Array.isArray(prev) ? prev : [];

      if (safe.length >= np) {
        return safe.slice(0, np);
      }

      return [
        ...safe,
        ...Array.from({ length: np - safe.length }, () => [])
      ];
    });

    setProblemStates(Array(np).fill(null));
    setShowResult(false);
  }

  // Drag from tray copies the tile.
  const handleTrayDragStart = (tile) => {
    dragRef.current = {
      tile: { ...tile, id: Math.random().toString(36).slice(2) },
      fromProblem: null
    };
  };

  // Tap tile from palette to replace pending selection.
  const handleTapReplace = (tile) => {
    if (activeProblem === null || pendingRemove === null) return;

    const problem = problems[activeProblem];
    const targetIdx = problem.findIndex(t => t.id === pendingRemove);

    if (targetIdx >= 0) {
      setProblems(prev => {
        const next = prev.map(p => [...(p || [])]);
        const newTile = {
          ...tile,
          id: Math.random().toString(36).slice(2)
        };

        next[activeProblem][targetIdx] = newTile;
        return next;
      });

      setPendingRemove(null);
      setShowResult(false);
    }
  };

  // Tap-to-place: insert tile into active problem.
  const handleDropIntoProblem = (problemIdx, insertIdx, tile) => {
    setProblems(prev => {
      if (!Array.isArray(prev)) return prev;

      const next = prev.map(p => [...(p || [])]);
      next[problemIdx].splice(insertIdx, 0, tile);
      return next;
    });

    setShowResult(false);
  };

  // Drop into a problem from drag or reorder.
  const handleDrop = (problemIdx, replaceIdx) => {
    const d = dragRef.current;
    if (!d) return;

    dragRef.current = null;
    setHoverProblem(null);
    setHoverIdx(null);
    setAccentCharIdx(null);

    const tile = d.tile;
    const [fromProblemIdx, fromTileIdx] = d.fromProblem || [null, null];

    // captool and accenttool modify highlighted tile, not replace it.
    if (tile.type === 'captool' || tile.type === 'accenttool') {
      setProblems(prev => {
        if (!Array.isArray(prev)) return prev;

        const next = prev.map(p => (p || []).map(t => ({ ...t })));
        const problem = next[problemIdx];
        const targetIdx = replaceIdx;

        if (
          targetIdx < 0 ||
          targetIdx >= problem.length ||
          problem[targetIdx].type !== 'text'
        ) {
          return prev;
        }

        const target = problem[targetIdx];

        if (tile.type === 'captool') {
          if (tile.value === 'up') {
            target.value =
              target.value.charAt(0).toUpperCase() + target.value.slice(1);
          } else {
            target.value =
              target.value.charAt(0).toLowerCase() + target.value.slice(1);
          }
        } else if (tile.type === 'accenttool') {
          const PLAIN_TO_ACC = {
            a:'á',
            e:'é',
            i:'í',
            o:'ó',
            u:'ú',
            A:'Á',
            E:'Í',
            I:'Í',
            O:'Ó',
            U:'Ú'
          };

          const ACC_TO_PLAIN = {
            á:'a',
            é:'e',
            í:'i',
            ó:'o',
            ú:'u',
            Á:'A',
            É:'E',
            Í:'I',
            Ó:'O',
            Ú:'U'
          };

          const chars = [...String(target.value || '')];

          if (
            accentCharIdx !== null &&
            accentCharIdx >= 0 &&
            accentCharIdx < chars.length
          ) {
            const ch = chars[accentCharIdx];

            if (PLAIN_TO_ACC[ch]) {
              chars[accentCharIdx] = PLAIN_TO_ACC[ch];
              target.value = chars.join('');
            } else if (ACC_TO_PLAIN[ch]) {
              chars[accentCharIdx] = ACC_TO_PLAIN[ch];
              target.value = chars.join('');
            }
          }
        }

        return next;
      });

      setShowResult(false);
      return;
    }

    // Reorder inside the same problem.
    if (fromProblemIdx === problemIdx && fromTileIdx !== null) {
      setProblems(prev => {
        if (!Array.isArray(prev)) return prev;

        const next = prev.map(p => [...(p || [])]);
        const problem = next[problemIdx];

        if (fromTileIdx < 0 || fromTileIdx >= problem.length) {
          return prev;
        }

        const [movedTile] = problem.splice(fromTileIdx, 1);

        let insertIdx = replaceIdx >= 0 ? replaceIdx : problem.length;

        // If moving forward inside the same array, dropping after removal
        // needs one-step correction.
        if (insertIdx > fromTileIdx) {
          insertIdx -= 1;
        }

        insertIdx = Math.max(0, Math.min(insertIdx, problem.length));
        problem.splice(insertIdx, 0, movedTile);

        return next;
      });

      setShowResult(false);
      return;
    }

    // Normal tiles from tray: replace selected tile or insert.
    const newTile = {
      ...tile,
      id: Math.random().toString(36).slice(2)
    };

    if (pendingRemove && replaceIdx >= 0) {
      setProblems(prev => {
        if (!Array.isArray(prev)) return prev;

        const next = prev.map(p => [...(p || [])]);

        if (next[problemIdx]?.[replaceIdx]) {
          next[problemIdx][replaceIdx] = newTile;
        }

        return next;
      });

      setPendingRemove(null);
    } else {
      setProblems(prev => {
        if (!Array.isArray(prev)) return prev;

        const next = prev.map(p => [...(p || [])]);
        const problem = next[problemIdx];

        const insertIdx =
          replaceIdx >= 0
            ? Math.max(0, Math.min(replaceIdx, problem.length))
            : problem.length;

        problem.splice(insertIdx, 0, newTile);
        return next;
      });
    }

    setShowResult(false);
  };

    const handleTileDragStart = (problemIdx, tileIdx, tile) => {
    dragRef.current = {
      tile,
      fromProblem: [problemIdx, tileIdx]
    };
  };

  const handleRemoveTile = (problemIdx, tileIdx) => {
    setProblems(prev => {
      if (!Array.isArray(prev)) return prev;

      const next = prev.map(p => [...(p || [])]);
      next[problemIdx].splice(tileIdx, 1);
      return next;
    });

    setShowResult(false);
  };

  const handleTrashDrop = (e) => {
    e.preventDefault();

    const d = dragRef.current;

    if (!d || d.fromProblem === null) return;

    const [fp, fi] = d.fromProblem;

    setProblems(prev => {
      if (!Array.isArray(prev)) return prev;

      const next = prev.map(p => [...(p || [])]);
      next[fp].splice(fi, 1);
      return next;
    });

    dragRef.current = null;
    setHoverProblem(null);
    setHoverIdx(null);
    setAccentCharIdx(null);
  };

  const validate = () => {
    if (!config?.answers) return;

    const newStates = problems.map((tiles, i) => {
      const expected = config.answers[i];

      if (!expected) return null;

      let built = '';

      tiles.forEach(t => {
        if (t.type === 'text' || t.type === 'punc') {
          built += t.value;
        } else if (t.type === 'write') {
          built += t.value || '';
        } else if (t.type === 'space') {
          built += ' ';
        } else if (t.type === 'img') {
          built += '[img]';
        }
      });

      built = built.trim();

      if (!built) return 'unanswered';

      return built === expected ? 'correct' : 'incorrect';
    });

    setProblemStates(newStates);
    setShowResult(true);

    if (newStates.filter(Boolean).every(s => s === 'correct')) {
      launchConfetti();
    }
  };

  const qrUrl = (() => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('student', '1');
      return u.toString();
    } catch {
      return window.location.href;
    }
  })();

  if (loading || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const {
    letters = [],
    syllables = [],
    words = [],
    punc = [],
    images = [],
    toggles = {},
    trayColumns = 0
  } = config;

  const isStudent = config.isStudent;

  const letterTiles = letters
    .filter(l => l !== '|')
    .map(l => createTile('text', l));

  const syllTiles = syllables
    .filter(s => !['|','_','^','~'].includes(s))
    .map(s => createTile('text', s));

  const wordTiles = words
    .filter(w => !['|','_'].includes(w))
    .map(w => createTile('text', w));

  const puncTiles = punc.map(p => createTile('punc', p));
  const spaceTile = createTile('space', ' ');
  const imgTiles = images.map(u => createTile('img', u));

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-white"
      style={{ fontFamily: 'Andika, system-ui, sans-serif' }}
    >
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3 flex-wrap">
          <Link
            to="/Lessons"
            className="text-blue-600 hover:underline font-bold text-sm"
          >
            ← Lecciones
          </Link>

          <h1 className="text-lg font-black text-gray-800">
            🧩 Construye palabras
          </h1>

          <div className="flex-1" />

          {!isStudent && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1 text-sm font-bold text-gray-700">
                Problemas:
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={numProblemsInput}
                  onChange={e => setNumProblemsInput(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1 w-16 text-sm"
                />
              </label>

              <button
                onClick={applyProblems}
                className="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-1 text-sm font-bold hover:bg-gray-50"
              >
                Aplicar
              </button>

              <button
                onClick={() => setSwapMode(!swapMode)}
                className={`rounded-lg px-3 py-1 text-sm font-bold transition-colors ${
                  swapMode
                    ? 'bg-red-500 text-white'
                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {swapMode ? '🗑 Delete Mode' : '↔ Replace Mode'}
              </button>

              {config.answers && (
                <button
                  onClick={validate}
                  className="bg-blue-600 text-white rounded-lg px-4 py-1 text-sm font-bold hover:bg-blue-700"
                >
                  ✓ Validar
                </button>
              )}

              <button
                onClick={() => setShowQR(true)}
                className="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-1 text-sm font-bold hover:bg-gray-50"
              >
                QR
              </button>
            </div>
          )}

          {isStudent && config.answers && (
            <button
              onClick={validate}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-blue-700"
            >
              ✓ Validar
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 flex flex-col lg:flex-row gap-5">
        <section className="flex-1 min-w-0">
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
            {(problems || []).map((tiles, pi) => (
              <ProblemZone
                key={pi}
                index={pi}
                tiles={tiles}
                state={problemStates[pi]}
                showResult={showResult}
                dragRef={dragRef}
                hoverProblem={hoverProblem}
                setHoverProblem={setHoverProblem}
                hoverIdx={hoverIdx}
                setHoverIdx={setHoverIdx}
                accentCharIdx={accentCharIdx}
                setAccentCharIdx={setAccentCharIdx}
                swapMode={swapMode}
                pendingRemove={pendingRemove}
                setPendingRemove={setPendingRemove}
                onDrop={(idx) => handleDrop(pi, idx)}
                onTileDragStart={(ti, tile) =>
                  handleTileDragStart(pi, ti, tile)
                }
                onRemoveTile={(ti) => handleRemoveTile(pi, ti)}
                isActive={activeProblem === pi}
                onActivate={setActiveProblem}
              />
            ))}

            <div className="mt-1 flex items-center gap-2">
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleTrashDrop}
                className="flex items-center gap-2 bg-red-50 border-2 border-dashed border-red-300 text-red-500 rounded-xl px-3 py-1.5 text-sm font-bold cursor-default"
              >
                🗑️ Suelta aquí para borrar
              </div>

              {showResult && (
                <button
                  onClick={() => {
                    setShowResult(false);
                    setProblemStates(Array(numProblems).fill(null));
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 font-bold underline"
                >
                  Limpiar resultados
                </button>
              )}
            </div>
          </div>
        </section>

        <aside className="lg:w-72 xl:w-80 flex flex-col gap-3 shrink-0">
          {(letterTiles.length > 0 || toggles.write) && (
            <PaletteCard title="Letras" cols={trayColumns}>
              {toggles.write && (
                <WriteTile
                  dragRef={dragRef}
                  activeProblem={activeProblem}
                  problems={problems}
                  onDropIntoProblem={handleDropIntoProblem}
                />
              )}

              {letterTiles.map((t, i) => (
                <TrayTile
                  key={i}
                  tile={t}
                  onDragStart={handleTrayDragStart}
                  activeProblem={activeProblem}
                  problems={problems}
                  onDropIntoProblem={handleDropIntoProblem}
                  onTapReplace={pendingRemove ? handleTapReplace : null}
                />
              ))}

              {toggles.caps && (
                <>
                  <ToolTile
                    label="↑"
                    title="Capitalizar"
                    dragRef={dragRef}
                    tileType="captool"
                    tileValue="up"
                  />

                  <ToolTile
                    label="↓"
                    title="Minúscula"
                    dragRef={dragRef}
                    tileType="captool"
                    tileValue="down"
                  />
                </>
              )}

              {toggles.accent && (
                <ToolTile
                  label="´"
                  title="Acento"
                  dragRef={dragRef}
                  tileType="accenttool"
                  tileValue="´"
                />
              )}
            </PaletteCard>
          )}

          {syllTiles.length > 0 && (
            <PaletteCard title="Sílabas" cols={trayColumns}>
              {syllTiles.map((t, i) => (
                <TrayTile
                  key={i}
                  tile={t}
                  onDragStart={handleTrayDragStart}
                  activeProblem={activeProblem}
                  problems={problems}
                  onDropIntoProblem={handleDropIntoProblem}
                  onTapReplace={pendingRemove ? handleTapReplace : null}
                />
              ))}
            </PaletteCard>
          )}

          {wordTiles.length > 0 && (
            <PaletteCard title="Palabras" cols={trayColumns}>
              {wordTiles.map((t, i) => (
                <TrayTile
                  key={i}
                  tile={t}
                  onDragStart={handleTrayDragStart}
                  activeProblem={activeProblem}
                  problems={problems}
                  onDropIntoProblem={handleDropIntoProblem}
                  onTapReplace={pendingRemove ? handleTapReplace : null}
                />
              ))}
            </PaletteCard>
          )}

          {toggles.punc !== false && puncTiles.length > 0 && (
            <PaletteCard title="Puntuación" cols={0}>
              <div className="flex flex-wrap gap-2">
                {toggles.space !== false && (
                  <TrayTile
                    tile={spaceTile}
                    onDragStart={handleTrayDragStart}
                    activeProblem={activeProblem}
                    problems={problems}
                    onDropIntoProblem={handleDropIntoProblem}
                    onTapReplace={pendingRemove ? handleTapReplace : null}
                  />
                )}

                {puncTiles.map((t, i) => (
                  <TrayTile
                    key={i}
                    tile={t}
                    onDragStart={handleTrayDragStart}
                    activeProblem={activeProblem}
                    problems={problems}
                    onDropIntoProblem={handleDropIntoProblem}
                    onTapReplace={pendingRemove ? handleTapReplace : null}
                  />
                ))}
              </div>
            </PaletteCard>
          )}

          {toggles.space !== false && puncTiles.length === 0 && (
            <PaletteCard title="Espacio" cols={0}>
              <TrayTile
                tile={spaceTile}
                onDragStart={handleTrayDragStart}
                activeProblem={activeProblem}
                problems={problems}
                onDropIntoProblem={handleDropIntoProblem}
                onTapReplace={pendingRemove ? handleTapReplace : null}
              />
            </PaletteCard>
          )}

          {toggles.images !== false && imgTiles.length > 0 && (
            <PaletteCard title="Imágenes" cols={trayColumns}>
              {imgTiles.map((t, i) => (
                <TrayTile
                  key={i}
                  tile={t}
                  onDragStart={handleTrayDragStart}
                  activeProblem={activeProblem}
                  problems={problems}
                  onDropIntoProblem={handleDropIntoProblem}
                  onTapReplace={pendingRemove ? handleTapReplace : null}
                />
              ))}
            </PaletteCard>
          )}

          {config.presetId && (
            <div className="text-xs text-gray-400 text-center font-bold">
              Preset:{' '}
              <code className="bg-gray-100 px-1 rounded">
                {config.presetId}
              </code>
            </div>
          )}
        </aside>
      </main>

      {showQR && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowQR(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 text-center shadow-2xl w-80"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-black text-lg mb-3">
              📱 Escanea para abrir
            </p>

            <div className="flex justify-center mb-3">
              <QRCodeSVG value={qrUrl} size={220} level="M" />
            </div>

            <p className="text-xs text-gray-400 mb-4 break-all">
              {qrUrl}
            </p>

            <button
              onClick={() => setShowQR(false)}
              className="border border-gray-300 bg-white rounded-xl px-4 py-2 text-sm font-bold hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}