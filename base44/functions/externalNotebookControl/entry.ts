// PREPARATION ONLY. No entity write or upstream request is made by this file.
// Future implementation: authenticate and authorize the teacher independently;
// fetch the current source entity by ID, derive authoritative controls/targets,
// and synchronize ONCE with the mapped backend, using idempotency and stale
// update protection. Never accept arbitrary class/role/ownership from browsers.
// Include a safe release/end/step-transition drain protocol for pending ink.
// Contract: {contractVersion:1, applied:true, controlRevision: nonnegativeInteger}
// Native control synchronization needs a NEW notebook-backend endpoint.
export default async function(req: Request) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (req.method !== "POST") return Response.json({ error: "POST required." }, { status: 405, headers });
  return Response.json({
    code: "NOTEBOOK_KIT_NOT_READY",
    error: "Notebook control synchronization is prepared but not activated.",
  }, { status: 503, headers });
}