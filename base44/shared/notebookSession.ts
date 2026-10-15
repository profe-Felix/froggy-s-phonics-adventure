// Connection handshakes carry metadata only; drawing history loads one page at a time.
export const NOTEBOOK_SESSION_FIELDS = [
  'assignment_id', 'class_name', 'student_number', 'school_year', 'current_page',
  'voice_notes_by_page', 'recordings_by_page', 'last_active',
  'collaboration_room_id', 'collaboration_version',
];

export async function readNotebookSessionHeader(entities, id) {
  const result = await entities.NotebookSession.filter({id}, 'created_date', 1, 0, NOTEBOOK_SESSION_FIELDS);
  const records = Array.isArray(result) ? result : result.items;
  return notebookSessionHeader(records?.[0]);
}

export function notebookSessionHeader(record) {
  if (!record) return null;
  const header = {id:record.id,strokes_by_page:{}};
  for (const field of NOTEBOOK_SESSION_FIELDS) {
    if (record[field] !== undefined) header[field] = record[field];
  }
  return header;
}