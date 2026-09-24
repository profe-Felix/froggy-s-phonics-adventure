import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { waitUntil } from 'base44:runtime';
import { syncSlotToSheet } from '../../shared/conferenceSheetSync.ts';

// Teacher-facing slot management (cancel booking or delete slot) that also
// mirrors the change to the Google Sheet. Cancelled/deleted rows are marked,
// never removed, so the sheet keeps a full audit trail.
export default async function(req) {
  try {
    const body = await req.json();
    const slot_id = body?.slot_id;
    const action = body?.action; // 'cancel' | 'delete'

    if (!slot_id || !action) {
      return Response.json({ error: 'Missing slot_id or action' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;

    // Read the slot before mutating so the sheet sync has the original data.
    let slot;
    try {
      slot = await svc.entities.ConferenceSlot.get(slot_id);
    } catch {
      return Response.json({ error: 'Slot not found' }, { status: 404 });
    }

    if (action === 'cancel') {
      await svc.entities.ConferenceSlot.update(slot_id, {
        status: 'open',
        parent_name: '',
        student_name: '',
        parent_phone: '',
        booked_at: '',
      });
      waitUntil(
        syncSlotToSheet(svc, { ...slot, parent_name: '', student_name: '', parent_phone: '', booked_at: '' }, 'cancel').catch(() => {})
      );
    } else if (action === 'delete') {
      waitUntil(syncSlotToSheet(svc, slot, 'delete').catch(() => {}));
      await svc.entities.ConferenceSlot.delete(slot_id);
    } else {
      return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}