import { StadiumContact, MatchStadiumContact, LeagueType } from '../types';
import { getCanonicalOfficialClub } from '../data/officialSeasonClubs';
import { parseContactsTab } from './contactsSheetParser';
import { INITIAL_STADIUM_CONTACTS, INITIAL_MATCH_CONTACTS } from '../data/stadiumContacts';
import { 
  parseGoogleSheetUrl, 
  fetchSingleSheetText, 
  getFixturesSheetT1T2Url,
  getFixturesSheetUrl,
  normalizeDate,
  parseDelimitedText,
  getFixtures
} from './fixturesService';
import { saveMultipleMatchContacts, getMatchContacts } from './firebase';
import { 
  findStadiumPhonebookEntry, 
  getCurrentWeekInfo, 
  isStadiumConfirmedForWeek, 
  StadiumPhonebookEntry 
} from './stadiumPhonebookService';
import { isMatchContactConfirmed } from './matchConfirmationService';
import { findMasterClubContact } from './clubPhonebookService';

export interface StadiumContactsSyncMeta {
  source: 'google-sheet' | 'default';
  sheetUrl: string;
  tabName?: string;
  syncedTabs?: string[];
  lastSyncedAt?: string;
  count: number;
  statusMessage?: string;
}

// The ONLY source of contact data: Google Sheet "เบอร์ติดต่อหน้าสนาม" (tabs: League 1 / League 2 / League 3)
export const DEFAULT_CONTACTS_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1-W4v4nTKkatHXUtXDHE9r5TOIfWEmqZjPfCTRsd_0IM/edit?gid=0#gid=0';
// New key (v2): a link saved by older versions of the app is ignored, so stale links can never override the default.
const LOCAL_CONTACTS_SHEET_URL_KEY = 'thaileague_stadium_contacts_sheet_url_v2';
const LOCAL_CONTACTS_SYNC_META_KEY = 'thaileague_stadium_contacts_sync_meta_v2';
const LOCAL_LEAGUE_CONTACTS_KEY = 'thaileague_stadium_contacts_by_league_v2'; // v2: drops contacts cached by older versions

export interface LeagueHomeTeamContact {
  id: string;
  league: LeagueType;
  homeTeam: string;
  cleanHomeTeam: string;
  cleanHomeCore: string;
  stadiumName?: string;
  boothCoordinatorName: string;
  boothCoordinatorPhone: string;
  boothRawText: string;
  boothSetupLocation?: string;
  ticketCoordinatorName: string;
  ticketCoordinatorPhone: string;
  ticketRawText: string;
  ticketPickupLocation?: string;
  operatingHours?: string;
  remark: string;
  note?: string;
  sourceTab: string;
  updatedAt: string;
}

// Map tabs for Google Sheet "เบอร์ติดต่อหน้าสนาม"
// League 1 -> แท็บ League 1
// League 2 -> แท็บ League 2
// League 3 -> แท็บ League 3
export const TABS_MAP_BY_LEAGUE: Record<LeagueType, string[]> = {
  'League 1': ['League 1', 'League1', 'L1', 'ไทยลีก 1', 'Thai League 1', 'T1', 'T1-(THA)'],
  'League 2': ['League 2', 'League2', 'L2', 'ไทยลีก 2', 'Thai League 2', 'T2', 'T2-(THA)'],
  'League 3': ['League 3', 'League3', 'L3', 'ไทยลีก 3', 'Thai League 3', 'T3', 'T3-(THA)'],
};

export const CANDIDATE_CONTACT_TABS = [
  'League 1',
  'League 2',
  'League 3',
  'L1',
  'L2',
  'L3',
  'ไทยลีก 1',
  'ไทยลีก 2',
  'ไทยลีก 3',
  'เบอร์ติดต่อหน้าสนาม',
  'เบอร์ติดต่อ',
  'ตารางเบอร์ติดต่อ',
  'T1',
  'T2',
  'T3',
  'T1-(THA)',
  'T2-(THA)',
  'T3-(THA)',
  'Remark',
];

type ContactsSyncListener = (meta: StadiumContactsSyncMeta) => void;
const syncListeners: Set<ContactsSyncListener> = new Set();

let cachedContactsMeta: StadiumContactsSyncMeta = loadStoredContactsMeta();
let memoryLeagueHomeTeamContacts: LeagueHomeTeamContact[] = loadStoredLeagueHomeTeamContacts();

function loadStoredLeagueHomeTeamContacts(): LeagueHomeTeamContact[] {
  try {
    const raw = localStorage.getItem(LOCAL_LEAGUE_CONTACTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading league home team contacts:', e);
  }
  return [];
}

export function getStoredLeagueHomeTeamContacts(): LeagueHomeTeamContact[] {
  if (memoryLeagueHomeTeamContacts.length === 0) {
    memoryLeagueHomeTeamContacts = loadStoredLeagueHomeTeamContacts();
  }
  return [...memoryLeagueHomeTeamContacts];
}

export function saveLeagueHomeTeamContacts(contacts: LeagueHomeTeamContact[]): void {
  memoryLeagueHomeTeamContacts = contacts;
  try {
    localStorage.setItem(LOCAL_LEAGUE_CONTACTS_KEY, JSON.stringify(contacts));
  } catch (e) {
    console.error('Error saving league home team contacts:', e);
  }
}

const exactClubKey = (name: string | undefined, league?: LeagueType): string => {
  const raw = (name || '').replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const canonical = getCanonicalOfficialClub(raw, league);
  return (canonical ? canonical.name : raw).replace(/\s+/g, '').toLowerCase();
};

/**
 * Find the contact row of a HOME club. Strict: same league AND same club name.
 * (Never matches the away team, never falls back to another league, no partial-name matching.)
 */
export function findLeagueHomeTeamContact(league?: LeagueType, homeTeam?: string): LeagueHomeTeamContact | null {
  if (!homeTeam || !league) return null;
  const key = exactClubKey(homeTeam, league);
  if (!key) return null;
  return getStoredLeagueHomeTeamContacts().find(c => c.league === league && exactClubKey(c.homeTeam, league) === key) || null;
}

function loadStoredContactsMeta(): StadiumContactsSyncMeta {
  try {
    const raw = localStorage.getItem(LOCAL_CONTACTS_SYNC_META_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error loading contacts meta:', e);
  }

  const defaultUrl = DEFAULT_CONTACTS_SHEET_URL;
  return {
    source: 'default',
    sheetUrl: defaultUrl,
    count: 0,
    statusMessage: 'ยังไม่ได้ซิงค์ — กดซิงค์เพื่อดึงเบอร์ติดต่อจากชีต "เบอร์ติดต่อหน้าสนาม" (แท็บ League 1, League 2, League 3)',
  };
}

export function getStadiumContactsSheetUrl(): string {
  return (localStorage.getItem(LOCAL_CONTACTS_SHEET_URL_KEY) || '').trim() || DEFAULT_CONTACTS_SHEET_URL;
}

export function setStadiumContactsSheetUrl(url: string) {
  const trimmed = (url || '').trim();
  localStorage.setItem(LOCAL_CONTACTS_SHEET_URL_KEY, trimmed);
  cachedContactsMeta = {
    ...cachedContactsMeta,
    sheetUrl: trimmed,
  };
  localStorage.setItem(LOCAL_CONTACTS_SYNC_META_KEY, JSON.stringify(cachedContactsMeta));
  notifySyncListeners();
}

export function getStadiumContactsSyncMeta(): StadiumContactsSyncMeta {
  return { ...cachedContactsMeta };
}

export function subscribeToContactsSync(callback: ContactsSyncListener): () => void {
  syncListeners.add(callback);
  callback({ ...cachedContactsMeta });
  return () => {
    syncListeners.delete(callback);
  };
}

function notifySyncListeners() {
  syncListeners.forEach(cb => {
    try {
      cb({ ...cachedContactsMeta });
    } catch (err) {
      console.error(err);
    }
  });
}

/**
 * Validate whether a string is an actual updated Thai phone number (not empty, dash, placeholder)
 */
export function isValidPhoneNumber(phoneStr?: string): boolean {
  if (!phoneStr) return false;
  const cleaned = phoneStr.trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '--' || cleaned.toLowerCase() === 'n/a' || cleaned.toLowerCase() === 'null') {
    return false;
  }
  const digits = cleaned.replace(/[^0-9]/g, '');
  // Standard 10-digit mobile starting with 0
  if (digits.length === 10 && digits.startsWith('0')) return true;
  // 9-digit mobile where Google Sheets / Excel stripped leading 0 (starts with 6, 8, 9) or 9-digit landline starting with 0
  if (digits.length === 9 && (digits.startsWith('0') || digits.startsWith('6') || digits.startsWith('8') || digits.startsWith('9'))) return true;
  // 8-digit landline where leading 0 was stripped
  if (digits.length === 8 && /^[2-7]/.test(digits)) return true;

  // Matches valid Thai mobile (06, 08, 09) and landline (02, 03, 04, 05, 07) numbers
  const phoneRegex = /(?:(?:\+66\s?|0)[689]\d[-.\s]?\d{3}[-.\s]?\d{4}|(?:\+66\s?|0)[2-57][-.\s]?\d{3}[-.\s]?\d{4}|(?:\+66\s?|0)[2-57]\d[-.\s]?\d{3}[-.\s]?\d{3}|0[689]\d{8}|0[2-57]\d{7,8})/;
  return phoneRegex.test(cleaned);
}

/**
 * Standardize phone string into readable format (e.g. 081-234-5678 or 02-123-4567)
 * Automatically restores missing leading 0 dropped by Google Sheets / Excel integer columns.
 */
export function formatPhoneNumber(phoneStr: string): string {
  if (!phoneStr) return '';
  let digits = phoneStr.replace(/[^0-9]/g, '');
  
  // Handle mobile numbers missing leading 0 (e.g. 644691923 -> 0644691923)
  if (digits.length === 9 && (digits.startsWith('6') || digits.startsWith('8') || digits.startsWith('9'))) {
    digits = '0' + digits;
  } else if (digits.length === 8 && /^[2-7]/.test(digits)) {
    digits = '0' + digits;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  return phoneStr.trim();
}

/**
 * Clean team name for fuzzy matching across spreadsheet formats
 */
export function cleanTeamName(name?: string): string {
  if (!name) return '';
  return name
    .replace(/(สโมสรฟุตบอล|สโมสร|เอฟซี|ยูไนเต็ด|fc|f\.c\.|united|utd)/gi, '')
    .replace(/[()\-_\.]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Clean team core: remove common sponsor/corporate/regional prefixes
 * to match teams like "ทรู แบงค็อก ยูไนเต็ด" and "แบงค็อก ยูไนเต็ด" flawlessly.
 */
export function cleanTeamCore(name?: string): string {
  if (!name) return '';
  let cleaned = cleanTeamName(name);
  cleaned = cleaned.replace(/^(ทรู|สิงห์|บีจี|เมืองไทย|พีที|การ|ช้าง|โตโยต้า|ไดโน|แอร์ฟอร์ซ|ราชประชา)/i, '');
  return cleaned.trim();
}

/**
 * Check if two team names refer to the same club
 */
export function teamsMatch(teamA?: string, teamB?: string): boolean {
  if (!teamA || !teamB) return false;
  const aClean = cleanTeamName(teamA);
  const bClean = cleanTeamName(teamB);
  if (aClean === bClean) return true;
  if (aClean && bClean && (aClean.includes(bClean) || bClean.includes(aClean))) return true;

  const aCore = cleanTeamCore(teamA);
  const bCore = cleanTeamCore(teamB);
  if (aCore && bCore && (aCore === bCore || aCore.includes(bCore) || bCore.includes(aCore))) return true;

  return false;
}

/**
 * Unique identifier for a match based on (Date, Home Team, Away Team)
 * As required: "โดยจะรู้ว่าเบอร์ติดต่อนั้นใช้สำหรับแมตช์ไหน ให้ระบบอิงข้อมูลจากวันที่ ทีมเหย้า ทีมเยือน ในตาราง"
 */
export function generateMatchKey(dateStr?: string, homeTeam?: string, awayTeam?: string): string {
  const d = dateStr ? (normalizeDate(dateStr) || dateStr.trim().slice(0, 10)) : '';
  const h = cleanTeamCore(homeTeam) || cleanTeamName(homeTeam);
  const a = cleanTeamCore(awayTeam) || cleanTeamName(awayTeam);
  return `${d}_${h}_${a}`;
}

/**
 * Helper: Extract phone number, coordinator name, location, and operating hours from a spreadsheet cell.
 * Handles complex real entries such as:
 * "รับบัตรได้ที่ห้องขายตั๋วช่องที่ 5 เวลา 15:00 - 18:00 น. เท่านั้น ติดต่อ คุณใหม่ 096-2060446"
 * "รับบัตรหน้าสนาม ติดต่อ คุณฮัมบาลี 093-7136677"
 * "คุณมนัส 081-234-5678"
 * "คุณเติ้ล 644691923"
 */
export function extractPhoneAndName(cellVal: string): { 
  phone: string; 
  name: string; 
  location?: string; 
  hours?: string; 
  rawText: string 
} {
  if (!cellVal) return { phone: '', name: '', rawText: '' };
  const str = cellVal.trim();
  if (!str || str === '-' || str === '--' || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'null') {
    return { phone: '', name: '', rawText: '' };
  }

  // 1. Precise Thai phone regex
  const phoneRegex = /(?:(?:\+66\s?|0)[689]\d[-.\s]?\d{3}[-.\s]?\d{4}|(?:\+66\s?|0)[2-57][-.\s]?\d{3}[-.\s]?\d{4}|(?:\+66\s?|0)[2-57]\d[-.\s]?\d{3}[-.\s]?\d{3}|0[689]\d{8}|0[2-57]\d{7,8})/;
  const phoneMatch = str.match(phoneRegex);
  let phone = '';
  let matchedPhoneRaw = '';
  if (phoneMatch) {
    matchedPhoneRaw = phoneMatch[0];
    phone = formatPhoneNumber(phoneMatch[0]);
  } else {
    // Check 9-digit mobile where Google Sheets dropped leading 0 (starts with 6, 8, or 9)
    const noZeroMobile = /(?:^|[^\d])([689]\d{8})(?:[^\d]|$)/;
    const m2 = str.match(noZeroMobile);
    if (m2) {
      matchedPhoneRaw = m2[1];
      phone = formatPhoneNumber(m2[1]);
    } else {
      // Check 8-digit landline where Google Sheets dropped leading 0
      const noZeroLandline = /(?:^|[^\d])([2-57]\d{7})(?:[^\d]|$)/;
      const m3 = str.match(noZeroLandline);
      if (m3) {
        matchedPhoneRaw = m3[1];
        phone = formatPhoneNumber(m3[1]);
      }
    }
  }

  // 2. Name extraction: look for "ติดต่อ คุณ...", "ผู้ประสานงาน: คุณ...", "คุณ...", or whatever non-phone text is in cell
  let name = '';
  const contactNameMatch = 
    str.match(/(?:ติดต่อ|ผู้ประสานงาน|จนท\.?|เจ้าหน้าที่|ประสานงาน|ชื่อ)\s*[:]?\s*(คุณ[^\s\d,\(\)\[\]\/]+(?:\s+[^\s\d,\(\)\[\]\/]+)?)/i)
    || str.match(/(?:ติดต่อ|ผู้ประสานงาน|จนท\.?|เจ้าหน้าที่|ประสานงาน)\s*[:]?\s*([^\s\d,\(\)\[\]\/]+(?:\s+[^\s\d,\(\)\[\]\/]+)?)/i)
    || str.match(/(คุณ[^\s\d,\(\)\[\]\/]+(?:\s+[^\s\d,\(\)\[\]\/]+)?)/);

  if (contactNameMatch && contactNameMatch[1]) {
    name = contactNameMatch[1].trim();
  } else if (matchedPhoneRaw) {
    // If the cell contains both name and phone without "คุณ" (e.g. "สมชาย 081-234-5678" or "085-6032530 นิคม")
    let cleaned = str.replace(matchedPhoneRaw, '');
    cleaned = cleaned
      .replace(/[()\[\]{}—–\-:,\/]/g, ' ')
      .replace(/(?:โทร|เบอร์|เบอร์โทร|ติดต่อ|ผู้ประสานงาน|จนท\.?|เจ้าหน้าที่|ชื่อ|tel|phone|mobile)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length >= 2 && cleaned.length <= 60 && !/^\d+$/.test(cleaned)) {
      name = cleaned;
    }
  } else if (!/^\d+$/.test(str) && str.length >= 2 && str.length <= 60) {
    name = str.replace(/(?:ติดต่อ|ผู้ประสานงาน|จนท\.?|เจ้าหน้าที่|ชื่อ)\s*[:]?\s*/i, '').trim();
  }

  // 3. Operating hours extraction (e.g. "เวลา 15:00 - 18:00 น.")
  let hours = '';
  const hoursMatch = str.match(/(?:เวลา\s*)?([0-2]?[0-9][.:][0-9]{2}\s*[-–—toถึง]+\s*[0-2]?[0-9][.:][0-9]{2}\s*(?:น\.|น)?)/);
  if (hoursMatch && hoursMatch[1]) {
    hours = hoursMatch[1].trim();
  }

  // 4. Pickup or setup location extraction (e.g. "รับบัตรได้ที่ห้องขายตั๋วช่องที่ 5", "รับบัตรหน้าสนาม")
  let location = '';
  const locMatch = str.match(/(?:รับบัตร(?:ได้)?ที่|จุดตั้งบูธ(?:ที่)?|บริเวณ|ที่|รับบัตร)\s*([^\n,]+?(?=\s*(?:เวลา|ติดต่อ|โทร|\d{3}-|$)))/);
  if (locMatch && locMatch[1]) {
    location = locMatch[1].trim();
  }

  return { phone, name, location, hours, rawText: str };
}

/**
 * Parse CSV into rows
 */
function parseCsvRows(rawCsv: string): string[][] {
  const lines = rawCsv.split(/\r\n|\n|\r/);
  const rows: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const row: string[] = [];
    let insideQuotes = false;
    let currentCell = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        row.push(currentCell.trim());
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    row.push(currentCell.trim());
    rows.push(row);
  }
  return rows;
}

/**
 * Parse match contact rows from a fixture tab like T1-(THA), T2-(THA), or T3-(THA)
 */
export function parseMatchContactsFromFixtureTab(
  rowsOrText: string[][] | string,
  league: LeagueType,
  tabName: string
): {
  contacts: (Omit<MatchStadiumContact, 'id' | 'updatedAt'> & { id?: string })[];
  leagueHomeTeamContacts: LeagueHomeTeamContact[];
  detectedHeaders: string[];
} {
  const rows: string[][] = typeof rowsOrText === 'string' ? parseDelimitedText(rowsOrText) : rowsOrText;

  if (rows.length < 2) {
    return { contacts: [], leagueHomeTeamContacts: [], detectedHeaders: [] };
  }

  // Find header row: scan first 15 rows with weighted keyword scoring and 2-tier header detection
  let headerIndex = -1;
  let headers: string[] = [];
  let bestScore = -1;
  let isMergedHeader = false;

  const KEYWORD_WEIGHTS = [
    { words: ['เหย้า', 'home', 'เจ้าบ้าน', 'ทีม 1', 'team 1', 'ทีมเหย้า', 'สโมสรเหย้า'], weight: 6 },
    { words: ['เยือน', 'away', 'ผู้มาเยือน', 'ทีม 2', 'team 2', 'ทีมเยือน', 'สโมสรเยือน'], weight: 6 },
    { words: ['วันที่', 'date', 'ว/ด/ป', 'วันแข่ง', 'วัน/เดือน/ปี'], weight: 5 },
    { words: ['เบอร์', 'โทร', 'phone', 'tel', 'ติดต่อ', 'mobile'], weight: 5 },
    { words: ['บูธ', 'booth', 'ออกบูธ'], weight: 5 },
    { words: ['บัตร', 'ตั๋ว', 'ticket', 'รับบัตร'], weight: 5 },
    { words: ['สนาม', 'stadium', 'venue', 'สถานที่'], weight: 4 },
    { words: ['เวลา', 'time', 'kickoff'], weight: 3 },
    { words: ['คู่', 'match', 'vs', 'คู่แข่งขัน'], weight: 3 },
    { words: ['ประสานงาน', 'เจ้าหน้าที่', 'ชื่อผู้', 'ผู้รับผิดชอบ'], weight: 3 },
  ];

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const filledCells = row.filter(c => c.trim().length > 0).length;
    // Skip banner/title rows with <= 2 non-empty cells
    if (filledCells <= 2) continue;

    let singleScore = 0;
    const rowText = row.join(' ').toLowerCase();
    for (const kw of KEYWORD_WEIGHTS) {
      if (kw.words.some(w => rowText.includes(w))) {
        singleScore += kw.weight;
      }
    }

    if (singleScore > bestScore) {
      bestScore = singleScore;
      headerIndex = i;
      headers = row.map(h => h.trim().toLowerCase());
      isMergedHeader = false;
    }

    // Check 2-tier header with next row (i+1)
    if (i + 1 < rows.length) {
      const nextRow = rows[i + 1];
      const nextFilled = nextRow.filter(c => c.trim().length > 0).length;
      if (nextFilled >= 3) {
        let lastParent = '';
        const combined: string[] = [];
        for (let c = 0; c < Math.max(row.length, nextRow.length); c++) {
          const top = (row[c] || '').trim();
          const bottom = (nextRow[c] || '').trim();
          if (top) lastParent = top;
          const combo = [lastParent, bottom].filter(Boolean).join(' ').trim().toLowerCase();
          combined.push(combo);
        }
        const combinedText = combined.join(' ');
        let cScore = 0;
        for (const kw of KEYWORD_WEIGHTS) {
          if (kw.words.some(w => combinedText.includes(w))) {
            cScore += kw.weight;
          }
        }
        if (cScore > bestScore && cScore > singleScore) {
          bestScore = cScore;
          headerIndex = i;
          headers = combined;
          isMergedHeader = true;
        }
      }
    }
  }

  if (headerIndex === -1) {
    headerIndex = 0;
    headers = rows[0].map(h => h.trim().toLowerCase());
    isMergedHeader = false;
  }

  // Detect column indices
  let colDate = -1;
  let colDay = -1;
  let colTime = -1;
  let colHome = -1;
  let colAway = -1;
  let colMatch = -1;
  let colStadium = -1;

  let colBoothPhone = -1;
  let colBoothName = -1;
  let colBoothLoc = -1;

  let colTicketPhone = -1;
  let colTicketName = -1;
  let colTicketLoc = -1;

  let colHours = -1;
  let colNote = -1;

  headers.forEach((h, idx) => {
    if (h.includes('วันที่') || h.includes('date') || h.includes('ว/ด/ป') || h.includes('วัน/เดือน/ปี') || h.includes('วันแข่ง')) {
      colDate = idx;
    } else if (h.includes('วัน') || h.includes('day')) {
      colDay = idx;
    } else if (h.includes('เวลา') || h.includes('time') || h.includes('kickoff')) {
      colTime = idx;
    } else if (
      !h.includes('ชื่อ+เบอร์') && !h.includes('เบอร์') && (
        h.includes('เหย้า') || h.includes('home') || h.includes('เจ้าบ้าน') || h.includes('ทีมเหย้า') || 
        h.includes('สโมสรเหย้า') || h.includes('สโมสร') || h.includes('ชื่อทีม') || h.includes('ชื่อสโมสร') ||
        h.includes('ทีม 1') || h.includes('team 1') || h.includes('ทีม1') || h.includes('team1') || 
        h.includes('สโมสร 1') || h.includes('สโมสร1') || h.includes('เจ้าถิ่น') ||
        h === 'ทีม' || h === 'team' || h === 'club'
      )
    ) {
      colHome = idx;
    } else if (
      h.includes('เยือน') || h.includes('away') || h.includes('ผู้มาเยือน') || h.includes('ทีมเยือน') || 
      h.includes('ทีม 2') || h.includes('team 2') || h.includes('ทีม2') || h.includes('team2') || 
      h.includes('สโมสร 2') || h.includes('สโมสร2') || h.includes('สโมสรเยือน')
    ) {
      colAway = idx;
    } else if (
      h.includes('คู่') || h.includes('match') || h.includes('fixture') || 
      h.includes('โปรแกรม') || h.includes('คู่แข่ง') || h.includes('คู่แข่งขัน') || 
      h.includes('รายการ') || h.includes('การแข่งขัน')
    ) {
      colMatch = idx;
    } else if (h.includes('สนาม') || h.includes('stadium') || h.includes('venue') || h.includes('สถานที่')) {
      colStadium = idx;
    } 

    // Specific Match for: ชื่อ+เบอร์ติดต่อสำหรับออกบูธ
    if (
      h.includes('ชื่อ+เบอร์ติดต่อสำหรับออกบูธ') ||
      h.includes('ชื่อ + เบอร์ติดต่อสำหรับออกบูธ') ||
      h.includes('ชื่อและเบอร์ติดต่อสำหรับออกบูธ') ||
      h.includes('เบอร์ติดต่อสำหรับออกบูธ') ||
      (h.includes('ออกบูธ') && (h.includes('ชื่อ') || h.includes('เบอร์') || h.includes('ติดต่อ')))
    ) {
      colBoothPhone = idx;
      colBoothName = idx;
      return;
    }

    // Specific Match for: ชื่อ+เบอร์ติดต่อสำหรับรับบัตร
    if (
      h.includes('ชื่อ+เบอร์ติดต่อสำหรับรับบัตร') ||
      h.includes('ชื่อ + เบอร์ติดต่อสำหรับรับบัตร') ||
      h.includes('ชื่อและเบอร์ติดต่อสำหรับรับบัตร') ||
      h.includes('เบอร์ติดต่อสำหรับรับบัตร') ||
      (h.includes('รับบัตร') && (h.includes('ชื่อ') || h.includes('เบอร์') || h.includes('ติดต่อ')))
    ) {
      colTicketPhone = idx;
      colTicketName = idx;
      return;
    }

    // Specific Match for: Remark
    if (
      h === 'remark' ||
      h === 'หมายเหตุ' ||
      h.includes('remark') ||
      h.includes('หมายเหตุ') ||
      h.includes('note') ||
      h.includes('ข้อมูลเพิ่มเติม') ||
      h.includes('ข้อความเพิ่มเติม')
    ) {
      colNote = idx;
      return;
    }

    // Combined Booth + Ticket Header (e.g. "เบอร์ติดต่อสำหรับออกบูธรับบัตรเข้า", "เบอร์ออกบูธและรับบัตร")
    const isBothBoothAndTicket = (h.includes('บูธ') && (h.includes('บัตร') || h.includes('ตั๋ว'))) ||
      h.includes('ออกบูธรับบัตร') || h.includes('ออกบูธและรับบัตร') || h.includes('ออกบูธ/รับบัตร') || h.includes('สำหรับออกบูธรับบัตร');

    if (isBothBoothAndTicket) {
      if (colBoothPhone === -1) colBoothPhone = idx;
      if (colTicketPhone === -1) colTicketPhone = idx;
      if (colBoothName === -1) colBoothName = idx;
      if (colTicketName === -1) colTicketName = idx;
      if (h.includes('จุด') || h.includes('สถานที่') || h.includes('ลาน') || h.includes('บริเวณ') || h.includes('location')) {
        colBoothLoc = idx;
        colTicketLoc = idx;
      }
      return;
    }

    // Booth Specific Columns (e.g. "ออกบูธ", "ผู้ประสานงานบูธ", "เบอร์ติดต่อออกบูธ", "เบอร์ออกบูธ", "บูธ", "เจ้าหน้าที่ดูแลบูธดีลเลอร์", "บูธดีลเลอร์")
    const isBoothHeader =
      h.includes('บูธ') ||
      h.includes('booth') ||
      h.includes('ออกบูธ') ||
      h.includes('ดีลเลอร์') ||
      h === 'บูธ' ||
      h === 'ออกบูธ';

    if (isBoothHeader) {
      if (colBoothPhone === -1) colBoothPhone = idx;
      if (colBoothName === -1) colBoothName = idx;
      if (h.includes('เบอร์') || h.includes('โทร') || h.includes('phone') || h.includes('tel') || h.includes('ติดต่อ') || h.includes('mobile')) {
        colBoothPhone = idx;
      }
      if (h.includes('ชื่อ') || h.includes('ผู้') || h.includes('เจ้าหน้าที่') || h.includes('ประสานงาน') || h.includes('name')) {
        colBoothName = idx;
      }
      if (h.includes('จุด') || h.includes('สถานที่') || h.includes('ลาน') || h.includes('บริเวณ') || h.includes('location')) {
        colBoothLoc = idx;
      }
    }

    // Ticket Specific Columns (e.g. "รับบัตร", "ผู้ประสานงานรับบัตร", "เบอร์ติดต่อรับบัตร", "เบอร์รับบัตร", "บัตร", "เจ้าหน้าที่ประจำซุ้มตั๋ว", "ซุ้มตั๋ว", "ตั๋วดูบอล")
    const isTicketHeader =
      h.includes('บัตร') ||
      h.includes('ตั๋ว') ||
      h.includes('ticket') ||
      h.includes('รับบัตร') ||
      h.includes('ซุ้มตั๋ว') ||
      h === 'บัตร' ||
      h === 'รับบัตร';

    if (isTicketHeader) {
      if (colTicketPhone === -1) colTicketPhone = idx;
      if (colTicketName === -1) colTicketName = idx;
      if (h.includes('เบอร์') || h.includes('โทร') || h.includes('phone') || h.includes('tel') || h.includes('ติดต่อ') || h.includes('mobile')) {
        colTicketPhone = idx;
      }
      if (h.includes('ชื่อ') || h.includes('ผู้') || h.includes('เจ้าหน้าที่') || h.includes('ประสานงาน') || h.includes('name')) {
        colTicketName = idx;
      }
      if (h.includes('จุด') || h.includes('สถานที่') || h.includes('ซุ้ม') || h.includes('เคาน์เตอร์') || h.includes('location')) {
        colTicketLoc = idx;
      }
    }

    if (h.includes('เวลาทำการ') || h.includes('operating hours') || h.includes('เวลาเปิด')) {
      colHours = idx;
    } else if (
      h.includes('หมายเหตุ') || h.includes('note') || h.includes('remark') ||
      h.includes('ข้อมูลเพิ่มเติม') || h.includes('แจ้งเพิ่มเติม') ||
      h.includes('ข้อความเพิ่มเติม') || h.includes('รายละเอียดเพิ่มเติม') ||
      h.includes('comment')
    ) {
      if (colNote === -1) colNote = idx;
    }
  });

  // Secondary fallback for general contact columns if not explicitly labelled "booth" or "ticket"
  if (colBoothPhone === -1 && colTicketPhone === -1) {
    headers.forEach((h, idx) => {
      if (idx === colHome || idx === colAway || idx === colMatch || idx === colDate || idx === colDay || idx === colTime || idx === colStadium) return;
      if (h.includes('เบอร์') || h.includes('โทร') || h.includes('phone') || h.includes('tel') || h.includes('ติดต่อ') || h.includes('mobile')) {
        if (colBoothPhone === -1) {
          colBoothPhone = idx;
        } else if (colTicketPhone === -1) {
          colTicketPhone = idx;
        }
      }
      if (h.includes('ชื่อ') || h.includes('ผู้ประสาน') || h.includes('เจ้าหน้าที่') || h.includes('name')) {
        if (colBoothName === -1) {
          colBoothName = idx;
        } else if (colTicketName === -1) {
          colTicketName = idx;
        }
      }
    });
  }

  // If still not identified, standard Thai League fixture layout has booth contact at Col 9, ticket at Col 10, remark at Col 11
  if (colBoothPhone === -1 && colTicketPhone === -1 && rows.length > 2) {
    const sampleRow = rows[Math.min(3, rows.length - 1)];
    if (sampleRow && sampleRow.length >= 10) {
      if (colStadium >= 0 && colStadium <= 8) {
        if (sampleRow.length > colStadium + 1 && sampleRow[colStadium + 1]) {
          colBoothPhone = colStadium + 1;
          colBoothName = colStadium + 1;
        }
        if (sampleRow.length > colStadium + 2 && sampleRow[colStadium + 2]) {
          colTicketPhone = colStadium + 2;
          colTicketName = colStadium + 2;
        }
        if (colNote === -1 && sampleRow.length > colStadium + 3) {
          colNote = colStadium + 3;
        }
      } else if (sampleRow.length >= 11) {
        colBoothPhone = 9;
        colBoothName = 9;
        colTicketPhone = 10;
        colTicketName = 10;
        if (colNote === -1) colNote = 11;
      }
    }
  }

  if (colDate === -1 && colDay >= 0) {
    colDate = colDay;
  }

  // Robust split vs helper for various delimiters
  const splitVs = (text: string): { home: string; away: string } | null => {
    if (!text) return null;
    const clean = text.replace(/\u00a0/g, ' ').trim();
    const separators = [
      /\s+(?:vs\.?|v|พบกับ|พบ|–|—|-)\s+/i,
      /\s*(?:vs\.?|v|พบกับ|พบ)\s*/i,
      /\s+[–—-]\s+/,
      /\s*-\s*/,
      /\s*[–—]\s*/,
    ];
    for (const sep of separators) {
      if (sep.test(clean)) {
        const parts = clean.split(sep);
        if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
          return { home: parts[0].trim(), away: parts[1].trim() };
        }
      }
    }
    return null;
  };

  const parsedContacts: (Omit<MatchStadiumContact, 'id' | 'updatedAt'> & { id?: string })[] = [];
  const parsedLeagueHomeTeamContacts: LeagueHomeTeamContact[] = [];
  let lastSeenDate = '';
  const dataStartRow = isMergedHeader ? headerIndex + 2 : headerIndex + 1;

  for (let r = dataStartRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0 || row.every(c => !c.trim())) continue;

    let homeTeam = colHome >= 0 && row[colHome] ? row[colHome].trim() : '';
    let awayTeam = colAway >= 0 && row[colAway] ? row[colAway].trim() : '';

    if ((!homeTeam || !awayTeam) && colMatch >= 0 && row[colMatch]) {
      const split = splitVs(row[colMatch]);
      if (split) {
        homeTeam = homeTeam || split.home;
        awayTeam = awayTeam || split.away;
      }
    }

    if (!homeTeam || !awayTeam) {
      for (const cell of row) {
        if (!cell || cell.length > 80) continue;
        const split = splitVs(cell);
        if (split) {
          homeTeam = split.home;
          awayTeam = split.away;
          break;
        }
      }
    }

    // Check if this row is a date divider row or has date
    let rowDate = '';
    if (colDate >= 0 && row[colDate]) {
      rowDate = normalizeDate(row[colDate]);
    }
    if (!rowDate) {
      for (const cell of row) {
        const d = normalizeDate(cell);
        if (d) {
          rowDate = d;
          break;
        }
      }
    }

    if (rowDate) {
      lastSeenDate = rowDate;
    }

    // In Google Sheet "เบอร์ติดต่อหน้าสนาม", each row is identified by Home Team (ทีมเหย้า)
    if (!homeTeam) {
      if (row[0] && row[0].trim() && !isValidPhoneNumber(row[0]) && row[0].trim().length < 60) {
        homeTeam = row[0].trim();
      } else {
        continue;
      }
    }

    const matchDate = rowDate || lastSeenDate || '';
    const stadium = colStadium >= 0 && row[colStadium] ? row[colStadium].trim() : `สนามเหย้าสโมสร ${homeTeam}`;

    let boothCoordinatorName = colBoothName >= 0 && row[colBoothName] ? row[colBoothName].trim() : '';
    let ticketCoordinatorName = colTicketName >= 0 && row[colTicketName] ? row[colTicketName].trim() : '';

    let rawBoothPhone = colBoothPhone >= 0 && row[colBoothPhone] ? row[colBoothPhone].trim() : '';
    let rawTicketPhone = colTicketPhone >= 0 && row[colTicketPhone] ? row[colTicketPhone].trim() : '';

    let boothLocation = colBoothLoc >= 0 && row[colBoothLoc] ? row[colBoothLoc].trim() : '';
    let ticketLocation = colTicketLoc >= 0 && row[colTicketLoc] ? row[colTicketLoc].trim() : '';
    let operatingHours = colHours >= 0 && row[colHours] ? row[colHours].trim() : '';
    let extractedNote = colNote >= 0 && row[colNote] ? row[colNote].trim() : '';

    // 1. Process booth coordinator name & phone
    if (boothCoordinatorName) {
      const ext = extractPhoneAndName(boothCoordinatorName);
      if (ext.phone && !rawBoothPhone) rawBoothPhone = ext.phone;
      if (ext.name) boothCoordinatorName = ext.name;
      if (ext.location && !boothLocation) boothLocation = ext.location;
    }
    if (rawBoothPhone) {
      const ext = extractPhoneAndName(rawBoothPhone);
      if (ext.phone) {
        rawBoothPhone = ext.phone;
        if (!boothCoordinatorName && ext.name) boothCoordinatorName = ext.name;
        if (!boothLocation && ext.location) boothLocation = ext.location;
        if (!operatingHours && ext.hours) operatingHours = ext.hours;
      } else if (!isValidPhoneNumber(rawBoothPhone)) {
        rawBoothPhone = '';
      }
    }

    // 2. Process ticket coordinator name & phone
    if (ticketCoordinatorName) {
      const ext = extractPhoneAndName(ticketCoordinatorName);
      if (ext.phone && !rawTicketPhone) rawTicketPhone = ext.phone;
      if (ext.name) ticketCoordinatorName = ext.name;
      if (ext.location && !ticketLocation) ticketLocation = ext.location;
    }
    if (rawTicketPhone) {
      const ext = extractPhoneAndName(rawTicketPhone);
      if (ext.phone) {
        rawTicketPhone = ext.phone;
        if (!ticketCoordinatorName && ext.name) ticketCoordinatorName = ext.name;
        if (!ticketLocation && ext.location) ticketLocation = ext.location;
        if (!operatingHours && ext.hours) operatingHours = ext.hours;
        if (!extractedNote && ext.rawText && ext.rawText !== ext.phone) {
          extractedNote = ext.rawText;
        }
      } else if (!isValidPhoneNumber(rawTicketPhone)) {
        rawTicketPhone = '';
      }
    }

    // Row-level cell scan fallback: if booth or ticket phone is still missing, scan all cells for phone numbers
    if (!isValidPhoneNumber(rawBoothPhone) || !isValidPhoneNumber(rawTicketPhone)) {
      for (let c = 0; c < row.length; c++) {
        if (c === colHome || c === colAway || c === colMatch || c === colDate || c === colDay || c === colTime || c === colStadium) continue;
        const cell = row[c] ? row[c].trim() : '';
        if (isValidPhoneNumber(cell)) {
          const extracted = extractPhoneAndName(cell);
          if (extracted.phone) {
            if (!isValidPhoneNumber(rawBoothPhone)) {
              rawBoothPhone = extracted.phone;
              if (!boothCoordinatorName && extracted.name) boothCoordinatorName = extracted.name;
              if (!boothLocation && extracted.location) boothLocation = extracted.location;
            }
            if (!isValidPhoneNumber(rawTicketPhone)) {
              rawTicketPhone = extracted.phone;
              if (!ticketCoordinatorName && extracted.name) ticketCoordinatorName = extracted.name;
              if (!ticketLocation && extracted.location) ticketLocation = extracted.location;
            }
            if (extracted.rawText && !extractedNote) extractedNote = extracted.rawText;
            break;
          }
        }
      }
    }

    // Clean coordinator names from trailing phone numbers if phone was extracted
    if (boothCoordinatorName && rawBoothPhone) {
      const digits = rawBoothPhone.replace(/[^0-9]/g, '');
      if (digits.length >= 8) {
        boothCoordinatorName = boothCoordinatorName.replace(digits, '').replace(rawBoothPhone, '').trim();
      }
    }
    if (ticketCoordinatorName && rawTicketPhone) {
      const digits = rawTicketPhone.replace(/[^0-9]/g, '');
      if (digits.length >= 8) {
        ticketCoordinatorName = ticketCoordinatorName.replace(digits, '').replace(rawTicketPhone, '').trim();
      }
    }

    const boothPhoneValid = isValidPhoneNumber(rawBoothPhone);
    const ticketPhoneValid = isValidPhoneNumber(rawTicketPhone);

    const hasUpdatedContact = boothPhoneValid || ticketPhoneValid;

    const finalBoothName = boothCoordinatorName 
      || (boothPhoneValid ? 'เจ้าหน้าที่ดูแลบูธ' : (hasUpdatedContact ? '' : 'รออัปเดตจาก Google Sheet (เบอร์ติดต่อหน้าสนาม)'));
    const finalBoothPhone = boothPhoneValid ? formatPhoneNumber(rawBoothPhone) : '';

    const boothSetupLocation = boothLocation 
      || (boothPhoneValid ? 'ลานกิจกรรมหน้าทางเข้าอัฒจันทร์หลัก' : (hasUpdatedContact ? '' : 'ตามที่สนามกำหนด'));

    const finalTicketName = ticketCoordinatorName 
      || (ticketPhoneValid ? 'เจ้าหน้าที่รับบัตร' : (hasUpdatedContact ? '' : 'รออัปเดตจาก Google Sheet (เบอร์ติดต่อหน้าสนาม)'));
    const finalTicketPhone = ticketPhoneValid ? formatPhoneNumber(rawTicketPhone) : '';

    const ticketPickupLocation = ticketLocation 
      || (ticketPhoneValid ? 'ซุ้มตั๋วผู้สนับสนุนและพันธมิตร' : (hasUpdatedContact ? '' : 'เต็นท์อำนวยการหน้าสนาม'));

    const operatingHoursFinal = operatingHours || '14:00 - 19:30 น. (วันแข่งขัน)';
    let sheetRemark = colNote >= 0 && row[colNote] ? row[colNote].trim() : '';
    if (sheetRemark === '-' || sheetRemark === '--' || sheetRemark.toLowerCase() === 'n/a' || sheetRemark.toLowerCase() === 'null') {
      sheetRemark = '';
    }
    const finalRemark = sheetRemark || (extractedNote && extractedNote !== '-' && !extractedNote.startsWith('ข้อมูลจากแท็บ') ? extractedNote : '');
    const note = finalRemark || `ข้อมูลจากแท็บ ${tabName}`;

    const matchKey = generateMatchKey(matchDate, homeTeam, awayTeam);
    const id = `contact_${league.replace(/\s+/g, '')}_${matchKey}`;

    const boothRaw = colBoothPhone >= 0 && row[colBoothPhone] ? row[colBoothPhone].trim() : (boothCoordinatorName || rawBoothPhone);
    const ticketRaw = colTicketPhone >= 0 && row[colTicketPhone] ? row[colTicketPhone].trim() : (ticketCoordinatorName || rawTicketPhone);

    parsedContacts.push({
      id,
      fixtureId: '',
      matchTitle: awayTeam ? `${homeTeam} vs ${awayTeam}` : homeTeam,
      matchDate,
      stadiumName: stadium,
      league,
      homeClub: homeTeam,
      awayTeam,
      locationProvince: 'ประจำสนามแข่งขัน',
      boothCoordinatorName: finalBoothName,
      boothCoordinatorPhone: finalBoothPhone,
      boothSetupLocation,
      ticketCoordinatorName: finalTicketName,
      ticketCoordinatorPhone: finalTicketPhone,
      ticketPickupLocation,
      operatingHours: operatingHoursFinal,
      note,
      remark: finalRemark,
      updatedBy: `Google Sheet [${tabName}]`,
      hasUpdatedContact,
      sourceTab: tabName,
    });

    parsedLeagueHomeTeamContacts.push({
      id: `lht_${league.replace(/\s+/g, '')}_${cleanTeamName(homeTeam)}`,
      league,
      homeTeam,
      cleanHomeTeam: cleanTeamName(homeTeam),
      cleanHomeCore: cleanTeamCore(homeTeam),
      stadiumName: stadium,
      boothCoordinatorName: finalBoothName,
      boothCoordinatorPhone: finalBoothPhone,
      boothRawText: boothRaw,
      boothSetupLocation,
      ticketCoordinatorName: finalTicketName,
      ticketCoordinatorPhone: finalTicketPhone,
      ticketRawText: ticketRaw,
      ticketPickupLocation,
      operatingHours: operatingHoursFinal,
      remark: finalRemark,
      note,
      sourceTab: tabName,
      updatedAt: new Date().toISOString(),
    });
  }

  return { contacts: parsedContacts, leagueHomeTeamContacts: parsedLeagueHomeTeamContacts, detectedHeaders: headers };
}

// ---------------------------------------------------------------------------------------------------------------
// SYNC: read the contacts ONLY from the Google Sheet "เบอร์ติดต่อหน้าสนาม"
//   League 1 -> tab "League 1", League 2 -> tab "League 2", League 3 -> tab "League 3"
//   Columns (by header name): สโมสรทีมเหย้า | ชื่อ+เบอร์ติดต่อสำหรับออกบูธ | ชื่อ+เบอร์ติดต่อสำหรับรับบัตร | Remark
//   The data of a league is REPLACED by what the sheet says. Nothing is invented. A tab that cannot be read is
//   reported as an error and the previously synced data of that league is left untouched.
// ---------------------------------------------------------------------------------------------------------------
const LEAGUE_TAB_NAMES: Record<LeagueType, string[]> = {
  'League 1': ['league 1', 'league1'],
  'League 2': ['league 2', 'league2'],
  'League 3': ['league 3', 'league3'],
};

export async function syncStadiumContactsFromOfficialSheet(
  customUrlInput?: string,
  targetLeague: 'all' | 'League 1' | 'League 2' | 'League 3' = 'all'
): Promise<{
  success: boolean;
  count: number;
  contacts: MatchStadiumContact[];
  syncedTabs: string[];
  leagueCounts?: Record<LeagueType, number>;
  error?: string;
}> {
  const emptyCounts: Record<LeagueType, number> = { 'League 1': 0, 'League 2': 0, 'League 3': 0 };
  const fail = (error: string) => ({ success: false, count: 0, contacts: [] as MatchStadiumContact[], syncedTabs: [] as string[], leagueCounts: emptyCounts, error });

  const sheetUrl = (customUrlInput || getStadiumContactsSheetUrl() || '').trim();
  const { sheetId } = parseGoogleSheetUrl(sheetUrl);
  if (!sheetId) return fail('ลิงก์ Google Sheet "เบอร์ติดต่อหน้าสนาม" ไม่ถูกต้อง');
  setStadiumContactsSheetUrl(sheetUrl);

  // Tab discovery through the backend proxy (gives the gid of each tab)
  let discoveredTabs: { name: string; gid: string }[] = [];
  try {
    const res = await fetch(`/api/sheets/tabs?sheetId=${encodeURIComponent(sheetId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.tabs)) discoveredTabs = data.tabs;
    }
  } catch (err) {
    console.warn('Contacts sync: tab discovery failed, will try by tab name', err);
  }

  const leagues: LeagueType[] = targetLeague === 'all' ? ['League 1', 'League 2', 'League 3'] : [targetLeague];
  const errors: string[] = [];
  const syncedTabs: string[] = [];
  const leagueCounts: Record<LeagueType, number> = { ...emptyCounts };
  const newByLeague = new Map<LeagueType, LeagueHomeTeamContact[]>();
  const nowIso = new Date().toISOString();

  for (const league of leagues) {
    const wanted = LEAGUE_TAB_NAMES[league];
    const tab = discoveredTabs.find(t => wanted.includes((t.name || '').trim().toLowerCase()));
    const tabName = tab ? tab.name : league;

    const csv = await fetchSingleSheetText(sheetId, { gid: tab?.gid, sheetName: tabName });
    if (!csv) {
      errors.push(`${league}: เปิดแท็บ "${tabName}" ไม่ได้ (ตรวจว่าแท็บชื่อ League 1/2/3 และชีตตั้งสิทธิ์ "ทุกคนที่มีลิงก์ดูได้")`);
      continue;
    }

    const parsed = parseContactsTab(csv, league);
    if (!parsed.headerFound) {
      errors.push(`${league}: ไม่พบหัวคอลัมน์ "สโมสรทีมเหย้า" ในแท็บ "${tabName}"`);
      continue;
    }
    if (parsed.missingColumns.length > 0) {
      errors.push(`${league}: แท็บ "${tabName}" ไม่มีคอลัมน์ ${parsed.missingColumns.join(', ')}`);
      continue;
    }
    if (parsed.rows.length === 0) {
      errors.push(`${league}: แท็บ "${tabName}" ไม่มีแถวข้อมูลสโมสร`);
      continue;
    }

    const rows: LeagueHomeTeamContact[] = parsed.rows.map(r => ({
      id: `lht_${league.replace(/\s+/g, '')}_${exactClubKey(r.homeClub, league)}`,
      league,
      homeTeam: r.homeClub,
      cleanHomeTeam: cleanTeamName(r.homeClub),
      cleanHomeCore: cleanTeamCore(r.homeClub),
      boothCoordinatorName: r.boothName,
      boothCoordinatorPhone: r.boothPhone,
      boothRawText: r.boothRaw,
      ticketCoordinatorName: r.ticketName,
      ticketCoordinatorPhone: r.ticketPhone,
      ticketRawText: r.ticketRaw,
      remark: r.remark,
      sourceTab: tabName,
      updatedAt: nowIso,
    }));

    if (parsed.duplicates.length > 0) {
      // Never guess which of two rows is right
      errors.push(`${league}: มีสโมสรซ้ำในแท็บ "${tabName}" (${parsed.duplicates.join(', ')}) กรุณาแก้ในชีตให้เหลือแถวเดียว`);
      continue;
    }

    newByLeague.set(league, rows);
    leagueCounts[league] = rows.length;
    syncedTabs.push(tabName);
  }

  if (newByLeague.size > 0) {
    const kept = getStoredLeagueHomeTeamContacts().filter(c => !newByLeague.has(c.league));
    saveLeagueHomeTeamContacts([...kept, ...Array.from(newByLeague.values()).flat()]);

    const total = getStoredLeagueHomeTeamContacts().length;
    cachedContactsMeta = {
      source: 'google-sheet',
      sheetUrl,
      syncedTabs,
      tabName: syncedTabs.join(', '),
      lastSyncedAt: new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }),
      count: total,
      statusMessage:
        errors.length === 0
          ? `ซิงค์จากชีต "เบอร์ติดต่อหน้าสนาม" สำเร็จ (${total} สโมสร) จับคู่ตามคอลัมน์ "สโมสรทีมเหย้า"`
          : `ซิงค์ได้บางส่วน: ${errors.join(' | ')}`,
    };
    localStorage.setItem(LOCAL_CONTACTS_SYNC_META_KEY, JSON.stringify(cachedContactsMeta));
    notifySyncListeners();
  }

  const count = Object.values(leagueCounts).reduce((a, b) => a + b, 0);
  return {
    success: errors.length === 0,
    count,
    contacts: [],
    syncedTabs,
    leagueCounts,
    error: errors.length > 0 ? `${errors.join(' | ')}${newByLeague.size > 0 ? ' (ลีกที่อ่านสำเร็จถูกบันทึกแล้ว)' : ''}` : undefined,
  };
}

export interface ContactLookupParams {
  stadiumName?: string;
  homeClub?: string;
  awayTeam?: string;
  matchDate?: string;
  league?: LeagueType;
  fixtureId?: string;
  customList?: MatchStadiumContact[];
}

export interface StadiumContactLookupResult extends StadiumContact {
  hasUpdatedContact: boolean;
  sourceTab?: string;
  isWeeklyConfirmed?: boolean;
  confirmedWeekKey?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  weekLabel?: string;
  weekRangeText?: string;
}

/**
 * Contact of a match = the row of the HOME club (คอลัมน์ "สโมสรทีมเหย้า") in the contacts sheet, same league.
 * e.g. ราชบุรี เอฟซี vs สุโขทัย เอฟซี  ->  contact of ราชบุรี เอฟซี.
 * If the sheet has no row for that club, every field stays empty (no default names, phones or places).
 */
export function findContactForStadiumOrMatch(params: ContactLookupParams): StadiumContactLookupResult {
  const { stadiumName, homeClub, matchDate, league, fixtureId } = params;
  const weekInfo = getCurrentWeekInfo(matchDate);
  const matchConfirmStatus = isMatchContactConfirmed({
    fixtureId,
    matchDate,
    homeClub,
    stadiumName,
    weekKey: weekInfo.weekKey,
  });

  const row = findLeagueHomeTeamContact(league, homeClub);
  const hasAny = Boolean(row && (row.boothRawText || row.ticketRawText || row.remark));

  return {
    id: row ? row.id : `no-contact_${league || ''}_${homeClub || ''}`,
    stadiumName: stadiumName || '',
    league: league || 'League 1',
    homeClub: homeClub || '',
    locationProvince: '',
    boothCoordinatorName: row?.boothCoordinatorName || '',
    boothCoordinatorPhone: row?.boothCoordinatorPhone || '',
    boothSetupLocation: '',
    ticketCoordinatorName: row?.ticketCoordinatorName || '',
    ticketCoordinatorPhone: row?.ticketCoordinatorPhone || '',
    ticketPickupLocation: row?.remark || '', // the sheet's Remark column tells where / how to collect tickets
    operatingHours: '',
    note: row?.remark || '',
    remark: row?.remark || '',
    hasUpdatedContact: Boolean(matchConfirmStatus.isConfirmed && hasAny),
    sourceTab: row ? `ชีตเบอร์ติดต่อหน้าสนาม (${row.sourceTab})` : 'ไม่พบสโมสรนี้ในชีตเบอร์ติดต่อหน้าสนาม',
    isWeeklyConfirmed: matchConfirmStatus.isConfirmed,
    confirmedWeekKey: matchConfirmStatus.confirmedWeekKey,
    confirmedAt: matchConfirmStatus.confirmedAt,
    confirmedBy: matchConfirmStatus.confirmedBy,
    weekLabel: weekInfo.weekLabel,
    weekRangeText: weekInfo.weekRangeText,
  };
}

/**
 * Keeps the contacts in step with the Google Sheet: sync when the app opens, then every 10 minutes.
 * Errors are not hidden: they are written to the sync status (getStadiumContactsSyncMeta().statusMessage).
 */
export function initContactsAutoSync(intervalMinutes = 10): () => void {
  let stopped = false;
  const run = async () => {
    if (stopped) return;
    try {
      const res = await syncStadiumContactsFromOfficialSheet();
      if (!res.success) {
        cachedContactsMeta = { ...cachedContactsMeta, statusMessage: `ซิงค์เบอร์ติดต่ออัตโนมัติไม่สำเร็จ: ${res.error || 'ไม่ทราบสาเหตุ'}` };
        localStorage.setItem(LOCAL_CONTACTS_SYNC_META_KEY, JSON.stringify(cachedContactsMeta));
        notifySyncListeners();
      }
    } catch (err) {
      console.warn('Contacts auto-sync failed', err);
    }
  };
  run();
  const timer = setInterval(run, Math.max(1, intervalMinutes) * 60 * 1000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
