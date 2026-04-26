import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { base44 } from '@/api/base44Client';

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
    studentNumber: sp.get('student') || null,
    className: sp.get('class') || null,
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
          presetLabel: preset.label || presetId,
          studentNumber: searchParams.get('student') || null,
          className: searchParams.get('class') || null,
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
      if (buf) { out.push(createTile('text', buf)); buf = ''; }
      out.push(createTile('space', ' '));
    } else if (punc.includes(ch)) {
      if (buf) { out.push(createTile('text', buf)); buf = ''; }
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
      el.style.cssText = `position:fixed;left:${Math.random()*100}vw;top:-10px;width:9px;height:9px;background:hsl(${Math.random()*360},90%,60%);border-radius:50%;opacity:.9;z-index:9999;pointer-events:none`;
      document.body.appendChild(el);
      const a = el.animate(
        [{ transform:'translateY(0)', opacity:1 },{ transform:`translateY(${window.innerHeight+120}px)`, opacity:0 }],
        { duration:700+Math.random()*500, easing:'ease-in' }
      );
      a.onfinish = () => el.remove();
    }
    requestAnimationFrame(frame);
  })();
}

// ─── Ghost element for touch drag ────────────────────────────────────────────
function createGhostEl(label) {
  const ghost = document.createElement('div');
  ghost.id = '__drag_ghost__';
  ghost.textContent = label;
  ghost.style.cssText = `
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    background: white;
    border: 2px solid #4f46e5;
    border-radius: 12px;
    padding: 4px 12px;
    font-size: 1.6rem;
    font-weight: bold;
    font-family: Andika, system-ui, sans-serif;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    opacity: 0.9;
    transform: translate(-50%, -50%);
    white-space: nowrap;
  `;
  document.body.appendChild(ghost);
  return ghost;
}
function removeGhostEl() {
  document.getElementById('__drag_ghost__')?.remove();
}
function moveGhostEl(x, y) {
  const g = document.getElementById('__drag_ghost__');
  if (g) { g.style.left = x + 'px'; g.style.top = y + 'px'; }
}

// ─── Palette card ─────────────────────────────────────────────────────────────
function PaletteCard({ title, cols, children }) {
  const gridStyle = cols > 0
    ? { display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: '6px' }
    : {};
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm">
      <h2 className="text-sm font-black text-gray-600 mb-2 uppercase tracking-wide">{title}</h2>
      {cols > 0
        ? <div style={gridStyle}>{children}</div>
        : <div className="flex flex-wrap gap-2">{children}</div>
      }
    </div>
  );
}

// ─── Tray tile ────────────────────────────────────────────────────────────────
function TrayTile({ tile, onDragStart, activeProblem, problems, onDropIntoProblem, onTapReplace }) {
  const handleTap = () => {
    if (onTapReplace) {
      onTapReplace(tile);
    } else if (activeProblem !== null && problems && problems[activeProblem] && onDropIntoProblem) {
      const clone = { ...tile, id: Math.random().toString(36).slice(2) };
      onDropIntoProblem(activeProblem, problems[activeProblem].length, clone);
    }
  };

  const tileLabel = tile.type === 'space' ? '␣' : tile.type === 'img' ? '🖼' : tile.value;

  return (
    <button
      data-tray-tile
      data-tile-type={tile.type}
      data-tile-value={tile.value}
      data-tile-id={tile.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        onDragStart(tile);
      }}
      onClick={handleTap}
      className="select-none touch-none cursor-grab active:cursor-grabbing rounded-xl border-2 border-gray-800 bg-white flex items-center justify-center font-bold text-xl min-w-[44px] h-11 px-3 hover:bg-indigo-50 shadow-sm transition-colors"
      style={{ fontFamily: 'Andika, system-ui, sans-serif' }}
    >
      {tile.type === 'space' ? (
        <span className="w-5 h-0.5 bg-gray-400 block rounded pointer-events-none" />
      ) : tile.type === 'img' ? (
        <img src={tile.value} alt="" className="max-h-9 max-w-[80px] object-contain pointer-events-none" />
      ) : (
        tile.value
      )}
    </button>
  );
}

// ─── WriteTile in tray ────────────────────────────────────────────────────────
function WriteTile({ dragRef, activeProblem, problems, onDropIntoProblem }) {
  const [input, setInput] = useState('');
  const [tiles, setTiles] = useState([]);
  const inputRef = useRef(null);

  const handleAddWord = () => {
    if (!input.trim()) return;
    setTiles(prev => [...prev, createTile('text', input.trim())]);
    setInput('');
    inputRef.current?.focus();
  };

  const handleTileTap = (tile) => {
    if (activeProblem !== null && problems && problems[activeProblem]) {
      const clone = { ...tile, id: Math.random().toString(36).slice(2) };
      onDropIntoProblem(activeProblem, problems[activeProblem].length, clone);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddWord()}
          placeholder="escribe…"
          className="border-2 border-indigo-400 bg-indigo-50 rounded-xl px-2 h-11 outline-none font-bold text-base flex-1"
          onPointerDown={e => e.stopPropagation()}
        />
        <button onClick={handleAddWord} className="bg-indigo-600 text-white rounded-xl px-3 h-11 font-bold text-sm hover:bg-indigo-700 shrink-0">+</button>
      </div>
      {tiles.length > 0 && (
        <div className="flex flex-wrap gap-2 bg-indigo-50 rounded-xl p-2 border border-indigo-200">
          {tiles.map((t, idx) => (
            <button
              key={t.id}
              data-tray-tile
              data-tile-type={t.type}
              data-tile-value={t.value}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'copy';
                dragRef.current = { tile: { ...t, id: Math.random().toString(36).slice(2) }, fromProblem: null };
              }}
              onClick={() => handleTileTap(t)}
              onContextMenu={(e) => { e.preventDefault(); setTiles(prev => prev.filter((_, i) => i !== idx)); }}
              className="rounded-xl border-2 border-gray-800 bg-white flex items-center justify-center font-bold text-base px-3 h-10 hover:bg-indigo-50 shadow-sm cursor-grab"
              style={{ fontFamily: 'Andika, system-ui, sans-serif' }}
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
      data-tray-tile
      data-tile-type={tileType}
      data-tile-value={tileValue}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        dragRef.current = { tile: createTile(tileType, tileValue), fromProblem: null };
      }}
      title={title}
      className="cursor-grab rounded-xl border-2 border-gray-400 bg-gray-50 flex items-center justify-center w-11 h-11 text-lg font-black hover:bg-gray-100 select-none touch-none"
    >
      {label}
    </div>
  );
}

// ─── InlineTile ───────────────────────────────────────────────────────────────
function InlineTile({ tile, onDragStart, pendingRemove, replaceIdx, tileIdx, onTap, swapMode, toolHover, accentCharIdx }) {
  const isSelected = pendingRemove === tile.id;
  const isToolHighlight = toolHover === tileIdx;

  if (tile.type === 'space') {
    let bg = 'transparent';
    if (isSelected) bg = swapMode ? 'rgba(156,163,175,0.25)' : 'rgba(239,68,68,0.15)';
    if (isToolHighlight) bg = 'rgba(59,130,246,0.20)';
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onTap(); }}
        data-slottile
        data-tile-id={tile.id}
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
        className="inline-block touch-none transition-colors"
        style={{
          width: '0.55em', height: '1.5em', verticalAlign: 'baseline',
          flexShrink: 0, background: bg, borderRadius: '3px',
          border: isToolHighlight ? '1px solid #3b82f6' : 'none',
          cursor: 'pointer', padding: 0, margin: 0
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
      bg = 'rgba(59,130,246,0.20)'; color = '#1d4ed8'; outline = '2px solid rgba(59,130,246,0.55)';
    }

    const displayText = accentCharIdx !== null && tile.type === 'text'
      ? [...String(tile.value || '')].map((ch, idx) => (
          <span key={idx} style={{
            color: idx === accentCharIdx ? '#dc2626' : 'inherit',
            background: idx === accentCharIdx ? 'rgba(220,38,38,0.15)' : 'transparent',
            borderRadius: idx === accentCharIdx ? '4px' : 0,
            padding: idx === accentCharIdx ? '0 1px' : 0
          }}>{ch}</span>
        ))
      : tile.value;

    return (
      <button
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
        onClick={(e) => { e.stopPropagation(); onTap(); }}
        data-slottile
        data-tile-id={tile.id}
        className="font-bold touch-none transition-colors cursor-grab active:cursor-grabbing rounded"
        style={{
          background: bg, outline, border: 'none', padding: 0, margin: 0,
          font: 'inherit', color, fontSize: '1.875rem', fontWeight: 'bold',
          verticalAlign: 'baseline', fontFamily: 'Andika, system-ui, sans-serif', lineHeight: 1.1
        }}
      >
        {displayText}
      </button>
    );
  }

  if (tile.type === 'img') {
    return (
      <img
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
        onClick={(e) => e.stopPropagation()}
        data-slottile
        data-tile-id={tile.id}
        src={tile.value}
        alt=""
        className="max-h-10 max-w-[80px] object-contain cursor-pointer hover:opacity-70 rounded touch-none"
        style={{
          outline: isToolHighlight ? '2px solid rgba(59,130,246,0.55)' : 'none',
          background: isToolHighlight ? 'rgba(59,130,246,0.20)' : 'transparent',
          padding: isToolHighlight ? '2px' : 0, margin: '0 3px'
        }}
      />
    );
  }
  return null;
}

// ─── Problem drop zone ────────────────────────────────────────────────────────
function ProblemZone({
  index, tiles, state, showResult, dragRef,
  hoverProblem, setHoverProblem, hoverIdx, setHoverIdx,
  accentCharIdx, setAccentCharIdx,
  swapMode, pendingRemove, setPendingRemove,
  onDrop, onTileDragStart, onRemoveTile, isActive, onActivate
}) {
  const ref = useRef(null);

  const clearHover = () => { setHoverProblem(null); setHoverIdx(null); setAccentCharIdx(null); };

  const calcInsertIdx = (clientX, clientY) => {
    const children = [...(ref.current?.querySelectorAll('[data-slottile]') || [])];
    let insertIdx = tiles.length;
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom && clientX < rect.left + rect.width / 2) {
        insertIdx = i; break;
      }
    }
    return insertIdx;
  };

  const calcToolHover = (clientX, clientY) => {
    const children = [...(ref.current?.querySelectorAll('[data-slottile]') || [])];
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom &&
          (tiles[i]?.type === 'text' || tiles[i]?.type === 'write')) {
        return i;
      }
    }
    return null;
  };

  const onDragOver = (e) => {
    e.preventDefault(); e.stopPropagation();
    const d = dragRef.current;
    if (!d) { clearHover(); return; }
    if (d.tile?.type === 'captool' || d.tile?.type === 'accenttool') {
      setHoverProblem(index);
      setHoverIdx(calcToolHover(e.clientX, e.clientY));
      return;
    }
    if (pendingRemove !== null && d.fromProblem === null) {
      const idx = tiles.findIndex(t => t.id === pendingRemove);
      setHoverProblem(index); setHoverIdx(idx >= 0 ? idx : null); return;
    }
    setHoverProblem(index);
    setHoverIdx(calcInsertIdx(e.clientX, e.clientY));
  };

  const onDragLeave = (e) => {
    if (!ref.current?.contains(e.relatedTarget)) clearHover();
  };

  const onDrop_ = (e) => {
    e.preventDefault(); e.stopPropagation();
    const dropIdx = hoverProblem === index && hoverIdx !== null ? hoverIdx : -1;
    clearHover();
    onDrop(dropIdx);
    setPendingRemove(null);
  };

  let border = 'border-gray-300';
  let ring = '';
  if (showResult) {
    if (state === 'correct') { border = 'border-green-500'; ring = 'ring-2 ring-green-400'; }
    else if (state === 'incorrect') { border = 'border-red-500'; ring = 'ring-2 ring-red-400'; }
    else if (state === 'unanswered') { border = 'border-gray-300 border-dashed'; }
  }

  const showHoverHere = hoverProblem === index;

  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-400 font-bold text-sm mt-3 w-5 shrink-0 text-right">{index + 1}.</span>
      <div
        ref={ref}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop_}
        onClick={() => onActivate(isActive ? null : index)}
        className={`flex-1 relative bg-white border-2 rounded-xl flex flex-wrap items-center min-h-[56px] px-3 py-2 gap-0 transition-all cursor-pointer ${isActive ? 'ring-2 ring-blue-400' : ''} ${border} ${ring}`}
      >
        {tiles.length === 0 && (
          <span className="text-gray-300 text-sm select-none pointer-events-none">Arrastra aquí…</span>
        )}
        {tiles.map((tile, i) => (
          <React.Fragment key={tile.id}>
            {showHoverHere && hoverIdx === i && hoverIdx !== null && pendingRemove === null &&
              dragRef.current?.tile?.type !== 'captool' && dragRef.current?.tile?.type !== 'accenttool' && (
              <div
                className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 min-h-12 flex items-center"
                style={{ minWidth: dragRef.current?.tile?.type === 'text' ? `${Math.max(String(dragRef.current.tile.value||'').length*1.1,3)}ch` : '2rem' }}
              />
            )}
            <InlineTile
              tile={tile} tileIdx={i}
              onDragStart={() => onTileDragStart(i, tile)}
              pendingRemove={pendingRemove}
              replaceIdx={showHoverHere ? hoverIdx : null}
              toolHover={showHoverHere && (dragRef.current?.tile?.type === 'captool' || dragRef.current?.tile?.type === 'accenttool') ? hoverIdx : null}
              accentCharIdx={showHoverHere && dragRef.current?.tile?.type === 'accenttool' && hoverIdx === i ? accentCharIdx : null}
              swapMode={swapMode}
              onTap={() => {
                if (pendingRemove === tile.id) {
                  if (swapMode) { onRemoveTile(i); setPendingRemove(null); }
                  else setPendingRemove(null);
                } else {
                  setPendingRemove(tile.id);
                }
              }}
            />
          </React.Fragment>
        ))}
        {showHoverHere && hoverIdx === tiles.length && hoverIdx !== null && pendingRemove === null &&
          dragRef.current?.tile?.type !== 'captool' && dragRef.current?.tile?.type !== 'accenttool' && (
          <div
            className="rounded-lg border-2 border-dashed border-blue-400 bg-blue-50 px-1 py-0.5 h-12 flex items-center justify-center"
            style={{
              minWidth: dragRef.current?.tile?.type === 'text' ? `${Math.max(String(dragRef.current.tile.value||'').length*1.1,3)}ch` : '2rem',
              fontSize: '0.75rem', color: '#60a5fa', fontWeight: 'bold'
            }}
          >↓</div>
        )}
      </div>
    </div>
  );
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
  const [hoverProblem, setHoverProblem] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [accentCharIdx, setAccentCharIdx] = useState(null);

  // Event recording for replay
  const eventsRef = useRef([]);
  const startTimeRef = useRef(Date.now());

  const recordEvent = useCallback((type, problemIdx, extraData = {}) => {
    eventsRef.current.push({
      t: Date.now() - startTimeRef.current,
      type,
      problemIdx,
      ...extraData,
    });
  }, []);

  useEffect(() => {
    if (!config) return;
    const np = config.numProblems || 1;
    setNumProblems(np);
    setNumProblemsInput(np);
    initProblems(np, config.prefillProblems, config.punc);
    setShowResult(false);
    eventsRef.current = [];
    startTimeRef.current = Date.now();
  }, [config]);

  // ── Touch drag support ───────────────────────────────────────────────────
  // We add a single touchstart listener on the document. When a touch starts
  // on a [data-tray-tile] or [data-slottile], we take over touch events and
  // simulate drag behaviour with a ghost element.
  useEffect(() => {
    const handleTouchStart = (e) => {
      const target = e.target.closest('[data-tray-tile],[data-slottile]');
      if (!target) return;

      const touch = e.touches[0];
      let ghostLabel = target.dataset.tileValue || target.textContent?.trim() || '?';
      if (target.dataset.tileType === 'space') ghostLabel = '␣';

      // Set up dragRef based on element type
      if (target.dataset.trayTile !== undefined || target.closest('[data-tray-tile]')) {
        const tileType = target.dataset.tileType;
        const tileValue = target.dataset.tileValue;
        if (tileType) {
          dragRef.current = {
            tile: createTile(tileType, tileValue),
            fromProblem: null
          };
        }
      } else if (target.dataset.slottile !== undefined || target.dataset.tileId) {
        // It's an inline tile — find which problem and index it belongs to
        const tileId = target.dataset.tileId;
        let found = false;
        setProblems(prev => {
          for (let pi = 0; pi < prev.length; pi++) {
            const ti = prev[pi].findIndex(t => t.id === tileId);
            if (ti >= 0) {
              dragRef.current = { tile: prev[pi][ti], fromProblem: [pi, ti] };
              found = true;
              break;
            }
          }
          return prev;
        });
      }

      if (!dragRef.current) return;

      e.preventDefault();

      const ghost = createGhostEl(ghostLabel);
      moveGhostEl(touch.clientX, touch.clientY);

      const findProblemZone = (x, y) => {
        const zones = document.querySelectorAll('[data-problem-zone]');
        for (const zone of zones) {
          const rect = zone.getBoundingClientRect();
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return zone;
          }
        }
        return null;
      };

      const calcTouchInsertIdx = (zone, x, y) => {
        const children = [...zone.querySelectorAll('[data-slottile]')];
        const zoneIndex = parseInt(zone.dataset.problemZone);
        const zoneTiles = [];
        setProblems(prev => { zoneTiles.push(...(prev[zoneIndex] || [])); return prev; });

        let insertIdx = zoneTiles.length;
        for (let i = 0; i < children.length; i++) {
          const rect = children[i].getBoundingClientRect();
          if (y >= rect.top && y <= rect.bottom && x < rect.left + rect.width / 2) {
            insertIdx = i; break;
          }
        }
        return insertIdx;
      };

      const onTouchMove = (ev) => {
        ev.preventDefault();
        const t = ev.touches[0];
        moveGhostEl(t.clientX, t.clientY);

        const zone = findProblemZone(t.clientX, t.clientY);
        if (zone) {
          const zoneIndex = parseInt(zone.dataset.problemZone);
          const insertIdx = calcTouchInsertIdx(zone, t.clientX, t.clientY);
          setHoverProblem(zoneIndex);
          setHoverIdx(insertIdx);
        } else {
          setHoverProblem(null);
          setHoverIdx(null);
        }
      };

      const onTouchEnd = (ev) => {
        ev.preventDefault();
        removeGhostEl();
        document.removeEventListener('touchmove', onTouchMove, { passive: false });
        document.removeEventListener('touchend', onTouchEnd);

        const changedTouch = ev.changedTouches[0];

        // Check if dropped on trash
        const trashEl = document.getElementById('__trash_zone__');
        if (trashEl) {
          const tr = trashEl.getBoundingClientRect();
          if (changedTouch.clientX >= tr.left && changedTouch.clientX <= tr.right &&
              changedTouch.clientY >= tr.top && changedTouch.clientY <= tr.bottom) {
            const d = dragRef.current;
            if (d?.fromProblem) {
              const [fp, fi] = d.fromProblem;
              setProblems(prev => {
                const next = prev.map(p => [...(p || [])]);
                next[fp].splice(fi, 1);
                return next;
              });
              recordEvent('remove', fp, { tileValue: d.tile?.value });
            }
            dragRef.current = null;
            setHoverProblem(null); setHoverIdx(null);
            return;
          }
        }

        const zone = findProblemZone(changedTouch.clientX, changedTouch.clientY);
        if (zone) {
          const zoneIndex = parseInt(zone.dataset.problemZone);
          const insertIdx = calcTouchInsertIdx(zone, changedTouch.clientX, changedTouch.clientY);
          handleDrop(zoneIndex, insertIdx);
        }

        dragRef.current = null;
        setHoverProblem(null); setHoverIdx(null);
      };

      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    return () => document.removeEventListener('touchstart', handleTouchStart);
  }, []); // eslint-disable-line

  function initProblems(np, prefill, punc) {
    const ps = Array.from({ length: np }, (_, i) => {
      const pre = prefill?.[i];
      if (!pre) return [];
      if (typeof pre === 'string') return parsePrefillString(pre, punc || DEFAULT_PUNC);
      if (Array.isArray(pre)) return pre.flatMap(s => typeof s === 'string' ? parsePrefillString(s, punc || DEFAULT_PUNC) : []);
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
      if (safe.length >= np) return safe.slice(0, np);
      return [...safe, ...Array.from({ length: np - safe.length }, () => [])];
    });
    setProblemStates(Array(np).fill(null));
    setShowResult(false);
  }

  const handleTrayDragStart = (tile) => {
    dragRef.current = { tile: { ...tile, id: Math.random().toString(36).slice(2) }, fromProblem: null };
  };

  const handleTapReplace = (tile) => {
    if (activeProblem === null || pendingRemove === null) return;
    const problem = problems[activeProblem];
    const targetIdx = problem.findIndex(t => t.id === pendingRemove);
    if (targetIdx >= 0) {
      setProblems(prev => {
        const next = prev.map(p => [...(p || [])]);
        next[activeProblem][targetIdx] = { ...tile, id: Math.random().toString(36).slice(2) };
        return next;
      });
      setPendingRemove(null);
      setShowResult(false);
    }
  };

  const handleDropIntoProblem = (problemIdx, insertIdx, tile) => {
    setProblems(prev => {
      if (!Array.isArray(prev)) return prev;
      const next = prev.map(p => [...(p || [])]);
      next[problemIdx].splice(insertIdx, 0, tile);
      return next;
    });
    recordEvent('place', problemIdx, { tileValue: tile.value, insertIdx });
    setShowResult(false);
  };

  const handleDrop = (problemIdx, replaceIdx) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setHoverProblem(null); setHoverIdx(null); setAccentCharIdx(null);

    const tile = d.tile;
    const [fromProblemIdx, fromTileIdx] = d.fromProblem || [null, null];

    if (tile.type === 'captool' || tile.type === 'accenttool') {
      setProblems(prev => {
        if (!Array.isArray(prev)) return prev;
        const next = prev.map(p => (p || []).map(t => ({ ...t })));
        const problem = next[problemIdx];
        const targetIdx = replaceIdx;
        if (targetIdx < 0 || targetIdx >= problem.length || problem[targetIdx].type !== 'text') return prev;
        const target = problem[targetIdx];
        if (tile.type === 'captool') {
          target.value = tile.value === 'up'
            ? target.value.charAt(0).toUpperCase() + target.value.slice(1)
            : target.value.charAt(0).toLowerCase() + target.value.slice(1);
        } else if (tile.type === 'accenttool') {
          const PLAIN_TO_ACC = { a:'á',e:'é',i:'í',o:'ó',u:'ú',A:'Á',E:'É',I:'Í',O:'Ó',U:'Ú' };
          const ACC_TO_PLAIN = { á:'a',é:'e',í:'i',ó:'o',ú:'u',Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U' };
          const chars = [...String(target.value || '')];
          if (accentCharIdx !== null && accentCharIdx >= 0 && accentCharIdx < chars.length) {
            const ch = chars[accentCharIdx];
            chars[accentCharIdx] = PLAIN_TO_ACC[ch] || ACC_TO_PLAIN[ch] || ch;
            target.value = chars.join('');
          }
        }
        return next;
      });
      setShowResult(false);
      return;
    }

    if (fromProblemIdx === problemIdx && fromTileIdx !== null) {
      setProblems(prev => {
        if (!Array.isArray(prev)) return prev;
        const next = prev.map(p => [...(p || [])]);
        const problem = next[problemIdx];
        if (fromTileIdx < 0 || fromTileIdx >= problem.length) return prev;
        const [movedTile] = problem.splice(fromTileIdx, 1);
        let insertIdx = replaceIdx >= 0 ? replaceIdx : problem.length;
        if (insertIdx > fromTileIdx) insertIdx -= 1;
        insertIdx = Math.max(0, Math.min(insertIdx, problem.length));
        problem.splice(insertIdx, 0, movedTile);
        return next;
      });
      recordEvent('reorder', problemIdx, { tileValue: tile.value, from: fromTileIdx, to: replaceIdx });
      setShowResult(false);
      return;
    }

    const newTile = { ...tile, id: Math.random().toString(36).slice(2) };
    if (pendingRemove && replaceIdx >= 0) {
      setProblems(prev => {
        if (!Array.isArray(prev)) return prev;
        const next = prev.map(p => [...(p || [])]);
        if (next[problemIdx]?.[replaceIdx]) next[problemIdx][replaceIdx] = newTile;
        return next;
      });
      setPendingRemove(null);
    } else {
      setProblems(prev => {
        if (!Array.isArray(prev)) return prev;
        const next = prev.map(p => [...(p || [])]);
        const problem = next[problemIdx];
        const insertIdx = replaceIdx >= 0 ? Math.max(0, Math.min(replaceIdx, problem.length)) : problem.length;
        problem.splice(insertIdx, 0, newTile);
        return next;
      });
    }
    recordEvent('place', problemIdx, { tileValue: newTile.value, insertIdx: replaceIdx });
    setShowResult(false);
  };

  const handleTileDragStart = (problemIdx, tileIdx, tile) => {
    dragRef.current = { tile, fromProblem: [problemIdx, tileIdx] };
  };

  const handleRemoveTile = (problemIdx, tileIdx) => {
    setProblems(prev => {
      if (!Array.isArray(prev)) return prev;
      const next = prev.map(p => [...(p || [])]);
      next[problemIdx].splice(tileIdx, 1);
      return next;
    });
    recordEvent('remove', problemIdx, { tileIdx });
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
    recordEvent('remove', fp, { tileIdx: fi });
    dragRef.current = null;
    setHoverProblem(null); setHoverIdx(null); setAccentCharIdx(null);
  };

  const validate = () => {
    if (!config?.answers) return;
    const newStates = problems.map((tiles, i) => {
      const expected = config.answers[i];
      if (!expected) return null;
      let built = '';
      tiles.forEach(t => {
        if (t.type === 'text' || t.type === 'punc') built += t.value;
        else if (t.type === 'write') built += t.value || '';
        else if (t.type === 'space') built += ' ';
        else if (t.type === 'img') built += '[img]';
      });
      built = built.trim();
      if (!built) return 'unanswered';
      return built === expected ? 'correct' : 'incorrect';
    });
    setProblemStates(newStates);
    setShowResult(true);
    const allCorrect = newStates.filter(Boolean).every(s => s === 'correct');
    if (allCorrect) launchConfetti();

    // Save attempt if student
    if (config.isStudent && config.studentNumber && config.className) {
      const problemsData = problems.map((tiles, i) => {
        let built = '';
        tiles.forEach(t => {
          if (t.type === 'text' || t.type === 'punc') built += t.value;
          else if (t.type === 'space') built += ' ';
        });
        return {
          expected: config.answers?.[i] || null,
          answer: built.trim(),
          isCorrect: newStates[i] === 'correct',
          tiles: tiles.map(t => ({ type: t.type, value: t.value }))
        };
      });

      base44.entities.WordBuilderAttempt.create({
        student_number: parseInt(config.studentNumber),
        class_name: config.className,
        preset_id: config.presetId || 'custom',
        preset_label: config.presetLabel || config.presetId || 'Custom',
        num_problems: problems.length,
        problems_data: JSON.stringify(problemsData),
        events_data: JSON.stringify(eventsRef.current),
        all_correct: allCorrect,
        submitted_at: new Date().toISOString(),
      }).catch(() => {});
    }
  };

  // QR leads to student login flow
  const qrUrl = (() => {
    try {
      const u = new URL(window.location.href);
      // Remove teacher params, keep preset
      u.searchParams.delete('student');
      u.searchParams.delete('class');
      const base = window.location.origin + '/WordSentenceBuilder';
      const preset = config?.presetId;
      return `${window.location.origin}/WordSentenceBuilder?${preset ? `preset=${preset}&` : ''}login=1`;
    } catch { return window.location.href; }
  })();

  if (loading || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Student login flow
  if (searchParams.get('login') === '1' && !config.isStudent) {
    return <StudentLoginFlow searchParams={searchParams} />;
  }

  const { letters=[], syllables=[], words=[], punc=[], images=[], toggles={}, trayColumns=0 } = config;
  const isStudent = config.isStudent;

  const letterTiles = letters.filter(l => l !== '|').map(l => createTile('text', l));
  const syllTiles = syllables.filter(s => !['|','_','^','~'].includes(s)).map(s => createTile('text', s));
  const wordTiles = words.filter(w => !['|','_'].includes(w)).map(w => createTile('text', w));
  const puncTiles = punc.map(p => createTile('punc', p));
  const spaceTile = createTile('space', ' ');
  const imgTiles = images.map(u => createTile('img', u));

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-white" style={{ fontFamily: 'Andika, system-ui, sans-serif' }}>
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center gap-3 flex-wrap">
          <Link to="/Lessons" className="text-blue-600 hover:underline font-bold text-sm">← Lecciones</Link>
          <h1 className="text-lg font-black text-gray-800">🧩 Construye palabras</h1>
          <div className="flex-1" />
          {!isStudent && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1 text-sm font-bold text-gray-700">
                Problemas:
                <input type="number" min={1} max={50} value={numProblemsInput}
                  onChange={e => setNumProblemsInput(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1 w-16 text-sm" />
              </label>
              <button onClick={applyProblems} className="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-1 text-sm font-bold hover:bg-gray-50">Aplicar</button>
              <button onClick={() => setSwapMode(!swapMode)}
                className={`rounded-lg px-3 py-1 text-sm font-bold transition-colors ${swapMode ? 'bg-red-500 text-white' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
                {swapMode ? '🗑 Delete Mode' : '↔ Replace Mode'}
              </button>
              {config.answers && (
                <button onClick={validate} className="bg-blue-600 text-white rounded-lg px-4 py-1 text-sm font-bold hover:bg-blue-700">✓ Validar</button>
              )}
              <button onClick={() => setShowQR(true)} className="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-1 text-sm font-bold hover:bg-gray-50">QR</button>
            </div>
          )}
          {isStudent && config.answers && (
            <button onClick={validate} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-blue-700">✓ Validar</button>
          )}
        </div>
      </header>

      {/* 50/50 split layout */}
      <main className="max-w-screen-2xl mx-auto px-4 py-4 flex flex-col lg:flex-row gap-5">
        {/* Problems area — 50% */}
        <section className="lg:w-1/2 min-w-0">
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
            {(problems || []).map((tiles, pi) => (
              <div key={pi} data-problem-zone={pi}>
                <ProblemZone
                  index={pi} tiles={tiles} state={problemStates[pi]} showResult={showResult}
                  dragRef={dragRef}
                  hoverProblem={hoverProblem} setHoverProblem={setHoverProblem}
                  hoverIdx={hoverIdx} setHoverIdx={setHoverIdx}
                  accentCharIdx={accentCharIdx} setAccentCharIdx={setAccentCharIdx}
                  swapMode={swapMode} pendingRemove={pendingRemove} setPendingRemove={setPendingRemove}
                  onDrop={(idx) => handleDrop(pi, idx)}
                  onTileDragStart={(ti, tile) => handleTileDragStart(pi, ti, tile)}
                  onRemoveTile={(ti) => handleRemoveTile(pi, ti)}
                  isActive={activeProblem === pi} onActivate={setActiveProblem}
                />
              </div>
            ))}
            <div className="mt-1 flex items-center gap-2">
              <div id="__trash_zone__"
                onDragOver={e => e.preventDefault()}
                onDrop={handleTrashDrop}
                className="flex items-center gap-2 bg-red-50 border-2 border-dashed border-red-300 text-red-500 rounded-xl px-3 py-1.5 text-sm font-bold cursor-default">
                🗑️ Suelta aquí para borrar
              </div>
              {showResult && (
                <button onClick={() => { setShowResult(false); setProblemStates(Array(numProblems).fill(null)); }}
                  className="text-xs text-gray-400 hover:text-gray-600 font-bold underline">
                  Limpiar resultados
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Palette — 50% */}
        <aside className="lg:w-1/2 flex flex-col gap-3">
          {(letterTiles.length > 0 || toggles.write) && (
            <PaletteCard title="Letras" cols={trayColumns}>
              {toggles.write && <WriteTile dragRef={dragRef} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} />}
              {letterTiles.map((t, i) => (
                <TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove ? handleTapReplace : null} />
              ))}
              {toggles.caps && <>
                <ToolTile label="↑" title="Capitalizar" dragRef={dragRef} tileType="captool" tileValue="up" />
                <ToolTile label="↓" title="Minúscula" dragRef={dragRef} tileType="captool" tileValue="down" />
              </>}
              {toggles.accent && <ToolTile label="´" title="Acento" dragRef={dragRef} tileType="accenttool" tileValue="´" />}
            </PaletteCard>
          )}
          {syllTiles.length > 0 && (
            <PaletteCard title="Sílabas" cols={trayColumns}>
              {syllTiles.map((t, i) => <TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove ? handleTapReplace : null} />)}
            </PaletteCard>
          )}
          {wordTiles.length > 0 && (
            <PaletteCard title="Palabras" cols={trayColumns}>
              {wordTiles.map((t, i) => <TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove ? handleTapReplace : null} />)}
            </PaletteCard>
          )}
          {toggles.punc !== false && puncTiles.length > 0 && (
            <PaletteCard title="Puntuación" cols={0}>
              <div className="flex flex-wrap gap-2">
                {toggles.space !== false && <TrayTile tile={spaceTile} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove ? handleTapReplace : null} />}
                {puncTiles.map((t, i) => <TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove ? handleTapReplace : null} />)}
              </div>
            </PaletteCard>
          )}
          {toggles.space !== false && puncTiles.length === 0 && (
            <PaletteCard title="Espacio" cols={0}>
              <TrayTile tile={spaceTile} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove ? handleTapReplace : null} />
            </PaletteCard>
          )}
          {toggles.images !== false && imgTiles.length > 0 && (
            <PaletteCard title="Imágenes" cols={trayColumns}>
              {imgTiles.map((t, i) => <TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove ? handleTapReplace : null} />)}
            </PaletteCard>
          )}
          {config.presetId && (
            <div className="text-xs text-gray-400 text-center font-bold">
              Preset: <code className="bg-gray-100 px-1 rounded">{config.presetId}</code>
            </div>
          )}
        </aside>
      </main>

      {showQR && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-2xl p-6 text-center shadow-2xl w-80" onClick={e => e.stopPropagation()}>
            <p className="font-black text-lg mb-3">📱 Escanea para abrir</p>
            <div className="flex justify-center mb-3"><QRCodeSVG value={qrUrl} size={220} level="M" /></div>
            <p className="text-xs text-gray-400 mb-4 break-all">{qrUrl}</p>
            <button onClick={() => setShowQR(false)} className="border border-gray-300 bg-white rounded-xl px-4 py-2 text-sm font-bold hover:bg-gray-50">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Student login flow ───────────────────────────────────────────────────────
const CLASSES = ['F', 'V', 'C'];

function StudentLoginFlow({ searchParams }) {
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const preset = searchParams.get('preset');

  if (selectedClass && selectedStudent) {
    const url = `/WordSentenceBuilder?${preset ? `preset=${preset}&` : ''}student=${selectedStudent}&class=${selectedClass}`;
    window.location.href = url;
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-black text-center text-indigo-700 mb-6">🧩 Construye palabras</h1>
        {!selectedClass ? (
          <>
            <p className="text-center text-gray-500 font-bold mb-4">¿Cuál es tu clase?</p>
            <div className="flex gap-3 justify-center">
              {CLASSES.map(c => (
                <button key={c} onClick={() => setSelectedClass(c)}
                  className="w-20 h-20 rounded-2xl bg-indigo-600 text-white text-3xl font-black shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">
                  {c}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-center text-gray-500 font-bold mb-4">Clase <span className="text-indigo-700">{selectedClass}</span> — ¿Cuál es tu número?</p>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 30 }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setSelectedStudent(n)}
                  className="w-full aspect-square rounded-xl bg-indigo-50 border-2 border-indigo-200 text-indigo-700 font-black text-lg hover:bg-indigo-600 hover:text-white active:scale-95 transition-all">
                  {n}
                </button>
              ))}
            </div>
            <button onClick={() => setSelectedClass(null)} className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 font-bold">← Cambiar clase</button>
          </>
        )}
      </div>
    </div>
  );
}