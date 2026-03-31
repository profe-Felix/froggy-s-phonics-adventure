// Reusable ten-frame display of cubes (blue filled, ghost empty)
export default function DisplayCubes({ count }) {
  const SLOT_H = 24;
  const FilledCube = ({ key: k }) => (
    <div key={k} style={{ flex: 1, height: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 3, right: 0, height: 5, background: '#4a6fc7', clipPath: 'polygon(0 100%, 3px 0, 100% 0, calc(100% - 3px) 100%)', borderTop: '1px solid #1e3a8a' }} />
      <div style={{ position: 'absolute', top: 5, left: 0, right: 3, bottom: 0, background: '#2d4fa1', border: '1px solid #1e3a8a', borderRadius: 1 }} />
      <div style={{ position: 'absolute', top: 5, right: 0, width: 3, bottom: 0, background: '#1e3a8a', borderRadius: '0 1px 1px 0' }} />
    </div>
  );
  const GhostSlot = ({ key: k }) => (
    <div key={k} style={{ flex: 1, height: '100%' }}
      className="rounded border border-dashed border-blue-300 bg-blue-100/40" />
  );
  const row1Count = Math.min(count, 10);
  const row2Count = Math.max(0, count - 10);
  return (
    <div className="flex flex-col w-full" style={{ gap: 8 }}>
      <div className="flex gap-0.5 w-full" style={{ height: SLOT_H }}>
        {Array.from({ length: 10 }).map((_, i) =>
          i < row1Count
            ? <div key={i} style={{ flex: 1, height: '100%', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 3, right: 0, height: 5, background: '#4a6fc7', clipPath: 'polygon(0 100%, 3px 0, 100% 0, calc(100% - 3px) 100%)', borderTop: '1px solid #1e3a8a' }} />
                <div style={{ position: 'absolute', top: 5, left: 0, right: 3, bottom: 0, background: '#2d4fa1', border: '1px solid #1e3a8a', borderRadius: 1 }} />
                <div style={{ position: 'absolute', top: 5, right: 0, width: 3, bottom: 0, background: '#1e3a8a', borderRadius: '0 1px 1px 0' }} />
              </div>
            : <div key={i} style={{ flex: 1, height: '100%' }} className="rounded border border-dashed border-blue-300 bg-blue-100/40" />
        )}
      </div>
      <div className="flex gap-0.5 w-full" style={{ height: SLOT_H }}>
        {Array.from({ length: 10 }).map((_, i) =>
          i < row2Count
            ? <div key={i} style={{ flex: 1, height: '100%', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 3, right: 0, height: 5, background: '#4a6fc7', clipPath: 'polygon(0 100%, 3px 0, 100% 0, calc(100% - 3px) 100%)', borderTop: '1px solid #1e3a8a' }} />
                <div style={{ position: 'absolute', top: 5, left: 0, right: 3, bottom: 0, background: '#2d4fa1', border: '1px solid #1e3a8a', borderRadius: 1 }} />
                <div style={{ position: 'absolute', top: 5, right: 0, width: 3, bottom: 0, background: '#1e3a8a', borderRadius: '0 1px 1px 0' }} />
              </div>
            : <div key={i} style={{ flex: 1, height: '100%' }} className="rounded border border-dashed border-blue-300 bg-blue-100/40" />
        )}
      </div>
    </div>
  );
}