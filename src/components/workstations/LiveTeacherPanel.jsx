// Teacher controls shown in the header during a live session.
// Switching activity or preset resets the shared state (seed reshuffled,
// settings cleared) so every participant lands on the same fresh view.
export default function LiveTeacherPanel({ session, presets, onUpdate, onShowQr }) {
  const activity = session.activity;
  const presetList = activity === 'fluency_table'
    ? presets.fluency_table.map((p) => ({ id: p.id, label: p.title }))
    : Object.entries(presets.syllable_blender).map(([id, p]) => ({ id, label: p.label || id }));

  const switchActivity = (a) => {
    const ids = a === 'fluency_table'
      ? presets.fluency_table.map((p) => p.id)
      : Object.keys(presets.syllable_blender);
    onUpdate({ activity: a, preset_id: ids[0] || '', seed: Date.now(), settings: {} });
  };
  const switchPreset = (id) => onUpdate({ preset_id: id, seed: Date.now(), settings: {} });
  const shuffle = () => onUpdate({ seed: Date.now(), settings: {} });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select value={activity} onChange={(e) => switchActivity(e.target.value)} className="px-3 py-2 rounded-lg border font-bold bg-white">
        <option value="syllable_blender">📦 Syllable Blender</option>
        <option value="fluency_table">📖 Fluency Table</option>
      </select>
      <select value={session.preset_id} onChange={(e) => switchPreset(e.target.value)} className="px-3 py-2 rounded-lg border font-bold bg-white">
        {presetList.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <button onClick={shuffle} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold">🔀 Shuffle</button>
      <button onClick={onShowQr} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold">📱 Student QR</button>
    </div>
  );
}