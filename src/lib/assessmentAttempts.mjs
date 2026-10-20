// Durable attempt identity travels with the result, including resumed legacy work.
export function attemptKey(sessionId, studentId, type, result) {
  return result._attempt_id || `legacy:${sessionId}:${studentId}:${type}`;
}

export function attemptPayload(session, studentId, type, result) {
  return {
    attempt_key: attemptKey(session.id, studentId, type, result),
    student_id: studentId, session_id: session.id, assessment_type: type,
    school_year: session.school_year, teacher_name: session.teacher_name,
    block: session.block, color_group: session.color_group,
    language: result._language || '',
    started_at: result._started_at || session.started_at || session.created_date,
    saved_at: new Date().toISOString(), completed: !!result.completed,
    result: structuredClone(result),
  };
}

export async function readAll(entity, query) {
  const rows = [];
  for (let skip = 0; ; skip += 200) {
    // Stable creation order, not mutable updated_date, while paging.
    const page = await entity.filter(query, 'created_date', 200, skip);
    rows.push(...page);
    if (page.length < 200) return rows;
  }
}

export function historyEntry(row) {
  const r = row.result || {};
  return {
    ...r, id: row.attempt_key, type: row.assessment_type,
    date: row.started_at || row.saved_at || row.created_date,
    teacher_name: row.teacher_name, color_group: row.color_group,
    language: row.language, source: row.attempt_key.startsWith('legacy:') ? 'Earlier session' : 'Student attempt',
    correct: row.assessment_type === 'decoding' ? Object.values(r.levels || {}).flatMap(l => l.correct || []) : r.correct || [],
    incorrect: row.assessment_type === 'decoding' ? Object.values(r.levels || {}).flatMap(l => l.incorrect || []) : r.incorrect || [],
  };
}

export function mergeStudentHistory(studentId, sessions, attempts) {
  const map = new Map();
  for (const session of sessions) {
    for (const [type, result] of Object.entries(session.results?.[studentId] || {})) {
      const row = attemptPayload(session, studentId, type, result);
      map.set(row.attempt_key, historyEntry(row));
    }
  }
  // Resolve a retry's ambiguous create without counting it as another attempt.
  for (const row of [...attempts].sort((a, b) => (a.saved_at || '').localeCompare(b.saved_at || ''))) {
    map.set(row.attempt_key, historyEntry(row));
  }
  return [...map.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function outcomes(attempt) {
  const map = new Map();
  const add = (r, level = '') => {
    for (const item of r.item_order || []) map.set(`${level}:${item}`, { key: `${level}:${item}`, item, level, outcome: null });
    for (const state of ['correct', 'incorrect']) {
      for (const item of r[state] || []) map.set(`${level}:${item}`, { key: `${level}:${item}`, item, level, outcome: state });
    }
  };
  if (attempt.type === 'decoding') {
    for (const [level, r] of Object.entries(attempt.levels || {})) add(r, level);
  } else add(attempt);
  return map;
}

export function compareAttempts(before, after) {
  const result = { improved: [], retained: [], regressed: [], stillIncorrect: [], notTested: [], shared: 0, beforeAccuracy: null, afterAccuracy: null };
  if (before.type !== after.type || (before.language && after.language && before.language !== after.language)) return { ...result, incompatible: true };
  const a = outcomes(before), b = outcomes(after);
  let correctA = 0, correctB = 0;
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const old = a.get(key), next = b.get(key), item = next || old;
    if (!old?.outcome || !next?.outcome) { result.notTested.push(item); continue; }
    result.shared++;
    if (old.outcome === 'correct') correctA++;
    if (next.outcome === 'correct') correctB++;
    const category = old.outcome === 'correct'
      ? next.outcome === 'correct' ? 'retained' : 'regressed'
      : next.outcome === 'correct' ? 'improved' : 'stillIncorrect';
    result[category].push(item);
  }
  if (result.shared) {
    result.beforeAccuracy = Math.round(100 * correctA / result.shared);
    result.afterAccuracy = Math.round(100 * correctB / result.shared);
  }
  return result;
}

// Serialized, per-attempt writes. Snapshots are captured BEFORE a reassessment
// replaces the current result. Unsent work survives reloads on this device.
export function createAttemptStore({ entity, storage, scope, onStatus = () => {}, onSaved = () => {} }) {
  const storageKey = `smallgroup-attempt-outbox:${scope}`;
  let pending = new Map(), known = new Map(), running = null, timer = null;
  const signatures = new Map();
  let localError = '';
  try { pending = new Map(JSON.parse(storage.getItem(storageKey) || '[]')); }
  catch { localError = 'Device recovery storage is unavailable. Keep this page open until saved.'; }
  const status = (error = '') => onStatus({ pending: pending.size, error: error || localError });
  const remember = () => {
    try {
      if (pending.size) storage.setItem(storageKey, JSON.stringify([...pending]));
      else storage.removeItem(storageKey);
      localError = '';
    } catch { localError = 'Device recovery storage is full or unavailable. Keep this page open until saved.'; }
    status();
  };
  const flush = () => {
    clearTimeout(timer);
    if (running) return running;
    if (!pending.size) { status(); return Promise.resolve(true); }
    running = (async () => {
      try {
        while (pending.size) {
          const [key, payload] = pending.entries().next().value;
          let id = known.get(key);
          if (!id) {
            const rows = await entity.filter({ attempt_key: key }, 'created_date', 10);
            id = rows[0]?.id;
          }
          const saved = id ? await entity.update(id, payload) : await entity.create(payload);
          known.set(key, saved.id);
          onSaved({ ...payload, ...saved });
          // A mark may arrive while the previous snapshot is being saved.
          if (pending.get(key) === payload) pending.delete(key);
          remember();
        }
        status();
        return true;
      } catch {
        status('Scores are not saved yet. They will retry; keep this page open or return on this device.');
        timer = setTimeout(() => { void flush(); }, 5000);
        return false;
      } finally { running = null; }
    })();
    return running;
  };
  return {
    stage(session, results) {
      for (const [studentId, types] of Object.entries(results)) {
        for (const [type, result] of Object.entries(types)) {
          const payload = attemptPayload(session, studentId, type, result);
          const key = payload.attempt_key;
          // No results map, roster, or other student's answers go into this write.
          const signature = JSON.stringify(result);
          if (signatures.get(key) === signature) continue;
          signatures.set(key, signature);
          pending.set(key, payload);
        }
      }
      remember();
      clearTimeout(timer);
      timer = setTimeout(() => { void flush(); }, 300);
    },
    seed(rows) { for (const row of rows) known.set(row.attempt_key, row.id); },
    snapshots(sessionId) { return [...pending.values()].filter(row => row.session_id === sessionId); },
    hasPending() { return pending.size > 0; },
    flush,
    dispose() { clearTimeout(timer); },
  };
}
