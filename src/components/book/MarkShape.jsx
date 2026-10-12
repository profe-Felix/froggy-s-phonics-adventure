// Draws a highlight / box / underline mark. x, y, w, h are normalized 0-1
// relative to the positioned parent.
export default function MarkShape({ mark }) {
  if (!mark?.shape) return null;
  const pos = { position: 'absolute', left: `${mark.x * 100}%`, top: `${mark.y * 100}%`, width: `${mark.w * 100}%`, height: `${mark.h * 100}%`, pointerEvents: 'none' };
  if (mark.shape === 'highlight') {
    return <div style={{ ...pos, background: 'rgba(250, 204, 21, 0.45)', borderRadius: 4, mixBlendMode: 'multiply' }} />;
  }
  if (mark.shape === 'box') {
    return <div style={{ ...pos, border: '4px solid #ef4444', borderRadius: 8 }} />;
  }
  return <div style={{ ...pos, borderBottom: '5px solid #ef4444' }} />;
}