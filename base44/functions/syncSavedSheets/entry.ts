import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { fetchSheetStudents, upsertStudents } from '../../shared/sheetParser.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const teacherFilter = body?.teacher_name?.trim() || null;
    const schoolYear = body?.school_year || '';

    const links = await base44.asServiceRole.entities.SheetLink.list('-created_date', 1000);
    const target = teacherFilter
      ? links.filter((l: any) => String(l.teacher_name || '').toLowerCase() === teacherFilter.toLowerCase())
      : links;

    const results = [];
    for (const link of target) {
      try {
        const incoming = await fetchSheetStudents(link.sheet_url);
        const { created, updated } = await upsertStudents(base44.asServiceRole, incoming, schoolYear);
        results.push({ teacher: link.teacher_name, created, updated });
      } catch (e) {
        results.push({ teacher: link.teacher_name, error: (e as Error).message });
      }
    }
    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}