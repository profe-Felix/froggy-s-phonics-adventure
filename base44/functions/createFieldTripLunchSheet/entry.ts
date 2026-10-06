import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Creates a Google Spreadsheet for tracking field trip lunch responses.
// Writes a header row and bolds it. Saves the spreadsheet ID as the setting.
// Teacher-only (requires auth) — called from the flyer page.
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const HEADERS = ["Timestamp", "Student Name", "Lunch Choice", "Language"];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const { accessToken } = await svc.connectors.getConnection("googlesheets");

    const body = await req.json().catch(() => ({}));
    const title = body?.title || "Field Trip Lunch Responses";

    // Create the spreadsheet
    const res = await fetch(SHEETS_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ properties: { title } }),
    });
    if (!res.ok) {
      return Response.json({ error: `Failed to create sheet: ${res.status}` }, { status: 500 });
    }
    const data = await res.json();
    const spreadsheetId = data.spreadsheetId;

    // Write header row on the default tab (Sheet1)
    await fetch(`${SHEETS_API}/${spreadsheetId}/values/Sheet1!A1:D1?valueInputOption=RAW`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [HEADERS] }),
    });

    // Bold + freeze the header row
    await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
          {
            updateSheetProperties: {
              properties: { sheetId: 0, gridProperties: { frozenRowCount: 1 } },
              fields: "gridProperties.frozenRowCount",
            },
          },
        ],
      }),
    });

    // Save the spreadsheet ID (upsert the single setting record)
    const existing = await svc.entities.FieldTripLunchSheetSetting.list("-created_date", 1);
    if (existing.length) {
      await svc.entities.FieldTripLunchSheetSetting.update(existing[0].id, { spreadsheet_id: spreadsheetId });
    } else {
      await svc.entities.FieldTripLunchSheetSetting.create({ spreadsheet_id: spreadsheetId });
    }

    return Response.json({ success: true, spreadsheet_id: spreadsheetId, url: data.spreadsheetUrl });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}