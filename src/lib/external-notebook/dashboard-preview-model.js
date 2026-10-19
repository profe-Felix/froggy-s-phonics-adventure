// Preview-only selection. Never merge ink identities or rewrite old assignments.
export function buildPreviewCatalog(records, className) {
  const eligible = records.filter(a => a?.id && a.pdf_url &&
    Number.isSafeInteger(a.pdf_page_count) && a.pdf_page_count > 0 &&
    ["draft", "active", "closed"].includes(a.status) &&
    (a.shared_across_classes === true || a.class_name === className));
  const groups = new Map();
  for (const a of eligible) {
    // Same title alone is not enough to identify the same PDF.
    const key = JSON.stringify([a.title?.trim().toLowerCase(), a.pdf_url, a.pdf_page_count]);
    const group = groups.get(key) || [];
    group.push(a); groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    // Keep this class's saved work identity when historical duplicates exist.
    group.sort((a, b) => Number(b.class_name === className) - Number(a.class_name === className) ||
      Number(b.shared_across_classes === true) - Number(a.shared_across_classes === true) ||
      String(a.id).localeCompare(String(b.id)));
    const a = group[0];
    return { id: a.id, title: a.title || "Untitled notebook", pageCount: a.pdf_page_count,
      status: a.status, aliases: group.map(row => row.id) };
  }).sort((a, b) => a.title.localeCompare(b.title));
}

export function previewNotebookContext({ assignment, className, schoolYear, page }) {
  if (!assignment?.id || !className || !schoolYear ||
      !Number.isSafeInteger(assignment.pdf_page_count) || assignment.pdf_page_count < 1) return null;
  const requested = Number(page);
  return { role: "teacher", kind: "assignment", active: true,
    sourceId: assignment.id, assignmentId: assignment.id, className, schoolYear,
    page: Number.isSafeInteger(requested) && requested >= 1
      ? Math.min(requested, assignment.pdf_page_count) : 1 };
}

export function validatePreviewSession(session, context, backendOrigin, now = Date.now()) {
  if (!session || session.contractVersion !== 1 || session.role !== "teacher" ||
      session.kind !== "assignment" || session.sourceId !== context.assignmentId ||
      session.backendOrigin !== backendOrigin || session.canWrite !== false ||
      session.allowedPages !== null || typeof session.accessToken !== "string" || !session.accessToken ||
      !Number.isSafeInteger(session.expiresAtMs) || session.expiresAtMs <= now + 5000 ||
      session.expiresAtMs > now + 11 * 60 * 1000 ||
      !session.classId || session.classroom?.id !== session.classId ||
      session.classroom?.name !== context.className ||
      !session.workbookId || session.classroom?.workbookId !== session.workbookId ||
      session.workbook?.id !== session.workbookId ||
      !Number.isSafeInteger(session.workbook.pageCount) || session.workbook.pageCount < 1) {
    throw new Error("The view-only notebook connection could not be verified.");
  }
  return session;
}
