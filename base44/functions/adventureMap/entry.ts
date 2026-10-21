import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { DEFAULT_MAP } from "./config.js";
import { MapError, validateMap, studentScope, progressFromAttempts,
  assertOpenLevel, assertAttempt, assertRequirement } from "./model.js";

// Existing student access stays subject to the caller's Base44 Student read
// permissions. Only the validated function can write the new, admin-only
// preview attempts. Nothing creates a Student or touches LessonProgress.
Deno.serve(async req => {
  try {
    if (req.method !== "POST") return Response.json({ error: "POST required." }, { status: 405 });
    const body = await req.json();
    if (!["catalog", "read", "begin", "complete"].includes(body.action))
      throw new MapError("Unknown trail action.");
    const caller = createClientFromRequest(req);
    const service = caller.asServiceRole;
    const mapId = body.mapId || DEFAULT_MAP.id;
    if (!/^[a-z0-9-]{1,60}$/.test(mapId)) throw new MapError("Invalid map identity.");
    const definitions = await service.entities.AdventureMapDefinition.filter({ map_id: mapId }, "-created_date", 2);
    if (definitions.length > 1) throw new MapError("This trail has conflicting definitions. Ask your teacher to review it.", 409);
    const definition = definitions[0];
    const map = validateMap(definition ? {
      id: definition.map_id, revision: definition.revision, title: definition.title,
      sections: JSON.parse(definition.sections_data), levels: JSON.parse(definition.levels_data),
    } : mapId === DEFAULT_MAP.id ? DEFAULT_MAP : null);
    if (body.action === "catalog") return Response.json({ map });

    let student;
    if (typeof body.studentId === "string" && /^[a-zA-Z0-9_-]{12,100}$/.test(body.studentId)) {
      // Not service-role: preserve existing Base44 entity visibility rules.
      student = await caller.entities.Student.get(body.studentId);
    } else if (body.identity) {
      const { className, number, schoolYear } = body.identity;
      if (!["Felix", "Valero", "Gutierrez", "Campos", "Aguirre", "Jimenez", "Mendez", "Schwarz"].includes(className) ||
          !Number.isInteger(number) || number < 1 || number > 30 ||
          !/^\d{2}-\d{2}$/.test(schoolYear || ""))
        throw new MapError("Choose a class, student number and school year.");
      const rows = await caller.entities.Student.filter({
        class_name: className, student_number: number, school_year: schoolYear,
      }, "-created_date", 2);
      if (rows.length !== 1) throw new MapError(rows.length
        ? "More than one existing student matches. Use the student's direct link; no new student was created."
        : "No existing student has that class and number. No student was created.", 404);
      student = rows[0];
    }
    if (!student) throw new MapError("This existing student is not available.", 403);
    const scope = studentScope(student, map);
    const entity = service.entities.AdventureMapAttempt;
    const readProgress = async () => {
      const rows = [];
      for (let skip = 0; skip < 4000; skip += 200) {
        const page = await entity.filter({ ...scope, status: "completed" }, "level_number", 200, skip);
        rows.push(...page);
        if (page.length < 200) return progressFromAttempts(rows, scope);
      }
      throw new MapError("This trail needs a progress review. Your saved work is kept.", 409);
    };
    let progress = await readProgress();
    const publicStudent = { id: student.id, displayName: student.name || `Student ${student.student_number}`,
      className: student.class_name, number: student.student_number, schoolYear: student.school_year };
    if (body.action === "read") return Response.json({ map, student: publicStudent, progress });
    const level = assertOpenLevel(body.level, progress, map);
    if (body.action === "begin") {
      if (body.level <= progress.completedCount) return Response.json({ level, progress, attemptId: null });
      const previous = await entity.filter({ ...scope, level_number: body.level, status: "started" }, "-created_date", 5);
      const attempt = previous.find(row => Date.parse(row.expires_at) > Date.now()) ||
        await entity.create({ ...scope, level_number: body.level, status: "started",
          requirement_type: level.requirement.type, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() });
      return Response.json({ level, progress, attemptId: attempt.id });
    }
    if (typeof body.attemptId !== "string" || !/^[a-zA-Z0-9_-]{12,100}$/.test(body.attemptId))
      throw new MapError("Open this level before completing it.");
    const attempt = await entity.get(body.attemptId);
    assertAttempt(attempt, scope, body.level);
    if (attempt.requirement_type !== level.requirement.type)
      throw new MapError("This activity's requirement changed. Open the level again.", 409);
    // Replays/retries are idempotent and never regress another tab's progress.
    if (attempt.status === "completed") return Response.json({ progress });
    if (body.level !== progress.currentLevel) throw new MapError("Finish the current level first.", 409);
    const lessonRows = level.requirement.type === "lesson_completion"
      ? await caller.entities.LessonProgress.filter({ student_number: student.student_number,
        class_name: student.class_name, school_year: student.school_year, lesson_id: level.requirement.lessonId }, "-updated_date", 20)
      : [];
    assertRequirement(level, body, lessonRows);
    // Append-style completion receipts, not a read/overwrite counter. Concurrent
    // tabs may confirm the same stop, but cannot lose progress or skip a level.
    await entity.update(attempt.id, { status: "completed", completed_at: new Date().toISOString() });
    progress = await readProgress();
    return Response.json({ progress });
  } catch (error) {
    if (error instanceof MapError)
      return Response.json({ error: error.message }, { status: error.status });
    // Do not echo SDK internals, tokens or foreign student records.
    return Response.json({ error: "The trail could not load or save. Your progress is kept. Please retry." }, { status: 503 });
  }
});
