import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { fetchSheetStudents, upsertStudents } from '../../shared/sheetParser.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const sheetUrl = body?.sheetUrl?.trim();
    const schoolYear = body?.school_year || '';
    if (!sheetUrl) return Response.json({ error: 'A Google Sheets URL is required' }, { status: 400 });

    const incoming = await fetchSheetStudents(sheetUrl);
    const { created, updated, unmatched } = await upsertStudents(base44.asServiceRole, incoming, schoolYear);

    return Response.json({ imported: created, updated, unmatched, total: created + updated });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}