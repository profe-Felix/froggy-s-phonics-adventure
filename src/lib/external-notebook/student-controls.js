// UI policy only, not server authorization.
//
// A requested page is NOT permission to switch views.
// A release request is NOT permission to unmount.
//
// The host must freeze input, finish local gestures and safely
// drain pending work before changing the displayed context.

export function createNotebookStudentControls({
  session,
  context: initialContext,
} = {}) {
  const positive = value =>
    Number.isSafeInteger(value) && value > 0;

  const text = value =>
    typeof value === "string" && value.length > 0;

  const count = session?.workbook?.pageCount;

  if (
    session?.contractVersion !== 1 ||
    session.role !== "student" ||
    !text(session.classId) ||
    !text(session.workbookId) ||
    session.workbook?.id !== session.workbookId ||
    !positive(count) ||
    !positive(session.studentNumber) ||
    session.studentNumber > 100 ||
    !positive(session.expiresAtMs) ||
    typeof session.canWrite !== "boolean" ||
    !["assessment", "lesson"].includes(session.kind) ||
    !text(session.sourceId)
  ) {
    throw new Error(
      "A complete authorized student notebook session is required."
    );
  }

  const {
    classId,
    workbookId,
    studentNumber,
    kind,
    sourceId,
    backendOrigin,
  } = session;

  let { expiresAtMs, canWrite } = session;
  let sessionGeneration = 0;

  if (
    initialContext?.role !== "student" ||
    initialContext.kind !== kind ||
    initialContext.sourceId !== sourceId ||
    initialContext.student?.number !== studentNumber ||
    !text(initialContext.student?.id) ||
    ![
      "assignmentId",
      "className",
      "schoolYear",
    ].every(key => text(initialContext[key])) ||
    initialContext.student.className !==
      initialContext.className ||
    initialContext.student.schoolYear !==
      initialContext.schoolYear ||
    (
      kind === "lesson" &&
      !text(initialContext.stepId)
    )
  ) {
    throw new Error(
      "A matching Base44 student context is required."
    );
  }

  const binding = Object.freeze({
    assignmentId: initialContext.assignmentId,
    className: initialContext.className,
    schoolYear: initialContext.schoolYear,
    studentId: initialContext.student.id,
    stepId:
      kind === "lesson"
        ? initialContext.stepId
        : null,
  });

  const pages = session.allowedPages;

  if (
    pages !== null &&
    (
      !Array.isArray(pages) ||
      !pages.length ||
      pages.length > 2000 ||
      new Set(pages).size !== pages.length ||
      pages.some(page =>
        !positive(page) || page > count
      )
    )
  ) {
    throw new Error(
      "The assigned notebook pages are invalid."
    );
  }

  let allowedPages =
    pages === null
      ? null
      : Object.freeze(
          [...pages].sort((a, b) => a - b)
        );

  const allowed = page =>
    positive(page) &&
    page <= count &&
    (
      !allowedPages ||
      allowedPages.includes(page)
    );

  let classroom = null;
  let ownPage = null;
  let seenReady = false;
  let error = null;

  function readClass(value) {
    if (
      value?.id !== classId ||
      value.workbookId !== workbookId
    ) {
      throw new Error(
        "Notebook scope changed. Keep the existing work open."
      );
    }

    if (
      ![
        "waiting",
        "live",
        "paused",
        "ended",
      ].includes(value.status) ||
      typeof value.followTeacher !== "boolean" ||
      !positive(value.currentPage) ||
      value.currentPage > count ||
      !positive(value.capacity) ||
      value.capacity > 100 ||
      studentNumber > value.capacity ||
      !Array.isArray(value.targetStudentNumbers) ||
      new Set(value.targetStudentNumbers).size !==
        value.targetStudentNumbers.length ||
      value.targetStudentNumbers.some(number =>
        !positive(number) ||
        number > value.capacity
      )
    ) {
      throw new Error(
        "The teacher controls are incomplete or invalid. Writing is paused."
      );
    }

    return Object.freeze({
      ...value,
      targetStudentNumbers: Object.freeze(
        [...value.targetStudentNumbers]
      ),
    });
  }

  classroom = readClass(session.classroom);

  function sameContext(value) {
    return value?.role === "student" && value.kind === kind &&
      value.sourceId === sourceId && value.student?.number === studentNumber &&
      value.student.id === binding.studentId &&
      ["assignmentId", "className", "schoolYear"].every(key => value[key] === binding[key]) &&
      value.student.className === binding.className && value.student.schoolYear === binding.schoolYear &&
      (kind !== "lesson" || value.stepId === binding.stepId);
  }

  return {
    // Call only with a verified bootstrap, after invalidating the old channel.
    // This changes UI policy, not transport credentials or saved/local work.
    replaceSession(next, { context = initialContext, nowMs = Date.now() } = {}) {
      if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !sameContext(context) ||
          sessionGeneration === Number.MAX_SAFE_INTEGER) {
        throw new Error("Renewal must keep the same student, assignment and lesson step.");
      }
      const checked = createNotebookStudentControls({ session: next, context });
      if (next.classId !== classId || next.workbookId !== workbookId ||
          next.studentNumber !== studentNumber || next.role !== "student" ||
          next.kind !== kind || next.sourceId !== sourceId ||
          next.backendOrigin !== backendOrigin || next.workbook.pageCount !== count ||
          next.expiresAtMs <= expiresAtMs || next.expiresAtMs <= nowMs) {
        throw new Error("Renewal cannot change notebook scope or reuse an expired session.");
      }
      const nextPages = checked.getState({ context, nowMs }).allowedPages;
      expiresAtMs = next.expiresAtMs;
      canWrite = next.canWrite;
      allowedPages = nextPages;
      if (ownPage !== null && !allowed(ownPage)) ownPage = null;
      seenReady = false;
      error = null;
      sessionGeneration++;
      // Keep the last live classroom controls until the NEW ready arrives.
      return sessionGeneration;
    },
    receive(message, { sessionGeneration: expectedGeneration = 0 } = {}) {
      // Legacy callers belong to the initial session only. After renewal they
      // cannot unlock input, even if an old asynchronous ready arrives late.
      if (expectedGeneration !== sessionGeneration) return false;
      if (
        !["ready", "classroom"].includes(
          message?.type
        )
      ) {
        return false;
      }

      try {
        if (
          (
            message.type === "classroom" &&
            message.classId !== classId
          ) ||
          (
            message.classId !== undefined &&
            message.classId !== classId
          )
        ) {
          throw new Error(
            "Teacher controls belong to another class."
          );
        }

        const next = readClass(message.classroom);

        classroom = next;

        if (next.followTeacher) {
          ownPage = null;
        }

        if (message.type === "ready") {
          seenReady = true;
        }

        error = null;
        return true;
      } catch (reason) {
        error =
          reason.message ||
          "Teacher controls could not be verified.";

        throw reason;
      }
    },

    choosePage(page) {
      if (
        error ||
        !seenReady ||
        classroom.followTeacher ||
        !allowed(page)
      ) {
        throw new Error(
          "This page cannot be selected under the current teacher controls."
        );
      }

      // Intent only. The caller must finish/save/load
      // before displaying this requested page.
      ownPage = page;

      return page;
    },

    getState({
      context = initialContext,
      pageState = null,
      busy = false,
      nowMs = Date.now(),
    } = {}) {
      if (
        !Number.isSafeInteger(nowMs) ||
        nowMs < 0
      ) {
        throw new Error(
          "A valid current time is required."
        );
      }

      const expired = nowMs >= expiresAtMs;

      const inGroup =
        !classroom.targetStudentNumbers.length ||
        classroom.targetStudentNumbers.includes(
          studentNumber
        );

      const sameSource = sameContext(context);

      const targets =
        context?.targetStudents ?? [];

      const finished =
        context?.finishedStudents ?? [];

      const sameSeat = entry =>
        entry?.class_name === binding.className &&
        Number(entry.student_number) ===
          studentNumber;

      const sourceActive =
        sameSource &&
        context.active === true &&
        !context.blocked &&
        Array.isArray(targets) &&
        Array.isArray(finished) &&
        (
          !targets.length ||
          targets.some(sameSeat)
        ) &&
        !finished.some(sameSeat);

      const requestedPage =
        classroom.followTeacher
          ? classroom.currentPage
          : ownPage ?? (
              allowed(classroom.currentPage)
                ? classroom.currentPage
                : allowedPages?.[0] ?? 1
            );

      const page =
        allowed(requestedPage)
          ? requestedPage
          : null;

      const pageReady =
        page !== null &&
        pageState?.page === page &&
        pageState.ready === true &&
        pageState.loading !== true &&
        pageState.needsReload !== true &&
        !pageState.error;

      // Pending undo/redo must be able to save before
      // the refreshed drawing surface becomes ready.
      const canSend =
        !error &&
        seenReady &&
        !expired &&
        sourceActive &&
        inGroup &&
        classroom.status === "live" &&
        canWrite;

      const reason =
        error
          ? "control-error"
          : !seenReady
            ? "connecting"
            : expired
              ? "expired"
              : !sameSource
                ? "source-changed"
                : !sourceActive
                  ? "source-inactive"
                  : !inGroup
                    ? "outside-group"
                    : classroom.status !== "live"
                      ? classroom.status
                      : page === null
                        ? "page-not-assigned"
                        : !canWrite
                          ? "read-only"
                          : pageReady !== true
                            ? "loading"
                            : busy !== false
                              ? "busy"
                              : null;

      return Object.freeze({
        classroom,
        page,
        requestedPage,
        allowedPages,
        pageCount: count,
        followTeacher: classroom.followTeacher,
        inGroup,
        expired,
        hasLiveControls: seenReady,
        sessionGeneration,
        canDraw: reason === null,
        canSend,
        reason,
        error,
        writeGrantMissing: !canWrite,
        needsNewSession:
          expired || !sameSource,

        canNavigate:
          !error &&
          seenReady &&
          !expired &&
          sourceActive &&
          inGroup &&
          classroom.status !== "ended" &&
          !classroom.followTeacher &&
          pageReady === true &&
          busy === false,

        releaseRequested:
          classroom.status === "ended" ||
          !inGroup ||
          (
            sameSource &&
            !sourceActive
          ),
      });
    },
  };
}
