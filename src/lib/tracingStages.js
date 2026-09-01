// Shared tracing-stage definitions and helpers for the live tracing student
// experience. Mirrors the Letter Tracing game's staged progression so the
// live session feels identical to independent practice.

export const TRACING_STAGES = [
  { key: 'guided_huge', label: 'Guided Huge', shortLabel: 'Guided', sizeLevel: 0, repetitions: 3, showGuide: true },
  { key: 'independent_big', label: 'Independent Big', shortLabel: 'Big', sizeLevel: 1, repetitions: 3, showGuide: false },
  { key: 'independent_medium', label: 'Independent Medium', shortLabel: 'Medium', sizeLevel: 2, repetitions: 3, showGuide: false },
];

export const SIZE_LEVELS = [
  { w: 1000, label: 'Huge' },
  { w: 690, label: 'Big' },
  { w: 470, label: 'Medium' },
  { w: 320, label: 'Small' },
  { w: 220, label: 'Paper' },
];

export const REQUIRED_CLEAN_STREAK = 2;
export const MAX_REPAIR_REPS = 2;
export const STAGES_PER_LETTER = TRACING_STAGES.length;

export function makeStageState() {
  return {
    stageIndex: 0,
    stageSuccesses: 0,
    cleanStreak: 0,
    repairReps: 0,
    mistakes: 0,
    totalSuccesses: 0,
    totalAttempts: 0,
    mastered: false,
  };
}

export function getStage(p) {
  return TRACING_STAGES[Math.min(Math.max(p?.stageIndex || 0, 0), TRACING_STAGES.length - 1)];
}

export function getRequiredForStage(p) {
  const s = getStage(p);
  return s.repetitions + Math.min(p?.repairReps || 0, MAX_REPAIR_REPS);
}

export function hasStarted(p) {
  return p && (
    p.stageIndex > 0 ||
    p.stageSuccesses > 0 ||
    p.totalSuccesses > 0 ||
    p.mistakes > 0
  );
}

// Whole-section progress (0-100) across a set of letters — used by the grid's
// progression bar. Each letter contributes STAGES_PER_LETTER points.
export function sectionProgressFor(letters, letterProgress, completedLetters) {
  if (!letters.length) return 0;
  let earned = 0;
  let possible = 0;
  for (const letter of letters) {
    const p = letterProgress[letter] || makeStageState();
    if (completedLetters.has(letter) || p.mastered) {
      earned += TRACING_STAGES.length;
      possible += TRACING_STAGES.length;
      continue;
    }
    possible += TRACING_STAGES.length;
    earned += p.stageIndex;
    const stage = TRACING_STAGES[p.stageIndex];
    if (stage) {
      const need = stage.repetitions + Math.min(p.repairReps || 0, MAX_REPAIR_REPS);
      earned += Math.min(1, (p.stageSuccesses || 0) / Math.max(1, need));
    }
  }
  return Math.max(0, Math.min(100, Math.round((earned / Math.max(1, possible)) * 100)));
}