import type { FixtureItem, LeagueType } from '../types';

/**
 * Parser for the official fixtures Google Sheets (L1/L2 tabs T1-(THA)/T2-(THA), and the
 * six L3 regional tabs). Pure functions only: no network, no storage, no mock data.
 */

/** RFC 4180 CSV parser: handles quoted cells that contain commas, quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const THAI_MONTHS: Record<string, number> = {
  'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6,
  'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12,
};
const EN_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Accepts: "4 ก.ย. 2569", "9-ต.ค.-2569", "30-ธ.ค.-69" (Buddhist era) and "19 Sep 26" / "19 Sep 2026" (Gregorian).
 * Returns YYYY-MM-DD or null when the text is not a recognizable date.
 */
export function parseSheetDate(raw: string): string | null {
  const m = (raw || '').trim().match(/^(\d{1,2})[\s\-/]+([^\s\-/\d]+)[\s\-/]*(\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const monthKey = m[2].trim();
  let month = THAI_MONTHS[monthKey] ?? THAI_MONTHS[monthKey.endsWith('.') ? monthKey : monthKey + '.'];
  const isThai = month !== undefined;
  if (!month) month = EN_MONTHS[monthKey.toLowerCase().slice(0, 3)];
  if (!month || day < 1 || day > 31) return null;

  let year = Number(m[3]);
  if (year < 100) year += isThai ? 2500 : 2000; // 2-digit years: BE for Thai months, CE for English
  if (year > 2400) year -= 543;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseSheetTime(raw: string): string {
  const m = (raw || '').trim().match(/^(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

const cleanCell = (s: string | undefined): string => (s || '').replace(/\s+/g, ' ').trim();

export interface RejectedRow {
  rowNumber: number;
  reason: string;
  cells: string[];
}

export interface ParsedSheet {
  fixtures: FixtureItem[];
  rejected: RejectedRow[];
  /** Text of the "UPDATED AS ..." line at the top of the tab, if present. */
  updatedLabel?: string;
  /** True when a header row (ทีมเหย้า / ทีมเยือน) was found. */
  headerFound: boolean;
}

/**
 * Parse one fixtures tab. Columns are located by their header names, so inserting or moving
 * columns in the sheet does not silently shift data.
 *
 * Match id = sheet-<l1|l2|l3>[-<zone>]-<คู่ที่>, which does NOT depend on date/time/venue,
 * so rescheduling a match in the sheet updates the same match instead of creating a new one.
 */
export function parseFixtureSheet(csvText: string, league: LeagueType, zone?: string): ParsedSheet {
  const rows = parseCsv(csvText);
  const result: ParsedSheet = { fixtures: [], rejected: [], headerFound: false };

  const updated = rows.slice(0, 6).find(r => /^\s*UPDATED/i.test(r[0] || ''));
  if (updated) result.updatedLabel = cleanCell(updated[0]);

  const normHeader = (s: string) => cleanCell(s).replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const headerIdx = rows.findIndex(r => {
    const hs = r.map(normHeader);
    return hs.some(h => ['ทีมเหย้า', 'เจ้าบ้าน', 'home'].includes(h)) &&
      hs.some(h => ['ทีมเยือน', 'ผู้มาเยือน', 'away'].includes(h));
  });
  if (headerIdx < 0) return result;
  result.headerFound = true;

  const header = rows[headerIdx].map(cleanCell);
  const normalizedHeader = header.map(normHeader);
  const col = (...names: string[]) => {
    const wanted = names.map(normHeader);
    return normalizedHeader.findIndex(h =>
  wanted.some(w => h === w || h.includes(w))
);
  };
  const cWeek = col('สัปดาห์', 'WEEK');
  const cNo = col('คู่ที่', 'MATCH NO.', 'MATCH NO', 'MATCH');
  const cExplicitDate = -1;
  const cDow = col('วัน เดือน ปี', 'วันที่แข่งขัน', 'วัน', 'DAY');
  const cDate = cExplicitDate >= 0 ? cExplicitDate : cDow;
  const cTime = col('เวลา', 'TIME');
  const cHome = col('ทีมเหย้า', 'เจ้าบ้าน', 'HOME');
  const cAway = col('ทีมเยือน', 'ผู้มาเยือน', 'AWAY');
  const cStadium = col('สนามแข่งขัน', 'สนาม', 'STADIUM');
  const cRemark = cStadium >= 0 ? cStadium + 1 : -1;

  if ([cWeek, cNo, cDate, cTime, cHome, cAway, cStadium].some(i => i < 0)) {
    result.headerFound = false;
    return result;
  }

  const leagueKey = league === 'League 1' ? 'l1' : league === 'League 2' ? 'l2' : 'l3';

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !/^\d+$/.test(cleanCell(r[cWeek]))) continue; // blank / footer rows

    let date = parseSheetDate(cleanCell(r[cDate]));
    // Align League 3 matches to 9-11 Oct weekend with League 1 & 2
    if (league === 'League 3' && date === '2026-10-12') {
      date = '2026-10-11';
    }
    const home = cleanCell(r[cHome]);
    const away = cleanCell(r[cAway]);
    const no = cleanCell(r[cNo]);

    if (!date) {
      result.rejected.push({ rowNumber: i + 1, reason: `อ่านวันที่ไม่ได้: "${cleanCell(r[cDate])}"`, cells: r });
      continue;
    }
    if (!home || !away) {
      result.rejected.push({ rowNumber: i + 1, reason: 'ไม่มีชื่อทีมเหย้า/เยือน', cells: r });
      continue;
    }

    let stadium = cleanCell(r[cStadium]);
    const remarks: string[] = [];
    const tbc = /\bTBC\b/i.test(stadium);
    if (tbc) {
      stadium = stadium.replace(/\s*\bTBC\b/gi, '').trim();
      remarks.push('สนามรอยืนยัน (TBC)');
    }
    const sheetRemark = cRemark >= 0 ? cleanCell(r[cRemark]) : '';
    if (sheetRemark) remarks.unshift(sheetRemark);

    result.fixtures.push({
      id: `sheet-${leagueKey}${zone ? `-${zone.toLowerCase()}` : ''}-${no || i}`,
      league,
      matchWeek: Number(cleanCell(r[cWeek])),
      homeTeam: home,
      awayTeam: away,
      stadium,
      matchDate: date,
      matchTime: parseSheetTime(r[cTime]),
      month: date.slice(0, 7),
      remark: remarks.length > 0 ? remarks.join(' | ') : undefined,
    });
  }

  return result;
}
