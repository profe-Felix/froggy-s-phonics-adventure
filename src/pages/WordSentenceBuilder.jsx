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
    trayColumns: parseInt(sp.get('cols')) || 0, // 0 = auto
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

// ─── Tray tile (palette) ──────────────────────────────────────────────────────
function TrayTile({ tile, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; onDragStart(tile); }}
      className="select-none cursor-grab active:cursor-grabbing rounded-xl border-2 border-gray-800 bg-white flex items-center justify-center font-bold text-xl min-w-[44px] h-11 px-3 hover:bg-indigo-50 shadow-sm transition-colors"
      style={{ fontFamily: 'Andika, system-ui, sans-serif' }}
    >
      {tile.type === 'space' ? <span className="w-5 h-0.5 bg-gray-400 block rounded" /> :
       tile.type === 'img'   ? <img src={tile.value} alt="" className="max-h-9 max-w-[80px] object-contain" /> :
       tile.value}
    </div>
  );
}

// ─── WriteTile in tray ────────────────────────────────────────────────────────
function WriteTile({ dragRef }) {
  const [val, setVal] = useState('');
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        dragRef.current = { tile: createTile('write', val), fromProblem: null };
      }}
      className="cursor-grab rounded-xl border-2 border-dashed border-indigo-400 bg-indigo-50 flex items-center px-2 h-11"
    >
      <input type="text" value={val} onChange={e => setVal(e.target.value)}
        placeholder="escribe…"
        className="bg-transparent outline-none font-bold text-base w-24"
        onPointerDown={e => e.stopPropagation()} />
    </div>
  );
}

// ─── Tool tiles ───────────────────────────────────────────────────────────────
function ToolTile({ label, title, dragRef, tileType, tileValue }) {
  return (
    <div draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        dragRef.current = { tile: createTile(tileType, tileValue), fromProblem: null };
      }}
      title={title}
      className="cursor-grab rounded-xl border-2 border-gray-400 bg-gray-50 flex items-center justify-center w-11 h-11 text-lg font-black hover:bg-gray-100 select-none"
    >{label}</div>
  );
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

// ─── Problem drop zone ────────────────────────────────────────────────────────
function ProblemZone({ index, tiles, state, showResult, dragRef, onDrop, onTileDragStart, onRemoveTile }) {
  const [insertIdx, setInsertIdx] = useState(null);
  const ref = useRef(null);

  // Find the best insert index using per-row left-to-right logic.
  // We group tiles by their vertical row (by top coordinate), then within
  // the row closest to the cursor, find the right insertion point.
  const getInsertIdx = (clientX, clientY) => {
    const children = [...(ref.current?.querySelectorAll('[data-slottile]') || [])];
    if (!children.length) return 0;

    const rects = children.map((el, i) => ({ i, r: el.getBoundingClientRect() }));

    // group into rows by snapping tops to nearest 10px bucket
    const rows = [];
    rects.forEach(({ i, r }) => {
      const rowTop = Math.round(r.top / 10) * 10;
      let row = rows.find(rw => rw.top === rowTop);
      if (!row) { row = { top: rowTop, items: [] }; rows.push(row); }
      row.items.push({ i, r });
    });
    rows.sort((a, b) => a.top - b.top);

    // find the closest row by vertical distance
    let bestRow = rows[0];
    let bestRowDist = Infinity;
    rows.forEach(rw => {
      const mid = rw.items[0].r.top + rw.items[0].r.height / 2;
      const d = Math.abs(clientY - mid);
      if (d < bestRowDist) { bestRowDist = d; bestRow = rw; }
    });

    // within that row, find insert point left-to-right
    const rowItems = bestRow.items.sort((a, b) => a.r.left - b.r.left);
    for (const { i, r } of rowItems) {
      if (clientX < r.left + r.width / 2) return i;
    }
    // past the last item in this row → insert after the last item in that row
    return rowItems[rowItems.length - 1].i + 1;
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setInsertIdx(getInsertIdx(e.clientX, e.clientY));
  };

  const onDragLeave = (e) => {
    // Only clear if we're actually leaving the zone (not entering a child)
    if (!ref.current?.contains(e.relatedTarget)) setInsertIdx(null);
  };

  const onDrop_ = (e) => {
    e.preventDefault();
    const idx = getInsertIdx(e.clientX, e.clientY);
    setInsertIdx(null);
    onDrop(idx);
  };

  let border = 'border-gray-300';
  let ring   = '';
  if (showResult) {
    if      (state === 'correct')    { border = 'border-green-500'; ring = 'ring-2 ring-green-400'; }
    else if (state === 'incorrect')  { border = 'border-red-500';   ring = 'ring-2 ring-red-400'; }
    else if (state === 'unanswered') { border = 'border-gray-300 border-dashed'; }
  }

  return (
    <div className="flex items-start gap-2">
      <span className="text-gray-400 font-bold text-sm mt-3 w-5 shrink-0 text-right">{index + 1}.</span>
      <div
        ref={ref}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop_}
        className={`flex-1 relative bg-white border-2 rounded-xl flex flex-wrap items-center min-h-[56px] px-3 py-2 gap-1 transition-all ${border} ${ring}`}
      >
        {tiles.length === 0 && insertIdx === null && (
          <span className="text-gray-300 text-sm select-none pointer-events-none">Arrastra aquí…</span>
        )}
        {tiles.map((tile, i) => (
          <React.Fragment key={tile.id}>
            {insertIdx === i && <InsertCaret />}
            <InlineTile
              tile={tile}
              onDragStart={() => onTileDragStart(i, tile)}
              onRemove={() => onRemoveTile(i)}
            />
          </React.Fragment>
        ))}
        {insertIdx === tiles.length && <InsertCaret />}
      </div>
    </div>
  );
}

function InsertCaret() {
  return <div className="w-0.5 h-9 bg-blue-500 rounded shrink-0 mx-0.5" />;
}

function InlineTile({ tile, onDragStart, onRemove }) {
  if (tile.type === 'space') {
    return (
      <span
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
        onClick={onRemove}
        data-slottile
        title="Clic para quitar"
        className="inline-block w-3 self-stretch border-l-2 border-dotted border-gray-400 mx-1 cursor-pointer hover:border-red-400 shrink-0"
      />
    );
  }
  if (tile.type === 'write') {
    return (
      <input
        data-slottile
        type="text"
        defaultValue={tile.value || ''}
        placeholder="…"
        className="border-b-2 border-gray-400 outline-none font-bold text-2xl bg-transparent text-center"
        style={{ minWidth: 40, width: `${Math.max(3, ((tile.value || '').length) + 1)}ch`, fontFamily: 'Andika, system-ui, sans-serif' }}
        onChange={e => { tile.value = e.target.value; }}
        onPointerDown={e => e.stopPropagation()}
        onDragStart={e => e.preventDefault()}
      />
    );
  }
  if (tile.type === 'img') {
    return (
      <img
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
        onClick={onRemove}
        data-slottile
        src={tile.value}
        alt=""
        title="Clic para quitar"
        className="max-h-10 max-w-[80px] object-contain cursor-pointer hover:opacity-70 rounded"
      />
    );
  }
  // text or punc
  return (
    <span
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onClick={onRemove}
      data-slottile
      title="Clic para quitar"
      className="text-3xl font-bold cursor-pointer hover:text-red-400 transition-colors select-none leading-tight"
      style={{ fontFamily: 'Andika, system-ui, sans-serif' }}
    >
      {tile.value}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WordSentenceBuilder() {
  const [searchParams] = useSearchParams();
  const { config, loading } = usePreset(searchParams);

  // problems: array of tile arrays, one per problem/row
  const [problems, setProblems] = useState(() => [[]]);
  const [problemStates, setProblemStates] = useState(() => [null]);
  const [numProblems, setNumProblems] = useState(1);
  const [numProblemsInput, setNumProblemsInput] = useState(1);
  const [showResult, setShowResult] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const dragRef = useRef(null);

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
      if (typeof pre === 'string') return parsePrefillString(pre, punc || DEFAULT_PUNC);
      if (Array.isArray(pre)) {
        return pre.flatMap(s => typeof s === 'string' ? parsePrefillString(s, punc || DEFAULT_PUNC) : []);
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
      if (safe.length >= np) return safe.slice(0, np);
      return [...safe, ...Array.from({ length: np - safe.length }, () => [])];
    });
    setProblemStates(Array(np).fill(null));
    setShowResult(false);
  }

  // Drag from tray (copy)
  const handleTrayDragStart = (tile) => {
    dragRef.current = { tile: { ...tile, id: Math.random().toString(36).slice(2) }, fromProblem: null };
  };

  // Drop into a problem
  const handleDrop = (problemIdx, insertIdx) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;

    const tile = d.tile;

    // captool and accenttool modify the tile just before the insert point, not insert
    if (tile.type === 'captool' || tile.type === 'accenttool') {
      setProblems(prev => {
        if (!Array.isArray(prev)) return prev;
        const next = prev.map(p => (p || []).map(t => ({ ...t })));
        const problem = next[problemIdx];
        // find the nearest text tile to the left of insertIdx
        let targetIdx = insertIdx - 1;
        while (targetIdx >= 0 && problem[targetIdx].type !== 'text') targetIdx--;
        if (targetIdx < 0) return prev; // nothing to modify
        const target = problem[targetIdx];
        if (tile.type === 'captool') {
          if (tile.value === 'up') {
            target.value = target.value.charAt(0).toUpperCase() + target.value.slice(1);
          } else {
            target.value = target.value.charAt(0).toLowerCase() + target.value.slice(1);
          }
        } else if (tile.type === 'accenttool') {
          const PLAIN_TO_ACC = { a:'á',e:'é',i:'í',o:'ó',u:'ú',A:'Á',E:'É',I:'Í',O:'Ó',U:'Ú' };
          target.value = target.value.split('').map(ch => PLAIN_TO_ACC[ch] || ch).join('');
        }
        return next;
      });
      setShowResult(false);
      return;
    }

    setProblems(prev => {
      if (!Array.isArray(prev)) return prev;
      const next = prev.map(p => [...(p || [])]);
      if (d.fromProblem !== null) {
        const [fp, fi] = d.fromProblem;
        if (fp === problemIdx) {
          next[fp].splice(fi, 1);
          const adjusted = insertIdx > fi ? insertIdx - 1 : insertIdx;
          next[problemIdx].splice(adjusted, 0, tile);
          return next;
        }
        next[fp].splice(fi, 1);
      }
      next[problemIdx].splice(insertIdx, 0, tile);
      return next;
    });
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
  };

  // Validate
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
    if (newStates.filter(Boolean).every(s => s === 'correct')) launchConfetti();
  };

  const qrUrl = (() => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('student', '1');
      return u.toString();
    } catch { return window.location.href; }
  })();

  if (loading || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const { letters=[], syllables=[], words=[], punc=[], images=[], toggles={}, trayColumns=0 } = config;
  const isStudent = config.isStudent;

  const letterTiles = letters.filter(l => l !== '|').map(l => createTile('text', l));
  const syllTiles   = syllables.filter(s => !['|','_','^','~'].includes(s)).map(s => createTile('text', s));
  const wordTiles   = words.filter(w => !['|','_'].includes(w)).map(w => createTile('text', w));
  const puncTiles   = punc.map(p => createTile('punc', p));
  const spaceTile   = createTile('space', ' ');
  const imgTiles    = images.map(u => createTile('img', u));

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-white"
      style={{ fontFamily: 'Andika, system-ui, sans-serif' }}>

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3 flex-wrap">
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
              <button onClick={applyProblems}
                className="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-1 text-sm font-bold hover:bg-gray-50">
                Aplicar
              </button>
              {config.answers && (
                <button onClick={validate}
                  className="bg-blue-600 text-white rounded-lg px-4 py-1 text-sm font-bold hover:bg-blue-700">
                  ✓ Validar
                </button>
              )}
              <button onClick={() => setShowQR(true)}
                className="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-1 text-sm font-bold hover:bg-gray-50">
                QR
              </button>
            </div>
          )}

          {isStudent && config.answers && (
            <button onClick={validate}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-blue-700">
              ✓ Validar
            </button>
          )}
        </div>
      </header>

      {/* Body: problems left, tray right */}
      <main className="max-w-7xl mx-auto px-4 py-4 flex flex-col lg:flex-row gap-5">

        {/* Problems area */}
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
                onDrop={(idx) => handleDrop(pi, idx)}
                onTileDragStart={(ti, tile) => handleTileDragStart(pi, ti, tile)}
                onRemoveTile={(ti) => handleRemoveTile(pi, ti)}
              />
            ))}

            {/* Trash */}
            <div className="mt-1 flex items-center gap-2">
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleTrashDrop}
                className="flex items-center gap-2 bg-red-50 border-2 border-dashed border-red-300 text-red-500 rounded-xl px-3 py-1.5 text-sm font-bold cursor-default"
              >
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

        {/* Tray (palette) */}
        <aside className="lg:w-72 xl:w-80 flex flex-col gap-3 shrink-0">

          {(letterTiles.length > 0 || toggles.write) && (
            <PaletteCard title="Letras" cols={trayColumns}>
              {toggles.write && <WriteTile dragRef={dragRef} />}
              {letterTiles.map((t, i) => (
                <TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} />
              ))}
              {toggles.caps && <>
                <ToolTile label="↑" title="Capitalizar" dragRef={dragRef} tileType="captool" tileValue="up" />
                <ToolTile label="↓" title="Minúscula"   dragRef={dragRef} tileType="captool" tileValue="down" />
              </>}
              {toggles.accent && (
                <ToolTile label="´" title="Acento" dragRef={dragRef} tileType="accenttool" tileValue="´" />
              )}
            </PaletteCard>
          )}

          {syllTiles.length > 0 && (
            <PaletteCard title="Sílabas" cols={trayColumns}>
              {syllTiles.map((t, i) => <TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} />)}
            </PaletteCard>
          )}

          {wordTiles.length > 0 && (
            <PaletteCard title="Palabras" cols={trayColumns}>
              {wordTiles.map((t, i) => <TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} />)}
            </PaletteCard>
          )}

          {(toggles.punc !== false && puncTiles.length > 0) && (
            <PaletteCard title="Puntuación" cols={0}>
              <div className="flex flex-wrap gap-2">
                {toggles.space !== false && (
                  <TrayTile tile={spaceTile} onDragStart={handleTrayDragStart} />
                )}
                {puncTiles.map((t, i) => <TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} />)}
              </div>
            </PaletteCard>
          )}

          {toggles.space !== false && puncTiles.length === 0 && (
            <PaletteCard title="Espacio" cols={0}>
              <TrayTile tile={spaceTile} onDragStart={handleTrayDragStart} />
            </PaletteCard>
          )}

          {toggles.images !== false && imgTiles.length > 0 && (
            <PaletteCard title="Imágenes" cols={trayColumns}>
              {imgTiles.map((t, i) => <TrayTile key={i} tile={t} onDragStart={handleTrayDragStart} />)}
            </PaletteCard>
          )}

          {config.presetId && (
            <div className="text-xs text-gray-400 text-center font-bold">
              Preset: <code className="bg-gray-100 px-1 rounded">{config.presetId}</code>
            </div>
          )}
        </aside>
      </main>

      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowQR(false)}>
          <div className="bg-white rounded-2xl p-6 text-center shadow-2xl w-80"
            onClick={e => e.stopPropagation()}>
            <p className="font-black text-lg mb-3">📱 Escanea para abrir</p>
            <div className="flex justify-center mb-3">
              <QRCodeSVG value={qrUrl} size={220} level="M" />
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