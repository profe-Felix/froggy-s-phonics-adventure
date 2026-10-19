// End is terminal for a session ID. Delayed heartbeats or broadcasts must not
// reopen it; starting again creates a new session.
export function mergeLiveSession(current, incoming) {
  return {
    ...current,
    ...incoming,
    ...(current?.active === false ? { active: false } : {}),
  };
}

// Only notebooks that can be in use need controls. A future notebook in a
// teacher-led lesson must not interfere with a completely different activity.
export function lessonNotebookTargets(session, steps, visited = new Set()) {
  const current = Number(session.current_step || 0);
  const selfPaced = session.release_mode === 'lesson';
  const targets = [];
  steps.forEach((step, index) => {
    if (step?.mode !== 'digital_notebook' || !step.config?.assignmentId) return;
    if (index <= current || visited.has(index) || selfPaced) targets.push({ step, index });
  });
  // One request per assignment is enough: server policy derives its current
  // active/paused state from the saved lesson, not from the chosen old step.
  return [...new Map(targets.map(target => [target.step.config.assignmentId, target])).values()];
}

export function markLiveSessionEnded(records, id) {
  return Array.isArray(records)
    ? records.map(record => record.id === id ? { ...record, active: false } : record)
    : records;
}
