// Library grouping is presentation, never authorization or a student-work key.
const titleKey = value => String(value || "").normalize("NFKC").trim().toLocaleLowerCase();
export function notebookLibraryIdentity(book) {
  return `${titleKey(book.title)}:${book.library_key || book.pdf_url || book.id}`;
}
export function notebookLibrary(records, className = "", statuses = ["active"]) {
  const eligible = records.filter(book => statuses.includes(book.status) &&
    (book.shared_across_classes || book.class_name === className));
  eligible.sort((a, b) => Number(b.class_name === className) - Number(a.class_name === className) ||
    String(a.created_date || a.id).localeCompare(String(b.created_date || b.id)));
  const groups = new Map();
  for (const book of eligible) {
    const key = notebookLibraryIdentity(book);
    if (!groups.has(key)) groups.set(key, book);
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}
export function notebookLibraryFamily(records, book) {
  return records.filter(row => notebookLibraryIdentity(row) === notebookLibraryIdentity(book));
}
export function resolveNotebookAssignment(records, { className, id, title, allowDraft = false }) {
  const choices = records.filter(book =>
    (book.shared_across_classes || book.class_name === className) &&
    (book.status === "active" || (allowDraft && book.status === "draft")));
  // Explicit links must retain their original assignment/work identity.
  if (id) return choices.find(book => book.id === id);
  return choices.filter(book => titleKey(book.title) === titleKey(title))
    .sort((a, b) => Number(b.class_name === className) - Number(a.class_name === className) ||
      String(a.created_date || a.id).localeCompare(String(b.created_date || b.id)))[0];
}
export async function notebookFileLibraryKey(file) {
  const bytes = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return "sha256:" + [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}
