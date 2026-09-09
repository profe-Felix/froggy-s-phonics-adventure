import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Public booking endpoint for parent-teacher conferences. Parents are
// anonymous (they scanned a QR), so this runs as the service role to bypass
// the teacher-only update RLS. The {status:'open'} filter on updateMany is
// the atomic guard: if two parents race for the same slot, only one
// updateMany matches an open slot — the other is a no-op. We read the slot
// back to confirm who won.
export default async function(req) {
  try {
    const body = await req.json();
    const slot_id = body?.slot_id;
    const parent_name = String(body?.parent_name || '').trim();
    const student_name = String(body?.student_name || '').trim();
    const parent_phone = String(body?.parent_phone || '').trim();

    if (!slot_id || !parent_name || !student_name) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    // Atomic guard: only flip to booked if still open.
    await svc.entities.ConferenceSlot.updateMany(
      { id: slot_id, status: 'open' },
      { $set: { status: 'booked', parent_name, student_name, parent_phone, booked_at: new Date().toISOString() } }
    );

    // Read back to confirm this caller won the race. A missing slot (e.g.
    // deleted mid-booking) is treated as unavailable, not an error.
    let slot;
    try {
      slot = await svc.entities.ConferenceSlot.get(slot_id);
    } catch {
      return Response.json({ success: false, reason: 'taken' });
    }
    if (slot && slot.status === 'booked' && slot.parent_name === parent_name) {
      return Response.json({ success: true, slot });
    }
    return Response.json({ success: false, reason: 'taken' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}