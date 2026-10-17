// PREPARATION ONLY. Do not invent a successful response or call the old Actor.
// Future implementation must validate the resolved Student and actual source
// entity (assessment or lesson), year/class/assignment mapping, targets,
// finished/released state, lesson step/pages and existing activity precedence.
// Teacher bootstrap requires the project's authenticated teacher authorization.
// Picture selection remains classroom identification, not strong student auth.
// Use server-held integration credentials, never a browser-chosen role.
// Contract: {contractVersion:1, role, backendOrigin, accessToken, expiresAtMs, ...}
// Requires a NEW native-component bootstrap endpoint on the notebook backend;
// the existing cookie/redirect launch endpoint is not this protocol.
export default async function(req: Request) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (req.method !== "POST") return Response.json({ error: "POST required." }, { status: 405, headers });
  return Response.json({
    code: "NOTEBOOK_KIT_NOT_READY",
    error: "The in-place notebook connection is prepared but not activated.",
  }, { status: 503, headers });
}