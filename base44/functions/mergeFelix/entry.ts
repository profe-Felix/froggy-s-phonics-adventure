import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

function mergeAttempts(a, b) {
  const result = { ...a };
  for (const key of Object.keys(b)) {
    if (result[key]) {
      result[key] = {
        correct: (result[key].correct || 0) + (b[key].correct || 0),
        total: (result[key].total || 0) + (b[key].total || 0),
      };
    } else {
      result[key] = b[key];
    }
  }
  return result;
}

function mergeMode(a, b) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  const masteredA = a.mastered_items || [];
  const masteredB = b.mastered_items || [];
  const mergedMastered = [...new Set([...masteredA, ...masteredB])];

  // Use the learning_items from whichever is more advanced (more mastered items)
  const learningItems = masteredA.length >= masteredB.length ? (a.learning_items || []) : (b.learning_items || []);

  return {
    mastered_items: mergedMastered,
    learning_items: learningItems.filter(x => !mergedMastered.includes(x)),
    item_attempts: mergeAttempts(a.item_attempts || {}, b.item_attempts || {}),
    total_correct: (a.total_correct || 0) + (b.total_correct || 0),
    total_attempts: (a.total_attempts || 0) + (b.total_attempts || 0),
    unlocked: !!(a.unlocked || b.unlocked),
  };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Admin only' }, { status: 403 });
  }

  const felixStudents = await base44.asServiceRole.entities.Student.filter({ class_name: 'Felix' }, 'student_number', 50);
  const felixUPPER = await base44.asServiceRole.entities.Student.filter({ class_name: 'FELIX' }, 'student_number', 50);

  const felixMap = {};
  for (const s of felixStudents) {
    felixMap[s.student_number] = s;
  }

  const results = [];
  const toDelete = [];

  for (const upper of felixUPPER) {
    const lower = felixMap[upper.student_number];
    toDelete.push(upper.id);

    if (!lower) {
      // No Felix counterpart — just rename
      await base44.asServiceRole.entities.Student.update(upper.id, { class_name: 'Felix' });
      results.push({ number: upper.student_number, action: 'renamed' });
      continue;
    }

    // Merge mode_progress
    const modes = ['letter_sounds', 'sight_words_easy', 'sight_words_spelling', 'spelling', 'case_matching'];
    const mergedProgress = {};
    for (const mode of modes) {
      mergedProgress[mode] = mergeMode(lower.mode_progress?.[mode], upper.mode_progress?.[mode]);
    }

    // Merge pets
    const mergedPets = [...new Set([...(lower.unlocked_pets || []), ...(upper.unlocked_pets || [])])];
    const activePet = upper.active_pet || lower.active_pet || mergedPets[0];
    const pendingUnlocks = (lower.pending_pet_unlocks || 0) + (upper.pending_pet_unlocks || 0);

    // Use FELIX's current_mode as it's more recent
    const currentMode = upper.current_mode || lower.current_mode;

    await base44.asServiceRole.entities.Student.update(lower.id, {
      mode_progress: mergedProgress,
      unlocked_pets: mergedPets,
      active_pet: activePet,
      pending_pet_unlocks: pendingUnlocks,
      current_mode: currentMode,
    });

    results.push({ number: upper.student_number, action: 'merged', mergedPets: mergedPets.length });
  }

  // Delete all FELIX records
  for (const id of toDelete) {
    await base44.asServiceRole.entities.Student.delete(id);
  }

  return Response.json({ success: true, processed: results.length, results });
});