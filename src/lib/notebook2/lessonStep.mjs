export function nativeStepKey({ variant, className, id, number, schoolYear, config = {}, stepIndex, liveSession }) {
  return JSON.stringify([variant, className, id, number, schoolYear, liveSession?.id || '',
    stepIndex, config.pageSelection, config.pageStart, config.pageEnd, config.customPages]);
}

export function stepLiveState(native, parent, number, selection) {
  if (!parent) return native?.active && !native.ended ? native : null;
  const selected = !Array.isArray(parent.target_students) || !parent.target_students.length
    || parent.target_students.map(Number).includes(number);
  const canWrite = parent.active === true && selected
    && (parent.phase === 'try' || parent.release_mode === 'lesson');
  if (native?.active && !native.ended && native.students?.includes(number)) {
    return { ...native, canWrite: canWrite && native.canWrite !== false };
  }
  return { id: `lesson-${parent.id}`, active: parent.active === true && selected,
    ended: parent.active !== true, engine: 'native', students: [number],
    page: selection.page, follow: false, canWrite };
}
