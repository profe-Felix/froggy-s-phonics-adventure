// Shared logic for mirroring conference bookings to a Google Spreadsheet.
// Used by bookConferenceSlot, manageConferenceSlot, and syncAllConferenceSlots.
// One tab per teacher; rows are appended on booking and updated on cancel/delete.
// Nothing is ever deleted from the sheet — cancelled/deleted rows are marked.

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

const HEADERS = [
  "Date",
  "Time",
  "Parent Name",
  "Student Name",
  "Phone",
  "Status",
  "Booked At",
  "Slot ID",
];

// Convert minutes-from-midnight to readable 12h time, e.g. 750 -> "12:30 pm".
function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Inverse of minutesToTime — parse "12:30 pm" back to minutes for sorting.
function timeToMinutes(timeStr) {
  if (!timeStr) return Infinity;
  const m = String(timeStr).trim().match(/^(\d+):(\d+)\s*(am|pm)$/i);
  if (!m) return Infinity;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toLowerCase();
  if (ampm === "pm" && h !== 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return h * 60 + min;
}

// Google Sheets tab titles: max 100 chars.
function sanitizeSheetTitle(name) {
  return String(name || "Teacher").slice(0, 100).trim() || "Teacher";
}

// Wrap a sheet title in single quotes for use in A1 ranges, escaping inner quotes.
function quoteSheet(name) {
  return `'${name.replace(/'/g, "''")}'`;
}

// Build a URL-safe range string. Only the quoted sheet title is encoded; the
// A1 portion (!A:H etc.) is left literal so the Sheets API can parse it,
// including the :append suffix used by the append endpoint.
function sheetRange(tabTitle, range) {
  return `${encodeURIComponent(quoteSheet(tabTitle))}!${range}`;
}

async function getAccessToken(svc) {
  const { accessToken } = await svc.connectors.getConnection("googlesheets");
  return accessToken;
}

async function getSpreadsheetId(svc) {
  const settings = await svc.entities.ConferenceSheetSetting.list("-created_date", 1);
  if (!settings.length || !settings[0].spreadsheet_id) {
    throw new Error("No conference spreadsheet configured");
  }
  return settings[0].spreadsheet_id;
}

// Ensure a tab exists for the teacher; create it with a header row if missing.
async function ensureSheetTab(spreadsheetId, tabTitle, token) {
  const metaRes = await fetch(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!metaRes.ok) throw new Error(`Failed to read spreadsheet: ${metaRes.status}`);
  const meta = await metaRes.json();
  const exists = (meta.sheets || []).find(
    (s) => s.properties.title === tabTitle
  );
  if (exists) return;

  // Create the tab
  const createRes = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: tabTitle } } }],
    }),
  });
  if (!createRes.ok) throw new Error(`Failed to create tab: ${createRes.status}`);

  // Write header row
  const range = sheetRange(tabTitle, "A1");
  await fetch(`${SHEETS_API}/${spreadsheetId}/values/${range}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [HEADERS] }),
  });
}

// Re-read a tab, sort all data rows by Date (col A) then Time (col B),
// and write them back so the sheet always shows meetings in chronological order.
async function sortSheetTab(spreadsheetId, tabTitle, token) {
  const range = sheetRange(tabTitle, "A:H");
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}/values/${range}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  const data = await res.json();
  const values = data.values || [];
  if (values.length <= 2) return; // header + at most one row — already sorted

  const header = values[0];
  const rows = values.slice(1).map((row) => {
    // Pad every row to 8 columns so the write is not ragged.
    const padded = Array.isArray(row) ? [...row] : [];
    while (padded.length < 8) padded.push("");
    return padded.slice(0, 8);
  });

  rows.sort((a, b) => {
    const dateA = a[0] || "";
    const dateB = b[0] || "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return timeToMinutes(a[1]) - timeToMinutes(b[1]);
  });

  await fetch(`${SHEETS_API}/${spreadsheetId}/values/${range}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [header, ...rows] }),
  });
}

// Find the 1-based row number for a slot_id, or -1 if not found.
async function findRowBySlotId(spreadsheetId, tabTitle, slotId, token) {
  const range = sheetRange(tabTitle, "A:H");
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}/values/${range}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return -1;
  const data = await res.json();
  const values = data.values || [];
  for (let i = 1; i < values.length; i++) {
    // Slot ID is the 8th column (index 7)
    if (values[i] && values[i][7] === slotId) return i + 1;
  }
  return -1;
}

function buildRow(slot, action) {
  const cancelled = action === "cancel";
  const deleted = action === "delete";
  return [
    slot.date || "",
    minutesToTime(slot.start_minutes),
    cancelled || deleted ? "" : slot.parent_name || "",
    cancelled || deleted ? "" : slot.student_name || "",
    cancelled || deleted ? "" : slot.parent_phone || "",
    cancelled ? "Cancelled" : deleted ? "Slot Deleted" : "Booked",
    cancelled || deleted ? "" : slot.booked_at || "",
    slot.id,
  ];
}

// Sync a single slot to the sheet — append if new, update if the row exists.
export async function syncSlotToSheet(svc, slot, action) {
  const spreadsheetId = await getSpreadsheetId(svc);
  const token = await getAccessToken(svc);
  const tabTitle = sanitizeSheetTitle(slot.teacher_name || "Teacher");

  await ensureSheetTab(spreadsheetId, tabTitle, token);

  const row = buildRow(slot, action);
  const rowNum = await findRowBySlotId(spreadsheetId, tabTitle, slot.id, token);

  if (rowNum > 0) {
    const range = sheetRange(tabTitle, `A${rowNum}:H${rowNum}`);
    await fetch(`${SHEETS_API}/${spreadsheetId}/values/${range}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [row] }),
    });
  } else {
    const appendRange = sheetRange(tabTitle, "A:H");
    await fetch(
      `${SHEETS_API}/${spreadsheetId}/values/${appendRange}:append?insertDataOption=INSERT_ROWS&valueInputOption=RAW`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [row] }),
      }
    );
  }

  // Keep the tab sorted by Date then Time so "who is next" is always visible.
  await sortSheetTab(spreadsheetId, tabTitle, token);
}

// Batch-sync many slots at once (used by the migration / "sync all" button).
// Groups by teacher, skips rows already present, appends the rest in one call per tab.
export async function syncSlotsBatchToSheet(svc, slots) {
  if (!slots.length) return { appended: 0, skipped: 0 };

  const spreadsheetId = await getSpreadsheetId(svc);
  const token = await getAccessToken(svc);

  const byTeacher = {};
  for (const slot of slots) {
    const tab = sanitizeSheetTitle(slot.teacher_name || "Teacher");
    (byTeacher[tab] ||= []).push(slot);
  }
  let appended = 0;
  let skipped = 0;

  for (const [tabTitle, teacherSlots] of Object.entries(byTeacher)) {
    await ensureSheetTab(spreadsheetId, tabTitle, token);

    // Read existing rows to collect slot IDs (last column) for dedup
    const existingIds = new Set();
    const dataRange = sheetRange(tabTitle, "A:H");
    const dataRes = await fetch(`${SHEETS_API}/${spreadsheetId}/values/${dataRange}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (dataRes.ok) {
      const dataJson = await dataRes.json();
      for (const row of (dataJson.values || []).slice(1)) {
        // Slot ID is the 8th column (index 7)
        if (row && row[7]) existingIds.add(row[7]);
      }
    }

    const newSlots = teacherSlots.filter((s) => !existingIds.has(s.id));
    skipped += teacherSlots.length - newSlots.length;
    if (!newSlots.length) continue;

    const rows = newSlots.map((slot) => buildRow(slot, "book"));
    const appendRange = sheetRange(tabTitle, "A:H");
    const appendRes = await fetch(
      `${SHEETS_API}/${spreadsheetId}/values/${appendRange}:append?insertDataOption=INSERT_ROWS&valueInputOption=RAW`,
      {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: rows }),
    });
    if (appendRes.ok) {
      appended += newSlots.length;
    } else {
      const errBody = await appendRes.text().catch(() => "");
      throw new Error(`Append failed for tab "${tabTitle}": ${appendRes.status} ${errBody}`);
    }

    // Re-sort the tab so all rows are in chronological order after the append.
    await sortSheetTab(spreadsheetId, tabTitle, token);
  }

  return { appended, skipped };
}