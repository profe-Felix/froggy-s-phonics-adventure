import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Creates a new Google Spreadsheet (owned by the builder's connected account)
// and saves its ID as the conference sheet setting. Returns the sheet URL.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const { accessToken } = await svc.connectors.getConnection("googlesheets");

    const body = await req.json().catch(() => ({}));
    const title = body?.title || "Parent Conferences";

    const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ properties: { title } }),
    });
    if (!res.ok) {
      return Response.json({ error: `Failed to create sheet: ${res.status}` }, { status: 500 });
    }
    const data = await res.json();
    const spreadsheetId = data.spreadsheetId;

    // Save the spreadsheet ID (upsert the single setting record)
    const existing = await svc.entities.ConferenceSheetSetting.list("-created_date", 1);
    if (existing.length) {
      await svc.entities.ConferenceSheetSetting.update(existing[0].id, { spreadsheet_id: spreadsheetId });
    } else {
      await svc.entities.ConferenceSheetSetting.create({ spreadsheet_id: spreadsheetId });
    }

    return Response.json({ success: true, spreadsheet_id: spreadsheetId, url: data.spreadsheetUrl });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}