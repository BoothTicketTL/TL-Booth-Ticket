import type { LeagueType } from '../types';
import { parseCsv } from './sheetFixtureParser';

/**
 * Strict parser for the Google Sheet "เบอร์ติดต่อหน้าสนาม".
 *
 * One tab per league (League 1 / League 2 / League 3). Columns are found by HEADER NAME only:
 *   - สโมสรทีมเหย้า                    -> home club (the key used to match a fixture)
 *   - ชื่อ+เบอร์ติดต่อสำหรับออกบูธ        -> booth contact
 *   - ชื่อ+เบอร์ติดต่อสำหรับรับบัตร        -> ticket contact
 *   - Remark                          -> remark
 *
 * Rules (no guessing):
 *   - A cell that is empty in the sheet stays empty. The booth contact is NEVER copied into the ticket column.
 *   - Nothing is invented: no default names, phones, locations or hours.
 *   - A row is skipped only when the home club cell is empty.
 *   - Rows are never split on "-" or "vs": the club is exactly what the sheet says.
 */

export interface SheetContactRow {
  league: LeagueType;
  homeClub: string;
  boothRaw: string;
  boothName: string;
  boothPhone: string;
  ticketRaw: string;
  ticketName: string;
  ticketPhone: string;
  remark: string;
  sheetRow: number; // 1-based row number inside the tab (for error messages)
}

export interface ParsedContactsTab {
  headerFound: boolean;
  missingColumns: string[];
  rows: SheetContactRow[];
  duplicates: string[]; // club names that appear more than once in the tab
}

const norm = (s: string) =>
  (s || '')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '')
    .toLowerCase();

// Header names expected in the sheet (compared after removing spaces / case)
const H_CLUB = ['สโมสรทีมเหย้า', 'ทีมเหย้า', 'สโมสรเหย้า'];
const H_BOOTH = ['ชื่อ+เบอร์ติดต่อสำหรับออกบูธ', 'เบอร์ติดต่อสำหรับออกบูธ', 'ติดต่อสำหรับออกบูธ'];
const H_TICKET = ['ชื่อ+เบอร์ติดต่อสำหรับรับบัตร', 'เบอร์ติดต่อสำหรับรับบัตร', 'ติดต่อสำหรับรับบัตร'];
const H_REMARK = ['remark', 'หมายเหตุ'];

const findCol = (headers: string[], names: string[]) => {
  const wanted = names.map(norm);
  return headers.findIndex(h => wanted.includes(norm(h)));
};

// Thai mobile / landline, with or without separators; also 9-digit numbers whose leading 0 was dropped by Sheets
const PHONE_RE = /(?:\+66[\s-]?|0)\d(?:[\s.-]?\d){7,8}|\b[689](?:[\s.-]?\d){8}\b/;

/** Split a "name + phone" cell into name and phone. Keeps both empty when the cell is empty. */
export function splitNameAndPhone(cell: string): { name: string; phone: string } {
  const text = (cell || '').replace(/\u00a0/g, ' ').trim();
  if (!text || text === '-' || text === '--') return { name: '', phone: '' };
  const m = text.match(PHONE_RE);
  if (!m) return { name: text, phone: '' };
  const phoneRaw = m[0].trim();
  let digits = phoneRaw.replace(/\D/g, '');
  if (digits.length === 9 && /^[689]/.test(digits)) digits = '0' + digits; // leading 0 dropped by Sheets
  let phone = phoneRaw; // anything we are not sure about is shown exactly as written in the sheet
  if (digits.length === 10 && digits.startsWith('0')) {
    phone = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  } else if (digits.length === 9 && /^0[2-57]/.test(digits)) {
    phone = `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`; // landline
  }
  const name = text.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
  return { name, phone };
}

export function parseContactsTab(csvText: string, league: LeagueType): ParsedContactsTab {
  const matrix = parseCsv(csvText || ''); // handles quoted cells that contain line breaks
  const empty: ParsedContactsTab = { headerFound: false, missingColumns: [], rows: [], duplicates: [] };

  // The header row is the first row (within the first 10) that contains the "home club" header
  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    if (findCol(matrix[i], H_CLUB) >= 0) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return { ...empty, missingColumns: ['สโมสรทีมเหย้า'] };

  const headers = matrix[headerIdx];
  const cClub = findCol(headers, H_CLUB);
  const cBooth = findCol(headers, H_BOOTH);
  const cTicket = findCol(headers, H_TICKET);
  const cRemark = findCol(headers, H_REMARK);

  const missing: string[] = [];
  if (cBooth < 0) missing.push('ชื่อ+เบอร์ติดต่อสำหรับออกบูธ');
  if (cTicket < 0) missing.push('ชื่อ+เบอร์ติดต่อสำหรับรับบัตร');
  if (cRemark < 0) missing.push('Remark');

  const cell = (row: string[], idx: number) => (idx >= 0 ? (row[idx] || '').replace(/\u00a0/g, ' ').trim() : '');

  const rows: SheetContactRow[] = [];
  const seen = new Map<string, number>();
  const duplicates: string[] = [];

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const row = matrix[r];
    const club = cell(row, cClub).replace(/\s+/g, ' ');
    if (!club) continue;

    const boothRaw = cell(row, cBooth);
    const ticketRaw = cell(row, cTicket);
    const booth = splitNameAndPhone(boothRaw);
    const ticket = splitNameAndPhone(ticketRaw);
    let remark = cell(row, cRemark);
    if (remark === '-' || remark === '--') remark = '';

    seen.set(norm(club), (seen.get(norm(club)) || 0) + 1);
    if (seen.get(norm(club)) === 2) duplicates.push(club);

    rows.push({
      league,
      homeClub: club,
      boothRaw,
      boothName: booth.name,
      boothPhone: booth.phone,
      ticketRaw,
      ticketName: ticket.name,
      ticketPhone: ticket.phone,
      remark,
      sheetRow: r + 1,
    });
  }

  return { headerFound: true, missingColumns: missing, rows, duplicates };
}
