import { RegistrationRecord, SeasonInfo, SeasonSummary, SeasonBrandStats, LeagueType, MonthlySummary, FixtureItem } from '../types';
import { SPONSOR_BRANDS } from '../data/fixtures';

export const DEFAULT_SEASON = '2026/27';

export const ACTIVE_SEASON_STORAGE_KEY = 'thaileague_active_registration_season';

type ActiveSeasonListener = (seasonId: string) => void;
const activeSeasonListeners: Set<ActiveSeasonListener> = new Set();

let cachedActiveSeason: string = loadStoredActiveSeason();

function loadStoredActiveSeason(): string {
  try {
    const stored = localStorage.getItem(ACTIVE_SEASON_STORAGE_KEY);
    if (stored && stored.trim()) {
      return stored.trim();
    }
  } catch (e) {
    // Ignore error
  }
  return DEFAULT_SEASON;
}

/**
 * Returns the current active registration season (e.g. "2026/27" or "2027/28")
 */
export function getActiveRegistrationSeason(): string {
  return cachedActiveSeason;
}

/**
 * Sets and broadcasts the active registration season.
 * Updates local storage and triggers listeners so all UI elements (like sidebar header) update immediately.
 */
export function setActiveRegistrationSeason(seasonId: string): void {
  const cleanId = seasonId?.trim();
  if (!cleanId || cleanId === cachedActiveSeason) return;

  cachedActiveSeason = cleanId;
  try {
    localStorage.setItem(ACTIVE_SEASON_STORAGE_KEY, cleanId);
  } catch (e) {
    // Ignore error
  }

  activeSeasonListeners.forEach((listener) => {
    try {
      listener(cleanId);
    } catch (e) {
      console.error(e);
    }
  });
}

/**
 * Subscribes to changes in the active registration season.
 */
export function subscribeToActiveSeason(listener: ActiveSeasonListener): () => void {
  activeSeasonListeners.add(listener);
  try {
    listener(cachedActiveSeason);
  } catch (e) {
    console.error(e);
  }
  return () => {
    activeSeasonListeners.delete(listener);
  };
}

/**
 * Converts a season string (e.g. "2026/27", "2027/28", "2026-27") into a short 2-digit format (e.g. "26/27", "27/28").
 */
export function getSeasonShort(seasonId?: string): string {
  const s = (seasonId || cachedActiveSeason || DEFAULT_SEASON).trim();
  if (!s) return '26/27';

  // Already "26/27" or "27/28"
  if (/^\d{2}\/\d{2}$/.test(s)) {
    return s;
  }

  // "2026/27" or "2026/2027"
  if (s.includes('/')) {
    const parts = s.split('/');
    const y1 = parts[0].trim().slice(-2);
    const y2 = parts[1].trim().slice(-2);
    return `${y1}/${y2}`;
  }

  // "2026-27" or "2026-2027"
  if (s.includes('-')) {
    const parts = s.split('-');
    const y1 = parts[0].trim().slice(-2);
    const y2 = parts[1].trim().slice(-2);
    return `${y1}/${y2}`;
  }

  return s.slice(-5);
}

/**
 * Inspects a list of fixtures to detect which season they belong to.
 * Returns the detected season string (e.g. "2027/28").
 */
export function detectSeasonFromFixtures(fixtures: FixtureItem[]): string | null {
  if (!fixtures || fixtures.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const f of fixtures) {
    const date = f.matchDate || f.month;
    if (date) {
      const s = getSeasonFromDate(date);
      counts[s] = (counts[s] || 0) + 1;
    }
  }

  const entries = Object.entries(counts);
  if (entries.length === 0) return null;

  // Sort by count descending, then by season string descending (prefer newer season)
  entries.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0].localeCompare(a[0]);
  });

  return entries[0][0];
}

/**
 * Automatically updates the active registration season if the given fixtures indicate a new season.
 */
export function autoUpdateSeasonFromFixtures(fixtures: FixtureItem[]): string | null {
  const detected = detectSeasonFromFixtures(fixtures);
  if (detected && detected !== cachedActiveSeason) {
    setActiveRegistrationSeason(detected);
    return detected;
  }
  return null;
}

// 12 Seasons covering historical and future 10+ years (2024/25 to 2035/36)
export const TOTAL_LEAGUE_MATCHES: Record<LeagueType, number> = {
  'League 1': 240,
  'League 2': 306,
  'League 3': 728,
};
export const TOTAL_SEASON_MATCHES = 1274; // 240 + 306 + 728 (ตามชีตทางการ)

/**
 * Checks if a registration record has a valid active booth request.
 * Matches where customer entered "-" or empty for dealer name are NOT counted.
 */
export function isRecordBoothActive(rec: { boothRequired?: boolean; dealerName?: string }): boolean {
  if (!rec.boothRequired) return false;
  const d = (rec.dealerName || '').trim();
  if (!d) return false;
  if (d === '-' || d === '–' || d === '—' || d.toLowerCase() === 'n/a' || d === 'ไม่มี' || d === 'ไม่มีการออกบูธ') {
    return false;
  }
  return true;
}

/**
 * Checks if a registration record has a valid active ticket request.
 * Matches where customer entered 0 or <= 0 for ticket quantity are NOT counted.
 */
export function isRecordTicketActive(rec: { ticketRequired?: boolean; ticketQuantity?: number }): boolean {
  if (!rec.ticketRequired) return false;
  const qty = Number(rec.ticketQuantity);
  if (isNaN(qty) || qty <= 0) return false;
  return true;
}

export const SUPPORTED_SEASONS: SeasonInfo[] = [
  { id: '2024/25', label: 'ฤดูกาล 2024/25', startYear: 2024, endYear: 2025 },
  { id: '2025/26', label: 'ฤดูกาล 2025/26', startYear: 2025, endYear: 2026 },
  { id: '2026/27', label: 'ฤดูกาล 2026/27 (ปัจจุบัน)', startYear: 2026, endYear: 2027, isCurrent: true },
  { id: '2027/28', label: 'ฤดูกาล 2027/28', startYear: 2027, endYear: 2028 },
  { id: '2028/29', label: 'ฤดูกาล 2028/29', startYear: 2028, endYear: 2029 },
  { id: '2029/30', label: 'ฤดูกาล 2029/30', startYear: 2029, endYear: 2030 },
  { id: '2030/31', label: 'ฤดูกาล 2030/31', startYear: 2030, endYear: 2031 },
  { id: '2031/32', label: 'ฤดูกาล 2031/32', startYear: 2031, endYear: 2032 },
  { id: '2032/33', label: 'ฤดูกาล 2032/33', startYear: 2032, endYear: 2033 },
  { id: '2033/34', label: 'ฤดูกาล 2033/34', startYear: 2033, endYear: 2034 },
  { id: '2034/35', label: 'ฤดูกาล 2034/35', startYear: 2034, endYear: 2035 },
  { id: '2035/36', label: 'ฤดูกาล 2035/36 (10 ปี)', startYear: 2035, endYear: 2036 },
];

const THAI_MONTHS = [
  { name: 'มกราคม', short: 'ม.ค.', en: 'Jan' },
  { name: 'กุมภาพันธ์', short: 'ก.พ.', en: 'Feb' },
  { name: 'มีนาคม', short: 'มี.ค.', en: 'Mar' },
  { name: 'เมษายน', short: 'เม.ย.', en: 'Apr' },
  { name: 'พฤษภาคม', short: 'พ.ค.', en: 'May' },
  { name: 'มิถุนายน', short: 'มิ.ย.', en: 'Jun' },
  { name: 'กรกฎาคม', short: 'ก.ค.', en: 'Jul' },
  { name: 'สิงหาคม', short: 'ส.ค.', en: 'Aug' },
  { name: 'กันยายน', short: 'ก.ย.', en: 'Sep' },
  { name: 'ตุลาคม', short: 'ต.ค.', en: 'Oct' },
  { name: 'พฤศจิกายน', short: 'พ.ย.', en: 'Nov' },
  { name: 'ธันวาคม', short: 'ธ.ค.', en: 'Dec' },
];

export interface SeasonMonthItem {
  key: string; // e.g. "2026-08"
  year: number;
  monthIndex: number; // 0-11
  nameThai: string; // e.g. "สิงหาคม 2569 (Aug 2026)"
  shortThai: string; // e.g. "ส.ค. 69"
}

/**
 * Returns the sequence of months in a Thai League season.
 * A football season typically runs from August of startYear to May of endYear.
 */
export function getSeasonMonths(seasonId: string): SeasonMonthItem[] {
  const season = SUPPORTED_SEASONS.find(s => s.id === seasonId) || SUPPORTED_SEASONS.find(s => s.isCurrent)!;
  const startY = season.startYear;
  const endY = season.endYear;

  const months: SeasonMonthItem[] = [];

  // August to December of startYear
  for (let m = 7; m <= 11; m++) {
    const monthNum = String(m + 1).padStart(2, '0');
    const thaiBE = startY + 543;
    const shortBE = String(thaiBE).slice(-2);
    months.push({
      key: `${startY}-${monthNum}`,
      year: startY,
      monthIndex: m,
      nameThai: `${THAI_MONTHS[m].name} ${thaiBE} (${THAI_MONTHS[m].en} ${startY})`,
      shortThai: `${THAI_MONTHS[m].short} ${shortBE}`,
    });
  }

  // January to May of endYear
  for (let m = 0; m <= 4; m++) {
    const monthNum = String(m + 1).padStart(2, '0');
    const thaiBE = endY + 543;
    const shortBE = String(thaiBE).slice(-2);
    months.push({
      key: `${endY}-${monthNum}`,
      year: endY,
      monthIndex: m,
      nameThai: `${THAI_MONTHS[m].name} ${thaiBE} (${THAI_MONTHS[m].en} ${endY})`,
      shortThai: `${THAI_MONTHS[m].short} ${shortBE}`,
    });
  }

  return months;
}

/**
 * Derives the season string (e.g. "2026/27") from a date string (YYYY-MM-DD or YYYY-MM)
 */
export function getSeasonFromDate(dateStr?: string): string {
  if (!dateStr) return DEFAULT_SEASON;
  const parts = dateStr.split('-');
  if (parts.length < 2) return DEFAULT_SEASON;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);

  if (isNaN(year) || isNaN(month)) return DEFAULT_SEASON;

  // If August (month 8) or later, it belongs to year / (year + 1)
  if (month >= 7) {
    const nextYY = String(year + 1).slice(-2);
    return `${year}/${nextYY}`;
  } else {
    // If before August (Jan-Jun), it belongs to (year - 1) / year
    const currYY = String(year).slice(-2);
    return `${year - 1}/${currYY}`;
  }
}

/**
 * Determines which season a registration record belongs to
 */
export function getRecordSeason(record: RegistrationRecord): string {
  if (record.season && record.season.trim()) {
    return record.season.trim();
  }
  return getSeasonFromDate(record.matchDate || record.month || record.createdAt);
}

/**
 * Aggregates all statistics for the entire season
 */
export function computeSeasonSummary(
  seasonId: string,
  records: RegistrationRecord[],
  selectedLeague: LeagueType | 'All' = 'All'
): SeasonSummary {
  const seasonInfo = SUPPORTED_SEASONS.find(s => s.id === seasonId) || {
    id: seasonId,
    label: `ฤดูกาล ${seasonId}`,
    startYear: parseInt(seasonId.split('/')[0]) || 2026,
    endYear: parseInt(seasonId.split('/')[0]) + 1 || 2027,
  };

  // 1. Filter by season
  const seasonRecords = records.filter(r => {
    const s = getRecordSeason(r);
    const matchesSeason = s === seasonId;
    if (!matchesSeason) return false;
    if (selectedLeague !== 'All' && r.league !== selectedLeague) return false;
    return true;
  });

  // Standard brand map
  const standardBrands = SPONSOR_BRANDS.map(b => b.id);
  const brandStatsMap: Record<string, SeasonBrandStats> = {};

  // Initialize with standard sponsors
  standardBrands.forEach(b => {
    brandStatsMap[b] = {
      brand: b,
      totalRegistrations: 0,
      totalBooths: 0,
      totalTickets: 0,
      approvedBooths: 0,
      approvedTickets: 0,
      byLeague: {
        'League 1': { booths: 0, tickets: 0 },
        'League 2': { booths: 0, tickets: 0 },
        'League 3': { booths: 0, tickets: 0 },
      },
    };
  });

  let totalRegistrations = 0;
  let totalBooths = 0;
  let totalTickets = 0;
  let approvedRegistrations = 0;

  const byLeague = {
    'League 1': { registrations: 0, booths: 0, tickets: 0 },
    'League 2': { registrations: 0, booths: 0, tickets: 0 },
    'League 3': { registrations: 0, booths: 0, tickets: 0 },
  };

  seasonRecords.forEach(rec => {
    totalRegistrations++;
    const isApproved = rec.status === 'approved';
    if (isApproved) approvedRegistrations++;

    const isBooth = isRecordBoothActive(rec);
    const isTicket = isRecordTicketActive(rec);
    const bReq = isBooth ? 1 : 0;
    const tQty = isTicket ? (Number(rec.ticketQuantity) || 0) : 0;

    totalBooths += bReq;
    totalTickets += tQty;

    if (byLeague[rec.league]) {
      byLeague[rec.league].registrations++;
      byLeague[rec.league].booths += bReq;
      byLeague[rec.league].tickets += tQty;
    }

    // Brand mapping
    const bName = rec.brand || 'อื่น ๆ';
    if (!brandStatsMap[bName]) {
      brandStatsMap[bName] = {
        brand: bName,
        totalRegistrations: 0,
        totalBooths: 0,
        totalTickets: 0,
        approvedBooths: 0,
        approvedTickets: 0,
        byLeague: {
          'League 1': { booths: 0, tickets: 0 },
          'League 2': { booths: 0, tickets: 0 },
          'League 3': { booths: 0, tickets: 0 },
        },
      };
    }

    const bStat = brandStatsMap[bName];
    bStat.totalRegistrations++;
    bStat.totalBooths += bReq;
    bStat.totalTickets += tQty;
    if (isApproved) {
      bStat.approvedBooths += bReq;
      bStat.approvedTickets += tQty;
    }

    if (bStat.byLeague[rec.league]) {
      bStat.byLeague[rec.league].booths += bReq;
      bStat.byLeague[rec.league].tickets += tQty;
    }
  });

  // Monthly breakdown for this season
  const seasonMonths = getSeasonMonths(seasonId);
  const monthlyBreakdown = seasonMonths.map(m => {
    const monthRecs = seasonRecords.filter(r => (r.month === m.key) || (r.matchDate && r.matchDate.startsWith(m.key)));
    let booths = 0;
    let tickets = 0;
    monthRecs.forEach(r => {
      if (isRecordBoothActive(r)) booths++;
      if (isRecordTicketActive(r)) tickets += (Number(r.ticketQuantity) || 0);
    });

    return {
      monthKey: m.key,
      monthNameThai: m.nameThai,
      shortThai: m.shortThai,
      totalRegistrations: monthRecs.length,
      totalBooths: booths,
      totalTickets: tickets,
    };
  });

  return {
    seasonId,
    seasonLabel: seasonInfo.label,
    totalRegistrations,
    totalBooths,
    totalTickets,
    approvedRegistrations,
    byLeague,
    brandStats: Object.values(brandStatsMap),
    monthlyBreakdown,
  };
}

/**
 * Computes detailed monthly summary for drill-down within a season
 */
export function computeMonthSummary(
  monthKey: string,
  records: RegistrationRecord[],
  selectedLeague: LeagueType | 'All' = 'All'
): MonthlySummary {
  const filtered = records.filter(r => {
    const match = (r.month === monthKey) || (r.matchDate && r.matchDate.startsWith(monthKey));
    if (!match) return false;
    if (selectedLeague !== 'All' && r.league !== selectedLeague) return false;
    return true;
  });

  const standardBrands = SPONSOR_BRANDS.map(b => b.id);
  const byBrand: Record<string, number> = {};
  standardBrands.forEach(b => { byBrand[b] = 0; });

  const byLeague = {
    'League 1': { registrations: 0, booths: 0, tickets: 0 },
    'League 2': { registrations: 0, booths: 0, tickets: 0 },
    'League 3': { registrations: 0, booths: 0, tickets: 0 },
  };

  const byStatus = { approved: 0, pending: 0, rejected: 0 };
  let totalBooths = 0;
  let totalTickets = 0;

  filtered.forEach(r => {
    const isBooth = isRecordBoothActive(r);
    const isTicket = isRecordTicketActive(r);

    if (isBooth) totalBooths++;
    if (isTicket) totalTickets += (Number(r.ticketQuantity) || 0);

    if (byLeague[r.league]) {
      byLeague[r.league].registrations++;
      if (isBooth) byLeague[r.league].booths++;
      if (isTicket) byLeague[r.league].tickets += (Number(r.ticketQuantity) || 0);
    }

    if (r.brand) {
      byBrand[r.brand] = (byBrand[r.brand] || 0) + 1;
    }

    if (r.status === 'approved') byStatus.approved++;
    else if (r.status === 'rejected') byStatus.rejected++;
    else byStatus.pending++;
  });

  return {
    monthKey,
    monthNameThai: monthKey,
    totalRegistrations: filtered.length,
    totalBooths,
    totalTickets,
    byLeague,
    byBrand,
    byStatus,
  };
}
