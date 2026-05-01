import { useRef, useState, useEffect } from 'react';

/**
 * CutPiecesLayer — renders draggable cut pieces over the PDF.
 * Each piece: { id, imageDataUrl, x_pct, y_pct, w_pct, h_pct, originX_pct, originY_pct }
 *
 * Props:
 *   pieces        — array of piece objects
 *   containerW/H  — pixel size of the PDF container
 *   onUpdate      — called with new pieces array when positions change
 *   selectedId    — currently selected piece id (controls draw-through)
 *   onSelect      — called with piece id (or null) on tap
 */
export default function CutPiecesLayer({ pieces, containerW, containerH, onUpdate, selectedId, onSelect }) {
  const dragging = useRef(null); // { id, startMouseX, startMouseY, startPctX, startPctY }

  const onMouseDown = (e, piece) => {
    e.stopPropagation();
    onSelect(piece.id);
    dragging.current = {
      id: piece.id,
      startMouseX: e.touches ? e.touches[0].clientX : e.clientX,
      startMouseY: e.touches ? e.touches[0].clientY : e.clientY,
      startPctX: piece.x_pct,
      startPctY: piece.y_pct,
    };
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = (clientX - dragging.current.startMouseX) / containerW;
      const dy = (clientY - dragging.current.startMouseY) / containerH;
      const updated = pieces.map(p =>
        p.id === dragging.current.id
          ? {
              ...p,
              x_pct: Math.max(0, Math.min(1, dragging.current.startPctX + dx)),
              y_pct: Math.max(0, Math.min(1, dragging.current.startPctY + dy)),
            }
          : p
      );
      onUpdate(updated);
    };

    const onUp = () => { dragging.current = null; };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [pieces, containerW, containerH, onUpdate]);

  // Click on background = deselect
  const onLayerClick = (e) => {
    if (e.target === e.currentTarget) onSelect(null);
  };

  if (!pieces || pieces.length === 0) return null;

  return (
    <div
      onClick={onLayerClick}
      style={{ position: 'absolute', inset: 0, zIndex: 25, width: containerW, height: containerH, pointerEvents: 'none' }}
    >
      {pieces.map(piece => {
        const px = piece.x_pct * containerW;
        const py = piece.y_pct * containerH;
        const pw = piece.w_pct * containerW;
        const ph = piece.h_pct * containerH;
        const ox = piece.originX_pct * containerW;
        const oy = piece.originY_pct * containerH;
        const ow = piece.w_pct * containerW;
        const oh = piece.h_pct * containerH;
        const isSelected = selectedId === piece.id;

        return (
          <div key={piece.id} style={{ pointerEvents: 'auto' }}>
            {/* Dashed placeholder at origin */}
            <div style={{
              position: 'absolute',
              left: ox,
              top: oy,
              width: ow,
              height: oh,
              border: '2.5px dashed #7c3aed',
              borderRadius: 4,
              background: 'rgba(124,58,237,0.04)',
              pointerEvents: 'none',
            }} />

            {/* The cut piece */}
            <div
              onMouseDown={e => onMouseDown(e, piece)}
              onTouchStart={e => onMouseDown(e, piece)}
              style={{
                position: 'absolute',
                left: px,
                top: py,
                width: pw,
                height: ph,
                cursor: 'grab',
                userSelect: 'none',
                touchAction: 'none',
                border: isSelected ? '2px solid #7c3aed' : '1.5px solid rgba(124,58,237,0.35)',
                borderRadius: 4,
                boxShadow: isSelected
                  ? '0 6px 24px rgba(0,0,0,0.35), 0 0 0 3px rgba(124,58,237,0.4)'
                  : '0 4px 16px rgba(0,0,0,0.28)',
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              <img
                src={piece.imageDataUrl}
                alt="cut piece"
                draggable={false}
                style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}