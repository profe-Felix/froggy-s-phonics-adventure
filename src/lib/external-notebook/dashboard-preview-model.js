// Preview-only selection. Never merge ink identities or rewrite old assignments.
export function previewDocumentKey(assignment) {
  // A verified content hash groups separate uploads of the same document.
  // This is library identity only, NEVER student-work or permission identity.
  const identity = /^sha256:[a-f0-9]{64}$/i.test(assignment.library_key || "")
    ? assignment.library_key.toLowerCase() : assignment.pdf_url;
  return JSON.stringify([assignment.title?.trim().toLowerCase(), identity, assignment.pdf_page_count]);
}

export function buildPreviewCatalog(records, className, { sharedAssignmentIds = [] } = {}) {
  const eligible = records.filter(a => a?.id && a.pdf_url &&
    Number.isSafeInteger(a.pdf_page_count) && a.pdf_page_count > 0 &&
    ["draft", "active", "closed"].includes(a.status) &&
    (a.shared_across_classes === true || a.class_name === className));
  const groups = new Map();
  for (const a of eligible) {
    // Same title alone is not enough to identify the same PDF.
    const key = previewDocumentKey(a);
    const group = groups.get(key) || [];
    group.push(a); groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    // Verified shared launch identities retain their work across classes.
    // Otherwise historical class copies must open THIS class's saved record,
    // not whichever teacher happened to upload the PDF first.
    const preferred = a => a.shared_across_classes === true && sharedAssignmentIds.includes(a.id);
    group.sort((a, b) => Number(preferred(b)) - Number(preferred(a)) ||
      Number(b.class_name === className) - Number(a.class_name === className) ||
      Number(b.shared_across_classes === true) - Number(a.shared_across_classes === true) ||
      String(a.created_date || a.id).localeCompare(String(b.created_date || b.id)) ||
      String(a.id).localeCompare(String(b.id)));
    const a = group[0];
    return { id: a.id, title: a.title || "Untitled notebook", pageCount: a.pdf_page_count,
      status: a.status, scope: preferred(a) || a.class_name !== className ? "shared" : "class",
      aliases: group.map(row => row.id) };
  }).sort((a, b) => a.title.localeCompare(b.title));
}

export function previewClassSelection(records, assignment, className, page, options) {
  const catalog = buildPreviewCatalog(records, className, options);
  const group = assignment && catalog.find(a => a.aliases.includes(assignment.id));
  const equivalent = group || (assignment && catalog.find(a => {
    const candidate = records.find(row => row.id === a.id);
    return candidate && previewDocumentKey(candidate) === previewDocumentKey(assignment);
  }));
  if (!equivalent) return { class: className, assignment: "", page: "" };
  return { class: className, assignment: equivalent.id,
    page: String(Math.max(1, Math.min(Number.isSafeInteger(page) ? page : 1, equivalent.pageCount))) };
}

export function parsePreviewPage(value, pages) {
  if (!/^[1-9]\d*$/.test(String(value))) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && pages.includes(page) ? page : null;
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
