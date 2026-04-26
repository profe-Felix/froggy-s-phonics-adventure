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
        if (!preset?.content) { setConfig(buildConfigFromParams(searchParams)); return; }
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
          perRow: c.perRow ?? 0,
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

// ─── Parse prefill string ─────────────────────────────────────────────────────
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
    } else { buf += ch; }
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
        [{ transform:'translateY(0)',opacity:1},{ transform:`translateY(${window.innerHeight+120}px)`,opacity:0}],
        { duration:700+Math.random()*500, easing:'ease-in' }
      );
      a.onfinish = () => el.remove();
    }
    requestAnimationFrame(frame);
  })();
}

// ─── Ghost element for touch drag ────────────────────────────────────────────
function createGhostEl(label) {
  removeGhostEl();
  const ghost = document.createElement('div');
  ghost.id = '__drag_ghost__';
  ghost.textContent = label;
  ghost.style.cssText = `position:fixed;z-index:9999;pointer-events:none;background:white;border:2px solid #4f46e5;border-radius:12px;padding:6px 14px;font-size:1.5rem;font-weight:bold;font-family:Andika,system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.25);opacity:0.92;transform:translate(-50%,-60%);white-space:nowrap;`;
  document.body.appendChild(ghost);
  return ghost;
}
function removeGhostEl() { document.getElementById('__drag_ghost__')?.remove(); }
function moveGhostEl(x, y) {
  const g = document.getElementById('__drag_ghost__');
  if (g) { g.style.left = x + 'px'; g.style.top = y + 'px'; }
}

// ─── Find nearest insert position across all tiles in a zone ─────────────────
// Queries the INNER drop container (data-drop-zone) directly so the ghost
// preview elements never pollute the slot list.
function calcBestInsertIdx(zoneEl, clientX, clientY, tileCount) {
  // Only consider real tile elements, ignore ghost/preview divs
  const slotEls = [...zoneEl.querySelectorAll('[data-slottile]')];
  if (slotEls.length === 0) return 0;

  // Snapshot rects once to avoid reflow thrashing
  const rects = slotEls.map(el => el.getBoundingClientRect());

  // Find the row (group of tiles on the same visual line) closest to clientY
  // A "row" is identified by similar top values (within 12px)
  const rowGroups = [];
  rects.forEach((r, i) => {
    const mid = (r.top + r.bottom) / 2;
    const existing = rowGroups.find(g => Math.abs(g.mid - mid) < 14);
    if (existing) { existing.items.push(i); }
    else { rowGroups.push({ mid, items: [i] }); }
  });

  // Pick the row whose vertical midpoint is closest to clientY
  let bestGroup = rowGroups[0];
  let bestDist = Math.abs(rowGroups[0].mid - clientY);
  for (const g of rowGroups) {
    const d = Math.abs(g.mid - clientY);
    if (d < bestDist) { bestDist = d; bestGroup = g; }
  }

  // Within the best row, scan left-to-right and insert before the first tile
  // whose horizontal midpoint is to the right of clientX
  for (const idx of bestGroup.items) {
    const r = rects[idx];
    if (clientX < r.left + r.width / 2) return idx;
  }
  // After the last tile in this row
  return bestGroup.items[bestGroup.items.length - 1] + 1;
}

// ─── Find which character in a text tile the cursor is over ──────────────────
function calcAccentCharIdx(tileEl, clientX) {
  if (!tileEl) return 0;
  const text = tileEl.textContent || '';
  if (text.length <= 1) return 0;
  const r = tileEl.getBoundingClientRect();
  const frac = (clientX - r.left) / r.width;
  return Math.max(0, Math.min(text.length - 1, Math.floor(frac * text.length)));
}

// ─── Palette card ─────────────────────────────────────────────────────────────
// tiles: raw array still containing '|' separators (strings), used when perRow is set
// children: used when perRow is not set (existing behavior)
function PaletteCard({ title, cols, perRow, rawTiles, renderTile, children }) {
  if (perRow > 0 && rawTiles) {
    // Split rawTiles by '|' into groups, render each group as its own row
    const groups = [[]];
    for (const item of rawTiles) {
      if (item === '|') groups.push([]);
      else groups[groups.length - 1].push(item);
    }
    const gridStyle = { display:'grid', gridTemplateColumns:`repeat(${perRow},max-content)`, gap:'6px' };
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm">
        <h2 className="text-sm font-black text-gray-600 mb-2 uppercase tracking-wide">{title}</h2>
        <div className="flex flex-col gap-2">
          {groups.filter(g => g.length > 0).map((group, gi) => (
            <div key={gi} style={gridStyle}>
              {group.map((val, ti) => renderTile(val, `${gi}-${ti}`))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const gridStyle = cols > 0
    ? { display:'grid', gridTemplateColumns:`repeat(${cols},minmax(0,1fr))`, gap:'6px' }
    : {};
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm">
      <h2 className="text-sm font-black text-gray-600 mb-2 uppercase tracking-wide">{title}</h2>
      {cols > 0 ? <div style={gridStyle}>{children}</div> : <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

// ─── Tray tile ────────────────────────────────────────────────────────────────
// NOTE: We do NOT use touch-none here — we need taps to work.
// Touch drag is handled by document-level touchstart, which checks for a movement threshold
// before committing to a drag, allowing quick taps to still fire onClick.
function TrayTile({ tile, onDragStart, activeProblem, problems, onDropIntoProblem, onTapReplace }) {
  const handleTap = () => {
    if (onTapReplace) {
      onTapReplace(tile);
    } else if (activeProblem !== null && problems && problems[activeProblem] && onDropIntoProblem) {
      const clone = { ...tile, id: Math.random().toString(36).slice(2) };
      onDropIntoProblem(activeProblem, problems[activeProblem].length, clone);
    }
  };

  return (
    <button
      data-tray-tile
      data-tile-type={tile.type}
      data-tile-value={tile.value}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; onDragStart(tile); }}
      onClick={handleTap}
      className="select-none cursor-grab active:cursor-grabbing rounded-xl border-2 border-gray-800 bg-white flex items-center justify-center font-bold text-xl min-w-[44px] h-11 px-3 hover:bg-indigo-50 shadow-sm transition-colors"
      style={{ fontFamily: 'Andika, system-ui, sans-serif' }}
    >
      {tile.type === 'space' ? <span className="w-5 h-0.5 bg-gray-400 block rounded pointer-events-none" />
       : tile.type === 'img' ? <img src={tile.value} alt="" className="max-h-9 max-w-[80px] object-contain pointer-events-none" />
       : tile.value}
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
        <input ref={inputRef} type="text" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddWord()}
          placeholder="escribe…"
          className="border-2 border-indigo-400 bg-indigo-50 rounded-xl px-2 h-11 outline-none font-bold text-base flex-1"
          onPointerDown={e => e.stopPropagation()} />
        <button onClick={handleAddWord} className="bg-indigo-600 text-white rounded-xl px-3 h-11 font-bold text-sm hover:bg-indigo-700 shrink-0">+</button>
      </div>
      {tiles.length > 0 && (
        <div className="flex flex-wrap gap-2 bg-indigo-50 rounded-xl p-2 border border-indigo-200">
          {tiles.map((t, idx) => (
            <button key={t.id}
              data-tray-tile data-tile-type={t.type} data-tile-value={t.value}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'copy';
                dragRef.current = { tile: { ...t, id: Math.random().toString(36).slice(2) }, fromProblem: null };
              }}
              onClick={() => handleTileTap(t)}
              onContextMenu={(e) => { e.preventDefault(); setTiles(prev => prev.filter((_,i) => i!==idx)); }}
              className="rounded-xl border-2 border-gray-800 bg-white flex items-center justify-center font-bold text-base px-3 h-10 hover:bg-indigo-50 shadow-sm cursor-grab"
              style={{ fontFamily: 'Andika, system-ui, sans-serif' }}>
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
    <button
      draggable
      data-tray-tile
      data-tile-type={tileType}
      data-tile-value={tileValue}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        dragRef.current = { tile: createTile(tileType, tileValue), fromProblem: null };
      }}
      title={title}
      className="cursor-grab rounded-xl border-2 border-gray-400 bg-gray-50 flex items-center justify-center w-11 h-11 text-lg font-black hover:bg-gray-100 select-none touch-none">
      {label}
    </button>
  );
}

// ─── InlineTile ───────────────────────────────────────────────────────────────
function InlineTile({ tile, onDragStart, pendingRemove, tileIdx, onTap, swapMode, toolHover, accentCharIdx, isDropTarget }) {
  const isSelected = pendingRemove === tile.id;
  const isToolHighlight = toolHover === tileIdx;

  if (tile.type === 'space') {
    let bg = 'transparent';
    if (isSelected) bg = swapMode ? 'rgba(156,163,175,0.25)' : 'rgba(239,68,68,0.15)';
    if (isToolHighlight) bg = 'rgba(59,130,246,0.20)';
    return (
      <button onClick={(e) => { e.stopPropagation(); onTap(); }}
        data-slottile data-tile-id={tile.id}
        draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
        className="inline-block transition-colors"
        style={{ width:'0.55em', height:'1.5em', verticalAlign:'baseline', flexShrink:0, background:bg,
          borderRadius:'3px', border: isToolHighlight ? '1px solid #3b82f6' : isDropTarget ? '2px solid #3b82f6' : 'none',
          cursor:'pointer', padding:0, margin:0 }} />
    );
  }

  if (tile.type === 'write' || tile.type === 'text' || tile.type === 'punc') {
    let color = '#1f2937', bg = 'transparent', outline = 'none';
    if (isSelected) { color = swapMode ? '#9ca3af' : '#ef4444'; bg = swapMode ? 'rgba(156,163,175,0.15)' : 'rgba(239,68,68,0.10)'; }
    if (isToolHighlight) { bg = 'rgba(59,130,246,0.20)'; color = '#1d4ed8'; outline = '2px solid rgba(59,130,246,0.55)'; }
    if (isDropTarget && !isSelected) { outline = '2px dashed #3b82f6'; }

    const displayText = accentCharIdx !== null && tile.type === 'text'
      ? [...String(tile.value||'')].map((ch,idx) => (
          <span key={idx} style={{
            color: idx===accentCharIdx ? '#dc2626' : 'inherit',
            background: idx===accentCharIdx ? 'rgba(220,38,38,0.15)' : 'transparent',
            borderRadius: idx===accentCharIdx ? '4px' : 0,
            padding: idx===accentCharIdx ? '0 1px' : 0
          }}>{ch}</span>
        ))
      : tile.value;

    return (
      <button draggable onDragStart={(e) => { e.dataTransfer.effectAllowed='move'; onDragStart(); }}
        onClick={(e) => { e.stopPropagation(); onTap(); }}
        data-slottile data-tile-id={tile.id}
        className="font-bold transition-colors cursor-grab active:cursor-grabbing rounded"
        style={{ background:bg, outline, border:'none', padding:0, margin:0,
          font:'inherit', color, fontSize:'1.875rem', fontWeight:'bold',
          verticalAlign:'baseline', fontFamily:'Andika,system-ui,sans-serif', lineHeight:1.1 }}>
        {displayText}
      </button>
    );
  }

  if (tile.type === 'img') {
    return (
      <img draggable onDragStart={(e) => { e.dataTransfer.effectAllowed='move'; onDragStart(); }}
        onClick={(e) => e.stopPropagation()}
        data-slottile data-tile-id={tile.id}
        src={tile.value} alt=""
        className="max-h-10 max-w-[80px] object-contain cursor-pointer hover:opacity-70 rounded"
        style={{
          outline: isToolHighlight ? '2px solid rgba(59,130,246,0.55)' : 'none',
          background: isToolHighlight ? 'rgba(59,130,246,0.20)' : 'transparent',
          padding: isToolHighlight ? '2px' : 0, margin:'0 3px'
        }} />
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

  const onDragOver = (e) => {
    e.preventDefault(); e.stopPropagation();
    const d = dragRef.current;
    if (!d) { clearHover(); return; }

    if (d.tile?.type === 'captool' || d.tile?.type === 'accenttool') {
      const children = [...(ref.current?.querySelectorAll('[data-slottile]')||[])];
      let hi = null;
      for (let i = 0; i < children.length; i++) {
        const r = children[i].getBoundingClientRect();
        if (e.clientX>=r.left && e.clientX<=r.right && e.clientY>=r.top && e.clientY<=r.bottom
            && (tiles[i]?.type==='text'||tiles[i]?.type==='write')) {
          hi = i;
          if (d.tile.type === 'accenttool') {
            setAccentCharIdx(calcAccentCharIdx(children[i], e.clientX));
          }
          break;
        }
      }
      setHoverProblem(index); setHoverIdx(hi); return;
    }

    // When there's a pendingRemove tile and dragging FROM TRAY, show replace preview
    if (pendingRemove !== null && d.fromProblem === null) {
      const idx = tiles.findIndex(t => t.id === pendingRemove);
      setHoverProblem(index); setHoverIdx(idx >= 0 ? idx : null); return;
    }

    // Normal insert
    const insertIdx = ref.current ? calcBestInsertIdx(ref.current, e.clientX, e.clientY, tiles.length) : tiles.length;
    setHoverProblem(index); setHoverIdx(insertIdx);
  };

  const onDragLeave = (e) => { if (!ref.current?.contains(e.relatedTarget)) clearHover(); };

  const onDrop_ = (e) => {
    e.preventDefault(); e.stopPropagation();
    const dropIdx = hoverProblem === index && hoverIdx !== null ? hoverIdx : -1;
    clearHover();
    onDrop(dropIdx);
    setPendingRemove(null);
  };

  let border = 'border-gray-300', ring = '';
  if (showResult) {
    if (state==='correct') { border='border-green-500'; ring='ring-2 ring-green-400'; }
    else if (state==='incorrect') { border='border-red-500'; ring='ring-2 ring-red-400'; }
    else if (state==='unanswered') { border='border-gray-300 border-dashed'; }
  }

  const showHoverHere = hoverProblem === index;
  const isReplaceMode = pendingRemove !== null && dragRef.current?.fromProblem === null;
  const isDraggingNormal = dragRef.current && dragRef.current?.tile?.type !== 'captool' && dragRef.current?.tile?.type !== 'accenttool';

  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-400 font-bold text-sm mt-3 w-5 shrink-0 text-right">{index+1}.</span>
      <div ref={ref}
        data-drop-inner={index}
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop_}
        onClick={() => onActivate(isActive ? null : index)}
        className={`flex-1 relative bg-white border-2 rounded-xl flex flex-wrap items-center min-h-[56px] px-3 py-2 gap-0 transition-all cursor-pointer ${isActive?'ring-2 ring-blue-400':''} ${border} ${ring}`}>
        {tiles.length === 0 && <span className="text-gray-300 text-sm select-none pointer-events-none">Arrastra aquí…</span>}
        {tiles.map((tile, i) => (
          <React.Fragment key={tile.id}>
            {/* Show blue insertion ghost ONLY in normal (non-replace) mode */}
            {showHoverHere && hoverIdx===i && hoverIdx!==null && !isReplaceMode && isDraggingNormal && (
              <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 min-h-12 flex items-center"
                style={{ minWidth: dragRef.current?.tile?.type==='text'
                  ? `${Math.max(String(dragRef.current.tile.value||'').length*1.1,3)}ch` : '2rem' }} />
            )}
            <InlineTile
              tile={tile} tileIdx={i}
              onDragStart={() => onTileDragStart(i, tile)}
              pendingRemove={pendingRemove}
              // isDropTarget: highlight the tile that is pending-replace target
              isDropTarget={isReplaceMode && showHoverHere && hoverIdx===i}
              toolHover={showHoverHere && (dragRef.current?.tile?.type==='captool'||dragRef.current?.tile?.type==='accenttool') ? hoverIdx : null}
              accentCharIdx={showHoverHere && dragRef.current?.tile?.type==='accenttool' && hoverIdx===i ? accentCharIdx : null}
              swapMode={swapMode}
              onTap={() => {
                // Activate this problem zone when tapping any tile inside it
                onActivate(index);
                if (pendingRemove===tile.id) {
                  if (swapMode) { onRemoveTile(i); setPendingRemove(null); }
                  else setPendingRemove(null);
                } else {
                  setPendingRemove(tile.id);
                }
              }}
            />
          </React.Fragment>
        ))}
        {/* Append ghost at end in normal mode */}
        {showHoverHere && hoverIdx===tiles.length && hoverIdx!==null && !isReplaceMode && isDraggingNormal && (
          <div className="rounded-lg border-2 border-dashed border-blue-400 bg-blue-50 px-1 py-0.5 h-12 flex items-center justify-center"
            style={{ minWidth: dragRef.current?.tile?.type==='text'
              ? `${Math.max(String(dragRef.current.tile.value||'').length*1.1,3)}ch` : '2rem',
              fontSize:'0.75rem', color:'#60a5fa', fontWeight:'bold' }}>↓</div>
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
  const [sessionRestored, setSessionRestored] = useState(false);
  const [sessionId, setSessionId] = useState(null); // DB session record id
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);

  const dragRef = useRef(null);
  const [hoverProblem, setHoverProblem] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [accentCharIdx, setAccentCharIdx] = useState(null);

  const eventsRef = useRef([]);
  const startTimeRef = useRef(Date.now());

  const recordEvent = useCallback((type, problemIdx, extraData = {}) => {
    eventsRef.current.push({ t: Date.now()-startTimeRef.current, type, problemIdx, ...extraData });
  }, []);

  // ── Keep a ref so save always has latest problems ─────────────────────────
  const problemsRef = useRef(problems);
  useEffect(() => { problemsRef.current = problems; }, [problems]);
  const sessionIdRef = useRef(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // ── DB save (mirrors notebook pattern) ────────────────────────────────────
  const saveSession = useCallback(async () => {
    if (!config?.isStudent || !config.studentNumber || !config.className) return;
    if (saveInFlightRef.current) { pendingSaveRef.current = true; return; }
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const data = JSON.stringify(problemsRef.current);
      const sid = sessionIdRef.current;
      if (sid) {
        await base44.entities.WordBuilderSession.update(sid, {
          problems_data: data,
          last_active: new Date().toISOString(),
        });
      }
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
      if (pendingSaveRef.current) { pendingSaveRef.current = false; void saveSession(); }
    }
  }, [config]);

  // Save on visibility hide / page hide
  useEffect(() => {
    const onHide = () => { void saveSession(); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onHide(); });
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [saveSession]);

  // Auto-save every 15s
  useEffect(() => {
    if (!config?.isStudent) return;
    const interval = setInterval(() => { void saveSession(); }, 15000);
    return () => clearInterval(interval);
  }, [saveSession, config]);

  // ── Config loaded: find/create DB session, restore or init fresh ──────────
  useEffect(() => {
    if (!config) return;
    const np = config.numProblems || 1;
    setNumProblems(np);
    setNumProblemsInput(np);
    setShowResult(false);
    setSubmitted(false);
    eventsRef.current = [];
    startTimeRef.current = Date.now();

    if (!config.isStudent || !config.studentNumber || !config.className || !config.presetId) {
      initProblems(np, config.prefillProblems, config.punc);
      return;
    }

    // Look for existing session in DB
    (async () => {
      try {
        const existing = await base44.entities.WordBuilderSession.filter({
          student_number: parseInt(config.studentNumber),
          class_name: config.className,
          preset_id: config.presetId,
        });
        if (existing.length > 0) {
          const sess = existing.sort((a,b) => new Date(b.updated_date||0) - new Date(a.updated_date||0))[0];
          setSessionId(sess.id);
          sessionIdRef.current = sess.id;
          if (sess.submitted) setSubmitted(true);
          // Restore tile state
          try {
            const savedProblems = JSON.parse(sess.problems_data || 'null');
            if (Array.isArray(savedProblems) && savedProblems.length === np) {
              setProblems(savedProblems);
              setProblemStates(Array(np).fill(null));
              setSessionRestored(true);
              setTimeout(() => setSessionRestored(false), 3000);
              return;
            }
          } catch {}
        } else {
          // Create new session
          const fresh = initProblemsReturn(np, config.prefillProblems, config.punc);
          const sess = await base44.entities.WordBuilderSession.create({
            student_number: parseInt(config.studentNumber),
            class_name: config.className,
            preset_id: config.presetId,
            num_problems: np,
            problems_data: JSON.stringify(fresh),
            submitted: false,
            last_active: new Date().toISOString(),
          });
          setSessionId(sess.id);
          sessionIdRef.current = sess.id;
          setProblems(fresh);
          setProblemStates(Array(np).fill(null));
          return;
        }
      } catch {}
      initProblems(np, config.prefillProblems, config.punc);
    })();
  }, [config]);

  // ── Touch drag ────────────────────────────────────────────────────────────
  // Uses a movement threshold (10px) before committing to drag so taps still fire.
  // The key fix: we query the INNER drop container ([data-drop-inner]) for insert
  // position, not the outer wrapper, to avoid ghost-element interference.
  // Also fully handles captool/accenttool on touch.
  useEffect(() => {
    const DRAG_THRESHOLD = 10;

    // Find the inner drop zone container at (x,y)
    const findInnerZone = (x, y) => {
      const zones = document.querySelectorAll('[data-drop-inner]');
      for (const zone of zones) {
        const r = zone.getBoundingClientRect();
        if (x>=r.left && x<=r.right && y>=r.top && y<=r.bottom) return zone;
      }
      return null;
    };

    const handleTouchStart = (e) => {
      const target = e.target.closest('[data-tray-tile],[data-slottile]');
      if (!target) return;

      const touch0 = e.touches[0];
      const startX = touch0.clientX;
      const startY = touch0.clientY;
      let dragging = false;
      let pendingDragData = null;
      // For accenttool: track which char is being hovered
      let touchAccentCharIdx = 0;

      const tileType = target.dataset.tileType;
      const tileValue = target.dataset.tileValue;
      const tileId = target.dataset.tileId;
      const isTray = !!target.closest('[data-tray-tile]');

      if (isTray && tileType) {
        pendingDragData = { tile: createTile(tileType, tileValue), fromProblem: null };
      } else if (tileId) {
        const probs = problemsRef.current;
        for (let pi = 0; pi < probs.length; pi++) {
          const ti = probs[pi].findIndex(t => t.id === tileId);
          if (ti >= 0) {
            pendingDragData = { tile: probs[pi][ti], fromProblem: [pi, ti] };
            break;
          }
        }
      }

      if (!pendingDragData) return;

      const isTool = tileType === 'captool' || tileType === 'accenttool';
      const ghostLabel = tileType === 'space' ? '␣' : (tileValue || target.textContent?.trim() || '?');

      const onTouchMove = (ev) => {
        const t = ev.touches[0];
        const dx = t.clientX - startX, dy = t.clientY - startY;

        if (!dragging) {
          if (Math.sqrt(dx*dx + dy*dy) < DRAG_THRESHOLD) {
            ev.preventDefault(); // block scroll while deciding
            return;
          }
          dragging = true;
          dragRef.current = pendingDragData;
          createGhostEl(ghostLabel);
        }

        ev.preventDefault();
        moveGhostEl(t.clientX, t.clientY);

        const innerZone = findInnerZone(t.clientX, t.clientY);
        if (innerZone) {
          const zoneIndex = parseInt(innerZone.dataset.dropInner);
          const probs = problemsRef.current;

          if (isTool) {
            // For tools: find which text tile is under the finger
            const slotEls = [...innerZone.querySelectorAll('[data-slottile]')];
            let hi = null;
            for (let i = 0; i < slotEls.length; i++) {
              const r = slotEls[i].getBoundingClientRect();
              const tileData = probs[zoneIndex]?.[i];
              if (t.clientX>=r.left && t.clientX<=r.right && t.clientY>=r.top && t.clientY<=r.bottom
                  && (tileData?.type==='text'||tileData?.type==='write')) {
                hi = i;
                if (tileType === 'accenttool') {
                  touchAccentCharIdx = calcAccentCharIdx(slotEls[i], t.clientX);
                  setAccentCharIdx(touchAccentCharIdx);
                }
                break;
              }
            }
            setHoverProblem(zoneIndex);
            setHoverIdx(hi);
          } else {
            const insertIdx = calcBestInsertIdx(innerZone, t.clientX, t.clientY, (probs[zoneIndex]||[]).length);
            setHoverProblem(zoneIndex);
            setHoverIdx(insertIdx);
          }
        } else {
          setHoverProblem(null); setHoverIdx(null); setAccentCharIdx(null);
        }
      };

      const onTouchEnd = (ev) => {
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);

        if (!dragging) return; // Was a tap — let click fire naturally

        ev.preventDefault();
        removeGhostEl();
        dragRef.current = null;

        const ct = ev.changedTouches[0];

        // Check trash
        const trashEl = document.getElementById('__trash_zone__');
        if (trashEl) {
          const tr = trashEl.getBoundingClientRect();
          if (ct.clientX>=tr.left && ct.clientX<=tr.right && ct.clientY>=tr.top && ct.clientY<=tr.bottom) {
            if (pendingDragData?.fromProblem) {
              const [fp,fi] = pendingDragData.fromProblem;
              setProblems(prev => {
                const next = prev.map(p=>[...(p||[])]);
                next[fp].splice(fi,1);
                return next;
              });
            }
            setHoverProblem(null); setHoverIdx(null); setAccentCharIdx(null);
            return;
          }
        }

        const innerZone = findInnerZone(ct.clientX, ct.clientY);
        if (innerZone) {
          const zoneIndex = parseInt(innerZone.dataset.dropInner);
          const probs = problemsRef.current;

          if (isTool) {
            // Apply captool / accenttool on touch drop
            const slotEls = [...innerZone.querySelectorAll('[data-slottile]')];
            let targetIdx = null;
            for (let i = 0; i < slotEls.length; i++) {
              const r = slotEls[i].getBoundingClientRect();
              const tileData = probs[zoneIndex]?.[i];
              if (ct.clientX>=r.left && ct.clientX<=r.right && ct.clientY>=r.top && ct.clientY<=r.bottom
                  && (tileData?.type==='text'||tileData?.type==='write')) {
                targetIdx = i;
                break;
              }
            }
            if (targetIdx !== null) {
              const capturedAccentIdx = touchAccentCharIdx;
              setProblems(prev => {
                if (!Array.isArray(prev)) return prev;
                const next = prev.map(p=>(p||[]).map(t=>({...t})));
                const problem = next[zoneIndex];
                if (!problem[targetIdx]||problem[targetIdx].type!=='text') return prev;
                const target = problem[targetIdx];
                if (tileType==='captool') {
                  target.value = tileValue==='up'
                    ? target.value.charAt(0).toUpperCase()+target.value.slice(1)
                    : target.value.charAt(0).toLowerCase()+target.value.slice(1);
                } else {
                  const PLAIN_TO_ACC = {a:'á',e:'é',i:'í',o:'ó',u:'ú',A:'Á',E:'É',I:'Í',O:'Ó',U:'Ú'};
                  const ACC_TO_PLAIN = {á:'a',é:'e',í:'i',ó:'o',ú:'u',Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U'};
                  const chars = [...String(target.value||'')];
                  const ci = capturedAccentIdx ?? 0;
                  if (ci>=0&&ci<chars.length) {
                    const ch = chars[ci];
                    chars[ci] = PLAIN_TO_ACC[ch]||ACC_TO_PLAIN[ch]||ch;
                    target.value = chars.join('');
                  }
                }
                return next;
              });
              setShowResult(false);
            }
          } else {
            const insertIdx = calcBestInsertIdx(innerZone, ct.clientX, ct.clientY, (probs[zoneIndex]||[]).length);
            handleDropTouch(pendingDragData, zoneIndex, insertIdx);
          }
        }

        setHoverProblem(null); setHoverIdx(null); setAccentCharIdx(null);
      };

      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    return () => document.removeEventListener('touchstart', handleTouchStart);
  }, []); // eslint-disable-line

  // ── Touch drop handler (mirrors handleDrop but takes explicit dragData) ────
  const handleDropTouch = (d, problemIdx, replaceIdx) => {
    if (!d) return;
    const tile = d.tile;
    const [fromProblemIdx, fromTileIdx] = d.fromProblem || [null, null];

    if (fromProblemIdx === problemIdx && fromTileIdx !== null) {
      setProblems(prev => {
        if (!Array.isArray(prev)) return prev;
        const next = prev.map(p=>[...(p||[])]);
        const problem = next[problemIdx];
        if (fromTileIdx<0||fromTileIdx>=problem.length) return prev;
        const [moved] = problem.splice(fromTileIdx,1);
        let ins = replaceIdx>=0 ? replaceIdx : problem.length;
        if (ins>fromTileIdx) ins--;
        ins = Math.max(0,Math.min(ins,problem.length));
        problem.splice(ins,0,moved);
        return next;
      });
      setShowResult(false); return;
    }

    const newTile = { ...tile, id: Math.random().toString(36).slice(2) };
    setProblems(prev => {
      if (!Array.isArray(prev)) return prev;
      const next = prev.map(p=>[...(p||[])]);
      const problem = next[problemIdx];
      const ins = replaceIdx>=0 ? Math.max(0,Math.min(replaceIdx,problem.length)) : problem.length;
      problem.splice(ins,0,newTile);
      return next;
    });
    setShowResult(false);
  };

  function buildInitialProblems(np, prefill, punc) {
    return Array.from({ length:np }, (_,i) => {
      const pre = prefill?.[i];
      if (!pre) return [];
      if (typeof pre==='string') return parsePrefillString(pre, punc||DEFAULT_PUNC);
      if (Array.isArray(pre)) return pre.flatMap(s=>typeof s==='string'?parsePrefillString(s,punc||DEFAULT_PUNC):[]);
      return [];
    });
  }

  function initProblemsReturn(np, prefill, punc) {
    const ps = buildInitialProblems(np, prefill, punc);
    return ps;
  }

  function initProblems(np, prefill, punc) {
    const ps = buildInitialProblems(np, prefill, punc);
    setProblems(ps);
    setProblemStates(Array(np).fill(null));
  }

  function applyProblems() {
    const np = Math.max(1,Math.min(50,parseInt(numProblemsInput)||1));
    setNumProblems(np);
    setProblems(prev => {
      const safe = Array.isArray(prev)?prev:[];
      if (safe.length>=np) return safe.slice(0,np);
      return [...safe,...Array.from({length:np-safe.length},()=>[])];
    });
    setProblemStates(Array(np).fill(null));
    setShowResult(false);
  }

  const handleTrayDragStart = (tile) => {
    dragRef.current = { tile:{...tile,id:Math.random().toString(36).slice(2)}, fromProblem:null };
  };

  const handleTapReplace = (tile) => {
    if (activeProblem===null||pendingRemove===null) return;
    const targetIdx = problems[activeProblem].findIndex(t=>t.id===pendingRemove);
    if (targetIdx>=0) {
      setProblems(prev => {
        const next = prev.map(p=>[...(p||[])]);
        next[activeProblem][targetIdx] = {...tile, id:Math.random().toString(36).slice(2)};
        return next;
      });
      setPendingRemove(null); setShowResult(false);
    }
  };

  const handleDropIntoProblem = (problemIdx, insertIdx, tile) => {
    setProblems(prev => {
      if (!Array.isArray(prev)) return prev;
      const next = prev.map(p=>[...(p||[])]);
      next[problemIdx].splice(insertIdx,0,tile);
      return next;
    });
    recordEvent('place', problemIdx, { tileValue:tile.value, insertIdx });
    setShowResult(false);
    setTimeout(() => saveSession(), 500);
  };

  const handleDrop = (problemIdx, dropIdx) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setHoverProblem(null); setHoverIdx(null); setAccentCharIdx(null);

    const tile = d.tile;
    const [fromProblemIdx, fromTileIdx] = d.fromProblem || [null,null];

    // Tool tiles
    if (tile.type==='captool'||tile.type==='accenttool') {
      // Capture accentCharIdx synchronously before clearing state
      const capturedAccentIdx = accentCharIdx;
      setProblems(prev => {
        if (!Array.isArray(prev)) return prev;
        const next = prev.map(p=>(p||[]).map(t=>({...t})));
        const problem = next[problemIdx];
        const targetIdx = dropIdx;
        if (targetIdx<0||targetIdx>=problem.length||problem[targetIdx].type!=='text') return prev;
        const target = problem[targetIdx];
        if (tile.type==='captool') {
          target.value = tile.value==='up'
            ? target.value.charAt(0).toUpperCase()+target.value.slice(1)
            : target.value.charAt(0).toLowerCase()+target.value.slice(1);
        } else {
          const PLAIN_TO_ACC = {a:'á',e:'é',i:'í',o:'ó',u:'ú',A:'Á',E:'É',I:'Í',O:'Ó',U:'Ú'};
          const ACC_TO_PLAIN = {á:'a',é:'e',í:'i',ó:'o',ú:'u',Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U'};
          const chars = [...String(target.value||'')];
          const ci = capturedAccentIdx ?? 0;
          if (ci>=0&&ci<chars.length) {
            const ch = chars[ci];
            chars[ci] = PLAIN_TO_ACC[ch]||ACC_TO_PLAIN[ch]||ch;
            target.value = chars.join('');
          }
        }
        return next;
      });
      setShowResult(false); return;
    }

    // Reorder within same problem
    if (fromProblemIdx===problemIdx && fromTileIdx!==null) {
      setProblems(prev => {
        if (!Array.isArray(prev)) return prev;
        const next = prev.map(p=>[...(p||[])]);
        const problem = next[problemIdx];
        if (fromTileIdx<0||fromTileIdx>=problem.length) return prev;
        const [moved] = problem.splice(fromTileIdx,1);
        let ins = dropIdx>=0?dropIdx:problem.length;
        if (ins>fromTileIdx) ins--;
        ins = Math.max(0,Math.min(ins,problem.length));
        problem.splice(ins,0,moved);
        return next;
      });
      setShowResult(false); return;
    }

    const newTile = {...tile, id:Math.random().toString(36).slice(2)};

    // Replace mode: pendingRemove is set AND dragging from tray
    if (pendingRemove && d.fromProblem===null) {
      // Find the pending tile's actual index (not dropIdx)
      setProblems(prev => {
        if (!Array.isArray(prev)) return prev;
        const next = prev.map(p=>[...(p||[])]);
        const targetIdx = next[problemIdx].findIndex(t=>t.id===pendingRemove);
        if (targetIdx>=0) next[problemIdx][targetIdx] = newTile;
        return next;
      });
      setPendingRemove(null);
    } else {
      setProblems(prev => {
        if (!Array.isArray(prev)) return prev;
        const next = prev.map(p=>[...(p||[])]);
        const problem = next[problemIdx];
        const ins = dropIdx>=0?Math.max(0,Math.min(dropIdx,problem.length)):problem.length;
        problem.splice(ins,0,newTile);
        return next;
      });
    }
    setShowResult(false);
    setTimeout(() => saveSession(), 500);
  };

  const handleTileDragStart = (problemIdx, tileIdx, tile) => {
    dragRef.current = { tile, fromProblem:[problemIdx,tileIdx] };
  };

  const handleRemoveTile = (problemIdx, tileIdx) => {
    setProblems(prev => {
      if (!Array.isArray(prev)) return prev;
      const next = prev.map(p=>[...(p||[])]);
      next[problemIdx].splice(tileIdx,1);
      return next;
    });
    setShowResult(false);
    setTimeout(() => saveSession(), 500);
  };

  const handleTrashDrop = (e) => {
    e.preventDefault();
    const d = dragRef.current;
    if (!d||d.fromProblem===null) return;
    const [fp,fi] = d.fromProblem;
    setProblems(prev => {
      if (!Array.isArray(prev)) return prev;
      const next = prev.map(p=>[...(p||[])]);
      next[fp].splice(fi,1);
      return next;
    });
    dragRef.current=null;
    setHoverProblem(null); setHoverIdx(null); setAccentCharIdx(null);
  };

  const validate = () => {
    if (!config?.answers) return;
    const newStates = problems.map((tiles,i) => {
      const expected = config.answers[i];
      if (!expected) return null;
      let built='';
      tiles.forEach(t => {
        if (t.type==='text'||t.type==='punc') built+=t.value;
        else if (t.type==='write') built+=t.value||'';
        else if (t.type==='space') built+=' ';
        else if (t.type==='img') built+='[img]';
      });
      built=built.trim();
      if (!built) return 'unanswered';
      return built===expected?'correct':'incorrect';
    });
    setProblemStates(newStates);
    setShowResult(true);
    const allCorrect = newStates.filter(Boolean).every(s=>s==='correct');
    if (allCorrect) launchConfetti();

    if (config.isStudent && config.studentNumber && config.className) {
      const problemsData = problems.map((tiles,i) => {
        let built='';
        tiles.forEach(t => {
          if (t.type==='text'||t.type==='punc') built+=t.value;
          else if (t.type==='space') built+=' ';
        });
        return {
          expected: config.answers?.[i]||null,
          answer: built.trim(),
          isCorrect: newStates[i]==='correct',
          tiles: tiles.map(t=>({type:t.type,value:t.value}))
        };
      });
      base44.entities.WordBuilderAttempt.create({
        student_number: parseInt(config.studentNumber),
        class_name: config.className,
        preset_id: config.presetId||'custom',
        preset_label: config.presetLabel||config.presetId||'Custom',
        num_problems: problems.length,
        problems_data: JSON.stringify(problemsData),
        events_data: JSON.stringify(eventsRef.current),
        all_correct: allCorrect,
        submitted_at: new Date().toISOString(),
      }).catch(()=>{});
      // Mark session as submitted
      setSubmitted(true);
      if (sessionIdRef.current) {
        base44.entities.WordBuilderSession.update(sessionIdRef.current, {
          submitted: true,
          problems_data: JSON.stringify(problems),
          last_active: new Date().toISOString(),
        }).catch(()=>{});
      }
    }
  };

  const qrUrl = (() => {
    try {
      const preset = config?.presetId;
      return `${window.location.origin}/WordSentenceBuilder?${preset?`preset=${preset}&`:''}login=1`;
    } catch { return window.location.href; }
  })();

  if (loading||!config) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>;
  }

  if (searchParams.get('login')==='1' && !config.isStudent) {
    return <StudentLoginFlow searchParams={searchParams} />;
  }

  const { letters=[], syllables=[], words=[], punc=[], images=[], toggles={}, trayColumns=0, perRow=0 } = config;
  const isStudent = config.isStudent;

  const letterTiles = letters.filter(l=>l!=='|').map(l=>createTile('text',l));
  const syllTiles = syllables.filter(s=>!['|','_','^','~'].includes(s)).map(s=>createTile('text',s));
  const wordTiles = words.filter(w=>!['|','_'].includes(w)).map(w=>createTile('text',w));
  const puncTiles = punc.map(p=>createTile('punc',p));
  const spaceTile = createTile('space',' ');
  const imgTiles = images.map(u=>createTile('img',u));

  // Helper to render a tray tile from a raw value (used with perRow layout)
  const makeTrayTileRenderer = (tileType) => (val, key) => {
    const t = createTile(tileType, val);
    return <TrayTile key={key} tile={t} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove?handleTapReplace:null} />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-white" style={{fontFamily:'Andika,system-ui,sans-serif'}}>
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center gap-3 flex-wrap">
          <Link to="/Lessons" className="text-blue-600 hover:underline font-bold text-sm">← Lecciones</Link>
          <h1 className="text-lg font-black text-gray-800">🧩 Construye palabras</h1>
          {sessionRestored && <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">✓ Sesión restaurada</span>}
          <div className="flex-1" />
          {!isStudent && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1 text-sm font-bold text-gray-700">
                Problemas:
                <input type="number" min={1} max={50} value={numProblemsInput}
                  onChange={e=>setNumProblemsInput(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1 w-16 text-sm" />
              </label>
              <button onClick={applyProblems} className="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-1 text-sm font-bold hover:bg-gray-50">Aplicar</button>
              {config.answers && <button onClick={validate} className="bg-blue-600 text-white rounded-lg px-4 py-1 text-sm font-bold hover:bg-blue-700">✓ Validar</button>}
              <button onClick={()=>setShowQR(true)} className="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-1 text-sm font-bold hover:bg-gray-50">QR</button>
            </div>
          )}
          {isStudent && (
            <div className="flex items-center gap-2">
              {saving && <span className="text-xs text-gray-400 animate-pulse font-bold">Guardando…</span>}
              {submitted && <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">✓ Entregado</span>}
              {config.answers && !submitted && (
                <button onClick={validate} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-blue-700">✓ Validar</button>
              )}
              {!submitted && (
                <button onClick={() => {
                  validate();
                }} className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-green-700 shadow-md">
                  📤 Entregar
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 py-4 flex flex-col lg:flex-row gap-5">
        <section className="lg:w-1/2 min-w-0">
          <div className="bg-white border-2 border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
            {(problems||[]).map((tiles,pi) => (
              <div key={pi} data-problem-zone={pi}>
                <ProblemZone
                  index={pi} tiles={tiles} state={problemStates[pi]} showResult={showResult}
                  dragRef={dragRef}
                  hoverProblem={hoverProblem} setHoverProblem={setHoverProblem}
                  hoverIdx={hoverIdx} setHoverIdx={setHoverIdx}
                  accentCharIdx={accentCharIdx} setAccentCharIdx={setAccentCharIdx}
                  swapMode={swapMode} pendingRemove={pendingRemove} setPendingRemove={setPendingRemove}
                  onDrop={(idx)=>handleDrop(pi,idx)}
                  onTileDragStart={(ti,tile)=>handleTileDragStart(pi,ti,tile)}
                  onRemoveTile={(ti)=>handleRemoveTile(pi,ti)}
                  isActive={activeProblem===pi} onActivate={setActiveProblem}
                />
              </div>
            ))}
            <div className="mt-1 flex items-center gap-2">
              <button
                id="__trash_zone__"
                onDragOver={e=>e.preventDefault()} onDrop={handleTrashDrop}
                onClick={() => {
                  if (pendingRemove) {
                    const pi = problems.findIndex(row => row.some(t => t.id === pendingRemove));
                    if (pi >= 0) {
                      const ti = problems[pi].findIndex(t => t.id === pendingRemove);
                      if (ti >= 0) handleRemoveTile(pi, ti);
                    }
                    setPendingRemove(null);
                  }
                }}
                className={`flex items-center gap-2 border-2 border-dashed rounded-xl px-3 py-1.5 text-sm font-bold transition-colors ${pendingRemove ? 'bg-red-100 border-red-500 text-red-600 cursor-pointer hover:bg-red-200' : 'bg-red-50 border-red-300 text-red-400 cursor-default'}`}>
                🗑️ {pendingRemove ? 'Toca para borrar' : 'Suelta aquí para borrar'}
              </button>
              {showResult && (
                <button onClick={()=>{setShowResult(false);setProblemStates(Array(numProblems).fill(null));}}
                  className="text-xs text-gray-400 hover:text-gray-600 font-bold underline">
                  Limpiar resultados
                </button>
              )}
            </div>
          </div>
        </section>

        <aside className="lg:w-1/2 flex flex-col gap-3">
          {toggles.write && (
            <PaletteCard title="Escribe" cols={0}>
              <WriteTile dragRef={dragRef} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} />
              {letterTiles.length===0 && (toggles.caps||toggles.accent) && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {toggles.caps && <>
                    <ToolTile label="↑" title="Capitalizar" dragRef={dragRef} tileType="captool" tileValue="up" />
                    <ToolTile label="↓" title="Minúscula" dragRef={dragRef} tileType="captool" tileValue="down" />
                  </>}
                  {toggles.accent && <ToolTile label="´" title="Acento" dragRef={dragRef} tileType="accenttool" tileValue="´" />}
                </div>
              )}
            </PaletteCard>
          )}
          {letterTiles.length>0 && (
            <PaletteCard title="Letras" cols={trayColumns} perRow={perRow} rawTiles={perRow>0?letters:null} renderTile={makeTrayTileRenderer('text')}>
              {letterTiles.map((t,i)=><TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove?handleTapReplace:null} />)}
              {toggles.caps && <>
                <ToolTile label="↑" title="Capitalizar" dragRef={dragRef} tileType="captool" tileValue="up" />
                <ToolTile label="↓" title="Minúscula" dragRef={dragRef} tileType="captool" tileValue="down" />
              </>}
              {toggles.accent && <ToolTile label="´" title="Acento" dragRef={dragRef} tileType="accenttool" tileValue="´" />}
            </PaletteCard>
          )}
          {syllTiles.length>0 && (
            <PaletteCard title="Sílabas" cols={trayColumns} perRow={perRow} rawTiles={perRow>0?syllables:null} renderTile={makeTrayTileRenderer('text')}>
              {syllTiles.map((t,i)=><TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove?handleTapReplace:null} />)}
            </PaletteCard>
          )}
          {wordTiles.length>0 && (
            <PaletteCard title="Palabras" cols={trayColumns} perRow={perRow} rawTiles={perRow>0?words:null} renderTile={makeTrayTileRenderer('text')}>
              {wordTiles.map((t,i)=><TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove?handleTapReplace:null} />)}
            </PaletteCard>
          )}
          {toggles.punc!==false&&puncTiles.length>0 && (
            <PaletteCard title="Puntuación" cols={0}>
              <div className="flex flex-wrap gap-2">
                {toggles.space!==false && <TrayTile tile={spaceTile} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove?handleTapReplace:null} />}
                {puncTiles.map((t,i)=><TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove?handleTapReplace:null} />)}
              </div>
            </PaletteCard>
          )}
          {toggles.space!==false&&puncTiles.length===0 && (
            <PaletteCard title="Espacio" cols={0}>
              <TrayTile tile={spaceTile} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove?handleTapReplace:null} />
            </PaletteCard>
          )}
          {toggles.images!==false&&imgTiles.length>0 && (
            <PaletteCard title="Imágenes" cols={trayColumns}>
              {imgTiles.map((t,i)=><TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} activeProblem={activeProblem} problems={problems} onDropIntoProblem={handleDropIntoProblem} onTapReplace={pendingRemove?handleTapReplace:null} />)}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={()=>setShowQR(false)}>
          <div className="bg-white rounded-2xl p-6 text-center shadow-2xl w-80" onClick={e=>e.stopPropagation()}>
            <p className="font-black text-lg mb-3">📱 Escanea para abrir</p>
            <div className="flex justify-center mb-3"><QRCodeSVG value={qrUrl} size={220} level="M" /></div>
            <p className="text-xs text-gray-400 mb-4 break-all">{qrUrl}</p>
            <button onClick={()=>setShowQR(false)} className="border border-gray-300 bg-white rounded-xl px-4 py-2 text-sm font-bold hover:bg-gray-50">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Student login flow ───────────────────────────────────────────────────────
const CLASSES = ['F','V','C'];

function StudentLoginFlow({ searchParams }) {
  const [selectedClass, setSelectedClass] = useState(null);
  const preset = searchParams.get('preset');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-black text-center text-indigo-700 mb-6">🧩 Construye palabras</h1>
        {!selectedClass ? (
          <>
            <p className="text-center text-gray-500 font-bold mb-4">¿Cuál es tu clase?</p>
            <div className="flex gap-3 justify-center">
              {CLASSES.map(c=>(
                <button key={c} onClick={()=>setSelectedClass(c)}
                  className="w-20 h-20 rounded-2xl bg-indigo-600 text-white text-3xl font-black shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">{c}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-center text-gray-500 font-bold mb-4">Clase <span className="text-indigo-700">{selectedClass}</span> — ¿Cuál es tu número?</p>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({length:30},(_,i)=>i+1).map(n=>(
                <button key={n}
                  onClick={()=>{ window.location.href=`/WordSentenceBuilder?${preset?`preset=${preset}&`:''}student=${n}&class=${selectedClass}`; }}
                  className="w-full aspect-square rounded-xl bg-indigo-50 border-2 border-indigo-200 text-indigo-700 font-black text-lg hover:bg-indigo-600 hover:text-white active:scale-95 transition-all">{n}</button>
              ))}
            </div>
            <button onClick={()=>setSelectedClass(null)} className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 font-bold">← Cambiar clase</button>
          </>
        )}
      </div>
    </div>
  );
}