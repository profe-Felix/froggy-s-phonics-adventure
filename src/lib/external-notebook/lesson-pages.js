// Page selection for a digital_notebook lesson step. Mirrors the semantics in
// LessonConfiguredActivity (pageSelection: single | range | custom | all).
export function lessonStepPages(config = {}) {
  const raw = Number(config.assignmentPageCount);
  const max = Number.isInteger(raw) && raw > 0 ? raw : 1;
  const clamp = v => Math.min(max, Math.max(1, Math.trunc(Number(v) || 1)));
  const selection = config.pageSelection || "single";
  const first = clamp(config.pageStart);
  const last = Math.max(first, clamp(config.pageEnd || first));
  const ranges = String(config.customPages || "").split(",").map(part => {
    const values = part.trim().split("-").map(Number);
    if (values.length > 2 || !values.every(Number.isInteger)) return null;
    return [Math.min(...values), Math.max(...values)];
  }).filter(Boolean);
  let pages = Array.from({ length: max }, (_, i) => i + 1).filter(page => {
    if (selection === "all") return true;
    if (selection === "range") return page >= first && page <= last;
    if (selection === "custom") return ranges.some(([a, b]) => page >= a && page <= b);
    return page === first;
  });
  if (!pages.length) pages = [1];
  return { page: pages[0], allowedPages: selection === "all" ? null : pages };
}

// Direct student link. Source identifiers and class only; never credentials.
export function liveNotebookLink(origin, { assessmentId, lessonSessionId, stepIndex, className }) {
  const q = new URLSearchParams();
  if (assessmentId) q.set("assessment", assessmentId);
  else { q.set("lesson", lessonSessionId); q.set("step", String(stepIndex ?? 0)); }
  if (className) q.set("class", className);
  return `${origin}/LiveNotebook?${q}`;
}
