export const TEACHER_SIGN_IN_REQUIRED = "NOTEBOOK_TEACHER_SIGN_IN_REQUIRED";

export function teacherAuthenticationError() {
  const error = new Error("Sign in as the teacher to connect this notebook. The assessment and existing student work are retained.");
  error.code = TEACHER_SIGN_IN_REQUIRED;
  return error;
}

export function isTeacherSignInRequired(error) {
  return error?.code === TEACHER_SIGN_IN_REQUIRED ||
    error?.status === 401 || error?.response?.status === 401;
}

export async function requireNotebookTeacherSession(auth) {
  let user;
  try { user = await auth.me(); }
  catch (error) {
    if (isTeacherSignInRequired(error)) throw teacherAuthenticationError();
    throw new Error("Teacher sign-in could not be checked. Keep this assessment open and retry.");
  }
  if (typeof user?.id !== "string" || !user.id) throw teacherAuthenticationError();
  // This is an interface check only. Both server functions still authenticate
  // and authorize the account independently before any service-role reads.
  return user;
}

export function notebookTeacherReturnUrl(origin, context) {
  if (context?.role !== "teacher") throw new Error("Teacher sign-in is not a student login.");
  const url = new URL("/LiveLesson", origin);
  if (context.kind === "assessment") {
    if (context.sourceId) url.searchParams.set("notebook_assessment", context.sourceId);
    else url.searchParams.set("notebook_setup", "1");
  } else if (context.kind === "lesson" && context.sourceId) {
    url.searchParams.set("session", context.sourceId);
  } else throw new Error("A teacher notebook activity is required.");
  if (context.className) url.searchParams.set("class", context.className);
  if (context.assignmentId) url.searchParams.set("assignment", context.assignmentId);
  return url.href;
}
