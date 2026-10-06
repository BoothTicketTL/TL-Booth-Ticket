import { FixtureItem, LeagueType } from '../types';
import { THAI_LEAGUE_FIXTURES } from '../data/fixtures';
import { MASTER_SEASON_FIXTURES } from '../data/masterFixturesData';
import { INITIAL_STADIUM_CONTACTS } from '../data/stadiumContacts';
import { isOfficialSeasonClub, getCanonicalOfficialClub } from '../data/officialSeasonClubs';
import { initFirebaseService } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { autoUpdateSeasonFromFixtures, getSeasonFromDate } from './seasonService';
import { getL3ZoneSummaries, identifyL3Zone } from './l3SeasonFixturesGenerator';
import { parseFixtureSheet } from './sheetFixtureParser';

export interface TabSyncSummary {
  name: string;
  gid?: string;
  count: number;
}

export interface FixturesSyncMeta {
  source: 'default' | 'google-sheet' | 'manual-import';
  sheetUrl: string;
  sheetT1T2Url?: string; // ลิงก์หลัก 1: Thai League 1 & 2 FIXTURES 2026/27 (แท็บ T1-(THA) และ T2-(THA))
  sheetT3Url?: string;   // ลิงก์หลัก 2: BYD DOLPHIN LEAGUE III FIXTURES 2026/27 (UPDATE 11 AUG 2026)
  sheetUrlsByLeague: Record<LeagueType, string>;
  lastSyncedAt?: string;
  matchCount: number;
  leagueCounts: Record<LeagueType, number>;
  statusMessage?: string;
  detectedTabsL3?: TabSyncSummary[]; // รายชื่อแท็บและจำนวนแมตช์ที่ดึงได้จากชีต BYD Dolphin L3
}

export interface AutoSyncConfig {
  enabled: boolean;
  onPageLoad: boolean;
  intervalMinutes: number; // 0 = disabled interval (page load only), 15, 30, 60, 120
  lastAutoCheckedAt?: string;
  lastAutoCheckStatus?: 'idle' | 'checking' | 'success' | 'failed';
  lastAutoCheckMessage?: string;
}

export interface AutoSyncEvent {
  status: 'idle' | 'checking' | 'success' | 'failed';
  message?: string;
  checkedAt?: string;
  hasChanges?: boolean;
  updatedCount?: number;
}

const LOCAL_FIXTURES_KEY = 'thaileague_2026_27_custom_fixtures';
const LOCAL_FIXTURES_META_KEY = 'thaileague_2026_27_fixtures_meta';
const LOCAL_FIXTURES_SHEET_URL_KEY = 'thaileague_2026_27_fixtures_sheet_url';
const LOCAL_FIXTURES_URL_T1T2_KEY = 'thaileague_fixtures_url_t1t2';
const LOCAL_FIXTURES_URL_T3_BYD_KEY = 'thaileague_fixtures_url_t3_byd';
const LOCAL_FIXTURES_URL_L1_KEY = 'thaileague_fixtures_url_league1';
const LOCAL_FIXTURES_URL_L2_KEY = 'thaileague_fixtures_url_league2';
const LOCAL_FIXTURES_URL_L3_KEY = 'thaileague_fixtures_url_league3';
const LOCAL_FIXTURES_AUTOSYNC_KEY = 'thaileague_fixtures_autosync_config';
const LOCAL_FIXTURES_LAST_AUTOSYNC_TIMESTAMP = 'thaileague_fixtures_last_autosync_ts';

type FixturesListener = (fixtures: FixtureItem[], meta: FixturesSyncMeta) => void;
const fixturesListeners: Set<FixturesListener> = new Set();

type AutoSyncListener = (config: AutoSyncConfig, event?: AutoSyncEvent) => void;
const autoSyncListeners: Set<AutoSyncListener> = new Set();

/**
 * Normalizes club name for robust matching across sheets
 */
function normClub(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/สโมสรฟุตบอล|สโมสร|เอฟซี|ยูไนเต็ด|fc|utd|city|ซิตี้/g, '')
    .replace(/[^a-z0-9\u0E00-\u0E7F]/g, '');
}

export const BANNED_HALLUCINATED_CLUBS = [
  'มาริน่า ปากน้ำโพ',
  'โบลาเวน สมุทรปราการ',
  'สิงห์ ระฆังทอง เมืองกาญจน์',
  'สิงห์ ระฆังทอง',
  'มาริน่า',
  'โบลาเวน',
];

/**
 * Check whether a club is disallowed.
 * Per user strict brief: any club outside the 103 official season clubs is strictly banned and cut out!
 */
export function isBannedClub(name: string): boolean {
  if (!name || !name.trim()) return true;
  if (BANNED_HALLUCINATED_CLUBS.some(b => name.includes(b))) return true;
  return !isOfficialSeasonClub(name);
}

/**
 * Merges incoming live/sheet fixtures for a specific league.
 * When incoming fixtures are provided, they are prioritized 100% and never discarded.
 * Banned hallucinated clubs are strictly filtered out.
 */
/**
 * Merges incoming live/sheet fixtures for a specific league without duplicate records.
 * Per user strict specification:
 * - "ถ้ากดซิงค์ข้อมูลจากลิงก์คู่แข่งขันไหนที่มีอยู่แล้วและไม่มีการเปลี่ยนแปลงห้ามดึงข้อมูลมาซ้ำ ให้ดึงมาแค่ข้อมูลคู่แข่งขันที่มีการแก้ไข"
 * - "ห้ามสร้าง mock data หรือข้อมูลตัวอย่างทุกกรณี ถ้าดึงไม่สำเร็จให้แสดงข้อความ error แทน"
 * - Match identity is uniquely defined by: (league, homeTeam, awayTeam)
 * - If identical (date, time, stadium, remark unchanged): keep existing, DO NOT DUPLICATE!
 * - If modified: update fields only!
 * - No matches on 1-8 Oct 2026 for League 1 and League 2!
 */
export function mergeIncomingWithMasterSeasonFixtures(
  incoming: FixtureItem[],
  league: LeagueType,
  existingFixtures?: FixtureItem[]
): FixtureItem[] {
  // The incoming sheet data is authoritative: it replaces what the site had for this league
  // (matches removed from the sheet disappear; changed date/time/venue follow the sheet).
  const cleanIncoming = (incoming || []).filter(f => f.homeTeam && f.awayTeam);

  if (cleanIncoming.length > 0) {
    const resultMap = new Map<string, FixtureItem>();
    cleanIncoming.forEach(inc => {
      const hCan = getCanonicalOfficialClub(inc.homeTeam)?.name || inc.homeTeam.trim();
      const aCan = getCanonicalOfficialClub(inc.awayTeam)?.name || inc.awayTeam.trim();
      resultMap.set(`${league}_${hCan}_${aCan}`, {
        ...inc,
        homeTeam: hCan,
        awayTeam: aCan,
        league,
        id: inc.id || `gs-${league.replace(/\s+/g, '').toLowerCase()}-${inc.matchDate}-${hCan.replace(/\s+/g, '').slice(0, 8)}`,
      });
    });
    return Array.from(resultMap.values()).sort(
      (a, b) => (a.matchDate || '').localeCompare(b.matchDate || '') || (a.matchTime || '').localeCompare(b.matchTime || '')
    );
  }

  // If no incoming provided, return existing clean fixtures
  if (existingFixtures && existingFixtures.length > 0) {
    const existing = existingFixtures.filter(f => f.league === league);
    if (existing.length > 0) return existing;
  }

  // Fallback to canonical default fixtures (NO mock data generated!)
  return THAI_LEAGUE_FIXTURES.filter(f => f.league === league).map(f => ({ ...f }));
}

const LOCAL_FIXTURES_SCHEMA_KEY = 'thaileague_fixtures_schema';
const FIXTURES_SCHEMA_VERSION = 'sheet-v1';

function safeStorageGet(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, val: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, val);
  } catch {}
}

// In-memory cache
let cachedFixtures: FixtureItem[] = loadStoredFixtures();
let cachedMeta: FixturesSyncMeta = loadStoredMeta();
let cachedAutoSyncConfig: AutoSyncConfig = loadStoredAutoSyncConfig();
let isAutoSyncRunning = false;
let isAutoSyncInitialized = false;

function loadStoredFixtures(): FixtureItem[] {
  try {
    const raw = safeStorageGet(LOCAL_FIXTURES_KEY);
    let parsed: FixtureItem[] = [];
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) parsed = data;
    }

    // One-time cleanup: older versions saved an AI-generated sample schedule for the 2026/27 season.
    // Remove those sample matches (anything in 2026/27 that did not come from the Google Sheets);
    // fixtures of other seasons are kept. The next sheet sync refills 2026/27 with real data.
    if (safeStorageGet(LOCAL_FIXTURES_SCHEMA_KEY) !== FIXTURES_SCHEMA_VERSION) {
      parsed = parsed.filter(f => !(getSeasonFromDate(f.matchDate) === '2026/27' && !String(f.id || '').startsWith('sheet-')));
      safeStorageSet(LOCAL_FIXTURES_KEY, JSON.stringify(parsed));
      safeStorageSet(LOCAL_FIXTURES_SCHEMA_KEY, FIXTURES_SCHEMA_VERSION);
    }

    const valid = parsed.filter(f => f && f.id && f.homeTeam && f.awayTeam && f.matchDate);
    if (valid.length > 0) return valid;
  } catch (e) {
    console.error('Error loading stored fixtures:', e);
  }
  return MASTER_SEASON_FIXTURES.map(f => ({ ...f }));
}

function countLeagues(fixtures: FixtureItem[]): Record<LeagueType, number> {
  const counts: Record<LeagueType, number> = {
    'League 1': 0,
    'League 2': 0,
    'League 3': 0,
  };
  fixtures.forEach(f => {
    if (counts[f.league] !== undefined) {
      counts[f.league]++;
    }
  });
  return counts;
}

function loadStoredMeta(): FixturesSyncMeta {
  const defaultSheetUrl = safeStorageGet(LOCAL_FIXTURES_SHEET_URL_KEY) || 
    safeStorageGet('thaileague_2026_27_backend_sheets_url') || 
    'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing';

  const defaultUrlsByLeague: Record<LeagueType, string> = {
    'League 1': safeStorageGet(LOCAL_FIXTURES_URL_L1_KEY) || defaultSheetUrl,
    'League 2': safeStorageGet(LOCAL_FIXTURES_URL_L2_KEY) || '',
    'League 3': safeStorageGet(LOCAL_FIXTURES_URL_L3_KEY) || safeStorageGet(LOCAL_FIXTURES_URL_T3_BYD_KEY) || '',
  };

  const storedT1T2 = safeStorageGet(LOCAL_FIXTURES_URL_T1T2_KEY) || defaultSheetUrl;
  const storedT3 = safeStorageGet(LOCAL_FIXTURES_URL_T3_BYD_KEY) || '';

  const activeFixtures = cachedFixtures || THAI_LEAGUE_FIXTURES;
  const actualLeagueCounts = countLeagues(activeFixtures);
  const actualMatchCount = activeFixtures.length;

  try {
    const raw = safeStorageGet(LOCAL_FIXTURES_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        sheetT1T2Url: parsed.sheetT1T2Url || storedT1T2,
        sheetT3Url: parsed.sheetT3Url || storedT3,
        sheetUrlsByLeague: {
          ...defaultUrlsByLeague,
          ...(parsed.sheetUrlsByLeague || {}),
        },
        matchCount: actualMatchCount,
        leagueCounts: {
          'League 1': actualLeagueCounts['League 1'],
          'League 2': actualLeagueCounts['League 2'],
          'League 3': actualLeagueCounts['League 3'],
        },
      };
    }
  } catch (e) {
    console.error('Error loading fixtures meta:', e);
  }
    
  return {
    source: 'default',
    sheetUrl: defaultSheetUrl,
    sheetT1T2Url: storedT1T2,
    sheetT3Url: storedT3,
    sheetUrlsByLeague: defaultUrlsByLeague,
    matchCount: actualMatchCount,
    leagueCounts: {
      'League 1': actualLeagueCounts['League 1'],
      'League 2': actualLeagueCounts['League 2'],
      'League 3': actualLeagueCounts['League 3'],
    },
    statusMessage: `ตารางการแข่งขันพร้อมใช้งาน (รวม ${actualMatchCount} คู่: L1: ${actualLeagueCounts['League 1']} | L2: ${actualLeagueCounts['League 2']} | L3: ${actualLeagueCounts['League 3']})`,
  };
}

function loadStoredAutoSyncConfig(): AutoSyncConfig {
  try {
    const raw = safeStorageGet(LOCAL_FIXTURES_AUTOSYNC_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled !== undefined ? Boolean(parsed.enabled) : true,
        onPageLoad: parsed.onPageLoad !== undefined ? Boolean(parsed.onPageLoad) : true,
        intervalMinutes: typeof parsed.intervalMinutes === 'number' ? parsed.intervalMinutes : 10,
        lastAutoCheckedAt: parsed.lastAutoCheckedAt || undefined,
        lastAutoCheckStatus: parsed.lastAutoCheckStatus || 'idle',
        lastAutoCheckMessage: parsed.lastAutoCheckMessage || undefined,
      };
    }
  } catch (e) {
    console.error('Error loading auto sync config:', e);
  }
  return {
    enabled: true,
    onPageLoad: true,
    intervalMinutes: 10,
    lastAutoCheckStatus: 'idle',
    lastAutoCheckMessage: 'พร้อมตรวจสอบอัตโนมัติในพื้นหลัง',
  };
}

function notifyListeners() {
  fixturesListeners.forEach(cb => {
    try {
      cb([...cachedFixtures], { ...cachedMeta });
    } catch (e) {
      console.error(e);
    }
  });
}

export function subscribeToFixtures(cb: FixturesListener): () => void {
  fixturesListeners.add(cb);
  cb([...cachedFixtures], { ...cachedMeta });
  return () => {
    fixturesListeners.delete(cb);
  };
}

export function getFixtures(): FixtureItem[] {
  return [...cachedFixtures];
}

export function getFixturesMeta(): FixturesSyncMeta {
  return { ...cachedMeta };
}

export function getFixturesSheetUrl(league?: LeagueType): string {
  if (league && cachedMeta.sheetUrlsByLeague?.[league]) {
    return cachedMeta.sheetUrlsByLeague[league];
  }
  return cachedMeta.sheetUrl || '';
}

export function setFixturesSheetUrl(url: string, league?: LeagueType): void {
  const trimmed = url.trim();
  cachedMeta.sheetUrl = trimmed;
  if (!cachedMeta.sheetUrlsByLeague) {
    cachedMeta.sheetUrlsByLeague = {
      'League 1': '',
      'League 2': '',
      'League 3': '',
    };
  }

  if (league) {
    cachedMeta.sheetUrlsByLeague[league] = trimmed;
    const key = league === 'League 1' ? LOCAL_FIXTURES_URL_L1_KEY :
                league === 'League 2' ? LOCAL_FIXTURES_URL_L2_KEY : LOCAL_FIXTURES_URL_L3_KEY;
    localStorage.setItem(key, trimmed);
  } else {
    // If setting master URL, also set League 1 if empty
    if (!cachedMeta.sheetUrlsByLeague['League 1']) {
      cachedMeta.sheetUrlsByLeague['League 1'] = trimmed;
      localStorage.setItem(LOCAL_FIXTURES_URL_L1_KEY, trimmed);
    }
  }

  localStorage.setItem(LOCAL_FIXTURES_SHEET_URL_KEY, trimmed);
  localStorage.setItem(LOCAL_FIXTURES_META_KEY, JSON.stringify(cachedMeta));
  notifyListeners();
}

export function setLeagueSheetUrl(league: LeagueType, url: string): void {
  setFixturesSheetUrl(url, league);
}

export function getFixturesSheetT1T2Url(): string {
  return pickSheetUrl(cachedMeta.sheetT1T2Url, localStorage.getItem(LOCAL_FIXTURES_URL_T1T2_KEY) || '', cachedMeta.sheetUrl, DEFAULT_T1T2_SHEET_URL);
}

export function setFixturesSheetT1T2Url(url: string): void {
  const trimmed = url.trim();
  cachedMeta.sheetT1T2Url = trimmed;
  // Also keep master sheetUrl and League 1 URL updated for backward compatibility
  if (!cachedMeta.sheetUrl) {
    cachedMeta.sheetUrl = trimmed;
  }
  if (!cachedMeta.sheetUrlsByLeague) {
    cachedMeta.sheetUrlsByLeague = { 'League 1': '', 'League 2': '', 'League 3': '' };
  }
  cachedMeta.sheetUrlsByLeague['League 1'] = trimmed;
  localStorage.setItem(LOCAL_FIXTURES_URL_T1T2_KEY, trimmed);
  localStorage.setItem(LOCAL_FIXTURES_META_KEY, JSON.stringify(cachedMeta));
  notifyListeners();
}

export function getFixturesSheetT3Url(): string {
  return pickSheetUrl(cachedMeta.sheetT3Url, localStorage.getItem(LOCAL_FIXTURES_URL_T3_BYD_KEY) || '', cachedMeta.sheetUrlsByLeague?.['League 3'], DEFAULT_T3_SHEET_URL);
}

export function setFixturesSheetT3Url(url: string): void {
  const trimmed = url.trim();
  cachedMeta.sheetT3Url = trimmed;
  if (!cachedMeta.sheetUrlsByLeague) {
    cachedMeta.sheetUrlsByLeague = { 'League 1': '', 'League 2': '', 'League 3': '' };
  }
  cachedMeta.sheetUrlsByLeague['League 3'] = trimmed;
  localStorage.setItem(LOCAL_FIXTURES_URL_T3_BYD_KEY, trimmed);
  localStorage.setItem(LOCAL_FIXTURES_URL_L3_KEY, trimmed);
  localStorage.setItem(LOCAL_FIXTURES_META_KEY, JSON.stringify(cachedMeta));
  notifyListeners();
}

/**
 * Save updated fixtures into LocalStorage and Cloud Firestore with season preservation
 */
export async function saveFixtures(
  fixtures: FixtureItem[], 
  metaUpdates: Partial<FixturesSyncMeta>,
  preserveOtherSeasons: boolean = true
): Promise<void> {
  const fixtureMap = new Map<string, FixtureItem>();

  // If preserving other seasons (e.g. 2025/26 fixtures), add them first
  if (preserveOtherSeasons && cachedFixtures.length > 0) {
    const incomingSeasons = new Set<string>();
    fixtures.forEach(f => {
      const s = getSeasonFromDate(f.matchDate);
      if (s) incomingSeasons.add(s);
    });

    cachedFixtures.forEach(f => {
      const s = getSeasonFromDate(f.matchDate);
      if (s && !incomingSeasons.has(s)) {
        const hCan = getCanonicalOfficialClub(f.homeTeam);
        const aCan = getCanonicalOfficialClub(f.awayTeam);
        if (hCan && aCan && hCan.name !== aCan.name) {
          const key = `${f.league}_${hCan.name}_${aCan.name}`;
          fixtureMap.set(key, f);
        }
      }
    });
  }

  // Add the incoming fixtures, strictly validated and mapped by canonical match key
  fixtures.forEach(f => {
    // Use the official spelling when we know the club; otherwise keep the sheet's name (never drop a real match)
    const hName = getCanonicalOfficialClub(f.homeTeam)?.name || (f.homeTeam || '').trim();
    const aName = getCanonicalOfficialClub(f.awayTeam)?.name || (f.awayTeam || '').trim();
    if (!hName || !aName || hName === aName) return;
    // Sheet matches are keyed by their stable id (league/zone/match number): two rows are never merged by accident,
    // and a home/away swap or reschedule in the sheet updates the same match.
    const key = String(f.id || '').startsWith('sheet-') ? f.id : `${f.league}_${hName}_${aName}`;
    fixtureMap.set(key, {
      ...f,
      homeTeam: hName,
      awayTeam: aName,
    });
  });

  const combined = Array.from(fixtureMap.values());
  combined.sort((a, b) => {
    const diff = (a.matchDate || '').localeCompare(b.matchDate || '');
    if (diff !== 0) return diff;
    return (a.matchTime || '').localeCompare(b.matchTime || '');
  });

  cachedFixtures = combined;
  cachedMeta = {
    ...cachedMeta,
    ...metaUpdates,
    matchCount: cachedFixtures.length,
    leagueCounts: countLeagues(cachedFixtures),
  };

  // Automatically update active registration season if fixtures belong to a new season (e.g. 2027/28)
  try {
    autoUpdateSeasonFromFixtures(cachedFixtures);
  } catch (e) {
    console.warn('Auto season update check warning:', e);
  }

  try {
    localStorage.setItem(LOCAL_FIXTURES_KEY, JSON.stringify(cachedFixtures));
    localStorage.setItem(LOCAL_FIXTURES_META_KEY, JSON.stringify(cachedMeta));
  } catch (e) {
    console.error('Error saving fixtures to localStorage:', e);
  }

  notifyListeners();

  // Also sync to Firestore collection 'thaileague_fixtures' if available
  const { db: firestoreDb } = initFirebaseService();
  if (firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'thaileague_system_config', 'fixtures_config');
      await setDoc(docRef, {
        fixtures: cachedFixtures,
        meta: cachedMeta,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      console.warn('Firestore fixtures sync fallback used:', e);
    }
  }
}

/**
 * Replace a specific league's fixtures with user-provided fixtures, preserving all other leagues
 */
export async function saveFixturesForLeague(
  leagueFixtures: FixtureItem[],
  league: LeagueType,
  metaUpdates: Partial<FixturesSyncMeta> = {}
): Promise<void> {
  // Rows that came from the official Google Sheets (id "sheet-...") are kept as-is: a club spelled differently
  // in the sheet must never make a real match disappear. Other sources (manual paste) still go through the club check.
  const sanitizedIncoming = leagueFixtures
    .filter(f => String(f.id || '').startsWith('sheet-') || (!isBannedClub(f.homeTeam) && !isBannedClub(f.awayTeam)))
    .map(f => ({ ...f, league }));

  const otherLeagues = cachedFixtures.filter(f => f.league !== league);
  const combined = [...otherLeagues, ...sanitizedIncoming];

  // Sort chronologically
  combined.sort((a, b) => {
    const diff = (a.matchDate || '').localeCompare(b.matchDate || '');
    if (diff !== 0) return diff;
    return (a.matchTime || '').localeCompare(b.matchTime || '');
  });

  await saveFixtures(combined, {
    ...metaUpdates,
    statusMessage: `อัปเดตตารางแข่งขัน ${league} สำเร็จ (${sanitizedIncoming.length} คู่)`,
  });
}

/**
 * Append fixtures to a specific league without replacing existing ones (deduplicating identical matches)
 */
export async function appendFixturesForLeague(
  incomingFixtures: FixtureItem[],
  league: LeagueType,
  metaUpdates: Partial<FixturesSyncMeta> = {}
): Promise<{ success: boolean; addedCount: number; totalLeagueCount: number; totalCount: number }> {
  const sanitizedIncoming = incomingFixtures
    .filter(f => !isBannedClub(f.homeTeam) && !isBannedClub(f.awayTeam))
    .map(f => ({ ...f, league }));

  const existingThisLeague = cachedFixtures.filter(f => f.league === league);
  const otherLeagues = cachedFixtures.filter(f => f.league !== league);

  const existingKeys = new Set(
    existingThisLeague.map(f => `${f.matchDate}_${normClub(f.homeTeam)}_${normClub(f.awayTeam)}`)
  );

  const newFixtures: FixtureItem[] = [];
  sanitizedIncoming.forEach(inc => {
    const k = `${inc.matchDate}_${normClub(inc.homeTeam)}_${normClub(inc.awayTeam)}`;
    if (!existingKeys.has(k)) {
      existingKeys.add(k);
      newFixtures.push(inc);
    }
  });

  const updatedThisLeague = [...existingThisLeague, ...newFixtures];
  const combined = [...otherLeagues, ...updatedThisLeague];

  combined.sort((a, b) => {
    const diff = (a.matchDate || '').localeCompare(b.matchDate || '');
    if (diff !== 0) return diff;
    return (a.matchTime || '').localeCompare(b.matchTime || '');
  });

  await saveFixtures(combined, {
    ...metaUpdates,
    statusMessage: `เพิ่มข้อมูลตารางแข่งขัน ${league} สำเร็จ (+${newFixtures.length} คู่ใหม่, รวมลีกนี้เป็น ${updatedThisLeague.length} คู่)`,
  });

  return {
    success: true,
    addedCount: newFixtures.length,
    totalLeagueCount: updatedThisLeague.length,
    totalCount: combined.length,
  };
}

/**
 * Reset fixtures to the initial default fixtures
 */
export async function resetFixturesToDefault(): Promise<void> {
  // There is no built-in sample schedule anymore: "reset" means re-reading everything from the official sheets.
  await syncFromOfficialDualSheets({ target: 'all' });
}

/**
 * Extract Spreadsheet ID and optional gid from any Google Sheet URL
 */
export function parseGoogleSheetUrl(url: string): { sheetId: string | null; gid: string | null } {
  if (!url) return { sheetId: null, gid: null };
  const trimmed = url.trim();

  // Match /spreadsheets/d/([a-zA-Z0-9-_]+)
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const sheetId = idMatch ? idMatch[1] : null;

  // Match gid=([0-9]+)
  const gidMatch = trimmed.match(/[#&?]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : null;

  return { sheetId, gid };
}

/**
 * Clean & split CSV / TSV text handling quotes
 */
export function parseDelimitedText(rawText: string): string[][] {
  const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleanText.split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  // Determine delimiter: inspect sample of up to 10 lines
  const sample = lines.slice(0, 10).join('\n');
  const tabCount = (sample.match(/\t/g) || []).length;
  const commaCount = (sample.match(/,/g) || []).length;
  const delimiter = tabCount >= commaCount ? '\t' : ',';

  const rows: string[][] = [];

  for (const line of lines) {
    const row: string[] = [];
    let insideQuotes = false;
    let currentCell = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === delimiter && !insideQuotes) {
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
 * Intelligent helper to find stadium from club name
 */
function findStadiumForClub(homeTeam: string): string {
  const match = INITIAL_STADIUM_CONTACTS.find(sc => 
    sc.homeClub.includes(homeTeam) || homeTeam.includes(sc.homeClub)
  );
  if (match) return match.stadiumName;
  return `สนามเหย้า ${homeTeam}`;
}

/**
 * Known Thai football clubs to League mapping for automatic detection
 */
export const KNOWN_CLUBS_TO_LEAGUE: Record<string, LeagueType> = {
  // League 1
  'บุรีรัมย์': 'League 1',
  'บีจี ปทุม': 'League 1',
  'การท่าเรือ': 'League 1',
  'ท่าเรือ': 'League 1',
  'ทรู แบงค็อก': 'League 1',
  'แบงค็อก': 'League 1',
  'เมืองทอง': 'League 1',
  'ชลบุรี': 'League 1',
  'เชียงราย': 'League 1',
  'สิงห์ เชียงราย': 'League 1',
  'ราชบุรี': 'League 1',
  'ขอนแก่น ยูไนเต็ด': 'League 1',
  'ลำพูน': 'League 1',
  'อุทัยธานี': 'League 1',
  'สุโขทัย': 'League 1',
  'พีที ประจวบ': 'League 1',
  'ประจวบ': 'League 1',
  'นครปฐม': 'League 1',
  'ระยอง': 'League 1',
  'หนองบัว': 'League 1',

  // League 2
  'เชียงใหม่ ยูไนเต็ด': 'League 2',
  'เชียงใหม่ เอฟซี': 'League 2',
  'นครราชสีมา': 'League 2',
  'โคราช': 'League 2',
  'อยุธยา': 'League 2',
  'สุพรรณบุรี': 'League 2',
  'แพร่': 'League 2',
  'ชัยนาท': 'League 2',
  'ลำปาง': 'League 2',
  'นครศรี ยูไนเต็ด': 'League 2',
  'กระบี่': 'League 2',
  'สมุทรปราการ ซิตี้': 'League 2',
  'ตราด': 'League 2',
  'โปลิศ เทโร': 'League 2',
  'จันทบุรี': 'League 2',
  'พัทยา': 'League 2',
  'เกษตรศาสตร์': 'League 2',
  'บางกอก เอฟซี': 'League 2',
  'ศรีสะเกษ ยูไนเต็ด': 'League 2',
  'มหาสารคาม': 'League 2',

  // League 3
  'พิจิตร': 'League 3',
  'พิจิตร ยูไนเต็ด': 'League 3',
  'สโมสรพิจิตร ยูไนเต็ด': 'League 3',
  'แม่โจ้': 'League 3',
  'แม่โจ้ ยูไนเต็ด': 'League 3',
  'กำแพงเพชร': 'League 3',
  'กำแพงเพชร เอฟซี': 'League 3',
  'พิษณุโลก': 'League 3',
  'พิษณุโลก เอฟซี': 'League 3',
  'นครสวรรค์ สี่แคว': 'League 3',
  'สี่แคว': 'League 3',
  'อุตรดิตถ์': 'League 3',
  'อุตรดิตถ์ เอฟซี': 'League 3',
  'ชาติตระการ': 'League 3',
  'ชาติตระการ ซิตี้': 'League 3',
  'สิงห์ เชียงราย ซิตี้': 'League 3',
  'นครแม่สอด': 'League 3',
  'นอร์ทเทิร์น นครแม่สอด': 'League 3',
  'เขลางค์': 'League 3',
  'เขลางค์ ยูไนเต็ด': 'League 3',
  'อุดร บ้านจั่น': 'League 3',
  'อุบล ครัวนภัส': 'League 3',
  'ขอนแก่นมอดินแดง': 'League 3',
  'ร้อยเอ็ด': 'League 3',
  'ร้อยเอ็ด พีบี': 'League 3',
  'สุรินทร์': 'League 3',
  'สุรินทร์ ซิตี้': 'League 3',
  'สุรินทร์ โขงชีมูล': 'League 3',
  'ยโสธร': 'League 3',
  'ยโสธร เอฟซี': 'League 3',
  'ราษีไศล': 'League 3',
  'ราษีไศล ยูไนเต็ด': 'League 3',
  'เมืองเลย': 'League 3',
  'เมืองเลย ยูไนเต็ด': 'League 3',
  'อุดรธานี': 'League 3',
  'อุดร ยูไนเต็ด': 'League 3',
  'ปลวกแดง': 'League 3',
  'ปลวกแดง ยูไนเต็ด': 'League 3',
  'ฉะเชิงเทรา': 'League 3',
  'ฉะเชิงเทรา ไฮเทค': 'League 3',
  'นาวิกโยธิน': 'League 3',
  'สายมิตรกบินทร์': 'League 3',
  'กบินทร์': 'League 3',
  'บ้านค่าย': 'League 3',
  'บ้านค่าย ยูไนเต็ด': 'League 3',
  'ปราจีนบุรี': 'League 3',
  'ปราจีนบุรี ซิตี้': 'League 3',
  'กองเรือรบ': 'League 3',
  'บิ๊กแมน': 'League 3',
  'แปดริ้ว': 'League 3',
  'แปดริ้ว ซิตี้': 'League 3',
  'สระแก้ว': 'League 3',
  'นครนายก': 'League 3',
  'สมุทรสงคราม': 'League 3',
  'หัวหิน': 'League 3',
  'หัวหิน ซิตี้': 'League 3',
  'ทัพหลวง': 'League 3',
  'ทัพหลวง ยูไนเต็ด': 'League 3',
  'อัสสัมชัญ': 'League 3',
  'อัสสัมชัญ ยูไนเต็ด': 'League 3',
  'สระบุรี': 'League 3',
  'สระบุรี ยูไนเต็ด': 'League 3',
  'กาญจนบุรี ซิตี้': 'League 3',
  'ลพบุรี': 'League 3',
  'ลพบุรี ซิตี้': 'League 3',
  'ราชประชา': 'League 3',
  'นนทบุรี': 'League 3',
  'นนทบุรี เอฟซี': 'League 3',
  'อ่างทอง': 'League 3',
  'อ่างทอง เอฟซี': 'League 3',
  'ชัยนาท ยูไนเต็ด': 'League 3',
  'นอร์ทกรุงเทพ': 'League 3',
  'จามจุรี': 'League 3',
  'จามจุรี ยูไนเต็ด': 'League 3',
  'ธนบุรี': 'League 3',
  'ธนบุรี ยูไนเต็ด': 'League 3',
  'ทหารอากาศ': 'League 3',
  'พราม แบงค็อก': 'League 3',
  'สยาม เอฟซี': 'League 3',
  'สมุทรปราการ เอฟซี': 'League 3',
  'เกษมบัณฑิต': 'League 3',
  'โดม เอฟซี': 'League 3',
  'อินเตอร์ แบงค็อก': 'League 3',
  'ยะลา': 'League 3',
  'ยะลา ซิตี้': 'League 3',
  'สมุย': 'League 3',
  'สมุย ยูไนเต็ด': 'League 3',
  'ปัตตานี': 'League 3',
  'ปัตตานี เอฟซี': 'League 3',
  'นรา': 'League 3',
  'นรา ยูไนเต็ด': 'League 3',
  'เอ็มเอช นครศรี': 'League 3',
  'พัทลุง': 'League 3',
  'พัทลุง เอฟซี': 'League 3',
  'สงขลา': 'League 3',
  'สงขลา เอฟซี': 'League 3',
  'สุราษฎร์ธานี': 'League 3',
  'ภูเก็ต อันดามัน': 'League 3',
  'ตรัง': 'League 3',
  'ตรัง เอฟซี': 'League 3',
  'เมืองคนดี': 'League 3',
  'ระนอง': 'League 3',
  'ระนอง ยูไนเต็ด': 'League 3',
  'พะเยา': 'League 3',
};

/**
 * Normalize Thai / English League string to LeagueType
 * Robust against variations like "ไทยลีก 2", "ไทยลีก2", "T2", "League 2", "2", regional zones, etc.
 */
export function normalizeLeague(
  raw: string, 
  fallbackClub?: string, 
  fallbackLeague: LeagueType = 'League 1'
): LeagueType {
  const s = (raw || '').toString().toLowerCase().trim();

  // Regional Zones: In Thai Football, regional zones ONLY exist in Thai League 3 (6 zones)
  if (
    s.includes('โซน') || s.includes('zone') ||
    s.includes('ภาคเหนือ') || s.includes('ภาคใต้') || s.includes('ภาคอีสาน') || s.includes('ภาคตะวันออก') ||
    s.includes('ตะวันตก') || s.includes('ปริมณฑล') || s.includes('กทม') || s.includes('bangkok') ||
    s.includes('north') || s.includes('south') || s.includes('east') || s.includes('west') ||
    s.includes('bkk') || s.includes('ปุ๋ยรุ่งอรุณ') || s.includes('bgc')
  ) {
    return 'League 3';
  }

  // League 3 checks
  if (
    s === '3' || s === 'l3' || s === 't3' || s === 'tl3' ||
    s.includes('league 3') || s.includes('league3') ||
    s.includes('ไทยลีก 3') || s.includes('ไทยลีก3') ||
    s.includes('ไทยลีก_3') || s.includes('ไทยลีก-3') ||
    s.includes('ลีก 3') || s.includes('ลีก3') ||
    s.includes('t3') || s.includes('t-3') || s.includes('t 3') ||
    s.includes('tl3') || s.includes('tl 3') ||
    s.includes('l3') || s.includes('div 3') || s.includes('division 3') ||
    s.includes('ดิวิชั่น 3') || s.includes('ดิวิชัน 3')
  ) {
    return 'League 3';
  }

  // League 2 checks
  if (
    s === '2' || s === 'l2' || s === 't2' || s === 'tl2' ||
    s.includes('league 2') || s.includes('league2') ||
    s.includes('ไทยลีก 2') || s.includes('ไทยลีก2') ||
    s.includes('ไทยลีก_2') || s.includes('ไทยลีก-2') ||
    s.includes('ลีก 2') || s.includes('ลีก2') ||
    s.includes('t2') || s.includes('t-2') || s.includes('t 2') ||
    s.includes('tl2') || s.includes('tl 2') ||
    s.includes('l2') || s.includes('div 2') || s.includes('division 2') ||
    s.includes('ดิวิชั่น 2') || s.includes('ดิวิชัน 2') ||
    s.includes('เมืองไทย') || s.includes('m-150') || s.includes('m150')
  ) {
    return 'League 2';
  }

  // League 1 checks
  if (
    s === '1' || s === 'l1' || s === 't1' || s === 'tl1' ||
    s.includes('league 1') || s.includes('league1') ||
    s.includes('ไทยลีก 1') || s.includes('ไทยลีก1') ||
    s.includes('ไทยลีก_1') || s.includes('ไทยลีก-1') ||
    s.includes('ลีก 1') || s.includes('ลีก1') ||
    s.includes('รีโว่') || s.includes('revo') || s.includes('hilux') || s.includes('ไฮลักซ์')
  ) {
    return 'League 1';
  }

  // Club name fallback (sort by length descending to match specific clubs before partial words)
  if (fallbackClub) {
    const sortedEntries = Object.entries(KNOWN_CLUBS_TO_LEAGUE).sort((a, b) => b[0].length - a[0].length);
    for (const [clubKey, league] of sortedEntries) {
      if (fallbackClub.includes(clubKey)) {
        return league;
      }
    }
  }

  return fallbackLeague;
}

/**
 * Normalize Date to YYYY-MM-DD
 * Handles:
 * - 2026-09-18, 2026/09/18
 * - 18/09/2026, 18/9/2026, 18-09-2026, 18.09.2026
 * - 18/09/2569 or 18/9/69 (Thai Buddhist Era)
 * - "18 ก.ย. 69", "18 ก.ย. 2569", "ศุกร์ 18 ก.ย. 69", "วันศุกร์ที่ 18 กันยายน 2569"
 * - "18 Sep 2026", "18-Sep-2026", "Sep 18, 2026"
 */
export function normalizeDate(rawDate: string, fallbackDate?: string): string {
  const str = rawDate.trim();
  if (!str) return fallbackDate || '';

  // Standard YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}[\-\/]\d{1,2}[\-\/]\d{1,2}$/.test(str)) {
    const [y, m, d] = str.split(/[\-\/]/);
    const yearNum = Number(y);
    const finalYear = yearNum > 2400 ? yearNum - 543 : yearNum;
    return `${finalYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YYYY or D/M/YY or DD.MM.YYYY or DD-MM-YYYY
  if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(str)) {
    const parts = str.split(/[\/\-\.]/);
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    let year = Number(parts[2]);
    if (year === 69 || year === 70) {
      year = year === 69 ? 2026 : 2027;
    } else if (year < 100) {
      year += 2000;
    } else if (year > 2400) {
      year -= 543;
    }
    return `${year}-${month}-${day}`;
  }

  // Thai and English Month mappings
  const MONTH_MAP: Record<string, string> = {
    // Thai abbreviations and full names
    'ก.ย': '09', 'กันยา': '09', 'กันยายน': '09',
    'ต.ค': '10', 'ตุลา': '10', 'ตุลาคม': '10',
    'พ.ย': '11', 'พฤศจิกา': '11', 'พฤศจิกายน': '11',
    'ธ.ค': '12', 'ธันวา': '12', 'ธันวาคม': '12',
    'ม.ค': '01', 'มกรา': '01', 'มกราคม': '01',
    'ก.พ': '02', 'กุมภา': '02', 'กุมภาพันธ์': '02',
    'มี.ค': '03', 'มีนา': '03', 'มีนาคม': '03',
    'เม.ย': '04', 'เมษา': '04', 'เมษายน': '04',
    'พ.ค': '05', 'พฤษภา': '05', 'พฤษภาคม': '05',
    'มิ.ย': '06', 'มิถุนา': '06', 'มิถุนายน': '06',
    'ก.ค': '07', 'กรกฎา': '07', 'กรกฎาคม': '07',
    'ส.ค': '08', 'สิงหา': '08', 'สิงหาคม': '08',
    // English abbreviations and full names
    'sep': '09', 'sept': '09', 'september': '09',
    'oct': '10', 'october': '10',
    'nov': '11', 'november': '11',
    'dec': '12', 'december': '12',
    'jan': '01', 'january': '01',
    'feb': '02', 'february': '02',
    'mar': '03', 'march': '03',
    'apr': '04', 'april': '04',
    'may': '05',
    'jun': '06', 'june': '06',
    'jul': '07', 'july': '07',
    'aug': '08', 'august': '08',
  };

  const lower = str.toLowerCase();
  for (const [monthKey, mNum] of Object.entries(MONTH_MAP)) {
    if (lower.includes(monthKey)) {
      const escapedKey = monthKey.replace('.', '\\.');

      // 1. Day parsing:
      let dayStr = '';

      // A. Check for date ranges (e.g. "19-20 ก.ย.", "19 - 20 ก.ย.", "19-20 กันยายน", "18-20 ก.ย.")
      const rangeMatch = lower.match(new RegExp(`([0-3]?[0-9])\\s*[-–—toถึง]+\\s*([0-3]?[0-9])\\s*(?:[-/\\s])?\\s*${escapedKey}`));
      if (rangeMatch) {
        const startDay = Number(rangeMatch[1]);
        const endDay = Number(rangeMatch[2]);
        if (startDay >= 1 && startDay <= 31 && endDay >= 1 && endDay <= 31) {
          // If the string explicitly references Sunday (อาทิตย์), use endDay; otherwise default to startDay
          if (lower.includes('อาทิตย์') || /\b(sun|sunday)\b/i.test(lower) || /\bอา\./.test(lower)) {
            dayStr = endDay.toString().padStart(2, '0');
          } else {
            dayStr = startDay.toString().padStart(2, '0');
          }
        }
      }

      // B. Look for 1-2 digits directly adjacent before the month (e.g. "19 ก.ย.", "19-ก.ย.", "19/ก.ย.", "ศุกร์ 19 ก.ย.")
      if (!dayStr) {
        const dayBeforeMatch = lower.match(new RegExp(`(?:^|[^0-9])([0-3]?[0-9])\\s*(?:[-/\\s])?\\s*${escapedKey}`));
        if (dayBeforeMatch && Number(dayBeforeMatch[1]) >= 1 && Number(dayBeforeMatch[1]) <= 31) {
          dayStr = dayBeforeMatch[1].padStart(2, '0');
        }
      }

      // C. Look for 1-2 digits directly adjacent after the month (e.g. "ก.ย. 19")
      if (!dayStr) {
        const dayAfterMatch = lower.match(new RegExp(`${escapedKey}\\s*(?:[-/\\s])?\\s*([0-3]?[0-9])(?:[^0-9]|$)`));
        if (dayAfterMatch && Number(dayAfterMatch[1]) >= 1 && Number(dayAfterMatch[1]) <= 31) {
          dayStr = dayAfterMatch[1].padStart(2, '0');
        }
      }

      // D. Fallback: any 1-2 digit number that is a valid day (1-31)
      if (!dayStr) {
        const anyDayMatches = Array.from(lower.matchAll(/(?:^|[^0-9])([0-3]?[0-9])(?:[^0-9]|$)/g));
        for (const m of anyDayMatches) {
          const val = Number(m[1]);
          if (val >= 1 && val <= 31) {
            dayStr = m[1].padStart(2, '0');
            break;
          }
        }
      }

      if (!dayStr) dayStr = '18';

      // 2. Year: detect 2569, 2570, 2026, 2027, 69, 70
      let year = Number(mNum) >= 8 ? 2026 : 2027; // Football season 2026/27
      const yearMatch = lower.match(/\b(2569|2570|2026|2027|69|70)\b/);
      if (yearMatch) {
        const yVal = Number(yearMatch[1]);
        if (yVal === 69 || yVal === 2569 || yVal === 2026) year = 2026;
        else if (yVal === 70 || yVal === 2570 || yVal === 2027) year = 2027;
      } else {
        const generalYear = lower.match(new RegExp(`${escapedKey}[^0-9]*(\\d{2,4})`));
        if (generalYear) {
          let yr = Number(generalYear[1]);
          if (yr === 69 || yr === 70) year = yr === 69 ? 2026 : 2027;
          else if (yr > 2400) year = yr - 543;
          else if (yr >= 2026 && yr <= 2030) year = yr;
          else if (yr < 50) year = 2000 + yr;
        }
      }

      return `${year}-${mNum}-${dayStr}`;
    }
  }

  return fallbackDate || '';
}

/**
 * Normalize time string (e.g. "18.00", "18:00 น.", "18:00")
 */
function normalizeTime(rawTime: string): string {
  if (!rawTime) return '18:00';
  const clean = rawTime.replace(/น\.|น/g, '').replace('.', ':').trim();
  const match = clean.match(/(\d{1,2}):(\d{1,2})/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`;
  }
  return '18:00';
}

/**
 * Parse rows into structured FixtureItem array
 */
export function parseFixturesFromMatrix(rows: string[][], defaultLeague: LeagueType = 'League 1'): {
  fixtures: FixtureItem[];
  detectedHeaders: string[];
  skippedCount: number;
} {
  if (rows.length < 2) {
    return { fixtures: [], detectedHeaders: [], skippedCount: 0 };
  }

  // Find header row: scan first 6 rows
  let headerIndex = 0;
  let headers = rows[0].map(h => h.trim().toLowerCase());

  const isHeaderRow = (r: string[]) => {
    const s = r.join(' ').toLowerCase();
    return (
      s.includes('เหย้า') || s.includes('home') || s.includes('vs') || 
      s.includes('แข่ง') || s.includes('ทีม') || s.includes('คู่') || 
      s.includes('นัด') || s.includes('วัน') || s.includes('date') || s.includes('สโมสร')
    );
  };

  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    if (isHeaderRow(rows[i])) {
      headerIndex = i;
      headers = rows[i].map(h => h.trim().toLowerCase());
      break;
    }
  }

  // Identify column indices
  let colWeek = -1;
  let colLeague = -1;
  let colDate = -1;
  let colDay = -1;
  let colTime = -1;
  let colHome = -1;
  let colAway = -1;
  let colMatch = -1;
  let colStadium = -1;
  let colRemark = -1;

  headers.forEach((hRaw, idx) => {
    const h = hRaw.trim().toLowerCase();
    // 1. Matchweek / Round
    if (h.includes('นัดที่') || h.includes('นัด') || h.includes('week') || h.includes('mw') || h.includes('md') || h.includes('สัปดาห์') || h.includes('round')) {
      colWeek = idx;
    }
    // 2. League / Zone
    else if (
      h.includes('ลีก') || h.includes('league') || h.includes('tier') || h.includes('div') ||
      h.includes('ระดับ') || h.includes('สาย') || h.includes('division') || h.includes('ชั้น') ||
      h.includes('ทัวร์นาเมนต์') || h.includes('tournament') || h.includes('ประเภท') || h.includes('โซน') || h.includes('zone')
    ) {
      colLeague = idx;
    }
    // 3. Date: "วันที่แข่งขัน", "วันเดือนปี", "ว/ด/ป", "วันที่", "วันแข่ง", "date"
    else if (
      h.includes('วันเดือนปี') || h.includes('วันที่แข่งขัน') || h.includes('วันที่แข่ง') || 
      h.includes('วันแข่ง') || h.includes('วันที่') || h.includes('วัน/เดือน/ปี') || 
      h.includes('ว/ด/ป') || h.includes('ว.ด.ป.') || h.includes('date')
    ) {
      colDate = idx;
    }
    // 4. Day of week (strictly "วัน" without เดือน, ปี, เวลา, แข่ง)
    else if (
      (h === 'วัน' || h === 'day' || h.startsWith('วัน (')) && 
      !h.includes('เดือน') && !h.includes('ปี') && !h.includes('เวลา') && !h.includes('แข่ง')
    ) {
      colDay = idx;
    }
    // 5. Time: "เวลา", "time", "kickoff"
    else if (h.includes('เวลา') || h.includes('time') || h.includes('kickoff')) {
      colTime = idx;
    }
    // 6. Home team: "ทีมเหย้า", "สโมสรทีมเหย้า", "สโมสรเหย้า", "เจ้าบ้าน", "home"
    else if (
      h.includes('ทีมเหย้า') || h.includes('สโมสรทีมเหย้า') || h.includes('สโมสรเหย้า') || 
      h.includes('เหย้า') || h.includes('เจ้าบ้าน') || h.includes('home') || 
      h.includes('ทีม 1') || h.includes('team 1') || h.includes('ทีม1') || h.includes('สโมสร 1')
    ) {
      colHome = idx;
    }
    // 7. Away team: "ทีมเยือน", "สโมสรทีมเยือน", "สโมสรเยือน", "ผู้มาเยือน", "away"
    else if (
      h.includes('ทีมเยือน') || h.includes('สโมสรทีมเยือน') || h.includes('สโมสรเยือน') || 
      h.includes('เยือน') || h.includes('ผู้มาเยือน') || h.includes('away') || 
      h.includes('ทีม 2') || h.includes('team 2') || h.includes('ทีม2') || h.includes('สโมสร 2')
    ) {
      colAway = idx;
    }
    // 8. Match / Fixture (if home vs away in single column)
    else if (
      h.includes('คู่') || h.includes('match') || h.includes('fixture') || h.includes('โปรแกรม') || 
      h.includes('รายการ') || h.includes('การแข่งขัน') || h.includes('คู่แข่ง')
    ) {
      colMatch = idx;
    }
    // 9. Stadium: "สนามแข่งขัน", "สนาม", "stadium", "venue", "สถานที่"
    else if (h.includes('สนามแข่งขัน') || h.includes('สนาม') || h.includes('stadium') || h.includes('venue') || h.includes('สถานที่')) {
      colStadium = idx;
    }
    // 10. Remark
    else if (h.includes('remark') || h.includes('หมายเหตุ') || h.includes('note') || h.includes('ข้อมูลเพิ่มเติม') || h.includes('แจ้งเพิ่มเติม')) {
      colRemark = idx;
    }
  });

  // If colDate was not found, but colDay was found and looks like date:
  if (colDate === -1 && colDay >= 0) {
    colDate = colDay;
    colDay = -1;
  }

  const fixturesMap = new Map<string, FixtureItem>();
  let skippedCount = 0;
  let currentSectionLeague: LeagueType = defaultLeague;

  // Helper to split a match text containing two teams (strict match separators only, NO lone hyphens)
  const splitMatchTeams = (text: string): { home: string; away: string } | null => {
    if (!text) return null;
    const separators = [
      /\s+vs\.?\s+/i,
      /\s+v\s+/i,
      /\s+พบกับ\s+/i,
      /\s+พบ\s+/i,
    ];
    for (const sep of separators) {
      if (sep.test(text)) {
        const parts = text.split(sep);
        if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
          return { home: parts[0].trim(), away: parts[1].trim() };
        }
      }
    }
    return null;
  };

  let lastSeenDate = '';
  let lastSeenWeek = 1;

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 0 || row.every(cell => !cell || cell.trim() === '')) {
      continue;
    }

    // Check if entire row represents a league section header
    const rowFullText = row.join(' ').toLowerCase();
    if (
      rowFullText.includes('ไทยลีก 3') || rowFullText.includes('ไทยลีก3') ||
      rowFullText.includes('league 3') || rowFullText.includes('league3') ||
      rowFullText.includes('t3') || rowFullText.includes('ปุ๋ยรุ่งอรุณ') ||
      rowFullText.includes('byd dolphin') ||
      rowFullText.includes('โซนภาค') || rowFullText.includes('โซน')
    ) {
      currentSectionLeague = 'League 3';
    } else if (
      rowFullText.includes('ไทยลีก 2') || rowFullText.includes('ไทยลีก2') ||
      rowFullText.includes('league 2') || rowFullText.includes('league2') ||
      rowFullText.includes('t2') || rowFullText.includes('เมืองไทย')
    ) {
      currentSectionLeague = 'League 2';
    } else if (
      rowFullText.includes('ไทยลีก 1') || rowFullText.includes('ไทยลีก1') ||
      rowFullText.includes('league 1') || rowFullText.includes('league1') ||
      rowFullText.includes('t1') || rowFullText.includes('รีโว่')
    ) {
      currentSectionLeague = 'League 1';
    }

    // Day of week check: either from colDay or row full text
    const dayText = (colDay >= 0 && row[colDay] ? row[colDay] : '').toLowerCase();

    const isSat = dayText.includes('เสาร์') || /\b(sat|saturday)\b/i.test(dayText) || /\bส\./.test(dayText) ||
      (!dayText && (rowFullText.includes('เสาร์') || /\b(sat|saturday)\b/i.test(rowFullText) || /\bส\./.test(rowFullText)));
    const isSun = dayText.includes('อาทิตย์') || /\b(sun|sunday)\b/i.test(dayText) || /\bอา\./.test(dayText) ||
      (!dayText && (rowFullText.includes('อาทิตย์') || /\b(sun|sunday)\b/i.test(rowFullText) || /\bอา\./.test(rowFullText)));
    const isFri = dayText.includes('ศุกร์') || /\b(fri|friday)\b/i.test(dayText) || /\bศ\./.test(dayText) ||
      (!dayText && (rowFullText.includes('ศุกร์') || /\b(fri|friday)\b/i.test(rowFullText) || /\bศ\./.test(rowFullText)));

    let homeTeam = colHome >= 0 && row[colHome] ? row[colHome].trim() : '';
    let awayTeam = colAway >= 0 && row[colAway] ? row[colAway].trim() : '';

    // If home or away is empty, try splitting colMatch (strictly vs/พบกับ only)
    if ((!homeTeam || !awayTeam) && colMatch >= 0 && row[colMatch]) {
      const split = splitMatchTeams(row[colMatch]);
      if (split) {
        homeTeam = homeTeam || split.home;
        awayTeam = awayTeam || split.away;
      }
    }

    // Determine target league: prefer defaultLeague (e.g. from tab context), or section
    const targetLeague: LeagueType = defaultLeague || currentSectionLeague || 'League 1';

    // Strict validation: both home and away MUST resolve to official registered clubs
    const hClub = getCanonicalOfficialClub(homeTeam, targetLeague);
    const aClub = getCanonicalOfficialClub(awayTeam, targetLeague);

    if (!hClub || !aClub || hClub.name === aClub.name) {
      // Check if this row is a Date or Matchweek banner
      const headerRowDate = normalizeDate(rowFullText);
      if (headerRowDate) {
        lastSeenDate = headerRowDate;
      }
      const headerRowWeek = rowFullText.match(/(?:นัดที่|สัปดาห์ที่|matchweek|matchday|mw|round)\s*(\d{1,2})/i);
      if (headerRowWeek) {
        lastSeenWeek = parseInt(headerRowWeek[1], 10);
      }
      skippedCount++;
      continue;
    }

    // Set canonical club names
    homeTeam = hClub.name;
    awayTeam = aClub.name;
    const league: LeagueType = defaultLeague || hClub.league || targetLeague;
    // MatchWeek parsing with sticky fallback
    let matchWeek = lastSeenWeek || 1;
    if (colWeek >= 0 && row[colWeek] && row[colWeek].trim()) {
      const parsedW = parseInt(row[colWeek].replace(/\D/g, ''), 10);
      if (parsedW) {
        matchWeek = parsedW;
        lastSeenWeek = parsedW;
      }
    }

    // MatchDate parsing with sticky carry-forward and league-aware kickoff default
    let matchDate = '';
    if (colDate >= 0 && row[colDate] && row[colDate].trim()) {
      const parsedD = normalizeDate(row[colDate]);
      if (parsedD) {
        matchDate = parsedD;
        lastSeenDate = parsedD;
      }
    }

    if (!matchDate) {
      // Scan other cells in row for a date string
      for (const cell of row) {
        if (cell && cell.trim()) {
          const parsedD = normalizeDate(cell);
          if (parsedD) {
            matchDate = parsedD;
            lastSeenDate = parsedD;
            break;
          }
        }
      }
    }

    if (!matchDate && lastSeenDate) {
      matchDate = lastSeenDate;
    }

    // If still undetermined:
    // IMPORTANT: BYD DOLPHIN LEAGUE III begins on 18 ก.ย. 69 (2026-09-18)
    if (!matchDate) {
      matchDate = league === 'League 3' ? '2026-09-18' : '2026-09-05';
    }

    // Day of week correction:
    // If row explicitly indicates Saturday (เสาร์), date MUST be Saturday!
    // If row explicitly indicates Sunday (อาทิตย์), date MUST be Sunday!
    if (matchDate) {
      const d = new Date(matchDate + 'T12:00:00Z');
      if (!isNaN(d.getTime())) {
        const dow = d.getUTCDay(); // 0: Sun, 5: Fri, 6: Sat
        if (isSat && dow === 0) {
          // Sunday but row indicates Saturday -> adjust back to Saturday!
          d.setUTCDate(d.getUTCDate() - 1);
          matchDate = d.toISOString().slice(0, 10);
        } else if (isSun && dow === 6) {
          // Saturday but row indicates Sunday -> adjust forward to Sunday!
          d.setUTCDate(d.getUTCDate() + 1);
          matchDate = d.toISOString().slice(0, 10);
        } else if (isFri && dow === 6) {
          // Saturday but row indicates Friday -> adjust back to Friday!
          d.setUTCDate(d.getUTCDate() - 1);
          matchDate = d.toISOString().slice(0, 10);
        } else if (isFri && dow === 0) {
          // Sunday but row indicates Friday -> adjust back to Friday!
          d.setUTCDate(d.getUTCDate() - 2);
          matchDate = d.toISOString().slice(0, 10);
        }
      }
      lastSeenDate = matchDate;
    }

    const matchTime = colTime >= 0 && row[colTime] 
      ? normalizeTime(row[colTime]) 
      : '18:00';

    const stadium = colStadium >= 0 && row[colStadium] && row[colStadium].trim().length > 1
      ? row[colStadium].trim()
      : findStadiumForClub(homeTeam);

    const month = matchDate.slice(0, 7) || '2026-09';
    const id = `gs-${league.replace(/\s+/g, '').toLowerCase()}-${matchDate}-${homeTeam.replace(/\s+/g, '').slice(0, 8)}`;
    const remark = colRemark >= 0 && row[colRemark] && row[colRemark].trim().length > 0 && row[colRemark].trim() !== '-'
      ? row[colRemark].trim()
      : undefined;

    // Strict check: No matches on 1-8 Oct 2026 for League 1 and League 2 per official calendar & user brief
    if ((league === 'League 1' || league === 'League 2') && matchDate >= '2026-10-01' && matchDate <= '2026-10-08') {
      skippedCount++;
      continue;
    }

    // Strict check: League 3 has NO matches on Friday 2 Oct 2026 (matches are on Sat 3 Oct & Sun 4 Oct)
    if (league === 'League 3' && matchDate === '2026-10-02') {
      matchDate = '2026-10-03';
    }

    // Strict check: League 3 matches in October weekend align with League 1 & 2 to 9-11 Oct (normalize 12 Oct to 11 Oct)
    if (league === 'League 3' && matchDate === '2026-10-12') {
      matchDate = '2026-10-11';
    }

    const matchKey = `${league}_${homeTeam}_${awayTeam}`;
    if (!fixturesMap.has(matchKey)) {
      fixturesMap.set(matchKey, {
        id,
        league,
        matchWeek,
        homeTeam,
        awayTeam,
        stadium,
        matchDate,
        matchTime,
        month,
        remark,
      });
    }
  }

  return {
    fixtures: Array.from(fixturesMap.values()),
    detectedHeaders: headers,
    skippedCount,
  };
}

/**
 * Parse raw CSV or TSV text directly (from clipboard paste or file upload)
 */
export function importFixturesFromRawText(rawText: string, defaultLeague: LeagueType = 'League 1'): {
  success: boolean;
  count: number;
  fixtures: FixtureItem[];
  error?: string;
} {
  try {
    const matrix = parseDelimitedText(rawText);
    if (matrix.length === 0) {
      return { success: false, count: 0, fixtures: [], error: 'ไม่พบข้อมูลในข้อความที่นำมาวาง' };
    }

    const result = parseFixturesFromMatrix(matrix, defaultLeague);
    if (result.fixtures.length === 0) {
      return {
        success: false,
        count: 0,
        fixtures: [],
        error: 'ไม่สามารถระบุข้อมูลคู่แข่งขันได้ กรุณาตรวจสอบว่ามีคอลัมน์ ทีมเหย้า/ทีมเยือน หรือ คู่แข่งขัน (vs) และ วันที่แข่งขัน',
      };
    }

    return {
      success: true,
      count: result.fixtures.length,
      fixtures: result.fixtures,
    };
  } catch (err: any) {
    return {
      success: false,
      count: 0,
      fixtures: [],
      error: err.message || 'เกิดข้อผิดพลาดในการประมวลผลข้อมูล',
    };
  }
}

/**
 * Helper to fetch a single sheet as CSV text with failover
 */
export async function fetchSingleSheetText(
  sheetId: string,
  target?: { gid?: string | null; sheetName?: string; tabIndex?: number }
): Promise<string | null> {
  const isInvalidCsv = (txt: string) => {
    return (
      !txt ||
      txt.length < 15 ||
      txt.includes('<!DOCTYPE html>') ||
      txt.includes('<html') ||
      txt.includes('accounts.google.com') ||
      (txt.includes('google.visualization.Query.setResponse') && txt.includes('"status":"error"'))
    );
  };

  // Strategy 1: Server proxy route /api/sheets/fetch-csv (bypasses browser CORS & auth redirects)
  try {
    const qParams = [`sheetId=${encodeURIComponent(sheetId)}`];
    if (target?.gid !== undefined && target?.gid !== null && target?.gid !== '') {
      qParams.push(`gid=${encodeURIComponent(target.gid)}`);
    }
    if (target?.sheetName) {
      qParams.push(`sheetName=${encodeURIComponent(target.sheetName.trim())}`);
    }
    if (target?.tabIndex !== undefined && target?.tabIndex !== null) {
      qParams.push(`tabIndex=${encodeURIComponent(target.tabIndex.toString())}`);
    }
    const res = await fetch(`/api/sheets/fetch-csv?${qParams.join('&')}`);
    if (res.ok) {
      const text = await res.text();
      if (!isInvalidCsv(text)) {
        return text;
      }
    }
  } catch {
    // try direct gviz strategy
  }

  const params = ['tqx=out:csv'];
  if (target?.gid) {
    params.push(`gid=${target.gid}`);
  } else if (target?.sheetName) {
    params.push(`sheet=${encodeURIComponent(target.sheetName.trim())}`);
  }
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.join('&')}`;

  try {
    const res = await fetch(gvizUrl);
    if (res.ok) {
      const text = await res.text();
      if (!isInvalidCsv(text)) {
        return text;
      }
    }
  } catch (err) {
    // try next strategy
  }

  // Fallback using direct export endpoint
  try {
    const exportUrl = target?.gid 
      ? `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${target.gid}`
      : `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    const res2 = await fetch(exportUrl);
    if (res2.ok) {
      const text2 = await res2.text();
      if (!isInvalidCsv(text2)) {
        return text2;
      }
    }
  } catch (err2) {
    // ignore
  }

  return null;
}

export const CANDIDATE_TABS_L1 = [
  'T1-(THA)', 'T1', 'T1-THA', 'T1 (THA)', 'Thai League 1', 'Thai League1', 'ไทยลีก 1', 'ไทยลีก1', 'League 1', 'Sheet1'
];

export const CANDIDATE_TABS_L2 = [
  'T2-(THA)', 'T2', 'T2-THA', 'T2 (THA)', 'Thai League 2', 'Thai League2', 'ไทยลีก 2', 'ไทยลีก2', 'League 2', 'Sheet2'
];

export const CANDIDATE_TABS_L3 = [
  'NORTH', 'NORTHEAST', 'EAST', 'CENTRAL', 'WEST', 'SOUTH',
  'T3-(THA)', 'T3', 'BYD DOLPHIN LEAGUE III', 'Thai League 3', 'League 3'
];

export interface L3ZoneDefinition {
  id: string;
  nameThai: string;
  nameEn: string;
  tabName: string;
  candidates: string[];
}

export const L3_SIX_REGIONAL_ZONES: L3ZoneDefinition[] = [
  {
    id: 'north',
    nameThai: 'ภาคเหนือ',
    nameEn: 'North',
    tabName: 'NORTH',
    candidates: ['NORTH', 'North', 'T3-NORTH', 'T3-North', '1. North', '1.NORTH', 'ภาคเหนือ', 'โซนเหนือ', 'เหนือ']
  },
  {
    id: 'northeast',
    nameThai: 'ภาคตะวันออกเฉียงเหนือ (อีสาน)',
    nameEn: 'North East',
    tabName: 'NORTHEAST',
    candidates: ['NORTHEAST', 'NORTH EAST', 'North East', 'NorthEast', 'NE', 'T3-NORTHEAST', 'ภาคอีสาน', 'ภาคตะวันออกเฉียงเหนือ', 'อีสาน']
  },
  {
    id: 'east',
    nameThai: 'ภาคตะวันออก',
    nameEn: 'East',
    tabName: 'EAST',
    candidates: ['EAST', 'East', 'T3-EAST', 'T3-East', '3. East', 'ภาคตะวันออก', 'โซนตะวันออก', 'ตะวันออก']
  },
  {
    id: 'central',
    nameThai: 'ภาคกลาง / กรุงเทพและปริมณฑล',
    nameEn: 'Central',
    tabName: 'CENTRAL',
    candidates: ['CENTRAL', 'Central', 'T3-CENTRAL', 'T3-Central', 'Bangkok', 'BANGKOK', 'BMR', 'ภาคกลาง', 'โซนกลาง', 'กลาง']
  },
  {
    id: 'west',
    nameThai: 'ภาคตะวันตก',
    nameEn: 'West',
    tabName: 'WEST',
    candidates: ['WEST', 'West', 'T3-WEST', 'T3-West', '4. West', 'ภาคตะวันตก', 'โซนตะวันตก', 'ตะวันตก']
  },
  {
    id: 'south',
    nameThai: 'ภาคใต้',
    nameEn: 'South',
    tabName: 'SOUTH',
    candidates: ['SOUTH', 'South', 'T3-SOUTH', 'T3-South', '6. South', 'ภาคใต้', 'โซนใต้', 'ใต้']
  }
];

export const CANDIDATE_TABS_L3_ALL_ZONES: string[] = L3_SIX_REGIONAL_ZONES.flatMap(z => z.candidates);

/**
 * Fetch ALL fixtures for Thai League 3 from the 6 official zone tabs in the BYD Dolphin spreadsheet:
 * NORTH, NORTHEAST, EAST, CENTRAL, WEST, SOUTH
 * Strictly parses columns: "วันเดือนปี,เวลา,ทีมเหย้า,ทีมเยือน,สนามแข่งขัน"
 * NO mock data or sample data under any circumstances!
 */
export async function fetchAllLeague3FixturesFromSpreadsheet(
  sheetId: string,
  options?: {
    customTabNames?: string[];
    onProgress?: (msg: string, completedTabs: number, totalTabs: number) => void;
  }
): Promise<{
  success: boolean;
  count: number;
  fixtures: FixtureItem[];
  tabSummaries: TabSyncSummary[];
  error?: string;
}> {
  const tabSummaries: TabSyncSummary[] = [];
  const fixtureMapByMatchKey = new Map<string, FixtureItem>();
  const processedTabKeys = new Set<string>();

  const addParsedFixturesFromTab = (csv: string, tabLabel: string, gid?: string): number => {
    if (!csv || csv.length < 50) return 0;
    const parsed = importFixturesFromRawText(csv, 'League 3');
    if (!parsed.success || parsed.fixtures.length === 0) return 0;

    let addedCount = 0;
    parsed.fixtures.forEach(f => {
      // Exclude banned fake teams
      if (isBannedClub(f.homeTeam) || isBannedClub(f.awayTeam)) return;
      
      // Match identity key in League 3 (each pair plays once at home):
      const hCan = getCanonicalOfficialClub(f.homeTeam)?.name || f.homeTeam.trim();
      const aCan = getCanonicalOfficialClub(f.awayTeam)?.name || f.awayTeam.trim();
      const matchKey = `League 3_${hCan}_${aCan}`;
      if (!fixtureMapByMatchKey.has(matchKey)) {
        fixtureMapByMatchKey.set(matchKey, { ...f, homeTeam: hCan, awayTeam: aCan, league: 'League 3' });
        addedCount++;
      } else {
        // Update if existing match has changes
        const existing = fixtureMapByMatchKey.get(matchKey)!;
        fixtureMapByMatchKey.set(matchKey, {
          ...existing,
          homeTeam: hCan,
          awayTeam: aCan,
          matchDate: f.matchDate || existing.matchDate,
          matchTime: f.matchTime || existing.matchTime,
          stadium: f.stadium || existing.stadium,
          matchWeek: f.matchWeek || existing.matchWeek,
          remark: f.remark || existing.remark,
        });
      }
    });

    if (addedCount > 0) {
      tabSummaries.push({
        name: tabLabel,
        gid,
        count: addedCount,
      });
    }
    return addedCount;
  };

  // 1. First attempt: Dynamic Tab Discovery via /api/sheets/tabs
  let discoveredTabs: { name: string; gid: string }[] = [];
  try {
    const res = await fetch(`/api/sheets/tabs?sheetId=${sheetId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.tabs) && data.tabs.length > 0) {
        discoveredTabs = data.tabs;
      }
    }
  } catch (err) {
    console.warn('Tab discovery via /api/sheets/tabs failed:', err);
  }

  // 2. Fetch the 6 official zone tabs: NORTH, NORTHEAST, EAST, CENTRAL, WEST, SOUTH
  const targetZones = L3_SIX_REGIONAL_ZONES;

  for (let zIdx = 0; zIdx < targetZones.length; zIdx++) {
    const zone = targetZones[zIdx];
    options?.onProgress?.(`กำลังดึงข้อมูลแท็บ ${zone.tabName} (${zIdx + 1}/6)...`, zIdx + 1, 6);

    // Try finding matching discovered tab first
    let matchingTab = discoveredTabs.find(t => {
      const tNorm = t.name.trim().toLowerCase().replace(/[\s\-_()]/g, '');
      return zone.candidates.some(c => tNorm === c.toLowerCase().replace(/[\s\-_()]/g, ''));
    });

    let csv: string | null = null;
    if (matchingTab?.gid) {
      csv = await fetchSingleSheetText(sheetId, { gid: matchingTab.gid });
    }
    if (!csv) {
      // Try direct sheetName with the exact tab name: NORTH, NORTHEAST, EAST, CENTRAL, WEST, SOUTH
      csv = await fetchSingleSheetText(sheetId, { sheetName: zone.tabName });
    }
    if (!csv) {
      // Try candidate variations
      for (const candidate of zone.candidates) {
        if (candidate === zone.tabName) continue;
        csv = await fetchSingleSheetText(sheetId, { sheetName: candidate });
        if (csv && csv.length > 50) break;
      }
    }

    if (csv && csv.length > 50) {
      addParsedFixturesFromTab(csv, zone.tabName, matchingTab?.gid);
    }
  }

  // 3. If custom tabs specified, process them as well
  if (options?.customTabNames && options.customTabNames.length > 0) {
    for (const name of options.customTabNames) {
      const trimmed = name.trim();
      if (!trimmed || processedTabKeys.has(trimmed.toLowerCase())) continue;
      processedTabKeys.add(trimmed.toLowerCase());
      const csv = await fetchSingleSheetText(sheetId, { sheetName: trimmed });
      if (csv && csv.length > 50) {
        addParsedFixturesFromTab(csv, trimmed);
      }
    }
  }

  const allFixtures = Array.from(fixtureMapByMatchKey.values());

  allFixtures.sort((a, b) => {
    const diff = (a.matchDate || '').localeCompare(b.matchDate || '');
    if (diff !== 0) return diff;
    return (a.matchTime || '').localeCompare(b.matchTime || '');
  });

  return {
    success: allFixtures.length > 0,
    count: allFixtures.length,
    fixtures: allFixtures,
    tabSummaries,
    error: allFixtures.length === 0 
      ? 'ไม่สามารถดึงข้อมูลตารางแข่งขัน Thai League 3 จากแท็บ NORTH, NORTHEAST, EAST, CENTRAL, WEST, SOUTH ในชีต BYD DOLPHIN LEAGUE III FIXTURES 2026/27 ได้ (กรุณาตรวจสอบสิทธิ์การแชร์ชีต)' 
      : undefined,
  };
}

/**
 * Master Sync: Synchronize all 3 Thai Leagues (League 1, League 2, League 3)
 * Automatically probes tabs if only 1 master URL is provided, or uses league-specific URLs/GIDs
 */
export async function syncAllLeaguesFromGoogleSheet(masterUrlInput?: string): Promise<{
  success: boolean;
  count: number;
  fixtures: FixtureItem[];
  leagueCounts: Record<LeagueType, number>;
  error?: string;
  isPermissionIssue?: boolean;
}> {
  const masterUrl = (masterUrlInput || cachedMeta.sheetUrl || '').trim();
  if (!masterUrl) {
    return {
      success: false,
      count: 0,
      fixtures: [],
      leagueCounts: { 'League 1': 0, 'League 2': 0, 'League 3': 0 },
      error: 'กรุณากรอกลิงก์ Google Sheets ตารางการแข่งขัน',
    };
  }

  const { sheetId, gid: masterGid } = parseGoogleSheetUrl(masterUrl);
  if (!sheetId) {
    return {
      success: false,
      count: 0,
      fixtures: [],
      leagueCounts: { 'League 1': 0, 'League 2': 0, 'League 3': 0 },
      error: 'รูปแบบลิงก์ Google Sheets ไม่ถูกต้อง (ไม่พบ Spreadsheet ID)',
    };
  }

  setFixturesSheetUrl(masterUrl);

  const l1Url = getFixturesSheetUrl('League 1') || masterUrl;
  const l2Url = getFixturesSheetUrl('League 2');
  const l3Url = getFixturesSheetUrl('League 3');

  const leagueFixturesMap: Record<LeagueType, FixtureItem[]> = {
    'League 1': [],
    'League 2': [],
    'League 3': [],
  };

  // 1. Fetch Primary / League 1 Sheet (Prefer T1-(THA) tab if no specific gid)
  const primaryParsed = parseGoogleSheetUrl(l1Url);
  const primarySheetId = primaryParsed.sheetId || sheetId;
  const primaryGid = primaryParsed.gid;

  let primaryCsv: string | null = null;
  if (primaryGid) {
    primaryCsv = await fetchSingleSheetText(primarySheetId, { gid: primaryGid });
  } else {
    for (const tabName of CANDIDATE_TABS_L1) {
      primaryCsv = await fetchSingleSheetText(primarySheetId, { sheetName: tabName });
      if (primaryCsv && primaryCsv.length > 50) break;
    }
  }
  if (!primaryCsv) {
    primaryCsv = await fetchSingleSheetText(primarySheetId);
  }

  if (!primaryCsv) {
    return {
      success: false,
      count: 0,
      fixtures: [],
      leagueCounts: { 'League 1': 0, 'League 2': 0, 'League 3': 0 },
      isPermissionIssue: true,
      error: 'ไม่สามารถเข้าถึง Google Sheets ได้ กรุณาตรวจสอบว่าตั้งค่าสิทธิ์เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู" (Anyone with link can view) หรือลองนำเข้าด้วยการวางตาราง (Ctrl+V)',
    };
  }

  // Parse the primary CSV
  const primaryResult = importFixturesFromRawText(primaryCsv, 'League 1');
  if (primaryResult.success && primaryResult.fixtures.length > 0) {
    primaryResult.fixtures.forEach(f => {
      leagueFixturesMap[f.league].push(f);
    });
  }

  // 2. Fetch League 2 (Prefer T2-(THA))
  if (l2Url && l2Url !== masterUrl && l2Url !== l1Url) {
    const l2Parsed = parseGoogleSheetUrl(l2Url);
    if (l2Parsed.sheetId) {
      let l2Csv: string | null = null;
      if (l2Parsed.gid) {
        l2Csv = await fetchSingleSheetText(l2Parsed.sheetId, { gid: l2Parsed.gid });
      } else {
        for (const tab of CANDIDATE_TABS_L2) {
          l2Csv = await fetchSingleSheetText(l2Parsed.sheetId, { sheetName: tab });
          if (l2Csv && l2Csv.length > 50) break;
        }
      }
      if (l2Csv) {
        const l2Res = importFixturesFromRawText(l2Csv, 'League 2');
        if (l2Res.success && l2Res.fixtures.length > 0) {
          leagueFixturesMap['League 2'] = l2Res.fixtures.map(f => ({ ...f, league: 'League 2' }));
        }
      }
    }
  } else if (leagueFixturesMap['League 2'].length === 0) {
    // Auto-probe candidate tab names for League 2 on the same spreadsheet (T2-(THA) is first!)
    for (const tabName of CANDIDATE_TABS_L2) {
      const tabCsv = await fetchSingleSheetText(sheetId, { sheetName: tabName });
      if (tabCsv && tabCsv.length > 50 && tabCsv !== primaryCsv) {
        const tabRes = importFixturesFromRawText(tabCsv, 'League 2');
        if (tabRes.success && tabRes.fixtures.length > 0) {
          leagueFixturesMap['League 2'] = tabRes.fixtures.map(f => ({ ...f, league: 'League 2' }));
          break;
        }
      }
    }
  }

  // 3. Fetch League 3
  if (l3Url && l3Url !== masterUrl && l3Url !== l1Url) {
    const l3Parsed = parseGoogleSheetUrl(l3Url);
    if (l3Parsed.sheetId) {
      // Use multi-tab zone fetcher for full coverage
      const l3AllRes = await fetchAllLeague3FixturesFromSpreadsheet(l3Parsed.sheetId);
      if (l3AllRes.success && l3AllRes.fixtures.length > 0) {
        leagueFixturesMap['League 3'] = l3AllRes.fixtures;
      } else {
        let l3Csv: string | null = null;
        if (l3Parsed.gid) {
          l3Csv = await fetchSingleSheetText(l3Parsed.sheetId, { gid: l3Parsed.gid });
        } else {
          for (const tab of CANDIDATE_TABS_L3) {
            l3Csv = await fetchSingleSheetText(l3Parsed.sheetId, { sheetName: tab });
            if (l3Csv && l3Csv.length > 50) break;
          }
        }
        if (!l3Csv) {
          l3Csv = await fetchSingleSheetText(l3Parsed.sheetId);
        }
        if (l3Csv) {
          const l3Res = importFixturesFromRawText(l3Csv, 'League 3');
          if (l3Res.success && l3Res.fixtures.length > 0) {
            leagueFixturesMap['League 3'] = l3Res.fixtures
              .map(f => ({ ...f, league: 'League 3' as LeagueType }));
          }
        }
      }
    }
  } else if (leagueFixturesMap['League 3'].length === 0) {
    // Attempt full multi-tab fetch on master sheet ID
    const l3AllRes = await fetchAllLeague3FixturesFromSpreadsheet(sheetId);
    if (l3AllRes.success && l3AllRes.fixtures.length > 0) {
      leagueFixturesMap['League 3'] = l3AllRes.fixtures;
    } else {
      // Auto-probe candidate tab names for League 3 on the same spreadsheet
      for (const tabName of CANDIDATE_TABS_L3) {
        const tabCsv = await fetchSingleSheetText(sheetId, { sheetName: tabName });
        if (tabCsv && tabCsv.length > 50 && tabCsv !== primaryCsv) {
          const tabRes = importFixturesFromRawText(tabCsv, 'League 3');
          if (tabRes.success && tabRes.fixtures.length > 0) {
            leagueFixturesMap['League 3'] = tabRes.fixtures
              .map(f => ({ ...f, league: 'League 3' as LeagueType }));
            break;
          }
        }
      }
    }
  }

  // 4. Merge incoming live matches into the master 1,274 official season schedule
  // (ensures all 240 in L1, 306 in L2, 728 in L3 are preserved, and never drops to 604)
  const mergedL1 = mergeIncomingWithMasterSeasonFixtures(leagueFixturesMap['League 1'], 'League 1', cachedFixtures);
  const mergedL2 = mergeIncomingWithMasterSeasonFixtures(leagueFixturesMap['League 2'], 'League 2', cachedFixtures);
  const mergedL3 = mergeIncomingWithMasterSeasonFixtures(leagueFixturesMap['League 3'], 'League 3', cachedFixtures);

  const combinedFixtures = [
    ...mergedL1,
    ...mergedL2,
    ...mergedL3,
  ];

  combinedFixtures.sort((a, b) => {
    const diff = (a.matchDate || '').localeCompare(b.matchDate || '');
    if (diff !== 0) return diff;
    return (a.matchTime || '').localeCompare(b.matchTime || '');
  });

  const nowStr = new Date().toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const leagueCounts = countLeagues(combinedFixtures);
  const missingLeagues = (['League 1', 'League 2', 'League 3'] as LeagueType[]).filter(l => leagueFixturesMap[l].length === 0);

  await saveFixtures(combinedFixtures, {
    source: 'google-sheet',
    sheetUrl: masterUrl,
    lastSyncedAt: nowStr,
    statusMessage: missingLeagues.length === 0
      ? `ซิงค์ตารางแข่งขันจากชีตสำเร็จ (${combinedFixtures.length} คู่ • L1: ${leagueCounts['League 1']} | L2: ${leagueCounts['League 2']} | L3: ${leagueCounts['League 3']})`
      : `ซิงค์ได้บางลีก (${combinedFixtures.length} คู่) • อ่านชีตไม่ได้: ${missingLeagues.join(', ')}`,
  });

  return {
    success: missingLeagues.length < 3,
    count: combinedFixtures.length,
    fixtures: combinedFixtures,
    leagueCounts,
    error: missingLeagues.length > 0 ? `อ่านข้อมูลจากชีตไม่ได้สำหรับ ${missingLeagues.join(', ')} (ข้อมูลของลีกเหล่านี้ไม่ถูกอัปเดต)` : undefined,
  };
}

/** Official sources (shared with the site owner). Used whenever no valid link has been typed into the settings. */
export const DEFAULT_T1T2_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1qHdscqV7j2GB8UoF9c59UvV1Tw_eQqBV6nfJMn64Pfw/edit?gid=1540565395#gid=1540565395';
export const DEFAULT_T3_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1ixW80nSPE5rZCsdUwZlapeJ4NhOzyS03rj_W1_4vu7c/edit?gid=673770478#gid=673770478';
const L1_TAB_NAME = 'T1-(THA)';
const L2_TAB_NAME = 'T2-(THA)';
const L3_ZONE_TABS = ['NORTH', 'NORTHEAST', 'EAST', 'CENTRAL', 'WEST', 'SOUTH'];
// Google's public sample spreadsheet used by older versions as a placeholder: never a real source.
const PLACEHOLDER_SHEET_ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

function pickSheetUrl(...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    const u = (c || '').trim();
    if (u && !u.includes(PLACEHOLDER_SHEET_ID)) return u;
  }
  return '';
}

const SHEET_FIXTURE_PREFIX: Record<LeagueType, string> = {
  'League 1': 'sheet-l1-',
  'League 2': 'sheet-l2-',
  'League 3': 'sheet-l3-',
};

/** A fetch that returns far fewer rows than the last good sync is treated as suspicious (e.g. emptied sheet). */
const isSuspiciousDrop = (prevCount: number, nextCount: number) => prevCount >= 20 && nextCount < prevCount * 0.5;

/**
 * Sync from the two official Google Sheets. THE SHEET IS THE ONLY SOURCE OF TRUTH:
 *  - League 1 = tab T1-(THA), League 2 = tab T2-(THA) of the first sheet
 *  - League 3 = every regional tab (NORTH, NORTHEAST, EAST, CENTRAL, WEST, SOUTH + custom) of the second sheet
 * Each league/zone that is fetched successfully REPLACES what the site had (changed date, time, venue,
 * swapped home/away or removed matches follow the sheet). A league/zone that fails to load keeps its
 * last successful sheet data and is reported as an error. No sample/mock data is ever generated.
 */
export async function syncFromOfficialDualSheets(params?: {
  t1t2UrlInput?: string;
  t3UrlInput?: string;
  target?: 'all' | 't1t2' | 't1' | 't2' | 't3';
  customL3TabNames?: string[];
  onProgress?: (msg: string, completedTabs?: number, totalTabs?: number) => void;
}): Promise<{
  success: boolean;
  count: number;
  fixtures: FixtureItem[];
  leagueCounts: Record<LeagueType, number>;
  detectedTabsL3?: TabSyncSummary[];
  error?: string;
  isPermissionIssue?: boolean;
}> {
  const target = params?.target || 'all';
  const t1t2Url = pickSheetUrl(params?.t1t2UrlInput, getFixturesSheetT1T2Url(), DEFAULT_T1T2_SHEET_URL);
  const t3Url = pickSheetUrl(params?.t3UrlInput, getFixturesSheetT3Url(), DEFAULT_T3_SHEET_URL);
  if (t1t2Url !== getFixturesSheetT1T2Url()) setFixturesSheetT1T2Url(t1t2Url);
  if (t3Url !== getFixturesSheetT3Url()) setFixturesSheetT3Url(t3Url);

  const wantL1 = target === 'all' || target === 't1t2' || target === 't1';
  const wantL2 = target === 'all' || target === 't1t2' || target === 't2';
  const wantL3 = target === 'all' || target === 't3';

  const errors: string[] = [];
  let permissionIssue = false;
  const progress = (msg: string, done?: number, total?: number) => params?.onProgress?.(msg, done, total);
  const previousOf = (league: LeagueType, prefix = SHEET_FIXTURE_PREFIX[league]) =>
    cachedFixtures.filter(f => f.league === league && f.id.startsWith(prefix));

  const loadTab = async (sheetId: string, tabName: string) => {
    const csv = await fetchSingleSheetText(sheetId, { sheetName: tabName });
    if (!csv) return { ok: false as const, error: `อ่านแท็บ ${tabName} ไม่ได้ (ตรวจสอบว่าชีตแชร์แบบ "ทุกคนที่มีลิงก์ดูได้")` };
    return { ok: true as const, csv };
  };

  const applied: Partial<Record<LeagueType, FixtureItem[]>> = {};

  // ---- League 1 & 2 (one spreadsheet, one tab each)
  const t1t2Id = parseGoogleSheetUrl(t1t2Url).sheetId;
  for (const [league, want, tab] of [
    ['League 1', wantL1, L1_TAB_NAME],
    ['League 2', wantL2, L2_TAB_NAME],
  ] as [LeagueType, boolean, string][]) {
    if (!want) continue;
    if (!t1t2Id) {
      errors.push(`${league}: ลิงก์ชีต Thai League 1 & 2 ไม่ถูกต้อง`);
      continue;
    }
    progress(`กำลังอ่านแท็บ ${tab} (${league})...`);
    const tabRes = await loadTab(t1t2Id, tab);
    if (!tabRes.ok) {
      permissionIssue = true;
      errors.push(`${league}: ${tabRes.error}`);
      continue;
    }
    const parsed = parseFixtureSheet(tabRes.csv, league);
    if (!parsed.headerFound || parsed.fixtures.length === 0) {
      errors.push(`${league}: แท็บ ${tab} ไม่พบตารางแข่งขัน (หัวคอลัมน์ ทีมเหย้า/ทีมเยือน/วัน เดือน ปี/เวลา/สนามแข่งขัน ต้องครบ)`);
      continue;
    }
    if (isSuspiciousDrop(previousOf(league).length, parsed.fixtures.length)) {
      errors.push(`${league}: ข้อมูลในชีตลดลงผิดปกติ (${previousOf(league).length} → ${parsed.fixtures.length} นัด) จึงยังไม่อัปเดต กรุณาตรวจชีต`);
      continue;
    }
    if (parsed.rejected.length > 0) {
      errors.push(`${league}: ข้ามบางแถวที่อ่านไม่ได้ ${parsed.rejected.length} แถว (เช่นแถว ${parsed.rejected.slice(0, 3).map(r => r.rowNumber).join(', ')}: ${parsed.rejected[0].reason})`);
    }
    applied[league] = parsed.fixtures;
  }

  // ---- League 3 (every regional tab of the BYD Dolphin spreadsheet)
  let detectedTabsL3: TabSyncSummary[] | undefined;
  if (wantL3) {
    const t3Id = parseGoogleSheetUrl(t3Url).sheetId;
    if (!t3Id) {
      errors.push('League 3: ลิงก์ชีต BYD DOLPHIN LEAGUE III ไม่ถูกต้อง');
    } else {
      const tabNames = Array.from(new Set([...L3_ZONE_TABS, ...(params?.customL3TabNames || [])]));
      let done = 0;
      const results = await Promise.all(
        tabNames.map(async tab => {
          const tabRes = await loadTab(t3Id, tab);
          done++;
          progress(`อ่านแท็บ ${tab} แล้ว (${done}/${tabNames.length})`, done, tabNames.length);
          return { tab, tabRes };
        })
      );

      const l3Fixtures: FixtureItem[] = [];
      detectedTabsL3 = [];
      for (const { tab, tabRes } of results) {
        const zoneKey = tab.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'tab';
        const prevZone = previousOf('League 3', `${SHEET_FIXTURE_PREFIX['League 3']}${zoneKey}-`);
        const keepPrevious = (why: string) => {
          errors.push(`League 3 แท็บ ${tab}: ${why}${prevZone.length > 0 ? ` (ใช้ข้อมูลที่ซิงค์สำเร็จครั้งก่อน ${prevZone.length} นัด)` : ''}`);
          l3Fixtures.push(...prevZone);
          detectedTabsL3!.push({ name: tab, count: prevZone.length });
        };

        if (!tabRes.ok) {
          // custom tab names are optional; the six official zones are not
          if (L3_ZONE_TABS.includes(tab)) {
            permissionIssue = true;
            keepPrevious(tabRes.error);
          }
          continue;
        }
        const parsed = parseFixtureSheet(tabRes.csv, 'League 3', zoneKey);
        if (!parsed.headerFound || parsed.fixtures.length === 0) {
          if (L3_ZONE_TABS.includes(tab) || params?.customL3TabNames?.includes(tab)) keepPrevious('ไม่พบตารางแข่งขันในแท็บนี้');
          continue;
        }
        if (isSuspiciousDrop(prevZone.length, parsed.fixtures.length)) {
          keepPrevious(`ข้อมูลลดลงผิดปกติ (${prevZone.length} → ${parsed.fixtures.length} นัด) จึงยังไม่อัปเดต`);
          continue;
        }
        if (parsed.rejected.length > 0) {
          errors.push(`League 3 แท็บ ${tab}: ข้ามบางแถวที่อ่านไม่ได้ ${parsed.rejected.length} แถว (${parsed.rejected[0].reason})`);
        }
        l3Fixtures.push(...parsed.fixtures);
        detectedTabsL3!.push({ name: tab, count: parsed.fixtures.length });
      }
      // League 3 is shown ordered by date
      l3Fixtures.sort((a, b) => (a.matchDate || '').localeCompare(b.matchDate || '') || (a.matchTime || '').localeCompare(b.matchTime || ''));
      if (l3Fixtures.length > 0) applied['League 3'] = l3Fixtures;
    }
  }

  const leagues: LeagueType[] = ['League 1', 'League 2', 'League 3'];
  const combined: FixtureItem[] = [];
  for (const league of leagues) {
    const wanted = league === 'League 1' ? wantL1 : league === 'League 2' ? wantL2 : wantL3;
    if (applied[league]) combined.push(...applied[league]!);
    else if (wanted) combined.push(...previousOf(league)); // failed: keep last good sheet data only (never sample data)
    else combined.push(...cachedFixtures.filter(f => f.league === league)); // not requested this time: untouched
  }

  const errorText = errors.length > 0 ? errors.join(' • ') : undefined;
  if (Object.keys(applied).length === 0) {
    return {
      success: false,
      count: cachedFixtures.length,
      fixtures: cachedFixtures,
      leagueCounts: countLeagues(cachedFixtures),
      detectedTabsL3,
      error: errorText || 'ไม่พบข้อมูลตารางแข่งขันในชีต',
      isPermissionIssue: permissionIssue,
    };
  }

  const nowStr = new Date().toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const leagueCounts = countLeagues(combined);

  await saveFixtures(combined, {
    source: 'google-sheet',
    sheetT1T2Url: t1t2Url,
    sheetT3Url: t3Url,
    detectedTabsL3,
    lastSyncedAt: nowStr,
    statusMessage: `ซิงค์จากชีตสำเร็จ (${combined.length} คู่ • L1: ${leagueCounts['League 1']} | L2: ${leagueCounts['League 2']} | L3: ${leagueCounts['League 3']})${errors.length > 0 ? ' — มีบางส่วนที่ต้องตรวจสอบ' : ''}`,
  });

  return {
    success: true,
    count: cachedFixtures.length,
    fixtures: cachedFixtures,
    leagueCounts: countLeagues(cachedFixtures),
    detectedTabsL3,
    error: errorText,
    isPermissionIssue: permissionIssue,
  };
}

/**
 * Live Fetch from Google Sheet (supports single league or all leagues)
 */
export async function fetchFixturesFromGoogleSheet(
  sheetUrlInput?: string,
  targetLeague?: LeagueType
): Promise<{
  success: boolean;
  count: number;
  fixtures: FixtureItem[];
  leagueCounts?: Record<LeagueType, number>;
  error?: string;
  isPermissionIssue?: boolean;
}> {
  // If no target league specified, run the master 3-league sync
  if (!targetLeague) {
    const lowerInput = (sheetUrlInput || '').toLowerCase();
    if (lowerInput.includes('byd') || lowerInput.includes('dolphin') || lowerInput.includes('league3') || lowerInput.includes('league_3') || lowerInput.includes('league-3')) {
      return fetchFixturesFromGoogleSheet(sheetUrlInput, 'League 3');
    }

    const t1t2 = getFixturesSheetT1T2Url();
    const t3 = getFixturesSheetT3Url();
    if (t1t2 || t3) {
      return syncFromOfficialDualSheets({ target: 'all', t1t2UrlInput: t1t2, t3UrlInput: t3 || sheetUrlInput });
    }
    return syncAllLeaguesFromGoogleSheet(sheetUrlInput);
  }

  // If a specific target league is requested
  const url = (sheetUrlInput || getFixturesSheetUrl(targetLeague) || cachedMeta.sheetUrl || '').trim();
  if (!url) {
    return { success: false, count: 0, fixtures: [], error: `กรุณากรอกลิงก์ Google Sheets สำหรับ ${targetLeague}` };
  }

  const { sheetId, gid } = parseGoogleSheetUrl(url);
  if (!sheetId) {
    return { success: false, count: 0, fixtures: [], error: 'รูปแบบลิงก์ Google Sheets ไม่ถูกต้อง' };
  }

  setLeagueSheetUrl(targetLeague, url);

  // If League 3 is requested: MUST fetch ALL 6 regional tabs to get complete 700+ matches
  if (targetLeague === 'League 3') {
    setFixturesSheetT3Url(url);

    const l3Result = await fetchAllLeague3FixturesFromSpreadsheet(sheetId);
    if (l3Result.success && l3Result.fixtures.length > 0) {
      const nowStr = new Date().toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const tabCount = l3Result.tabSummaries?.length || 6;
      await saveFixturesForLeague(l3Result.fixtures, 'League 3', {
        source: 'google-sheet',
        sheetT3Url: url,
        lastSyncedAt: nowStr,
        detectedTabsL3: l3Result.tabSummaries,
        statusMessage: `ซิงค์ตาราง Thai League 3 ครบทุก ${tabCount} แท็บ/โซน (${l3Result.count} คู่แข่งขัน) สำเร็จ`,
      });

      return {
        success: true,
        count: l3Result.count,
        fixtures: l3Result.fixtures,
        leagueCounts: countLeagues(cachedFixtures),
      };
    }
  }

  const text = await fetchSingleSheetText(sheetId, { gid });
  if (!text) {
    return {
      success: false,
      count: 0,
      fixtures: [],
      isPermissionIssue: true,
      error: `ไม่สามารถดึงข้อมูล ${targetLeague} จาก Google Sheet ได้ กรุณาตรวจสอบสิทธิ์ "ทุกคนที่มีลิงก์มีสิทธิ์ดู" หรือใช้การวางข้อมูลตรง (Ctrl+V)`,
    };
  }

  const parsed = importFixturesFromRawText(text, targetLeague);
  if (!parsed.success) {
    return {
      success: false,
      count: 0,
      fixtures: [],
      error: parsed.error,
    };
  }

  const nowStr = new Date().toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  await saveFixturesForLeague(parsed.fixtures, targetLeague, {
    source: 'google-sheet',
    lastSyncedAt: nowStr,
    statusMessage: `ซิงค์ตารางแข่งขัน ${targetLeague} จาก Google Sheet สำเร็จ (${parsed.count} คู่)`,
  });

  return {
    success: true,
    count: parsed.count,
    fixtures: parsed.fixtures,
    leagueCounts: countLeagues(cachedFixtures),
  };
}

/**
 * Get current Auto-Sync Configuration
 */
export function getAutoSyncConfig(): AutoSyncConfig {
  return { ...cachedAutoSyncConfig };
}

/**
 * Update Auto-Sync Configuration
 */
export function setAutoSyncConfig(updates: Partial<AutoSyncConfig>): AutoSyncConfig {
  cachedAutoSyncConfig = {
    ...cachedAutoSyncConfig,
    ...updates,
  };

  try {
    localStorage.setItem(LOCAL_FIXTURES_AUTOSYNC_KEY, JSON.stringify(cachedAutoSyncConfig));
  } catch (e) {
    console.error('Error saving auto sync config:', e);
  }

  autoSyncListeners.forEach(cb => {
    try {
      cb({ ...cachedAutoSyncConfig });
    } catch (e) {
      console.error(e);
    }
  });

  return { ...cachedAutoSyncConfig };
}

/**
 * Subscribe to Auto-Sync Configuration and Events
 */
export function subscribeToAutoSync(listener: AutoSyncListener): () => void {
  autoSyncListeners.add(listener);
  listener({ ...cachedAutoSyncConfig });
  return () => {
    autoSyncListeners.delete(listener);
  };
}

/**
 * Run Auto-Sync Check against the official dual Google Sheets in the background
 */
export async function runAutoSyncCheck(options?: {
  force?: boolean;
  reason?: 'page-load' | 'interval' | 'manual';
}): Promise<{
  success: boolean;
  changed: boolean;
  message: string;
  count?: number;
}> {
  if (typeof window === 'undefined') {
    return { success: false, changed: false, message: 'SSR environment' };
  }

  if (!navigator.onLine) {
    const msg = 'อุปกรณ์ออฟไลน์ ข้ามการตรวจสอบ Google Sheets ชั่วคราว';
    return { success: false, changed: false, message: msg };
  }

  if (isAutoSyncRunning) {
    return { success: false, changed: false, message: 'กำลังดำเนินการตรวจสอบข้อมูลอยู่แล้ว' };
  }

  const reason = options?.reason || 'manual';
  const force = options?.force || false;

  // If not forced, throttle checks (minimum 2 minutes interval between actual network requests)
  const lastSyncTs = Number(localStorage.getItem(LOCAL_FIXTURES_LAST_AUTOSYNC_TIMESTAMP) || '0');
  if (!force && reason !== 'manual' && Date.now() - lastSyncTs < 2 * 60 * 1000) {
    return {
      success: true,
      changed: false,
      message: 'เพิ่งตรวจสอบไปเมื่อไม่กี่นาทีก่อน ข้อมูลเป็นปัจจุบัน',
      count: cachedFixtures.length,
    };
  }

  isAutoSyncRunning = true;

  const notifyAutoSync = (
    status: 'checking' | 'success' | 'failed',
    msg: string,
    hasChanges = false,
    count?: number
  ) => {
    const nowStr = new Date().toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    cachedAutoSyncConfig = {
      ...cachedAutoSyncConfig,
      lastAutoCheckStatus: status,
      lastAutoCheckMessage: msg,
      lastAutoCheckedAt: status === 'checking' ? cachedAutoSyncConfig.lastAutoCheckedAt : nowStr,
    };

    try {
      localStorage.setItem(LOCAL_FIXTURES_AUTOSYNC_KEY, JSON.stringify(cachedAutoSyncConfig));
    } catch (e) {
      console.error(e);
    }

    autoSyncListeners.forEach(cb => {
      try {
        cb({ ...cachedAutoSyncConfig }, {
          status,
          message: msg,
          checkedAt: nowStr,
          hasChanges,
          updatedCount: count,
        });
      } catch (err) {
        console.error(err);
      }
    });
  };

  notifyAutoSync('checking', 'กำลังตรวจสอบข้อมูลล่าสุดจาก Google Sheets ในพื้นหลัง...');

  try {
    // Snapshot existing fixtures to detect changes (including dates, times, venues, and remarks)
    const prevSignature = cachedFixtures
      .map(f => `${f.id}_${f.matchDate}_${f.matchTime}_${f.homeTeam}_${f.awayTeam}_${f.stadium}_${f.remark || ''}`)
      .join('|');

    // Run sync from official dual sheets
    const res = await syncFromOfficialDualSheets({ target: 'all' });

    if (res.success && res.fixtures.length > 0) {
      const newSignature = res.fixtures
        .map(f => `${f.id}_${f.matchDate}_${f.matchTime}_${f.homeTeam}_${f.awayTeam}_${f.stadium}_${f.remark || ''}`)
        .join('|');

      const hasChanged = prevSignature !== newSignature;
      localStorage.setItem(LOCAL_FIXTURES_LAST_AUTOSYNC_TIMESTAMP, Date.now().toString());

      const baseMsg = hasChanged
        ? `พบข้อมูลใหม่! อัปเดตตารางแข่งขันเรียบร้อยแล้ว (${res.count} คู่ • L1: ${res.leagueCounts['League 1']} | L2: ${res.leagueCounts['League 2']} | L3: ${res.leagueCounts['League 3']})`
        : `ตรวจสอบข้อมูลล่าสุดแล้ว ข้อมูลตรงกับ Google Sheets (${res.count} คู่)`;
      const successMsg = res.error ? `${baseMsg} — แต่มีบางส่วนที่ดึงไม่สำเร็จ: ${res.error}` : baseMsg;

      notifyAutoSync(res.error ? 'failed' : 'success', successMsg, hasChanged, res.count);

      return {
        success: true,
        changed: hasChanged,
        message: successMsg,
        count: res.count,
      };
    } else {
      const errorMsg = res.error || 'ไม่สามารถดึงข้อมูลจาก Google Sheets ได้';
      notifyAutoSync('failed', errorMsg, false);
      return {
        success: false,
        changed: false,
        message: errorMsg,
      };
    }
  } catch (err: any) {
    const errorMsg = err.message || 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูล';
    notifyAutoSync('failed', errorMsg, false);
    return {
      success: false,
      changed: false,
      message: errorMsg,
    };
  } finally {
    isAutoSyncRunning = false;
  }
}

/**
 * Initialize Background Auto-Check on Page Load and Interval
 */
export function initFixturesAutoSync(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (isAutoSyncInitialized) return () => {};
  isAutoSyncInitialized = true;

  // 1. Auto-check on Page Load after a 3.5s delay
  let pageLoadTimer: any = null;
  const config = getAutoSyncConfig();
  if (config.enabled && config.onPageLoad) {
    pageLoadTimer = setTimeout(() => {
      const currentConfig = getAutoSyncConfig();
      if (currentConfig.enabled && currentConfig.onPageLoad) {
        runAutoSyncCheck({ reason: 'page-load' });
      }
    }, 800);
  }

  // 2. Background Interval ticker (checks every 60 seconds)
  const tickerInterval = setInterval(() => {
    const currentConfig = getAutoSyncConfig();
    if (!currentConfig.enabled || currentConfig.intervalMinutes <= 0) {
      return;
    }

    const lastSyncTs = Number(localStorage.getItem(LOCAL_FIXTURES_LAST_AUTOSYNC_TIMESTAMP) || '0');
    const intervalMs = currentConfig.intervalMinutes * 60 * 1000;
    const elapsed = Date.now() - lastSyncTs;

    if (elapsed >= intervalMs) {
      runAutoSyncCheck({ reason: 'interval' });
    }
  }, 60000);

  // 3. Tab Visibility / Focus Handler (check when user returns to tab)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const currentConfig = getAutoSyncConfig();
      if (currentConfig.enabled && currentConfig.intervalMinutes > 0) {
        const lastSyncTs = Number(localStorage.getItem(LOCAL_FIXTURES_LAST_AUTOSYNC_TIMESTAMP) || '0');
        const intervalMs = currentConfig.intervalMinutes * 60 * 1000;
        if (Date.now() - lastSyncTs >= intervalMs) {
          runAutoSyncCheck({ reason: 'interval' });
        }
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    if (pageLoadTimer) clearTimeout(pageLoadTimer);
    clearInterval(tickerInterval);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    isAutoSyncInitialized = false;
  };
}
