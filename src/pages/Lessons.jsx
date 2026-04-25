import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

const SUPABASE_PRESETS_URL =
  'https://dmlsiyyqpcupbizpxwhp.supabase.co/storage/v1/object/public/app-presets/wordbuilder/presets.json';

const DEFAULT_LETTERS = ['a','e','i','o','u'];
const DEFAULT_SYLL    = ['ma','me','mi','mo','mu'];
const DEFAULT_WORDS   = [];
const DEFAULT_PUNC    = ['¿','?','¡','!',',','.'];

const PLAIN_TO_ACC = { a:'á',e:'é',i:'í',o:'ó',u:'ú',A:'Á',E:'É',I:'Í',O:'Ó',U:'Ú' };
const ACC_TO_PLAIN = { á:'a',é:'e',í:'i',ó:'o',ú:'u',Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U' };

function parseList(raw) {
  if (!raw) return null;
  const lo = raw.toLowerCase();
  if (['','off','false','0','none'].includes(lo)) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function usePreset(searchParams) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const presetId = searchParams.get('preset');
    if (!presetId) {
      // Build config from URL params directly
      const cfg = buildConfigFromParams(searchParams);
      setConfig(cfg);
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
          letters:   c.letters   ?? parseList(searchParams.get('letters'))   ?? DEFAULT_LETTERS,
          syllables: c.syllables ?? parseList(searchParams.get('syll'))       ?? DEFAULT_SYLL,
          words:     c.words     ?? parseList(searchParams.get('words'))      ?? DEFAULT_WORDS,
          punc:      c.punc      ?? parseList(searchParams.get('punc'))       ?? DEFAULT_PUNC,
          images:    c.images    ?? parseList(searchParams.get('imgs'))       ?? [],
          answers:   c.answers   ?? null,
          boxesPerRow: c.boxes   ?? parseInt(searchParams.get('boxes')) || 4,
          numRows:     c.rows    ?? parseInt(searchParams.get('rows'))  || 1,
          toggles: {
            space:  c.toggles?.space  !== false,
            caps:   c.toggles?.caps   !== false,
            accent: c.toggles?.accent !== false,
            punc:   c.toggles?.punc   !== false,
            images: c.toggles?.images !== false,
            write:  c.toggles?.write  === true,
          },
          prefillRows: c.prefillRows ?? null,
          isStudent: searchParams.has('student'),
          presetId,
        });
      })
      .catch(() => setConfig(buildConfigFromParams(searchParams)))
      .finally(() => setLoading(false));
  }, [searchParams.toString()]);

  return { config, loading };
}

function buildConfigFromParams(sp) {
  return {
    letters:   parseList(sp.get('letters'))   ?? DEFAULT_LETTERS,
    syllables: parseList(sp.get('syll'))       ?? DEFAULT_SYLL,
    words:     parseList(sp.get('words'))      ?? DEFAULT_WORDS,
    punc:      parseList(sp.get('punc'))       ?? DEFAULT_PUNC,
    images:    parseList(sp.get('imgs'))       ?? [],
    answers:   sp.get('answers') ? sp.get('answers').split('|').map(s => s.trim()) : null,
    boxesPerRow: parseInt(sp.get('boxes')) || 4,
    numRows:     parseInt(sp.get('rows'))  || 1,
    toggles: {
      space:  !['0','off','false'].includes((sp.get('space')||'').toLowerCase()),
      caps:   !['0','off','false'].includes((sp.get('caps')||'').toLowerCase()),
      accent: !['0','off','false'].includes((sp.get('accent')||'').toLowerCase()),
      punc:   !['0','off','false'].includes((sp.get('punc')||'').toLowerCase()),
      images: !['0','off','false'].includes((sp.get('imgs')||'').toLowerCase()),
      write:  ['1','on','true'].includes((sp.get('write')||'').toLowerCase()),
    },
    prefillRows: null,
    isStudent: sp.has('student'),
    presetId: sp.get('preset') || null,
  };
}

// ─── Tile Types ───────────────────────────────────────────────────────────────
function createTile(type, value) {
  return { id: Math.random().toString(36).slice(2), type, value };
}

// ─── Single Tile Visual ───────────────────────────────────────────────────────
const Tile = React.forwardRef(function Tile(
  { tile, inSlot, onPointerDown, style, className = '', dragging },
  ref
) {
  const base =
    'select-none touch-none cursor-grab active:cursor-grabbing rounded-xl border-2 border-gray-900 flex items-center justify-center font-bold transition-transform';

  if (tile.type === 'space') {
    return (
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        style={style}
        className={`${base} bg-gray-100 border-dashed px-2 text-gray-400 text-sm ${inSlot ? 'opacity-60' : 'px-3 py-2'} ${className}`}
        title="Space"
      >
        {!inSlot && <span className="w-5 h-0.5 bg-gray-400 rounded block" />}
      </div>
    );
  }
  if (tile.type === 'img') {
    return (
      <div ref={ref} onPointerDown={onPointerDown} style={style}
        className={`${base} bg-white p-1 ${inSlot ? '' : 'min-w-[48px] h-12'} ${className}`}>
        <img src={tile.value} alt="" className={inSlot ? 'max-h-10 max-w-[80px]' : 'max-h-10 max-w-[120px]'} />
      </div>
    );
  }
  if (tile.type === 'punc') {
    return (
      <div ref={ref} onPointerDown={onPointerDown} style={style}
        className={`${base} bg-white min-w-[32px] h-12 px-2 text-2xl ${className}`}>
        {tile.value}
      </div>
    );
  }
  if (tile.type === 'write') {
    return (
      <div ref={ref} onPointerDown={onPointerDown} style={style}
        className={`${base} bg-indigo-50 border-dashed min-w-[48px] h-12 px-2 text-xl ${className}`}>
        <input
          type="text"
          className="bg-transparent outline-none font-bold w-full text-center"
          placeholder="…"
          style={{ minWidth: 32, maxWidth: 120 }}
          onPointerDown={e => e.stopPropagation()}
          onChange={e => { tile.value = e.target.value; }}
        />
      </div>
    );
  }
  // text tile
  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      style={style}
      className={`${base} bg-white min-w-[48px] h-12 px-3 text-2xl ${inSlot ? 'text-3xl min-w-0 h-auto px-0 bg-transparent border-none shadow-none' : ''} ${dragging ? 'opacity-90 shadow-2xl scale-95' : ''} ${className}`}
    >
      {tile.value}
    </div>
  );
});

// ─── Drop Slot ────────────────────────────────────────────────────────────────
function DropSlot({ tiles, onDrop, onRemoveTile, onCapToggle, onAccentToggle, state, showResult, answer }) {
  const slotRef = useRef(null);

  const getInsertIndex = (clientX) => {
    const children = [...slotRef.current.querySelectorAll('[data-tile-id]')];
    if (!children.length) return 0;
    for (let i = 0; i < children.length; i++) {
      const r = children[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return children.length;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const idx = getInsertIndex(e.clientX);
    onDrop(idx);
  };

  let borderClass = 'border-gray-900';
  if (showResult) {
    if (state === 'correct') borderClass = 'border-green-500 outline outline-2 outline-green-400';
    else if (state === 'incorrect') borderClass = 'border-red-500 outline outline-2 outline-red-400';
    else if (state === 'unanswered') borderClass = 'border-gray-400 border-dashed';
  }

  return (
    <div
      ref={slotRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative bg-white border-2 rounded-xl flex flex-wrap items-center gap-0 min-h-[56px] px-4 pr-10 py-1 transition-all ${borderClass}`}
      style={{ minWidth: 120 }}
    >
      {tiles.length === 0 && (
        <span className="text-gray-300 text-sm pointer-events-none select-none">···</span>
      )}
      {tiles.map((tile, i) => {
        const isSpace = tile.type === 'space';
        return (
          <div
            key={tile.id}
            data-tile-id={tile.id}
            className={`flex items-center ${isSpace ? 'mx-1' : ''}`}
          >
            {isSpace ? (
              <div
                onClick={() => onRemoveTile(i)}
                className="w-3 h-8 border-l-2 border-dotted border-gray-400 cursor-pointer hover:border-red-400 mx-1"
                title="Click to remove"
              />
            ) : tile.type === 'write' ? (
              <input
                type="text"
                defaultValue={tile.value}
                className="border-b-2 border-gray-400 outline-none font-bold text-2xl bg-transparent text-center"
                style={{ minWidth: 40, maxWidth: 120 }}
                onChange={e => { tile.value = e.target.value; }}
                onPointerDown={e => e.stopPropagation()}
              />
            ) : (
              <span
                onClick={() => onRemoveTile(i)}
                className="text-3xl font-bold cursor-pointer hover:text-red-400 transition-colors select-none"
                title="Click to remove"
              >
                {tile.value}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tray (palette) ───────────────────────────────────────────────────────────
function TrayTile({ tile, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        onDragStart(tile);
      }}
      className="select-none cursor-grab active:cursor-grabbing rounded-xl border-2 border-gray-900 bg-white flex items-center justify-center font-bold text-xl min-w-[44px] h-11 px-3 hover:bg-indigo-50 transition-colors"
    >
      {tile.type === 'space' ? <span className="w-5 h-0.5 bg-gray-400 block rounded" /> :
       tile.type === 'img'   ? <img src={tile.value} alt="" className="max-h-9 max-w-[80px]" /> :
       tile.value}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Lessons() {
  const [searchParams] = useSearchParams();
  const { config, loading } = usePreset(searchParams);

  const [boxesPerRow, setBoxesPerRow] = useState(4);
  const [numRows, setNumRows]         = useState(1);
  const [boxesInput, setBoxesInput]   = useState(4);
  const [rowsInput, setRowsInput]     = useState(1);

  // slots[row][col] = tile[]
  const [slots, setSlots] = useState([]);
  const [slotStates, setSlotStates] = useState([]); // 'correct' | 'incorrect' | 'unanswered' | null
  const [showResult, setShowResult]  = useState(false);
  const [showQR, setShowQR]          = useState(false);

  const dragRef = useRef(null); // { tile, fromSlot: [r,c,i] | null }
  const [, rerender] = useState(0);

  // ── Init slots when config loads ──────────────────────────────────────────
  useEffect(() => {
    if (!config) return;
    const bpr = config.boxesPerRow || 4;
    const nr  = config.numRows     || 1;
    setBoxesPerRow(bpr); setBoxesInput(bpr);
    setNumRows(nr);      setRowsInput(nr);
    buildSlots(bpr, nr, config.prefillRows, config.punc);
    setShowResult(false);
  }, [config]);

  function buildSlots(bpr, nr, prefillRows, punc) {
    const s = Array.from({ length: nr }, (_, ri) =>
      Array.from({ length: bpr }, (_, ci) => {
        const content = prefillRows?.[ri]?.[ci];
        if (!content) return [];
        // parse prefill string
        return parsePrefillString(content, punc || DEFAULT_PUNC);
      })
    );
    setSlots(s);
    setSlotStates(Array.from({ length: nr }, () => Array(bpr).fill(null)));
  }

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

  function applyBoxes() {
    const bpr = Math.max(1, Math.min(12, parseInt(boxesInput) || 4));
    const nr  = Math.max(1, Math.min(50, parseInt(rowsInput) || 1));
    setBoxesPerRow(bpr); setNumRows(nr);
    buildSlots(bpr, nr, null, config?.punc);
    setShowResult(false);
  }

  // ── Drag from tray ─────────────────────────────────────────────────────────
  const handleTrayDragStart = (tile) => {
    dragRef.current = { tile: { ...tile, id: Math.random().toString(36).slice(2) }, fromSlot: null };
  };

  const handleSlotDrop = (rowIdx, colIdx, insertIdx) => {
    const d = dragRef.current;
    if (!d) return;
    setSlots(prev => {
      const next = prev.map(r => r.map(c => [...c]));
      // remove from origin if from a slot
      if (d.fromSlot) {
        const [fr, fc, fi] = d.fromSlot;
        next[fr][fc].splice(fi, 1);
      }
      next[rowIdx][colIdx].splice(insertIdx, 0, d.tile);
      return next;
    });
    dragRef.current = null;
    setShowResult(false);
  };

  const handleSlotTileDragStart = (rowIdx, colIdx, tileIdx, tile) => {
    dragRef.current = { tile, fromSlot: [rowIdx, colIdx, tileIdx] };
  };

  const handleRemoveTile = (rowIdx, colIdx, tileIdx) => {
    setSlots(prev => {
      const next = prev.map(r => r.map(c => [...c]));
      next[rowIdx][colIdx].splice(tileIdx, 1);
      return next;
    });
    setShowResult(false);
  };

  // ── Trash drop ─────────────────────────────────────────────────────────────
  const handleTrashDrop = (e) => {
    e.preventDefault();
    const d = dragRef.current;
    if (!d || !d.fromSlot) return;
    const [fr, fc, fi] = d.fromSlot;
    setSlots(prev => {
      const next = prev.map(r => r.map(c => [...c]));
      next[fr][fc].splice(fi, 1);
      return next;
    });
    dragRef.current = null;
  };

  // ── Validate ───────────────────────────────────────────────────────────────
  const validate = () => {
    if (!config?.answers) return;
    const answers = config.answers;
    const newStates = slots.map((row, ri) =>
      row.map((col, ci) => {
        const idx = ri * boxesPerRow + ci;
        const expected = answers[idx];
        if (!expected) return null;

        let built = '';
        col.forEach(t => {
          if (t.type === 'text') built += t.value;
          else if (t.type === 'write') built += t.value || '';
          else if (t.type === 'space') built += ' ';
          else if (t.type === 'punc') {
            built = built.replace(/\s+$/, '') + t.value;
          }
          else if (t.type === 'img') built += '[img]';
        });
        built = built.trim();
        if (!built) return 'unanswered';
        return built === expected ? 'correct' : 'incorrect';
      })
    );
    setSlotStates(newStates);
    setShowResult(true);

    // Confetti if all correct
    const allCorrect = newStates.flat().filter(Boolean).every(s => s === 'correct');
    if (allCorrect) launchConfetti();
  };

  function launchConfetti() {
    const end = Date.now() + 900;
    (function frame() {
      if (Date.now() > end) return;
      for (let i = 0; i < 4; i++) {
        const el = document.createElement('div');
        el.style.cssText = `position:fixed;left:${Math.random()*100}vw;top:-10px;width:8px;height:8px;background:hsl(${Math.random()*360},90%,60%);border-radius:50%;opacity:.9;z-index:9999;pointer-events:none`;
        document.body.appendChild(el);
        const a = el.animate([{ transform:'translateY(0)', opacity:1 },{ transform:`translateY(${window.innerHeight+100}px)`, opacity:0 }],{ duration:700+Math.random()*400, easing:'ease-in' });
        a.onfinish = () => el.remove();
      }
      requestAnimationFrame(frame);
    })();
  }

  // ── QR URL ─────────────────────────────────────────────────────────────────
  const qrUrl = (() => {
    const u = new URL(window.location.href);
    u.searchParams.set('student', '1');
    return u.toString();
  })();

  if (loading || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const { letters=[], syllables=[], words=[], punc=[], images=[], toggles={} } = config;
  const isStudent = config.isStudent;

  // Build tray tiles
  const letterTiles  = letters.filter(l => l !== '|').map(l => createTile('text', l));
  const syllTiles    = syllables.filter(s => s !== '|' && s !== '_' && s !== '^' && s !== '~').map(s => createTile('text', s));
  const wordTiles    = words.filter(w => w !== '|' && w !== '_').map(w => createTile('text', w));
  const puncTiles    = toggles.punc !== false ? punc.map(p => createTile('punc', p)) : [];
  const spaceTile    = createTile('space', ' ');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-white" style={{ fontFamily: 'Andika, system-ui, sans-serif' }}>
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3 flex-wrap">
          <Link to="/Dashboard" className="text-blue-600 hover:underline font-bold text-sm">← Dashboard</Link>
          <h1 className="text-xl font-black text-gray-800">🧩 Construye palabras</h1>
          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-bold hidden sm:inline">
            Arrastra desde los paneles
          </span>
          <div className="flex-1" />
          {!isStudent && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1 text-sm font-bold">
                Cajas:
                <input type="number" min={1} max={12} value={boxesInput}
                  onChange={e => setBoxesInput(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1 w-16 text-sm" />
              </label>
              <label className="flex items-center gap-1 text-sm font-bold">
                Filas:
                <input type="number" min={1} max={50} value={rowsInput}
                  onChange={e => setRowsInput(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1 w-16 text-sm" />
              </label>
              <button onClick={applyBoxes}
                className="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-1 text-sm font-bold hover:bg-gray-50">
                Aplicar
              </button>
              <button onClick={validate}
                className="bg-blue-600 text-white rounded-lg px-4 py-1 text-sm font-bold hover:bg-blue-700">
                Validar
              </button>
              <button onClick={() => setShowQR(true)}
                className="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-1 text-sm font-bold hover:bg-gray-50">
                QR
              </button>
            </div>
          )}
          {isStudent && (
            <button onClick={validate}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-blue-700">
              ✓ Validar
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Board */}
        <section>
          <div className="bg-white border-2 border-gray-900 rounded-2xl p-4 shadow-lg">
            <div className="flex flex-col gap-4">
              {slots.map((row, ri) => (
                <div key={ri} className="flex flex-wrap gap-3">
                  {row.map((colTiles, ci) => (
                    <SlotDropZone
                      key={`${ri}-${ci}`}
                      tiles={colTiles}
                      state={slotStates[ri]?.[ci]}
                      showResult={showResult}
                      dragRef={dragRef}
                      onDrop={(idx) => handleSlotDrop(ri, ci, idx)}
                      onTileDragStart={(tileIdx, tile) => handleSlotTileDragStart(ri, ci, tileIdx, tile)}
                      onRemoveTile={(tileIdx) => handleRemoveTile(ri, ci, tileIdx)}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Trash */}
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <small className="text-gray-400 text-xs">Consejo: suelta sobre la papelera para borrar.</small>
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleTrashDrop}
                className="flex items-center gap-2 bg-red-50 border-2 border-dashed border-red-400 text-red-700 rounded-xl px-3 py-2 text-sm font-bold"
              >
                🗑️ Papelera
              </div>
            </div>
          </div>
        </section>

        {/* Palettes */}
        <aside className="flex flex-col gap-4">
          {(letterTiles.length > 0 || toggles.write) && (
            <PaletteCard title="Letras" tools={toggles.caps || toggles.accent}>
              <div className="flex flex-wrap gap-2">
                {toggles.write && <WriteTile dragRef={dragRef} />}
                {letterTiles.map((t, i) => (
                  <TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} />
                ))}
                {toggles.caps && <>
                  <CapToolTile mode="up" dragRef={dragRef} slots={slots} setSlots={setSlots} />
                  <CapToolTile mode="down" dragRef={dragRef} slots={slots} setSlots={setSlots} />
                </>}
                {toggles.accent && <AccentToolTile dragRef={dragRef} slots={slots} setSlots={setSlots} />}
              </div>
            </PaletteCard>
          )}

          {syllTiles.length > 0 && (
            <PaletteCard title="Sílabas">
              <div className="flex flex-wrap gap-2">
                {syllTiles.map((t, i) => (
                  <TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} />
                ))}
              </div>
            </PaletteCard>
          )}

          {wordTiles.length > 0 && (
            <PaletteCard title="Palabras">
              <div className="flex flex-wrap gap-2">
                {wordTiles.map((t, i) => (
                  <TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} />
                ))}
              </div>
            </PaletteCard>
          )}

          {toggles.punc !== false && puncTiles.length > 0 && (
            <PaletteCard title="Puntuación">
              <div className="flex flex-wrap gap-2">
                {toggles.space !== false && (
                  <TrayTile tile={spaceTile} onDragStart={handleTrayDragStart} />
                )}
                {puncTiles.map((t, i) => (
                  <TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} />
                ))}
              </div>
            </PaletteCard>
          )}

          {toggles.space !== false && puncTiles.length === 0 && (
            <PaletteCard title="Espacio">
              <TrayTile tile={spaceTile} onDragStart={handleTrayDragStart} />
            </PaletteCard>
          )}

          {toggles.images !== false && images.length > 0 && (
            <PaletteCard title="Imágenes">
              <div className="flex flex-wrap gap-2">
                {images.map((url, i) => (
                  <TrayTile key={i} tile={createTile('img', url)} onDragStart={handleTrayDragStart} />
                ))}
              </div>
            </PaletteCard>
          )}

          {/* Preset info */}
          {config.presetId && (
            <div className="text-xs text-gray-400 text-center font-bold">
              Preset: <code className="bg-gray-100 px-1 rounded">{config.presetId}</code>
            </div>
          )}
        </aside>
      </main>

      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-2xl p-6 text-center shadow-2xl w-80" onClick={e => e.stopPropagation()}>
            <p className="font-black text-lg mb-3">📱 Escanea para abrir</p>
            <div className="flex justify-center mb-3">
              <QRCodeSVG value={qrUrl} size={240} level="M" />
            </div>
            <p className="text-xs text-gray-400 mb-4 break-all">{qrUrl}</p>
            <button onClick={() => setShowQR(false)}
              className="border border-gray-300 bg-white rounded-xl px-4 py-2 text-sm font-bold hover:bg-gray-50">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Slot Drop Zone ───────────────────────────────────────────────────────────
function SlotDropZone({ tiles, state, showResult, dragRef, onDrop, onTileDragStart, onRemoveTile }) {
  const [insertIdx, setInsertIdx] = useState(null);
  const ref = useRef(null);

  const getIdx = (clientX) => {
    const children = [...(ref.current?.querySelectorAll('[data-slottile]') || [])];
    if (!children.length) return 0;
    for (let i = 0; i < children.length; i++) {
      const r = children[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return children.length;
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setInsertIdx(getIdx(e.clientX));
  };
  const onDragLeave = () => setInsertIdx(null);
  const onDrop_ = (e) => {
    e.preventDefault();
    const idx = getIdx(e.clientX);
    setInsertIdx(null);
    onDrop(idx);
  };

  let outline = 'border-gray-900';
  if (showResult) {
    if (state === 'correct')     outline = 'border-green-500 ring-2 ring-green-400';
    else if (state === 'incorrect')  outline = 'border-red-500 ring-2 ring-red-400';
    else if (state === 'unanswered') outline = 'border-gray-400 border-dashed';
  }

  return (
    <div
      ref={ref}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop_}
      className={`relative bg-white border-2 rounded-xl flex flex-wrap items-center min-h-[56px] px-3 py-1 gap-0.5 transition-all ${outline}`}
      style={{ minWidth: 80 }}
    >
      {tiles.length === 0 && insertIdx === null && (
        <span className="text-gray-300 text-xs select-none pointer-events-none">···</span>
      )}
      {tiles.map((tile, i) => (
        <React.Fragment key={tile.id}>
          {insertIdx === i && (
            <div className="w-1 h-10 bg-blue-500 rounded mx-1" />
          )}
          <SlotTile
            tile={tile}
            index={i}
            onDragStart={() => onTileDragStart(i, tile)}
            onRemove={() => onRemoveTile(i)}
          />
        </React.Fragment>
      ))}
      {insertIdx === tiles.length && (
        <div className="w-1 h-10 bg-blue-500 rounded mx-1" />
      )}
    </div>
  );
}

function SlotTile({ tile, index, onDragStart, onRemove }) {
  if (tile.type === 'space') {
    return (
      <span
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed='move'; onDragStart(); }}
        onClick={onRemove}
        data-slottile
        className="inline-block w-4 h-8 border-l-2 border-dotted border-gray-400 mx-1 cursor-pointer hover:border-red-400"
        title="Click to remove"
      />
    );
  }
  if (tile.type === 'write') {
    return (
      <input
        data-slottile
        type="text"
        defaultValue={tile.value}
        className="border-b-2 border-gray-400 outline-none font-bold text-2xl bg-transparent text-center mx-1"
        style={{ minWidth: 32, maxWidth: 100 }}
        onChange={e => { tile.value = e.target.value; }}
        onPointerDown={e => e.stopPropagation()}
      />
    );
  }
  return (
    <span
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed='move'; onDragStart(); }}
      onClick={onRemove}
      data-slottile
      className="text-3xl font-bold cursor-pointer hover:text-red-400 transition-colors select-none"
      title="Click to remove"
    >
      {tile.value}
    </span>
  );
}

function PaletteCard({ title, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm">
      <h2 className="text-base font-black text-gray-700 mb-2">{title}</h2>
      {children}
    </div>
  );
}

function WriteTile({ dragRef }) {
  const [val, setVal] = useState('');
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        dragRef.current = { tile: createTile('write', val), fromSlot: null };
      }}
      className="cursor-grab rounded-xl border-2 border-dashed border-indigo-400 bg-indigo-50 flex items-center px-2 h-11"
    >
      <input
        type="text"
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="escribe…"
        className="bg-transparent outline-none font-bold text-base w-24"
        onPointerDown={e => e.stopPropagation()}
      />
    </div>
  );
}

function CapToolTile({ mode, dragRef, slots, setSlots }) {
  const apply = (clientX, clientY) => {
    // Find nearest text tile
    const els = document.querySelectorAll('[data-slottile]');
    let best = null, bestDist = Infinity;
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(clientX - (r.left+r.width/2), clientY - (r.top+r.height/2));
      if (d < bestDist) { bestDist = d; best = el; }
    });
    // Not used via pointer in React HTML5 drag — handled on drop
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        dragRef.current = { tile: createTile('captool', mode), fromSlot: null };
      }}
      className="cursor-grab rounded-xl border-2 border-gray-400 bg-gray-50 flex items-center justify-center w-11 h-11 text-lg font-black hover:bg-gray-100"
      title={mode === 'up' ? 'Capitalizar' : 'Minúscula'}
    >
      {mode === 'up' ? '↑' : '↓'}
    </div>
  );
}

function AccentToolTile({ dragRef }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        dragRef.current = { tile: createTile('accenttool', '´'), fromSlot: null };
      }}
      className="cursor-grab rounded-xl border-2 border-gray-400 bg-gray-50 flex items-center justify-center w-11 h-11 text-lg font-black hover:bg-gray-100"
      title="Agregar acento"
    >
      ´
    </div>
  );
}