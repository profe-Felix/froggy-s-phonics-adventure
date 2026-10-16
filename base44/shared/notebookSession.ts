// Connection handshakes carry metadata only; drawing history loads one page at a time.
export const NOTEBOOK_SESSION_FIELDS = [
  'assignment_id', 'class_name', 'student_number', 'school_year', 'current_page',
  'voice_notes_by_page', 'recordings_by_page', 'last_active',
  'collaboration_room_id', 'collaboration_version',
];

export async function readNotebookSessionHeader(entities, id) {
  // Read the current record for admission, but never transfer its full
  // multi-page drawing history for a connection handshake.
  const page = await entities.NotebookSession.filter({ id }, { limit: 1, fields: NOTEBOOK_SESSION_FIELDS });
  return notebookSessionHeader(page?.items?.[0]);
}

export function notebookSessionHeader(record) {
  if (!record) return null;
  const header = {id:record.id,strokes_by_page:{}};
  for (const field of NOTEBOOK_SESSION_FIELDS) {
    if (record[field] !== undefined) header[field] = record[field];
  }
  return header;
}