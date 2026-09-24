// Adaptive difficulty for Spanish Reading.
//
// Computes a rolling accuracy score from a student's recent reading sessions
// and maps it to a difficulty level that controls two things:
//   1. The new/review ratio in each practice round.
//   2. The maximum WordBank difficulty tier (1=simple, 2=intermediate, 3=complex)
//      that decodable words are drawn from.
//
// Teacher grade takes precedence when available; otherwise the student's
// self-grade is used. A minimum sample size is required before the level
// moves away from the default "unknown" (which behaves like medium).

const WINDOW_SIZE = 20;
const MIN_SAMPLE = 5;

// Resolve the effective grade for one session: teacher grade wins if reviewed,
// otherwise fall back to the student's self-assessment.
function effectiveGrade(session) {
  if (session.teacher_grade && session.teacher_grade !== 'pending') {
    return session.teacher_grade;
  }
  if (session.student_self_grade && session.student_self_grade !== 'pending') {
    return session.student_self_grade;
  }
  return null;
}

// Returns 'high' | 'medium' | 'low' | 'unknown'
export function computeAdaptiveLevel(sessions) {
  const graded = (sessions || [])
    .map((s) => ({ grade: effectiveGrade(s), date: s.created_date }))
    .filter((s) => s.grade === 'correct' || s.grade === 'incorrect')
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, WINDOW_SIZE);

  if (graded.length < MIN_SAMPLE) return 'unknown';

  const correct = graded.filter((s) => s.grade === 'correct').length;
  const accuracy = correct / graded.length;

  if (accuracy >= 0.8) return 'high';
  if (accuracy >= 0.5) return 'medium';
  return 'low';
}

// New/review ratio for the practice round.
export function getAdaptiveRatio(level) {
  switch (level) {
    case 'high':
      return { new: 0.8, review: 0.2 };
    case 'low':
      return { new: 0.4, review: 0.6 };
    default:
      return { new: 0.7, review: 0.3 };
  }
}

// Maximum WordBank difficulty tier to include (1=simple, 2=intermediate, 3=complex).
export function getMaxTier(level) {
  switch (level) {
    case 'high':
      return 3;
    case 'low':
      return 1;
    default:
      return 2;
  }
}