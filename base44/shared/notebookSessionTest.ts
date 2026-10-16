// Test-only session header helpers — mirror notebookSession.ts but reference
// the TestNotebookSession entity so load tests never touch production data.
export const TEST_NOTEBOOK_SESSION_FIELDS = [
  'assignment_id', 'class_name', 'student_number', 'school_year', 'current_page',
  'voice_notes_by_page', 'recordings_by_page', 'last_active',
  'collaboration_room_id', 'collaboration_version',
];

export async function readTestNotebookSessionHeader(entities, id) {
  const page = await entities.TestNotebookSession.filter({ id }, { limit: 1, fields: TEST_NOTEBOOK_SESSION_FIELDS });
  return testNotebookSessionHeader(page?.items?.[0]);
}

export function testNotebookSessionHeader(record) {
  if (!record) return null;
  const header = { id: record.id, strokes_by_page: {} };
  for (const field of TEST_NOTEBOOK_SESSION_FIELDS) {
    if (record[field] !== undefined) header[field] = record[field];
  }
  return header;
}