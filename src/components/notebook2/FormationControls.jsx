// Fine scrubbing spans one stroke, not an entire page of handwriting.
export default function FormationControls({ timeline, time, onSeek }) {
  const strokes = timeline.filter(entry => entry.operation.stroke);
  if (!strokes.length) return null;
  let index = strokes.findLastIndex(entry => entry.start <= time);
  index = Math.max(0, index);
  const entry = strokes[index];
  const button = { border: "1px solid #b5c5cc", borderRadius: 7, padding: "4px 7px", background: "#fff", color: "#234351", cursor: "pointer" };
  return <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "6px 0", fontSize: 12 }}>
    <button type="button" style={button} aria-label="Previous stroke" disabled={index === 0}
      onClick={() => onSeek(strokes[index - 1].start)}>Previous stroke</button>
    <span>Stroke {index + 1}/{strokes.length}</span>
    <button type="button" style={button} aria-label="Next stroke" disabled={index === strokes.length - 1}
      onClick={() => onSeek(strokes[index + 1].start)}>Next stroke</button>
    <input type="range" min={entry.start} max={entry.end} step={1}
      value={Math.min(entry.end, Math.max(entry.start, time))}
      onChange={e => onSeek(Number(e.target.value))} aria-label="Current stroke formation"
      style={{ flex: "1 1 160px", minWidth: 100 }} />
    <small style={{ flexBasis: "100%", color: "#526776" }}>Slowed for formation review; pauses shortened. Original ink and timing are unchanged.</small>
  </div>;
}
