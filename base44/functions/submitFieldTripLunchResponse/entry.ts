import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Public submission endpoint for the field trip lunch form. Parents are
// anonymous (they scanned a QR from the flyer), so this runs as the service
// role to create the entity record AND append a row to the Google Sheet
// (if one is configured). The entity record is the source of truth; the
// sheet sync is best-effort.
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export default async function(req) {
  try {
    const body = await req.json();
    const student_name = String(body?.student_name || '').trim();
    const needs_school_lunch = Boolean(body?.needs_school_lunch);
    const language = body?.language === 'en' ? 'en' : 'es';

    if (!student_name) {
      return Response.json({ error: 'Missing student name' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    // 1. Create the entity record (source of truth)
    const record = await svc.entities.FieldTripLunchResponse.create({
      student_name,
      needs_school_lunch,
      language,
    });

    // 2. Append to Google Sheet (best-effort — skip silently if not configured)
    try {
      const settings = await svc.entities.FieldTripLunchSheetSetting.list("-created_date", 1);
      if (settings.length && settings[0].spreadsheet_id) {
        const spreadsheetId = settings[0].spreadsheet_id;
        const { accessToken } = await svc.connectors.getConnection("googlesheets");
        const row = [
          new Date().toISOString(),
          student_name,
          needs_school_lunch ? "School lunch" : "Lunch from home",
          language,
        ];
        await fetch(
          `${SHEETS_API}/${spreadsheetId}/values/Sheet1!A:D:append?insertDataOption=INSERT_ROWS&valueInputOption=RAW`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ values: [row] }),
          }
        );
      }
    } catch (sheetErr) {
      // Sheet sync is best-effort — the entity record is already saved.
    }

    return Response.json({ success: true, record });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}