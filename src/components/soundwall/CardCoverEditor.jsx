import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Check, Eye } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useBlueToRed } from '@/hooks/useBlueToRed';

// Modal cover editor for a single SoundWallCard. The teacher draws rounded
// rectangles ("covers") over the card image to hide parts of it. One cover
// can be marked as the active reveal — during the lesson step it animates
// away to unveil what's underneath.
//
// Covers are stored as percentages of the image dimensions so they scale
// correctly across the manager preview, the student step, and live mode.
export default function CardCoverEditor({ card, onClose, onSaved }) {
  const [covers, setCovers] = useState(() => {
    const raw = Array.isArray(card?.covers) ? card.covers : [];
    return raw.map((c) => ({ ...c, id: c.id || `cov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }));
  });
  const [activeRevealId, setActiveRevealId] = useState(card?.active_reveal_id || '');
  const [drawing, setDrawing] = useState(null); // { startX, startY, x, y, w, h } in px
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [interaction, setInteraction] = useState(null); // { mode: 'move'|'nw'|'ne'|'sw'|'se', id, startMX, startMY, startCover }
  const imgWrapRef = useRef(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const processedImageUrl = useBlueToRed(card?.image_url);

  const recalcSize = useCallback(() => {
    const el = imgWrapRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setImgSize({ w: r.width, h: r.height });
    }
  }, []);

  const pxToPct = (x, y, w, h) => ({
    x_pct: Math.max(0, Math.min(100, (x / imgSize.w) * 100)),
    y_pct: Math.max(0, Math.min(100, (y / imgSize.h) * 100)),
    w_pct: Math.max(0, Math.min(100, (w / imgSize.w) * 100)),
    h_pct: Math.max(0, Math.min(100, (h / imgSize.h) * 100)),
  });

  const pctToPx = (c) => ({
    x: (c.x_pct / 100) * imgSize.w,
    y: (c.y_pct / 100) * imgSize.h,
    w: (c.w_pct / 100) * imgSize.w,
    h: (c.h_pct / 100) * imgSize.h,
  });

  const onPointerDown = (e) => {
    if (e.target.closest('[data-cover-control]')) return;
    setEditingId(null);
    const el = imgWrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    setDrawing({ startX: x, startY: y, x, y, w: 0, h: 0 });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onCoverPointerDown = (e, cover) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
    e.stopPropagation();
    setEditingId(cover.id);
    const el = imgWrapRef.current;
    if (el) el.setPointerCapture(e.pointerId);
    setInteraction({ mode: 'move', id: cover.id, startMX: e.clientX, startMY: e.clientY, startCover: { ...cover } });
  };

  const onHandlePointerDown = (e, cover, mode) => {
    e.stopPropagation();
    setEditingId(cover.id);
    const el = imgWrapRef.current;
    if (el) el.setPointerCapture(e.pointerId);
    setInteraction({ mode, id: cover.id, startMX: e.clientX, startMY: e.clientY, startCover: { ...cover } });
  };

  const onPointerMove = (e) => {
    if (!drawing && !interaction) return;
    const el = imgWrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (drawing) {
      const cx = Math.max(0, Math.min(r.width, e.clientX - r.left));
      const cy = Math.max(0, Math.min(r.height, e.clientY - r.top));
      setDrawing((d) => ({
        ...d,
        x: Math.min(d.startX, cx),
        y: Math.min(d.startY, cy),
        w: Math.abs(cx - d.startX),
        h: Math.abs(cy - d.startY),
      }));
    } else if (interaction && imgSize.w > 0) {
      const dxPct = ((e.clientX - interaction.startMX) / imgSize.w) * 100;
      const dyPct = ((e.clientY - interaction.startMY) / imgSize.h) * 100;
      const sc = interaction.startCover;
      let nx = sc.x_pct, ny = sc.y_pct, nw = sc.w_pct, nh = sc.h_pct;
      if (interaction.mode === 'move') {
        nx = Math.max(0, Math.min(100 - sc.w_pct, sc.x_pct + dxPct));
        ny = Math.max(0, Math.min(100 - sc.h_pct, sc.y_pct + dyPct));
      } else {
        if (interaction.mode.includes('w')) {
          nx = Math.max(0, Math.min(sc.x_pct + sc.w_pct - 3, sc.x_pct + dxPct));
          nw = sc.x_pct + sc.w_pct - nx;
        }
        if (interaction.mode.includes('e')) {
          nw = Math.max(3, Math.min(100 - sc.x_pct, sc.w_pct + dxPct));
        }
        if (interaction.mode.includes('n')) {
          ny = Math.max(0, Math.min(sc.y_pct + sc.h_pct - 3, sc.y_pct + dyPct));
          nh = sc.y_pct + sc.h_pct - ny;
        }
        if (interaction.mode.includes('s')) {
          nh = Math.max(3, Math.min(100 - sc.y_pct, sc.h_pct + dyPct));
        }
      }
      setCovers((prev) => prev.map((c) => (c.id === interaction.id ? { ...c, x_pct: nx, y_pct: ny, w_pct: nw, h_pct: nh } : c)));
    }
  };

  const onPointerUp = () => {
    if (drawing) {
      if (drawing.w > 12 && drawing.h > 12) {
        const pct = pxToPct(drawing.x, drawing.y, drawing.w, drawing.h);
        const id = `cov_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const newCover = { id, ...pct, label: '' };
        setCovers((prev) => [...prev, newCover]);
        if (!activeRevealId) setActiveRevealId(id);
      }
      setDrawing(null);
    }
    setInteraction(null);
  };

  const deleteCover = (id) => {
    setCovers((prev) => prev.filter((c) => c.id !== id));
    if (activeRevealId === id) setActiveRevealId('');
  };

  const setLabel = (id, label) => {
    setCovers((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
  };

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.SoundWallCard.update(card.id, {
        covers,
        active_reveal_id: activeRevealId,
      });
      onSaved?.();
      onClose?.();
    } catch (err) {
      alert('Could not save covers: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-black text-slate-800">Cover & Reveal Editor</h2>
            <p className="text-xs text-slate-500">
              {card?.card_type === 'phoneme' ? 'Phoneme' : 'Grapheme'} card · {card?.grapheme}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 flex flex-col lg:flex-row gap-5">
          {/* Drawing canvas */}
          <div className="flex-1 flex flex-col items-center">
            <p className="text-xs text-slate-500 mb-2 text-center">
              Drag on the card to draw a cover. Mark one as <b>“Reveal”</b> — it animates away during the lesson.
            </p>
            <div
              ref={imgWrapRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="relative w-full max-w-sm aspect-[3/4] rounded-2xl overflow-hidden shadow-lg bg-slate-100 border-2 border-red-300 select-none touch-none cursor-crosshair"
              onMouseEnter={recalcSize}
            >
              {processedImageUrl && (
                <img
                  src={processedImageUrl}
                  alt={card.label || card.grapheme}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  onLoad={recalcSize}
                />
              )}

              {/* Committed covers */}
              {imgSize.w > 0 && covers.map((c) => {
                const px = pctToPx(c);
                const isActive = c.id === activeRevealId;
                return (
                  <div
                    key={c.id}
                    data-cover-control
                    onPointerDown={(e) => onCoverPointerDown(e, c)}
                    className={`absolute rounded-xl flex flex-col items-stretch cursor-move ${editingId === c.id ? 'ring-2 ring-red-400' : ''}`}
                    style={{
                      left: px.x,
                      top: px.y,
                      width: px.w,
                      height: px.h,
                      background: isActive ? 'rgba(220,38,38,0.42)' : 'rgba(30,41,59,0.55)',
                      border: isActive ? '2px solid #dc2626' : '2px solid #475569',
                      boxShadow: isActive ? '0 0 0 3px rgba(220,38,38,0.25)' : 'none',
                    }}
                  >
                    {/* Cover label input */}
                    <input
                      data-cover-control
                      type="text"
                      value={c.label || ''}
                      onChange={(e) => setLabel(c.id, e.target.value)}
                      placeholder="label…"
                      className="w-full px-1.5 py-0.5 text-[11px] font-bold text-white bg-black/30 placeholder-white/40 text-center outline-none border-none"
                    />
                    {/* Action row */}
                    <div className="flex-1 flex items-end justify-end gap-1 p-1">
                      <button
                        data-cover-control
                        onClick={() => setActiveRevealId(isActive ? '' : c.id)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-black flex items-center gap-0.5 ${
                          isActive ? 'bg-red-500 text-white' : 'bg-white/80 text-slate-700 hover:bg-white'
                        }`}
                        title={isActive ? 'This cover will animate away during the lesson' : 'Mark as the lesson reveal'}
                      >
                        <Eye className="w-3 h-3" /> {isActive ? 'Reveal ✓' : 'Set reveal'}
                      </button>
                      <button
                        data-cover-control
                        onClick={() => deleteCover(c.id)}
                        className="w-6 h-6 rounded bg-black/50 text-white flex items-center justify-center hover:bg-red-500"
                        title="Delete cover"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {editingId === c.id && (
                      <>
                        <div data-cover-control onPointerDown={(e) => onHandlePointerDown(e, c, 'nw')} className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-red-500 rounded-sm cursor-nwse-resize z-10" />
                        <div data-cover-control onPointerDown={(e) => onHandlePointerDown(e, c, 'ne')} className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-red-500 rounded-sm cursor-nesw-resize z-10" />
                        <div data-cover-control onPointerDown={(e) => onHandlePointerDown(e, c, 'sw')} className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-red-500 rounded-sm cursor-nesw-resize z-10" />
                        <div data-cover-control onPointerDown={(e) => onHandlePointerDown(e, c, 'se')} className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-red-500 rounded-sm cursor-nwse-resize z-10" />
                      </>
                    )}
                  </div>
                );
              })}

              {/* Live drawing preview */}
              {drawing && drawing.w > 0 && (
                <div
                  className="absolute rounded-xl pointer-events-none border-2 border-dashed border-indigo-400 bg-indigo-400/20"
                  style={{ left: drawing.x, top: drawing.y, width: drawing.w, height: drawing.h }}
                />
              )}
            </div>
          </div>

          {/* Cover list / instructions */}
          <div className="w-full lg:w-64 shrink-0 flex flex-col gap-3">
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-bold text-slate-700 mb-2">How it works</p>
              <ul className="text-[11px] text-slate-600 space-y-1.5 list-disc list-inside">
                <li>Drag on the card to draw a rounded cover over the part you want hidden.</li>
                <li>Drag a cover to move it; drag its corner handles to resize.</li>
                <li>Tap <b>Set reveal</b> on the cover you want to animate away during the lesson.</li>
                <li>Other covers stay in place (reveal them in later lessons by switching the active one).</li>
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-slate-700">
                Covers ({covers.length})
              </p>
              {covers.length === 0 && (
                <p className="text-xs text-slate-400">No covers yet — draw one on the card.</p>
              )}
              {covers.map((c, i) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs ${
                    c.id === activeRevealId
                      ? 'border-red-300 bg-red-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-[10px]">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-slate-600">
                    {c.label || `Cover ${i + 1}`}
                  </span>
                  {c.id === activeRevealId && (
                    <span className="text-[10px] font-black text-red-600 flex items-center gap-0.5">
                      <Eye className="w-3 h-3" /> Reveal
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg font-bold text-slate-600 hover:bg-slate-200">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-black flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
            Save covers
          </button>
        </div>
      </div>
    </div>
  );
}