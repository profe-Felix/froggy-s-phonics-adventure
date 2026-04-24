import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

// ── Seeded RNG ─────────────────────────────────────────────────────
function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ── 3 emoji sets for the 3 types ──────────────────────────────────
const TRIO_SETS = [
  [['🐶','dogs'], ['🐱','cats'], ['🐭','mice']],
  [['🍎','apples'], ['🍊','oranges'], ['🍋','lemons']],
  [['🦋','butterflies'], ['🐝','bees'], ['🐞','ladybugs']],
  [['⭐','stars'], ['🌙','moons'], ['☀️','suns']],
  [['🧁','cupcakes'], ['🍩','donuts'], ['🍪','cookies']],
  [['🚗','cars'], ['🚕','taxis'], ['🚙','trucks']],
];

const MAX_ROWS = 10; // graph goes 0–10
const COLS = 4; // 4 columns: label + 3 categories

// Generate scattered items with normalized positions
function generateItems(seed, counts) {
  const rng = seededRng(seed);
  const setIdx = Math.floor(rng() * TRIO_SETS.length);
  const trio = TRIO_SETS[setIdx];
  const items = [];
  let id = 0;
  counts.forEach((count, typeIdx) => {
    const [emoji] = trio[typeIdx];
    const placed = [];
    for (let i = 0; i < count; i++) {
      let nx, ny, tries = 0;
      do {
        nx = 0.04 + rng() * 0.88;
        ny = 0.04 + rng() * 0.88;
        tries++;
      } while (tries < 200 && placed.some(p => Math.hypot((p.nx - nx), (p.ny - ny)) < 0.12));
      placed.push({ nx, ny });
      items.push({ id: id++, emoji, typeIdx, nx, ny, rotation: (rng() - 0.5) * 30 });
    }
  });
  // shuffle so types are mixed
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return { items, trio, setIdx };
}

// ── Draggable emoji item on collection canvas ─────────────────────
function DraggableEmoji({ item, containerRef, onMove }) {
  const onPointerDown = (e) => {
    e.preventDefault(); e.stopPropagation();
    const mx = e.clientX, my = e.clientY;
    const ox = item.nx, oy = item.ny;
    const onMoveEvt = (ev) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      onMove(item.id,
        Math.max(0, Math.min(0.95, ox + (ev.clientX - mx) / rect.width)),
        Math.max(0, Math.min(0.95, oy + (ev.clientY - my) / rect.height))
      );
    };
    const onUp = () => { document.removeEventListener('pointermove', onMoveEvt); document.removeEventListener('pointerup', onUp); };
    document.addEventListener('pointermove', onMoveEvt);
    document.addEventListener('pointerup', onUp);
  };
  return (
    <div onPointerDown={onPointerDown} style={{
      position: 'absolute',
      left: `${item.nx * 100}%`,
      top: `${item.ny * 100}%`,
      fontSize: 26,
      transform: `rotate(${item.rotation}deg)`,
      cursor: 'grab',
      touchAction: 'none',
      zIndex: 10,
      lineHeight: 1,
      userSelect: 'none',
    }}>
      {item.emoji}
    </div>
  );
}

// ── Label drag target for x-axis ─────────────────────────────────
// Students drag an emoji picture to the x-axis label slots
function XAxisSlot({ slotIdx, droppedEmoji, droppedLabel, onDrop }) {
  const ref = useRef(null);

  // Allow drop via pointer events
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onPointerUp = (e) => {
      // handled via global drag end
    };
    el.addEventListener('pointerup', onPointerUp);
    return () => el.removeEventListener('pointerup', onPointerUp);
  }, []);

  return (
    <div
      ref={ref}
      data-xslot={slotIdx}
      onClick={() => { if (!droppedEmoji && window.__draggingLabel) onDrop(slotIdx, window.__draggingLabel); }}
      style={{
        flex: 1,
        minHeight: 52,
        border: droppedEmoji ? '2px solid #6366f1' : '2px dashed #94a3b8',
        borderRadius: 10,
        background: droppedEmoji ? '#eef2ff' : '#f8fafc',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: 22,
      }}
    >
      {droppedEmoji || <span style={{ fontSize: 11, color: '#94a3b8' }}>drop</span>}
    </div>
  );
}

// ── Number drag chip (0–10) for y-axis ───────────────────────────
function NumberChip({ n, onDragStart }) {
  const onPointerDown = (e) => {
    e.preventDefault();
    onDragStart(n, e.clientX, e.clientY);
  };
  return (
    <div onPointerDown={onPointerDown} style={{
      width: 32, height: 32, borderRadius: 8,
      background: '#6366f1', color: 'white', fontWeight: 900, fontSize: 14,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'grab', touchAction: 'none', userSelect: 'none',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    }}>
      {n}
    </div>
  );
}

// ── Bar graph component ───────────────────────────────────────────
// Y-axis numbers sit ON the gridlines between rows (0 at baseline, 1 at top of row 1, etc.)
function BarGraph({ trio, filledCells, onToggle, yAxisLabels, onYLabelDrop, xAxisLabels, onXLabelDrop, feedback, counts }) {
  const COL_COLORS = ['#ef4444', '#f59e0b', '#3b82f6'];
  const COL_LIGHT = ['#fee2e2', '#fef3c7', '#dbeafe'];

  // We render MAX_ROWS cells. Each cell has height = 1 unit.
  // Gridline i sits at the top of cell i (0-indexed from bottom), i.e. between row i and row i+1.
  // We render the grid as a CSS grid with (MAX_ROWS) rows.
  // The y-axis has (MAX_ROWS+1) slots — one per gridline including baseline (0) and top (MAX_ROWS).
  // Each slot is centered on its gridline.

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '4px 4px 0 4px' }}>
      {/* Graph body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>

        {/* Y-axis: number drop slots centered on gridlines */}
        {/* We use an absolutely positioned overlay so slots align with gridlines of the grid */}
        <div style={{ width: 38, flexShrink: 0, position: 'relative', borderRight: '2px solid #374151' }}>
          {/* Slots from 0 (bottom) to MAX_ROWS (top) */}
          {Array.from({ length: MAX_ROWS + 1 }, (_, i) => i).map(lineNum => {
            const pct = (lineNum / MAX_ROWS) * 100; // 0% = bottom, 100% = top
            const val = yAxisLabels[lineNum];
            return (
              <div key={lineNum}
                data-yrow={lineNum}
                onClick={() => { if (window.__draggingNumber !== undefined) onYLabelDrop(lineNum, window.__draggingNumber); }}
                style={{
                  position: 'absolute',
                  bottom: `${pct}%`,
                  left: 0, right: 0,
                  height: 24,
                  transform: 'translateY(50%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 5,
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 5,
                  border: val !== undefined ? '2px solid #6366f1' : '2px dashed #94a3b8',
                  background: val !== undefined ? '#eef2ff' : 'rgba(248,250,252,0.85)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900, color: '#6366f1',
                }}>
                  {val !== undefined ? val : ''}
                </div>
              </div>
            );
          })}
        </div>

        {/* Grid columns */}
        <div style={{ display: 'flex', flex: 1, gap: 2, padding: '0 2px' }}>
          {[0, 1, 2].map(colIdx => (
            <div key={colIdx} style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse', gap: 2 }}>
              {Array.from({ length: MAX_ROWS }, (_, i) => i + 1).map(row => {
                const filled = filledCells[colIdx]?.has(row);
                return (
                  <div key={row}
                    onClick={() => onToggle(colIdx, row)}
                    style={{
                      flex: 1,
                      border: `1.5px solid ${filled ? COL_COLORS[colIdx] : '#cbd5e1'}`,
                      background: filled ? COL_COLORS[colIdx] : COL_LIGHT[colIdx] + '40',
                      borderRadius: 3,
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* X-axis border */}
      <div style={{ height: 2, background: '#374151', margin: '0 0 0 40px' }} />

      {/* X-axis label slots */}
      <div style={{ display: 'flex', gap: 2, padding: '4px 2px 0 42px' }}>
        {[0, 1, 2].map(colIdx => {
          const dropped = xAxisLabels[colIdx];
          const fb = feedback?.xAxis?.[colIdx];
          return (
            <div key={colIdx} style={{ flex: 1 }}>
              <div
                data-xslot={colIdx}
                onClick={() => { if (window.__draggingLabel !== undefined) onXLabelDrop(colIdx, window.__draggingLabel); }}
                style={{
                  minHeight: 48,
                  border: dropped ? `2px solid ${fb === false ? '#ef4444' : fb === true ? '#22c55e' : '#6366f1'}` : '2px dashed #94a3b8',
                  borderRadius: 8,
                  background: dropped ? (fb === false ? '#fee2e2' : fb === true ? '#dcfce7' : '#eef2ff') : '#f8fafc',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: 22, gap: 1,
                }}
              >
                {dropped ? (
                  <>
                    <span>{dropped.emoji}</span>
                    {fb === false && <span style={{ fontSize: 16 }}>✗</span>}
                    {fb === true && <span style={{ fontSize: 14 }}>✓</span>}
                  </>
                ) : (
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>drop here</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Color picker ─────────────────────────────────────────────────
const GRAPH_COLORS = [
  { label: 'Red', value: '#ef4444' },
  { label: 'Yellow', value: '#f59e0b' },
  { label: 'Blue', value: '#3b82f6' },
];

// ── Number drag chip tray ─────────────────────────────────────────
function NumberTray({ onDragStart }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 0' }}>
      {Array.from({ length: 11 }, (_, i) => i).map(n => (
        <NumberChip key={n} n={n} onDragStart={onDragStart} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────
export default function GraphingGame({ onBack }) {
  const [seed] = useState(() => Math.floor(Math.random() * 999999));
  const [counts] = useState(() => [
    Math.floor(Math.random() * 5) + 2,
    Math.floor(Math.random() * 5) + 2,
    Math.floor(Math.random() * 5) + 2,
  ]);

  const { items: initialItems, trio } = generateItems(seed, counts);
  const [items, setItems] = useState(initialItems);
  const containerRef = useRef(null);

  // Graph state: filledCells[colIdx] = Set of row numbers tapped
  const [filledCells, setFilledCells] = useState([new Set(), new Set(), new Set()]);

  // Y-axis label drops: {rowNum: number}
  const [yAxisLabels, setYAxisLabels] = useState({});

  // X-axis label drops: {colIdx: {emoji, typeIdx}}
  const [xAxisLabels, setXAxisLabels] = useState({});

  // Feedback for x-axis labels
  const [feedback, setFeedback] = useState(null);
  const [graphChecked, setGraphChecked] = useState(false);

  // Drag state for number chips
  const dragNumRef = useRef(null);
  const ghostRef = useRef(null);

  // Drag state for emoji labels
  const dragLabelRef = useRef(null);
  const ghostLabelRef = useRef(null);

  // ── Number drag ────────────────────────────────────────────────
  const startNumberDrag = (n, startX, startY) => {
    window.__draggingNumber = n;
    dragNumRef.current = n;

    const ghost = document.createElement('div');
    ghost.style.cssText = `position:fixed;pointer-events:none;z-index:9999;width:32px;height:32px;border-radius:8px;background:#6366f1;color:white;font-weight:900;font-size:14px;display:flex;align-items:center;justify-content:center;`;
    ghost.textContent = n;
    document.body.appendChild(ghost);
    ghostRef.current = ghost;

    const move = (x, y) => { ghost.style.left = (x - 16) + 'px'; ghost.style.top = (y - 16) + 'px'; };
    move(startX, startY);

    const onMove = (e) => {
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      move(x, y);
    };
    const onUp = (e) => {
      ghost.remove(); ghostRef.current = null;
      const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      // Hit-test y-axis slots
      const slots = document.querySelectorAll('[data-yrow]');
      for (const slot of slots) {
        const r = slot.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          const row = parseInt(slot.getAttribute('data-yrow'));
          setYAxisLabels(prev => ({ ...prev, [row]: n }));
          break;
        }
      }
      window.__draggingNumber = undefined;
      dragNumRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
  };

  // ── Emoji label drag (drag from collection canvas items) ──────
  const startLabelDrag = (typeIdx, startX, startY) => {
    const [emoji] = trio[typeIdx];
    window.__draggingLabel = { emoji, typeIdx };
    dragLabelRef.current = { emoji, typeIdx };

    const ghost = document.createElement('div');
    ghost.style.cssText = `position:fixed;pointer-events:none;z-index:9999;font-size:28px;`;
    ghost.textContent = emoji;
    document.body.appendChild(ghost);
    ghostLabelRef.current = ghost;

    const move = (x, y) => { ghost.style.left = (x - 16) + 'px'; ghost.style.top = (y - 16) + 'px'; };
    move(startX, startY);

    const onMove = (e) => {
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      move(x, y);
    };
    const onUp = (e) => {
      ghost.remove(); ghostLabelRef.current = null;
      const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const y = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      // Hit-test x-axis slots
      const slots = document.querySelectorAll('[data-xslot]');
      for (const slot of slots) {
        const r = slot.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          const colIdx = parseInt(slot.getAttribute('data-xslot'));
          setXAxisLabels(prev => ({ ...prev, [colIdx]: { emoji, typeIdx } }));
          setFeedback(null); setGraphChecked(false);
          break;
        }
      }
      window.__draggingLabel = undefined;
      dragLabelRef.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
  };

  const moveItem = (id, nx, ny) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, nx, ny } : it));
  };

  const toggleCell = (colIdx, row) => {
    setFilledCells(prev => {
      const next = prev.map(s => new Set(s));
      if (next[colIdx].has(row)) next[colIdx].delete(row);
      else next[colIdx].add(row);
      return next;
    });
    setGraphChecked(false); setFeedback(null);
  };

  const dropYLabel = (row, n) => {
    setYAxisLabels(prev => ({ ...prev, [row]: n }));
  };

  const dropXLabel = (colIdx, label) => {
    setXAxisLabels(prev => ({ ...prev, [colIdx]: label }));
    setFeedback(null); setGraphChecked(false);
  };

  // ── Check graph ────────────────────────────────────────────────
  // Any order of labels is fine — just check that bar height matches the count for whatever
  // emoji was placed in that column.
  const checkGraph = () => {
    const xFb = {};
    const barFb = {};
    for (let col = 0; col < 3; col++) {
      const placed = xAxisLabels[col];
      if (!placed) continue;
      // Label is correct as long as no duplicate (each emoji can only appear once)
      const otherCols = [0, 1, 2].filter(c => c !== col);
      const isDuplicate = otherCols.some(c => xAxisLabels[c]?.typeIdx === placed.typeIdx);
      xFb[col] = !isDuplicate;
      // Bar height must match the count for the emoji placed in this column
      const correctCount = counts[placed.typeIdx];
      const filled = filledCells[col]?.size ?? 0;
      barFb[col] = filled === correctCount && !isDuplicate;
    }
    setFeedback({ xAxis: xFb, bars: barFb });
    setGraphChecked(true);
  };

  const newGame = () => window.location.reload();

  const COL_COLORS = ['#ef4444', '#f59e0b', '#3b82f6'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', userSelect: 'none' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: '#16a34a', color: 'white' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>← Back</button>
        <h1 style={{ flex: 1, textAlign: 'center', fontWeight: 900, fontSize: 16, margin: 0 }}>📊 Graphing</h1>
        <button onClick={newGame} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer', borderRadius: 8, padding: '4px 10px' }}>🔄 New</button>
      </div>

      {/* Main layout: collection canvas left | graph right */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 6, padding: 6 }}>

        {/* LEFT: Collection canvas */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: 11, color: '#64748b', textAlign: 'center', fontWeight: 600 }}>
            Count and sort the objects
          </div>
          {/* Canvas */}
          <div ref={containerRef} style={{ flex: 1, background: '#fefce8', borderRadius: 12, border: '2px solid #fde68a', position: 'relative', overflow: 'hidden', minHeight: 200 }}>
            {items.map(item => (
              <DraggableEmoji key={item.id} item={item} containerRef={containerRef} onMove={moveItem} />
            ))}
          </div>

          {/* Emoji label chips — only show ones not yet placed */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>DRAG TO GRAPH X-AXIS →</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {trio.map(([emoji, label], typeIdx) => {
                const alreadyPlaced = Object.values(xAxisLabels).some(v => v?.typeIdx === typeIdx);
                if (alreadyPlaced) return <div key={typeIdx} style={{ flex: 1, minWidth: 48 }} />;
                return (
                  <div key={typeIdx} onPointerDown={(e) => { e.preventDefault(); startLabelDrag(typeIdx, e.clientX, e.clientY); }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      background: COL_COLORS[typeIdx] + '22', border: `2px solid ${COL_COLORS[typeIdx]}`,
                      borderRadius: 10, padding: '6px 10px', cursor: 'grab', touchAction: 'none',
                      fontSize: 22,
                    }}>
                    {emoji}
                    <span style={{ fontSize: 9, fontWeight: 700, color: COL_COLORS[typeIdx] }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Number tray */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>DRAG NUMBERS TO Y-AXIS →</div>
            <NumberTray onDragStart={startNumberDrag} />
          </div>
        </div>

        {/* RIGHT: Bar graph */}
        <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: 11, color: '#64748b', textAlign: 'center', fontWeight: 600 }}>
            Tap squares to color · drag labels & numbers to graph
          </div>

          {/* Graph */}
          <div style={{ flex: 1, background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden', minHeight: 280 }}>
            <BarGraph
              trio={trio}
              filledCells={filledCells}
              onToggle={toggleCell}
              yAxisLabels={yAxisLabels}
              onYLabelDrop={dropYLabel}
              xAxisLabels={xAxisLabels}
              onXLabelDrop={dropXLabel}
              feedback={feedback}
              counts={counts}
            />
          </div>

          {/* Check / feedback */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            {!graphChecked ? (
              <button onClick={checkGraph}
                style={{ width: '100%', padding: '10px 0', background: '#16a34a', color: 'white', fontWeight: 900, fontSize: 14, borderRadius: 10, border: 'none', cursor: 'pointer' }}>
                ✓ Check My Graph
              </button>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  {[0, 1, 2].map(col => {
                    const xOk = feedback?.xAxis?.[col];
                    const barOk = feedback?.bars?.[col];
                    const placed = xAxisLabels[col];
                    if (!placed) return <div key={col} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>—</div>;
                    const allOk = xOk && barOk;
                    return (
                      <div key={col} style={{ flex: 1, textAlign: 'center', padding: '4px 2px', borderRadius: 8, background: allOk ? '#dcfce7' : '#fee2e2', border: `2px solid ${allOk ? '#22c55e' : '#ef4444'}` }}>
                        <div style={{ fontSize: 18 }}>{placed.emoji}</div>
                        <div style={{ fontSize: 18 }}>{allOk ? '✓' : '✗'}</div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => { setGraphChecked(false); setFeedback(null); }}
                  style={{ width: '100%', padding: '8px 0', background: '#f59e0b', color: 'white', fontWeight: 900, fontSize: 12, borderRadius: 10, border: 'none', cursor: 'pointer' }}>
                  ✏️ Keep Working
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}