import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { prepareNotebookRequest } from "../../shared/externalNotebookMapping.mjs";
import { resolveNotebookAssessmentAccess } from "../../shared/externalNotebookNativePolicy.mjs";
import { bootstrapNotebookExtension } from "../../shared/externalNotebookLessonPolicy.mjs";

// The server supplies Deno; this declaration is only for the code editor.
declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

const NOTEBOOK_ORIGIN = "https://live-classroom-annotation-notebook.replit.app";
const BASE44_ORIGIN = "https://edu-aventura.base44.app";
const pendingReads = new Map<string, Promise<any>>();

// Coalesce simultaneous reads within an instance, never cache finished results.
function sharedRead(key: string, read: () => Promise<any>) {
  if (pendingReads.has(key)) return pendingReads.get(key);

  const task = Promise.resolve().then(read).finally(() => {
    if (pendingReads.get(key) === task) pendingReads.delete(key);
  });

  pendingReads.set(key, task);
  return task;
}

export default async function(req: Request) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Notebook-Adapter": "native-assessment-lesson-v1",
  };

  const reply = (error: string, status: number) =>
    Response.json({ error }, { status, headers });

  if (req.method !== "POST") return reply("POST required.", 405);

  const origin = req.headers.get("Origin");

  if (origin && ![BASE44_ORIGIN, "https://preview--edu-aventura.base44.app"].includes(origin)) {
    return reply("This notebook origin is not enabled.", 403);
  }

  // Keep disabled until the backend, teacher controls and safe exits are ready.
  if (Deno.env.get("NOTEBOOK_NATIVE_ENABLED") !== "true") {
    return reply("The native notebook connection is not activated.", 503);
  }

  let body: any;

  try {
    body = await req.json();
  } catch {
    return reply("Invalid notebook request.", 400);
  }

  const id = (value: unknown): value is string =>
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 100 &&
    value.trim() === value;

  if (
    !body ||
    Array.isArray(body) ||
    typeof body !== "object" ||
    Object.keys(body).some(
      key => !["kind", "sourceId", "studentId", "stepId", "recoveryOnly"].includes(key)
    ) ||
    !["assessment", "lesson", "assignment"].includes(body.kind) ||
    !id(body.sourceId) ||
    (body.studentId !== undefined && !id(body.studentId)) ||
    (body.kind === "lesson" && (!id(body.stepId) || !/^(0|[1-9]\d{0,3})$/.test(body.stepId))) ||
    (body.kind === "assessment" && body.stepId !== undefined) ||
    (body.recoveryOnly !== undefined && typeof body.recoveryOnly !== "boolean")
  ) {
    return reply("Only notebook activity and student identifiers are accepted.", 400);
  }

  let credential = Deno.env.get("NOTEBOOK_BRIDGE_KEY");
  let config: any;

  try {
    config = JSON.parse(Deno.env.get("NOTEBOOK_BRIDGE_CONFIG") || "null");
  } catch {
    return reply("The notebook mapping is not configured.", 503);
  }

  if (
    !credential ||
    !config ||
    ["appId", "className", "schoolYear", "assignmentId"].some(
      key => !id(config[key])
    ) ||
    (config.teacherUserIds !== undefined && (!Array.isArray(config.teacherUserIds) ||
      config.teacherUserIds.length > 100 || config.teacherUserIds.some((value: unknown) => !id(value))))
  ) {
    return reply("The notebook mapping is not configured.", 503);
  }

  let bootstrapStage = "sdk-client";
  try {
    let client = createClientFromRequest(req);
    bootstrapStage = "mapping";
    ({ client, config, credential } = await prepareNotebookRequest(client, body, config, credential, NOTEBOOK_ORIGIN));
    if (body.kind === "lesson" || body.kind === "assignment" || !body.studentId) {
      return await bootstrapNotebookExtension({
        client, body, config, credential, notebookOrigin: NOTEBOOK_ORIGIN,
        browserOrigin: origin || BASE44_ORIGIN, headers, sharedRead,
        onStage: (stage: string) => { bootstrapStage = stage; },
      });
    }
    const svc = client.asServiceRole;
    const key = JSON.stringify([
      config.appId,
      config.className,
      config.schoolYear,
    ]);

    const [student, assessment, assignment] = await Promise.all([
      svc.entities.Student.get(body.studentId),

      sharedRead(`${key}:assessment:${body.sourceId}`, () =>
        svc.entities.LiveNotebookAssessment.get(body.sourceId)
      ),

      sharedRead(`${key}:assignment:${config.assignmentId}`, () =>
        svc.entities.DigitalNotebookAssignment.get(config.assignmentId)
      ),
    ]);

    if (student?.id !== body.studentId || assessment?.id !== body.sourceId) {
      return reply(
        "The selected student or notebook activity could not be verified.",
        403
      );
    }

    // Validate fixed scope BEFORE querying competing activities.
    resolveNotebookAssessmentAccess({
      config,
      student,
      assessment,
      assignment,
      blocked: true,
    });

    const query = {
      class_name: config.className,
      school_year: config.schoolYear,
      active: true,
    };

    const [lessons, dictations] = await Promise.all([
      sharedRead(`${key}:lessons`, () =>
        svc.entities.LiveLessonSession.filter(query, "-updated_date", 100)
      ),

      sharedRead(`${key}:dictations`, () =>
        svc.entities.LiveDictationSession.filter(query, "-updated_date", 100)
      ),
    ]);

    // Reject ambiguous/truncated results rather than assuming no other activity.
    const completeList = (result: any): any[] => {
      const rows = Array.isArray(result) ? result : result?.items;

      if (
        !Array.isArray(rows) ||
        rows.length >= 100 ||
        (!Array.isArray(result) && (
          result.has_more === true ||
          result.hasMore === true ||
          (result.total !== undefined && result.total !== rows.length)
        ))
      ) {
        throw new Error("Incomplete activity lookup");
      }

      return rows;
    };

    const activeLessons = completeList(lessons);
    const activeDictations = completeList(dictations);

    const lessonBlocks = (lesson: any) => {
      if (
        !lesson ||
        lesson.active !== true ||
        lesson.class_name !== config.className ||
        lesson.school_year !== config.schoolYear
      ) {
        throw new Error("Unexpected lesson scope");
      }

      const targets = lesson.target_students;

      if (targets === undefined) return true;

      if (
        !Array.isArray(targets) ||
        targets.some((entry: any) =>
          !entry ||
          typeof entry.class_name !== "string" ||
          !Number.isSafeInteger(entry.student_number) ||
          entry.student_number < 1 ||
          entry.student_number > 100
        )
      ) {
        throw new Error("Invalid lesson targeting");
      }

      return targets.length === 0 || targets.some((entry: any) =>
        entry.class_name === student.class_name &&
        entry.student_number === student.student_number
      );
    };

    const lessonMatches = activeLessons.map(lessonBlocks);

    for (const dictation of activeDictations) {
      if (
        !dictation ||
        dictation.active !== true ||
        dictation.class_name !== config.className ||
        dictation.school_year !== config.schoolYear
      ) {
        throw new Error("Unexpected dictation scope");
      }
    }

    const decision = resolveNotebookAssessmentAccess({
      config,
      student,
      assessment,
      assignment,
      blocked: lessonMatches.some(Boolean) || activeDictations.length > 0,
    });

    const recoveryOnly = decision.recoveryOnly || body.recoveryOnly === true;

    const response = await fetch(
      `${NOTEBOOK_ORIGIN}/api/notebook/base44/native-session`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credential}`,
        },
        body: JSON.stringify({
          ...decision.request,
          origin: origin || BASE44_ORIGIN,
          recoveryOnly,
          canWrite: !recoveryOnly && decision.request.canWrite,
        }),
        signal: AbortSignal.timeout(12000),
        redirect: "manual",
      }
    );

    if (!response.ok) {
      const status = response.status === 429
        ? 429
        : [401, 403, 409].includes(response.status)
          ? response.status
          : 503;

      return reply(
        "The notebook could not authorize this connection. Pending work was retained; keep the page open and retry.",
        status
      );
    }

    const session = await response.json();
    const allowed = session.allowedPages;

    if (
      session.contractVersion !== 1 ||
      session.role !== "student" ||
      session.kind !== "assessment" ||
      session.sourceId !== assessment.id ||
      session.studentNumber !== student.student_number ||
      typeof session.accessToken !== "string" ||
      !session.accessToken ||
      !Number.isSafeInteger(session.expiresAtMs) ||
      session.expiresAtMs <= Date.now() ||
      session.expiresAtMs > Date.now() + 11 * 60 * 1000 ||
      !id(session.classId) ||
      !id(session.workbookId) ||
      session.classroom?.id !== session.classId ||
      session.classroom?.workbookId !== session.workbookId ||
      session.workbook?.id !== session.workbookId ||
      session.workbook?.pageCount !== decision.pageCount ||
      typeof session.canWrite !== "boolean" ||
      (session.canWrite && (recoveryOnly || !decision.request.canWrite)) ||
      (allowed !== null && (
        !Array.isArray(allowed) ||
        !allowed.length ||
        new Set(allowed).size !== allowed.length ||
        allowed.some((page: any) =>
          !Number.isSafeInteger(page) ||
          page < 1 ||
          page > decision.pageCount
        )
      )) ||
      (decision.request.allowedPages !== null && (
        allowed === null ||
        allowed.some((page: any) =>
          !decision.request.allowedPages.includes(page)
        )
      ))
    ) {
      throw new Error("Invalid notebook bootstrap response");
    }

    return Response.json({
      contractVersion: 1,
      role: "student",
      kind: "assessment",
      sourceId: assessment.id,
      backendOrigin: NOTEBOOK_ORIGIN,
      accessToken: session.accessToken,
      expiresAtMs: session.expiresAtMs,
      classId: session.classId,
      workbookId: session.workbookId,
      studentNumber: student.student_number,
      canWrite: session.canWrite,
      allowedPages: allowed,
      classroom: session.classroom,
      workbook: session.workbook,
    }, { headers });
  } catch (error: any) {
    // Never echo SDK/upstream errors, credentials, tokens, or roster records.
    if (error?.code === "notebook_images_preparing") {
      return Response.json({
        error: "Preparing this notebook's image pages. Keep this page open; it will connect automatically.",
        code: "notebook_images_preparing", retryAfterMs: 5000,
      }, { status: 503, headers });
    }
    const status = error?.status ?? error?.response?.status;
    const message = typeof error?.message === "string" ? error.message : "";
    const reason = /AbortSignal.*timeout|timeout.*not a function/i.test(message) ? "timeout-api" :
      /redirect/i.test(message) ? "redirect" :
      /timed? ?out|abort/i.test(message) ? "timeout" :
      /dns|resolve|ENOTFOUND/i.test(message) ? "dns" :
      /fetch|network|socket|connect/i.test(message) ? "network" :
      /header|ByteString/i.test(message) ? "request-header" : "unclassified";
    console.warn("Native notebook bootstrap failed.", {
      stage: bootstrapStage,
      reason,
      upstreamStatus: Number.isInteger(status) ? status : null,
    });
    return Response.json({
      error: "The notebook connection is unavailable or its records changed. Pending work was retained; keep this page open and retry.",
      code: `notebook_${bootstrapStage}`,
      reason,
    }, { status: 503, headers });
  }
}