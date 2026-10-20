export function matchesNativeLaunch(row, identity) {
  return !!identity && row?.active === true && [2, 3].includes(row.variant)
    && row.class_name === identity.className && row.school_year === identity.schoolYear
    && typeof row.assignment_id === "string" && typeof row.session_id === "string"
    && Array.isArray(row.students) && row.students.includes(identity.number);
}
export function chooseNativeLaunch(rows, identity, ended = new Set()) {
  return (Array.isArray(rows) ? rows : []).filter(r => matchesNativeLaunch(r, identity)
    && !ended.has(`${r.variant}:${r.session_id}`))
    .sort((a, b) => (b.started_at || 0) - (a.started_at || 0) || String(b.id).localeCompare(String(a.id)))[0] || null;
}
export function mergeNativeLaunch(rows = [], event) {
  const id = event?.id || event?.data?.id;
  if (!id) return rows;
  if (event.type === "delete") return rows.filter(r => r.id !== id);
  const previous = rows.find(r => r.id === id);
  const value = { ...previous, ...event.data, id };
  return [...rows.filter(r => r.id !== id), value];
}
