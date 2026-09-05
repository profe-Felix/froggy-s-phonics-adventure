// Teacher rotation: 3 teachers cycle across 3 class periods (A, B, C).
// Group A = own homeroom, B = next teacher in order, C = third teacher.
const TEACHER_ORDER = ['Felix', 'Gutierrez', 'Valero'];
const GROUP_SHIFT = { A: 0, B: 1, C: 2 };

export const ROTATION_TEACHERS = TEACHER_ORDER;

export function getHomeroomForClass(teacher, group) {
  const idx = TEACHER_ORDER.findIndex(
    (t) => t.toLowerCase() === (teacher || '').toLowerCase()
  );
  if (idx === -1) return teacher; // fallback: unknown teacher keeps own students
  const shift = GROUP_SHIFT[group] ?? 0;
  return TEACHER_ORDER[(idx + shift) % TEACHER_ORDER.length];
}