// Student 30 is a teacher-model account: every level and every lesson step is
// unlocked so the teacher can jump straight to any activity to model it,
// without satisfying the normal completion gating. Keep this small and
// import-only so the gating stays in one obvious place per surface.
export const TEACHER_MODEL_NUMBER = 30;

export function isTeacherModelStudent(studentNumber) {
  return Number(studentNumber) === TEACHER_MODEL_NUMBER;
}