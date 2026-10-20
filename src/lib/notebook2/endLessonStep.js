import { openNativeNotebook } from "./client";
import { endNativeLaunch } from "./announcements";
import { ACTIVE_SCHOOL_YEAR } from "@/lib/schoolYear";

// Only called when leaving an explicit V2/V3 step, never for stable notebooks.
export async function endNativeLessonStep(className, step) {
  if (!["digital_notebook2", "digital_notebook3"].includes(step?.mode) || !step.config?.assignmentId) return;
  const variant = step.mode === "digital_notebook3" ? 3 : 2;
  let session;
  await new Promise((resolve, reject) => {
    let client, timer, settled = false;
    const done = error => {
      if (settled) return; settled = true; clearTimeout(timer);
      client?.close(); error ? reject(error) : resolve();
    };
    timer = setTimeout(() => done(new Error("Native notebook end was not confirmed. Retry ending the lesson.")), 12000);
    try {
      client = openNativeNotebook({ className, assignmentId: step.config.assignmentId, schoolYear: ACTIVE_SCHOOL_YEAR,
        variant, channel: "live", number: 0 }, "teacher", msg => {
        if (msg.type === "joined") {
          session = msg.live;
          if (!session?.active || session.ended) { done(); return; }
          client.send({ type: "control", control: { ...session, ended: true }, requestId: "lesson-step-end" });
        } else if (msg.type === "control-ack" && msg.requestId === "lesson-step-end") done();
        else if (msg.type === "error") done(new Error(msg.message));
      });
    } catch (error) { done(error); }
  });
  if (session?.id) await endNativeLaunch(className, session.id, variant);
}
