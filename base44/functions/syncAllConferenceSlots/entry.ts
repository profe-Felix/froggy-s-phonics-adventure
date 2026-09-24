import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { syncSlotsBatchToSheet } from '../../shared/conferenceSheetSync.ts';

// Migration / "sync all" — reads every booked slot and appends any that are
// not already in the sheet. Existing rows are skipped (never duplicated).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const slots = await svc.entities.ConferenceSlot.filter({ status: 'booked' }, '-created_date', 500);

    const result = await syncSlotsBatchToSheet(svc, slots);

    return Response.json({
      success: true,
      total: slots.length,
      appended: result.appended,
      skipped: result.skipped,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}