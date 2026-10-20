import { base44 } from "@/api/base44Client";
import { ACTIVE_SCHOOL_YEAR } from "@/lib/schoolYear";
import { nativeScope } from "./model.mjs";

export async function publishNativeLaunch({ className, assignmentId, sessionId, students, variant = 2, page, schoolYear = ACTIVE_SCHOOL_YEAR }) {
  nativeScope({ className, assignmentId, schoolYear, variant, channel: "live" });
  if (!sessionId || !students?.length || students.some(n => !Number.isInteger(n) || n < 1 || n > 30)) throw new Error("Select the classroom students before announcing the session.");
  const entity = base44.entities.NativeNotebookLaunch;
  const previous = await entity.filter({ class_name: className, school_year: schoolYear, session_id: sessionId, variant });
  if (previous.some(r => r.active === false)) throw new Error("This classroom session already ended. Start a new session.");
  const body = { class_name: className, school_year: schoolYear, assignment_id: assignmentId,
    session_id: sessionId, students: [...new Set(students)], variant, page, active: true,
    started_at: previous[0]?.started_at || Date.now() };
  if (previous.length) {
    await Promise.all(previous.map(row => entity.update(row.id, body)));
    return body;
  }
  return entity.create(body);
}

export async function endNativeLaunch(className, sessionId, variant = 2, schoolYear = ACTIVE_SCHOOL_YEAR) {
  const entity = base44.entities.NativeNotebookLaunch;
  const rows = await entity.filter({ class_name: className, school_year: schoolYear, session_id: sessionId, variant });
  await Promise.all(rows.map(row => entity.update(row.id, { active: false })));
}
