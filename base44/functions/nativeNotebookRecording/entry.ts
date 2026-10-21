import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { recordingScope, recordingPin, recordingTimeline } from "./model.js";

// Base44-only media: private audio and a separate measured ink/pointer timeline.
// No Replit notebook endpoints, original NotebookSession fields, or video encoding.
Deno.serve(async req => {
  try {
    if (req.method !== "POST") return Response.json({ error: "POST required." }, { status: 405 });
    const body = await req.json();
    const { scope, page, action } = body;
    const scope_key = recordingScope(scope, page);
    const client = createClientFromRequest(req).asServiceRole;
    const assignment = await client.entities.DigitalNotebookAssignment.get(scope.assignmentId);
    if (!assignment || !["active", "draft", "closed"].includes(assignment.status)
      || (assignment.class_name !== scope.className && assignment.shared_across_classes !== true)
      || page > assignment.pdf_page_count) return Response.json({ error: "This page is not available to this class." }, { status: 403 });
    const entity = client.entities.NativeNotebookRecording;
    const publicNote = row => ({ id: row.id, pin_id: row.pin_id, x_pct: row.x_pct, y_pct: row.y_pct,
      has_audio: !!row.audio_uri, duration_ms: row.duration_ms || 0 });
    if (action === "list") {
      const rows = await entity.filter({ scope_key, page }, "created_date", 100);
      return Response.json({ notes: rows.map(publicNote) });
    }
    const pin = recordingPin(body.pin);
    const rows = await entity.filter({ scope_key, page, pin_id: pin.pin_id }, "created_date", 2);
    let row = rows[0];
    if (rows.length > 1) throw Error("Duplicate microphone records require teacher review.");
    if (action === "pin") {
      if (!row && (await entity.filter({ scope_key, page }, "created_date", 51)).length >= 50)
        throw Error("This page already has 50 microphones.");
      row = row ? await entity.update(row.id, pin) : await entity.create({ scope_key, page, ...pin });
      return Response.json({ note: publicNote(row) });
    }
    if (!row) return Response.json({ error: "This microphone no longer exists. Your local recording is kept." }, { status: 404 });
    if (action === "delete") {
      await entity.delete(row.id);
      return Response.json({ deleted: true });
    }
    if (action === "play") {
      if (!row.audio_uri || !row.timeline_uri) throw Error("This microphone has no saved recording.");
      const sign = file_uri => client.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 3600 });
      const [audio, timeline] = await Promise.all([sign(row.audio_uri), sign(row.timeline_uri)]);
      return Response.json({ audio_url: audio.signed_url, timeline_url: timeline.signed_url });
    }
    if (action !== "save") throw Error("Unknown recording action.");
    if (!/^[a-zA-Z0-9_-]{16,120}$/.test(body.recording_id || "")) throw Error("Invalid recording identity.");
    if (row.audio_uri) {
      if (row.recording_id === body.recording_id) return Response.json({ note: publicNote(row) });
      return Response.json({ error: "This microphone already has a recording. Drop another microphone instead." }, { status: 409 });
    }
    const timeline = recordingTimeline(body.timeline, scope_key, page);
    const match = /^data:(audio\/[a-zA-Z0-9.+-]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(body.audio || "");
    if (!match || match[2].length > 8000000) throw Error("The audio is empty, unsupported or too large.");
    const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
    if (!bytes.length) throw Error("The audio recording is empty.");
    const ext = match[1].includes("mp4") ? "m4a" : match[1].includes("ogg") ? "ogg" : "webm";
    const [audio, data] = await Promise.all([
      client.integrations.Core.UploadPrivateFile({ file: new File([bytes], `notebook-${body.recording_id}.${ext}`, { type: match[1] }) }),
      client.integrations.Core.UploadPrivateFile({ file: new File([JSON.stringify(timeline)], `notebook-${body.recording_id}.json`, { type: "application/json" }) }),
    ]);
    if (!audio.file_uri || !data.file_uri) throw Error("Private recording upload did not complete.");
    row = await entity.update(row.id, { audio_uri: audio.file_uri, timeline_uri: data.file_uri,
      duration_ms: timeline.duration_ms, recording_id: body.recording_id });
    return Response.json({ note: publicNote(row) });
  } catch (error) {
    return Response.json({ error: error?.message || "The recording could not be saved. Keep this page open and retry." }, { status: 400 });
  }
});
