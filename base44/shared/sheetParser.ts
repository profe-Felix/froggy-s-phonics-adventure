// Shared Google Sheets → Student parser. Fetches the CSV export of a public
// (link-shared) Google Sheet, maps flexible column headers to the existing
// Student entity fields, and upserts rows (matching by class + number, then
// class + name). No OAuth needed — the sheet must be "Anyone with the link".

const HEADER_MAP: Record<string, string> = {
  'name': 'name', 'student name': 'name', 'student': 'name', 'student_name': 'name',
  'id': 'barcode_number', 'id number': 'barcode_number', 'id_number': 'barcode_number',
  'barcode': 'barcode_number', 'barcode number': 'barcode_number', 'barcode_number': 'barcode_number',
  'number': 'number_raw', 'no': 'number_raw', 'num': 'number_raw', '#': 'number_raw',
  'class': 'class_name', 'class name': 'class_name', 'class_name': 'class_name',
  'class number': 'class_name', 'class_number': 'class_name', 'class #': 'class_name', 'classno': 'class_name',
  'teacher': 'teacher_name', 'teacher name': 'teacher_name', 'teacher_name': 'teacher_name',
  'site': 'site', 'grade': 'grade', 'homeroom': 'homeroom',
  'print': 'print_flag', 'print id': 'print_flag', 'need id': 'print_flag',
  'needs id': 'print_flag', 'need print': 'print_flag', 'needs print': 'print_flag',
  'reprint': 'print_flag', 'print_flag': 'print_flag',
};

const TRUTHY = new Set(['yes', 'y', 'x', '1', 'true', 't', 'print', 'printed', '✓', 'check', 'checked']);

function parseBool(v: string | undefined): boolean {
  if (v === undefined || v === null) return false;
  return TRUTHY.has(String(v).toLowerCase().trim());
}

export function extractSheetId(url: string): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (!trimmed.includes('/') && /^[a-zA-Z0-9-_]+$/.test(trimmed)) return trimmed;
  return null;
}

export function extractGid(url: string): string | null {
  if (!url) return null;
  const m = String(url).trim().match(/[?&#]gid=([0-9]+)/);
  return m ? m[1] : null;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

// "Last, First" → "First Last"; leaves already-"First Last" names as-is.
function formatName(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (!trimmed.includes(',')) return trimmed;
  const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  const last = parts[0];
  const restTokens = parts.slice(1).join(' ').trim().split(/\s+/).filter(Boolean);
  if (restTokens.length === 0) return last;
  const first = restTokens[0];
  const middles = restTokens.slice(1).map((m) => {
    const letter = m.replace(/[^a-zA-Z]/g, '')[0];
    return letter ? letter.toUpperCase() + '.' : '';
  }).filter(Boolean);
  return [first, ...middles, last].filter(Boolean).join(' ');
}

export interface SheetStudent {
  name?: string;
  student_number?: number;
  class_name?: string;
  barcode_number?: string;
  teacher_name?: string;
  site?: string;
  grade?: string;
  homeroom?: string;
  print_flag?: boolean;
}

export async function fetchSheetStudents(sheetUrl: string): Promise<SheetStudent[]> {
  const spreadsheetId = extractSheetId(sheetUrl);
  if (!spreadsheetId) throw new Error('Could not find a spreadsheet ID in that URL');
  const gid = extractGid(sheetUrl);
  let exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  if (gid) exportUrl += `&gid=${gid}`;
  const resp = await fetch(exportUrl, { redirect: 'follow' });
  if (!resp.ok) throw new Error(`Could not read the sheet (HTTP ${resp.status}). Make sure it is shared as "Anyone with the link".`);
  const text = await resp.text();
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The sheet has no data rows');
  const headers = rows[0].map((h) => String(h || '').toLowerCase().trim());
  const mapped = headers.map((h) => HEADER_MAP[h] || null);
  const students: SheetStudent[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const obj: SheetStudent = {};
    for (let c = 0; c < mapped.length; c++) {
      const key = mapped[c];
      if (!key) continue;
      const val = String(row[c] || '').trim();
      if (key === 'print_flag') { obj.print_flag = parseBool(val); continue; }
      if (key === 'number_raw') {
        const n = parseInt(val, 10);
        if (!isNaN(n) && n >= 1 && n <= 30) obj.student_number = n;
        else if (val) obj.barcode_number = val;
        continue;
      }
      if (key === 'name') { obj.name = formatName(val); continue; }
      (obj as any)[key] = val;
    }
    if (!obj.name && !obj.student_number && !obj.barcode_number) continue;
    if (!obj.class_name && obj.homeroom) obj.class_name = obj.homeroom;
    students.push(obj);
  }
  return students;
}

export async function upsertStudents(base44: any, incoming: SheetStudent[], schoolYear: string) {
  const existing = await base44.entities.Student.list('-created_date', 10000);
  const byClassNumber: Record<string, any> = {};
  const byClassName: Record<string, any> = {};
  for (const s of existing) {
    if (schoolYear && s.school_year && s.school_year !== schoolYear) continue;
    const cls = String(s.class_name || '').toLowerCase();
    if (s.student_number) byClassNumber[`${cls}:${s.student_number}`] = s;
    if (s.name) byClassName[`${cls}:${String(s.name).toLowerCase().trim()}`] = s;
  }
  const toCreate: any[] = [];
  const toUpdate: any[] = [];
  const unmatched: string[] = [];
  for (const s of incoming) {
    const cls = String(s.class_name || '').toLowerCase();
    let ex: any = null;
    if (s.student_number) ex = byClassNumber[`${cls}:${s.student_number}`];
    if (!ex && s.name) ex = byClassName[`${cls}:${String(s.name).toLowerCase().trim()}`];
    const patch: any = {};
    if (s.name !== undefined) patch.name = s.name;
    if (s.print_flag !== undefined) patch.print_flag = s.print_flag;
    if (s.barcode_number !== undefined) patch.barcode_number = s.barcode_number;
    if (s.teacher_name !== undefined) patch.teacher_name = s.teacher_name;
    if (s.site !== undefined) patch.site = s.site;
    if (s.grade !== undefined) patch.grade = s.grade;
    if (s.homeroom !== undefined) patch.homeroom = s.homeroom;
    if (ex) {
      toUpdate.push({ id: ex.id, ...patch });
    } else if (s.student_number && s.class_name) {
      toCreate.push({ student_number: s.student_number, class_name: s.class_name, school_year: schoolYear, language: 'es', ...patch });
    } else {
      unmatched.push(s.name || s.barcode_number || '(no name)');
    }
  }
  let created = 0;
  let updated = 0;
  if (toCreate.length) {
    const res = await base44.entities.Student.bulkCreate(toCreate);
    created = res.length;
  }
  if (toUpdate.length) {
    await base44.entities.Student.bulkUpdate(toUpdate);
    updated = toUpdate.length;
  }
  return { created, updated, unmatched };
}