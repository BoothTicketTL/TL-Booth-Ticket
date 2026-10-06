import { LeagueType } from '../types';
import { INITIAL_STADIUM_CONTACTS } from '../data/stadiumContacts';
import { THAI_LEAGUE_FIXTURES } from '../data/fixtures';
import { L3_ZONES_DATA } from './l3SeasonFixturesGenerator';
import {
  ALL_OFFICIAL_CLUBS,
  OFFICIAL_CLUBS_BY_LEAGUE,
  getCanonicalOfficialClub,
  isOfficialSeasonClub
} from '../data/officialSeasonClubs';
import { 
  teamsMatch, 
  cleanTeamName, 
  cleanTeamCore,
  saveLeagueHomeTeamContacts,
  LeagueHomeTeamContact,
  isValidPhoneNumber,
  formatPhoneNumber
} from './stadiumContactsService';
import {
  parseGoogleSheetUrl,
  fetchSingleSheetText,
  parseDelimitedText,
  normalizeLeague
} from './fixturesService';

export interface ClubPhonebookEntry {
  id: string;
  league: LeagueType;
  clubName: string;          // ชื่อสโมสร (ทีมเหย้า)
  stadiumName?: string;       // ชื่อสนามหลัก
  province?: string;          // จังหวัด
  boothContact: string;      // เบอร์ติดต่อสำหรับออกบูธ (ชื่อ + เบอร์)
  ticketContact: string;     // เบอร์ติดต่อสำหรับรับบัตร (ชื่อ + เบอร์)
  remark: string;            // Remark
  updatedAt: string;
  updatedBy?: string;
}

const STORAGE_KEY = 'thaileague_master_club_phonebook_v1';
const DELETED_KEYS_STORAGE = 'thaileague_deleted_clubs_v1';

function getDeletedClubKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_KEYS_STORAGE);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        // Sanitize: only retain league-scoped keys or specific IDs.
        // Drops legacy un-scoped team names that accidentally caused global blacklisting.
        const sanitized = arr.filter(k => 
          typeof k === 'string' && (
            k.startsWith('sc-') || 
            k.startsWith('club-') || 
            k.startsWith('League 1_') || 
            k.startsWith('League 2_') || 
            k.startsWith('League 3_')
          )
        );
        return new Set(sanitized);
      }
    }
  } catch (e) {
    console.error('Error loading deleted clubs blacklist:', e);
  }
  return new Set();
}

function recordDeletedClub(id: string, league?: string, clubName?: string) {
  const set = getDeletedClubKeys();
  if (id) set.add(id);
  if (league && clubName) {
    set.add(`${league}_${cleanTeamName(clubName)}`);
  }
  try {
    localStorage.setItem(DELETED_KEYS_STORAGE, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.error('Error storing deleted clubs blacklist:', e);
  }
}

/**
 * Remove a club from the deleted blacklist so it can be re-added anytime
 */
export function unrecordDeletedClub(id?: string, league?: string, clubName?: string): void {
  try {
    const raw = localStorage.getItem(DELETED_KEYS_STORAGE);
    if (!raw) return;
    const arr: string[] = JSON.parse(raw);
    if (!Array.isArray(arr)) return;

    const toRemove = new Set<string>();
    if (id) toRemove.add(id);
    if (clubName) {
      const pure = cleanTeamName(clubName);
      toRemove.add(pure);
      if (league) {
        toRemove.add(`${league}_${pure}`);
      }
      toRemove.add(`League 1_${pure}`);
      toRemove.add(`League 2_${pure}`);
      toRemove.add(`League 3_${pure}`);
    }

    const updated = arr.filter(k => !toRemove.has(k));
    localStorage.setItem(DELETED_KEYS_STORAGE, JSON.stringify(updated));
  } catch (e) {
    console.error('Error unrecording deleted club:', e);
  }
}

type PhonebookListener = (clubs: ClubPhonebookEntry[]) => void;
const listeners: Set<PhonebookListener> = new Set();

let cachedPhonebook: ClubPhonebookEntry[] | null = null;

/**
 * Deduplicate and sanitize club list:
 * - Checks deletion blacklist
 * - Merges any duplicate clubs within the same league (retaining any filled contact data)
 * - Sorts Thai alphabetically
 */
export function deduplicateClubs(rawList: ClubPhonebookEntry[]): ClubPhonebookEntry[] {
  const deletedKeys = getDeletedClubKeys();
  const result: ClubPhonebookEntry[] = [];

  for (const item of rawList) {
    if (!item.clubName || !item.clubName.trim()) continue;
    
    const pureKey = cleanTeamName(item.clubName);
    const cleanKey = `${item.league}_${pureKey}`;
    if (deletedKeys.has(item.id) || deletedKeys.has(cleanKey)) {
      continue;
    }

    // Check if club already exists in this league
    const existingIdx = result.findIndex(r => {
      if (r.id === item.id) return true;
      if (r.league !== item.league) return false;
      if (r.clubName === item.clubName) return true;
      const canA = getCanonicalOfficialClub(r.clubName, r.league);
      const canB = getCanonicalOfficialClub(item.clubName, item.league);
      if (canA && canB) {
        return canA.name === canB.name && canA.league === canB.league;
      }
      return false;
    });

    if (existingIdx === -1) {
      result.push({
        ...item,
        clubName: item.clubName.trim(),
        stadiumName: item.stadiumName?.trim() || '',
        province: item.province?.trim() || '',
        boothContact: item.boothContact?.trim() || '',
        ticketContact: item.ticketContact?.trim() || '',
        remark: item.remark?.trim() || '',
      });
    } else {
      const existing = result[existingIdx];
      const isIncomingFromSync = Boolean(item.updatedBy?.includes('Google Sheet') || item.updatedBy?.includes('CSV'));
      
      if (isIncomingFromSync) {
        // Incoming is from sheet sync: prioritize new contact data from sheet!
        result[existingIdx] = {
          ...existing,
          ...item,
          id: existing.id,
          stadiumName: item.stadiumName || existing.stadiumName,
          province: item.province || existing.province,
          boothContact: item.boothContact !== undefined && item.boothContact !== '' ? item.boothContact.trim() : existing.boothContact,
          ticketContact: item.ticketContact !== undefined && item.ticketContact !== '' ? item.ticketContact.trim() : existing.ticketContact,
          remark: item.remark !== undefined && item.remark !== '' ? item.remark.trim() : existing.remark,
          updatedBy: item.updatedBy,
          updatedAt: item.updatedAt,
        };
      } else {
        const hasBetterNewContact = Boolean((item.boothContact && item.boothContact.trim()) || (item.ticketContact && item.ticketContact.trim()));
        const hasBetterExistingContact = Boolean((existing.boothContact && existing.boothContact.trim()) || (existing.ticketContact && existing.ticketContact.trim()));

        if (hasBetterNewContact && !hasBetterExistingContact) {
          result[existingIdx] = {
            ...existing,
            ...item,
            stadiumName: item.stadiumName || existing.stadiumName,
            province: item.province || existing.province,
            boothContact: item.boothContact.trim(),
            ticketContact: item.ticketContact.trim(),
            remark: item.remark?.trim() || existing.remark,
          };
        } else {
          // Merge missing data, preferring non-empty contact fields
          result[existingIdx] = {
            ...item,
            ...existing,
            boothContact: (item.boothContact || existing.boothContact || '').trim(),
            ticketContact: (item.ticketContact || existing.ticketContact || '').trim(),
            remark: (item.remark || existing.remark || '').trim(),
            stadiumName: item.stadiumName || existing.stadiumName || '',
            province: item.province || existing.province || '',
          };
        }
      }
    }
  }

  return result.sort((a, b) => a.clubName.localeCompare(b.clubName, 'th'));
}

/**
 * Generate initial list of clubs categorized into League 1, 2, 3
 * STRICTLY restricted to the 103 official season clubs specified by user brief.
 * Total: 103 clubs (League 1: 16, League 2: 18, League 3: 69).
 * Absolutely no outside, historical, or hallucinated clubs are allowed.
 */
function buildInitialClubPhonebook(): ClubPhonebookEntry[] {
  const list: ClubPhonebookEntry[] = [];

  // Helper map from INITIAL_STADIUM_CONTACTS for stadium names & provinces only (NO mock coordinator phones)
  const stadiumVenueMap = new Map<string, { stadiumName?: string; province?: string }>();
  INITIAL_STADIUM_CONTACTS.forEach(sc => {
    if (sc.homeClub) {
      stadiumVenueMap.set(`${sc.league}_${sc.homeClub}`, {
        stadiumName: sc.stadiumName,
        province: sc.locationProvince,
      });
    }
  });

  // Also extract stadium info from L3_ZONES_DATA if available
  const l3StadiumMap = new Map<string, { stadium?: string; zoneName?: string }>();
  if (typeof L3_ZONES_DATA === 'object' && L3_ZONES_DATA !== null) {
    Object.values(L3_ZONES_DATA).forEach((zone) => {
      if (Array.isArray(zone.clubs)) {
        zone.clubs.forEach((clubObj) => {
          const canonical = getCanonicalOfficialClub(clubObj.name, 'League 3');
          if (canonical) {
            l3StadiumMap.set(canonical.name, {
              stadium: clubObj.stadium || '',
              zoneName: zone.nameThai || '',
            });
          }
        });
      }
    });
  }

  // Iterate strictly through the official clubs per league (103 clubs)
  // Per user instruction: absolutely NO mock data or dummy coordinator contacts.
  // Contact numbers and remarks remain empty until fetched from Google Sheet "เบอร์ติดต่อหน้าสนาม" or entered by admin.
  (Object.entries(OFFICIAL_CLUBS_BY_LEAGUE) as [LeagueType, readonly string[]][]).forEach(([league, clubs]) => {
    clubs.forEach((clubName) => {
      const venue = stadiumVenueMap.get(`${league}_${clubName}`);
      const l3Info = l3StadiumMap.get(clubName);
      const idKey = `club-${league.replace(/\s+/g, '')}-${cleanTeamName(clubName)}`;

      list.push({
        id: idKey,
        league: league,
        clubName: clubName,
        stadiumName: venue?.stadiumName || l3Info?.stadium || (clubName.includes('พิจิตร') ? 'สนามกีฬา อบจ.พิจิตร' : `สนามเหย้าสโมสร ${clubName}`),
        province: venue?.province || (clubName.includes('พิจิตร') ? 'พิจิตร' : ''),
        boothContact: '',
        ticketContact: '',
        remark: '',
        updatedAt: new Date().toISOString(),
        updatedBy: '',
      });
    });
  });

  return deduplicateClubs(list);
}

/**
 * Load club phonebook from local storage or initialize
 * Statically guarantees only official season clubs are present (103 clubs).
 * Purges any legacy mock data.
 */
export function getMasterClubPhonebook(): ClubPhonebookEntry[] {
  const baseList = buildInitialClubPhonebook();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter strictly to official season clubs and normalize canonical club name and league
        const validStoredMap = new Map<string, ClubPhonebookEntry>();
        parsed.forEach(item => {
          const canonical = getCanonicalOfficialClub(item.clubName, item.league);
          if (canonical) {
            const key = `${canonical.league}_${canonical.name}`;
            // Purge legacy mock data that was previously seeded with dummy phone numbers
            const isMockSeed = item.updatedBy === 'ระบบตั้งต้น' || 
              (typeof item.boothContact === 'string' && (
                item.boothContact.includes('คุณสิรภพ') ||
                item.boothContact.includes('คุณใหม่') ||
                item.boothContact.includes('086-354-5766') ||
                item.boothContact.includes('096-206-0446')
              ));

            validStoredMap.set(key, {
              ...item,
              clubName: canonical.name,
              league: canonical.league,
              boothContact: isMockSeed ? '' : (item.boothContact || ''),
              ticketContact: isMockSeed ? '' : (item.ticketContact || ''),
              remark: isMockSeed ? '' : (item.remark || ''),
              updatedBy: isMockSeed ? '' : item.updatedBy,
            });
          }
        });

        // Merge stored updates onto canonical baseList
        const merged = baseList.map(baseClub => {
          const key = `${baseClub.league}_${baseClub.clubName}`;
          const stored = validStoredMap.get(key);
          if (stored) {
            return {
              ...baseClub,
              stadiumName: stored.stadiumName || baseClub.stadiumName,
              province: stored.province || baseClub.province,
              boothContact: stored.boothContact !== undefined ? stored.boothContact : baseClub.boothContact,
              ticketContact: stored.ticketContact !== undefined ? stored.ticketContact : baseClub.ticketContact,
              remark: stored.remark !== undefined ? stored.remark : baseClub.remark,
              updatedBy: stored.updatedBy || baseClub.updatedBy,
              updatedAt: stored.updatedAt || baseClub.updatedAt,
            };
          }
          return baseClub;
        });

        const sanitized = deduplicateClubs(merged.filter(c => isOfficialSeasonClub(c.clubName)));
        cachedPhonebook = sanitized;

        // Keep localStorage sanitized
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
        } catch {}

        return sanitized;
      }
    }
  } catch (e) {
    console.error('Error loading master club phonebook:', e);
  }

  // Fallback to initial base list
  cachedPhonebook = baseList;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(baseList));
  } catch (e) {
    console.error('Error saving initial club phonebook:', e);
  }

  return cachedPhonebook;
}

/**
 * Get clubs for a specific league
 */
export function getClubPhonebookByLeague(league: LeagueType): ClubPhonebookEntry[] {
  const all = getMasterClubPhonebook();
  return all.filter(c => c.league === league);
}

/**
 * Notify all subscribed components
 */
function notifyListeners() {
  const current = getMasterClubPhonebook();
  listeners.forEach(fn => {
    try {
      fn(current);
    } catch (err) {
      console.error('Error in phonebook listener:', err);
    }
  });
}

/**
 * Subscribe to phonebook changes
 */
export function subscribeToClubPhonebook(listener: PhonebookListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Save / Update a single club in the phonebook
 */
export function saveClubPhonebookEntry(
  entry: Partial<ClubPhonebookEntry> & { id: string },
  updatedBy: string = 'Admin'
): ClubPhonebookEntry {
  const all = [...getMasterClubPhonebook()];
  
  // Find by ID first, or by team match + league
  let idx = all.findIndex(c => c.id === entry.id);
  if (idx < 0 && entry.clubName) {
    idx = all.findIndex(c => 
      (entry.league ? c.league === entry.league : true) && 
      teamsMatch(c.clubName, entry.clubName)
    );
  }

  const existing = idx >= 0 ? all[idx] : null;
  const updatedItem: ClubPhonebookEntry = {
    id: entry.id || existing?.id || `club-${Date.now()}`,
    league: entry.league || existing?.league || 'League 1',
    clubName: (entry.clubName ?? existing?.clubName ?? '').trim(),
    stadiumName: (entry.stadiumName ?? existing?.stadiumName ?? '').trim(),
    province: (entry.province ?? existing?.province ?? '').trim(),
    boothContact: (entry.boothContact ?? existing?.boothContact ?? '').trim(),
    ticketContact: (entry.ticketContact ?? existing?.ticketContact ?? '').trim(),
    remark: (entry.remark ?? existing?.remark ?? '').trim(),
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  if (idx >= 0) {
    all[idx] = updatedItem;
  } else {
    all.push(updatedItem);
  }

  const cleanList = deduplicateClubs(all);
  cachedPhonebook = cleanList;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanList));
  } catch (e) {
    console.error('Error storing club phonebook:', e);
  }

  notifyListeners();
  return updatedItem;
}

/**
 * Save multiple clubs at once (e.g. after editing a whole league)
 */
export function saveAllClubPhonebookEntries(
  entries: ClubPhonebookEntry[],
  updatedBy: string = 'Admin'
): void {
  const current = [...getMasterClubPhonebook()];
  const entryMap = new Map(entries.map(e => [e.id, e]));

  const updatedList = current.map(item => {
    if (entryMap.has(item.id)) {
      const incoming = entryMap.get(item.id)!;
      entryMap.delete(item.id);
      return {
        ...item,
        ...incoming,
        boothContact: (incoming.boothContact ?? item.boothContact ?? '').trim(),
        ticketContact: (incoming.ticketContact ?? item.ticketContact ?? '').trim(),
        remark: (incoming.remark ?? item.remark ?? '').trim(),
        updatedAt: new Date().toISOString(),
        updatedBy,
      };
    }
    return item;
  });

  // Append any remainder
  entryMap.forEach(incoming => {
    updatedList.push({
      ...incoming,
      boothContact: (incoming.boothContact || '').trim(),
      ticketContact: (incoming.ticketContact || '').trim(),
      remark: (incoming.remark || '').trim(),
      updatedAt: new Date().toISOString(),
      updatedBy,
    });
  });

  const cleanList = deduplicateClubs(updatedList);
  cachedPhonebook = cleanList;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanList));
  } catch (e) {
    console.error('Error saving all club phonebook entries:', e);
  }

  notifyListeners();
}

/**
 * Add a new club entry
 */
export function addClubPhonebookEntry(
  data: Omit<ClubPhonebookEntry, 'id' | 'updatedAt'>,
  updatedBy: string = 'Admin'
): ClubPhonebookEntry {
  // Un-blacklist this club name and league
  unrecordDeletedClub(undefined, data.league, data.clubName);

  const newId = `club-custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const newEntry: ClubPhonebookEntry = {
    ...data,
    clubName: data.clubName.trim(),
    stadiumName: data.stadiumName?.trim() || '',
    province: data.province?.trim() || '',
    boothContact: data.boothContact?.trim() || '',
    ticketContact: data.ticketContact?.trim() || '',
    remark: data.remark?.trim() || '',
    id: newId,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  const current = getMasterClubPhonebook();
  // Filter out any prior duplicate for the same league so new entry takes full precedence
  const withoutDuplicate = current.filter(c => 
    !(c.league === data.league && teamsMatch(c.clubName, data.clubName))
  );

  const all = deduplicateClubs([...withoutDuplicate, newEntry]);
  cachedPhonebook = all;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    console.error('Error adding club phonebook entry:', e);
  }

  notifyListeners();
  return newEntry;
}

/**
 * Delete a club entry
 */
export function deleteClubPhonebookEntry(id: string, clubName?: string, league?: LeagueType): void {
  // Record in deleted blacklist
  recordDeletedClub(id, league, clubName);

  const current = getMasterClubPhonebook();
  const all = current.filter(c => {
    if (c.id === id) return false;
    if (clubName && league && c.league === league && (c.clubName === clubName || cleanTeamName(c.clubName) === cleanTeamName(clubName))) {
      return false;
    }
    return true;
  });

  cachedPhonebook = deduplicateClubs(all);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedPhonebook));
  } catch (e) {
    console.error('Error deleting club phonebook entry:', e);
  }
  notifyListeners();
}

/**
 * Move or change club league
 */
export function changeClubLeague(id: string, newLeague: LeagueType, updatedBy: string = 'Admin'): void {
  const current = getMasterClubPhonebook();
  const all = current.map(c => {
    if (c.id === id) {
      return {
        ...c,
        league: newLeague,
        updatedAt: new Date().toISOString(),
        updatedBy,
      };
    }
    return c;
  });

  cachedPhonebook = deduplicateClubs(all);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedPhonebook));
  } catch (e) {
    console.error('Error changing club league:', e);
  }
  notifyListeners();
}

/**
 * Primary lookup for match contact:
 * Matches home team or stadium against the Master Club Phonebook
 */
export function findMasterClubContact(
  league?: LeagueType,
  clubName?: string,
  stadiumName?: string
): ClubPhonebookEntry | null {
  if (!clubName && !stadiumName) return null;
  const list = getMasterClubPhonebook();

  const hasAnyContact = (c: ClubPhonebookEntry) => 
    Boolean((c.boothContact && c.boothContact.trim()) || 
            (c.ticketContact && c.ticketContact.trim()) || 
            (c.remark && c.remark.trim()));

  // 1. Try exact league + team match with contacts
  if (league && clubName) {
    const match = list.find(c => c.league === league && teamsMatch(c.clubName, clubName) && hasAnyContact(c));
    if (match) return match;
  }

  // 2. Try any league + team match with contacts
  if (clubName) {
    const match = list.find(c => teamsMatch(c.clubName, clubName) && hasAnyContact(c));
    if (match) return match;
  }

  // 3. Try stadium match with contacts
  if (stadiumName) {
    const cleanStad = cleanTeamName(stadiumName);
    const match = list.find(c => 
      c.stadiumName && 
      (cleanTeamName(c.stadiumName) === cleanStad || teamsMatch(c.stadiumName, stadiumName)) && 
      hasAnyContact(c)
    );
    if (match) return match;
  }

  // 4. Fallback: match without contacts (if club registered but no contact numbers yet)
  if (league && clubName) {
    const match = list.find(c => c.league === league && teamsMatch(c.clubName, clubName));
    if (match) return match;
  }

  if (clubName) {
    const match = list.find(c => teamsMatch(c.clubName, clubName));
    if (match) return match;
  }

  if (stadiumName) {
    const cleanStad = cleanTeamName(stadiumName);
    const match = list.find(c => 
      c.stadiumName && 
      (cleanTeamName(c.stadiumName) === cleanStad || teamsMatch(c.stadiumName, stadiumName))
    );
    if (match) return match;
  }

  return null;
}

/**
 * Parse a CSV sheet text into ClubPhonebookEntry items
 * Handles columns:
 * 1. สโมสรทีมเหย้า
 * 2. ชื่อ+เบอร์ติดต่อสำหรับออกบูธ
 * 3. ชื่อ+เบอร์ติดต่อสำหรับรับบัตร
 * 4. Remark
 */
export function parseClubPhonebookCsv(
  csvText: string,
  league: LeagueType,
  tabName: string
): ClubPhonebookEntry[] {
  const rows = parseDelimitedText(csvText);
  if (!rows || rows.length < 2) return [];

  // 1. Identify header row (must have >= 2 non-empty cells)
  let headerIndex = -1;
  let headers: string[] = [];
  
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const nonEmpty = row.filter(c => c && c.trim().length > 0);
    if (nonEmpty.length < 2) continue;

    const lineStr = row.join(' ').toLowerCase();
    if (
      lineStr.includes('สโมสร') || 
      lineStr.includes('ทีม') || 
      lineStr.includes('เหย้า') || 
      lineStr.includes('home') || 
      lineStr.includes('ออกบูธ') || 
      lineStr.includes('รับบัตร') ||
      lineStr.includes('บูธ') ||
      lineStr.includes('บัตร') ||
      lineStr.includes('เบอร์') ||
      lineStr.includes('โทร') ||
      lineStr.includes('ติดต่อ') ||
      lineStr.includes('phone') ||
      lineStr.includes('tel') ||
      lineStr.includes('contact') ||
      lineStr.includes('club') ||
      lineStr.includes('team') ||
      lineStr.includes('coordinator') ||
      lineStr.includes('ผู้ประสานงาน') ||
      lineStr.includes('remark') ||
      lineStr.includes('หมายเหตุ')
    ) {
      headerIndex = i;
      headers = row.map(h => (h || '').trim().toLowerCase());
      break;
    }
  }

  if (headerIndex === -1) {
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      if (rows[i] && rows[i].filter(c => c && c.trim()).length >= 2) {
        headerIndex = i;
        headers = rows[i].map(h => (h || '').trim().toLowerCase());
        break;
      }
    }
    if (headerIndex === -1) {
      headerIndex = 0;
      headers = rows[0].map(h => (h || '').trim().toLowerCase());
    }
  }

  // Column matching
  let colClub = -1;
  let colBooth = -1;
  let colTicket = -1;
  let colGeneralPhone = -1;
  let colCoordinator = -1;
  let colRemark = -1;
  let colStadium = -1;
  let colProvince = -1;
  let colLeague = -1;

  headers.forEach((h, idx) => {
    const rawH = (h || '').trim();
    const cleanH = rawH.replace(/[\s\-_()\/\\+,]/g, '').toLowerCase();
    const lowerH = rawH.toLowerCase();

    // 0. League column if present
    if (
      colLeague === -1 &&
      (
        lowerH === 'league' || lowerH.includes('league') || lowerH === 'ลีก' || lowerH.includes('ลีก') ||
        lowerH === 'tier' || lowerH === 'ระดับ' || lowerH === 'สาย' || lowerH === 'division'
      )
    ) {
      colLeague = idx;
      return;
    }

    // 1. สโมสรทีมเหย้า
    if (
      colClub === -1 &&
      (
        cleanH.includes('สโมสรทีมเหย้า') ||
        cleanH.includes('ทีมเหย้า') ||
        cleanH.includes('สโมสรเหย้า') ||
        cleanH.includes('ชื่อสโมสร') ||
        cleanH.includes('รายชื่อสโมสร') ||
        cleanH.includes('รายชื่อทีม') ||
        cleanH.includes('hometeam') ||
        cleanH.includes('homeclub') ||
        cleanH === 'home' ||
        cleanH === 'สโมสร' ||
        cleanH === 'ทีม' ||
        cleanH.includes('สโมสร') ||
        cleanH.includes('ชื่อทีม')
      ) &&
      !cleanH.includes('เบอร์') &&
      !cleanH.includes('โทร') &&
      !cleanH.includes('ออกบูธ') &&
      !cleanH.includes('รับบัตร') &&
      !cleanH.includes('เยือน') &&
      !cleanH.includes('away')
    ) {
      colClub = idx;
      return;
    }

    // 2. ชื่อ+เบอร์ติดต่อสำหรับออกบูธ
    if (
      colBooth === -1 &&
      (
        cleanH.includes('ชื่อเบอร์ติดต่อสำหรับออกบูธ') ||
        cleanH.includes('ชื่อเบอร์ติดต่อออกบูธ') ||
        cleanH.includes('เบอร์ติดต่อสำหรับออกบูธ') ||
        cleanH.includes('เบอร์ติดต่อออกบูธ') ||
        cleanH.includes('เบอร์ออกบูธ') ||
        cleanH.includes('ออกบูธ') ||
        cleanH.includes('บูธ') ||
        cleanH.includes('booth')
      ) &&
      !cleanH.includes('รับบัตร') &&
      !cleanH.includes('บัตร')
    ) {
      colBooth = idx;
      return;
    }

    // 3. ชื่อ+เบอร์ติดต่อสำหรับรับบัตร
    if (
      colTicket === -1 &&
      (
        cleanH.includes('ชื่อเบอร์ติดต่อสำหรับรับบัตร') ||
        cleanH.includes('ชื่อเบอร์ติดต่อรับบัตร') ||
        cleanH.includes('เบอร์ติดต่อสำหรับรับบัตร') ||
        cleanH.includes('เบอร์ติดต่อรับบัตร') ||
        cleanH.includes('เบอร์รับบัตร') ||
        cleanH.includes('รับบัตร') ||
        cleanH.includes('บัตร') ||
        cleanH.includes('ตั๋ว') ||
        cleanH.includes('ticket')
      ) &&
      !cleanH.includes('ออกบูธ') &&
      !cleanH.includes('บูธ')
    ) {
      colTicket = idx;
      return;
    }

    // 4. Combined Booth + Ticket if a single merged column
    if (
      (colBooth === -1 || colTicket === -1) &&
      (
        cleanH.includes('ออกบูธรับบัตร') ||
        cleanH.includes('บูธและบัตร') ||
        (cleanH.includes('บูธ') && cleanH.includes('บัตร'))
      )
    ) {
      if (colBooth === -1) colBooth = idx;
      if (colTicket === -1) colTicket = idx;
      return;
    }

    // 5. Coordinator name
    if (
      colCoordinator === -1 &&
      (
        cleanH.includes('ผู้ประสานงาน') ||
        cleanH.includes('ชื่อผู้ประสานงาน') ||
        cleanH.includes('ชื่อผู้ติดต่อ') ||
        cleanH.includes('ผู้ติดต่อ') ||
        cleanH.includes('coordinator') ||
        cleanH.includes('contactperson')
      ) &&
      !cleanH.includes('เบอร์') &&
      !cleanH.includes('โทร')
    ) {
      colCoordinator = idx;
      return;
    }

    // 6. General phone / contact column (including เบอร์ติดต่อหน้าสนาม)
    if (
      colGeneralPhone === -1 &&
      (
        cleanH.includes('เบอร์ติดต่อหน้าสนาม') ||
        cleanH.includes('เบอร์หน้าสนาม') ||
        cleanH.includes('หน้าสนาม') ||
        cleanH.includes('เบอร์โทรศัพท์') ||
        cleanH.includes('เบอร์โทร') ||
        cleanH.includes('เบอร์ติดต่อ') ||
        cleanH.includes('เบอร์ประสานงาน') ||
        cleanH.includes('เบอร์') ||
        cleanH.includes('โทรศัพท์') ||
        cleanH.includes('โทร') ||
        cleanH.includes('tel') ||
        cleanH.includes('phone') ||
        cleanH.includes('mobile') ||
        cleanH.includes('contact')
      )
    ) {
      colGeneralPhone = idx;
      return;
    }

    // 7. Remark
    if (
      colRemark === -1 &&
      (
        cleanH === 'remark' ||
        cleanH.includes('remark') ||
        cleanH.includes('หมายเหตุ') ||
        cleanH.includes('note') ||
        cleanH.includes('ข้อความเพิ่มเติม') ||
        cleanH.includes('ข้อมูลเพิ่มเติม') ||
        cleanH.includes('comment')
      )
    ) {
      colRemark = idx;
      return;
    }

    // 8. Stadium & Province if present
    if (colStadium === -1 && (cleanH.includes('สนาม') || cleanH.includes('stadium') || cleanH.includes('venue'))) {
      colStadium = idx;
      return;
    }
    if (colProvince === -1 && (cleanH.includes('จังหวัด') || cleanH.includes('province'))) {
      colProvince = idx;
      return;
    }
  });

  // Fallbacks by inspecting first data row if header didn't explicitly match
  if (colClub === -1 && rows.length > headerIndex + 1) {
    const firstRow = rows[headerIndex + 1] || [];
    if (firstRow[0] && isOfficialSeasonClub(firstRow[0].trim())) {
      colClub = 0;
    } else if (firstRow[1] && isOfficialSeasonClub(firstRow[1].trim())) {
      colClub = 1;
    } else if (firstRow[0] && isNaN(Number(firstRow[0].trim()))) {
      colClub = 0;
    }
  }

  // If club column was completely undetectable, do NOT guess or create mock data
  if (colClub === -1) {
    return [];
  }

  // If booth/ticket were not explicitly separated, check general phone
  if (colBooth === -1 && colTicket === -1 && colGeneralPhone >= 0) {
    colBooth = colGeneralPhone;
    colTicket = colGeneralPhone;
  } else if (colBooth === -1 && colGeneralPhone >= 0) {
    colBooth = colGeneralPhone;
  } else if (colTicket === -1 && colGeneralPhone >= 0) {
    colTicket = colGeneralPhone;
  }

  if (colBooth === -1 && headers.length >= 2) {
    colBooth = colClub === 0 ? 1 : 2;
  }
  if (colTicket === -1 && headers.length >= 3) {
    colTicket = colBooth;
  }
  if (colRemark === -1 && headers.length >= 4) {
    colRemark = colTicket === colBooth ? colBooth + 1 : colTicket + 1;
  }

  const entries: ClubPhonebookEntry[] = [];
  const now = new Date().toISOString();
  const masterClubs = getMasterClubPhonebook();

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0 || row.every(c => !c.trim())) continue;

    let rawClub = colClub >= 0 && row[colClub] ? row[colClub].trim() : '';
    if (!rawClub || rawClub === '-' || rawClub.toLowerCase() === 'n/a') continue;

    // If first column was row number (1, 2, 3...) and next column has club name
    if (/^\d+$/.test(rawClub) && row[colClub + 1] && isNaN(Number(row[colClub + 1].trim()))) {
      rawClub = row[colClub + 1].trim();
    }

    // Filter out rows that are actually header repeats or notes
    const lowerClub = rawClub.toLowerCase().trim();
    if (
      lowerClub === 'สโมสรทีมเหย้า' || 
      lowerClub === 'รายชื่อสโมสร' || 
      lowerClub === 'ไทยลีก' || 
      lowerClub === 'ไทยลีก 1' || 
      lowerClub === 'ไทยลีก 2' || 
      lowerClub === 'ไทยลีก 3' || 
      lowerClub === 'league' ||
      (lowerClub.startsWith('league 1') && lowerClub.length < 12) ||
      (lowerClub.startsWith('league 2') && lowerClub.length < 12) ||
      (lowerClub.startsWith('league 3') && lowerClub.length < 12) ||
      cleanTeamName(rawClub).length < 2
    ) {
      continue;
    }

    const rawBooth = colBooth >= 0 && row[colBooth] ? row[colBooth].trim() : '';
    const rawTicket = colTicket >= 0 && row[colTicket] ? row[colTicket].trim() : '';
    const rawCoord = colCoordinator >= 0 && row[colCoordinator] ? row[colCoordinator].trim() : '';
    const rawRemark = colRemark >= 0 && row[colRemark] ? row[colRemark].trim() : '';
    const rawStadium = colStadium >= 0 && row[colStadium] ? row[colStadium].trim() : '';
    const rawProvince = colProvince >= 0 && row[colProvince] ? row[colProvince].trim() : '';

    let cleanBooth = (rawBooth === '-' || rawBooth === '--' || rawBooth.toLowerCase() === 'n/a' || rawBooth.toLowerCase() === 'null') ? '' : rawBooth;
    let cleanTicket = (rawTicket === '-' || rawTicket === '--' || rawTicket.toLowerCase() === 'n/a' || rawTicket.toLowerCase() === 'null') ? '' : rawTicket;
    const cleanRemark = (rawRemark === '-' || rawRemark === '--' || rawRemark.toLowerCase() === 'n/a' || rawRemark.toLowerCase() === 'null') ? '' : rawRemark;

    // If coordinator name is separate from phone number, combine them gracefully
    if (rawCoord && rawCoord !== '-' && rawCoord.toLowerCase() !== 'n/a') {
      if (cleanBooth && !cleanBooth.includes(rawCoord)) {
        cleanBooth = `${rawCoord} ${cleanBooth}`.trim();
      } else if (!cleanBooth) {
        cleanBooth = rawCoord;
      }

      if (cleanTicket && !cleanTicket.includes(rawCoord)) {
        cleanTicket = `${rawCoord} ${cleanTicket}`.trim();
      } else if (!cleanTicket) {
        cleanTicket = rawCoord;
      }
    }

    // Determine canonical official season club:
    // Matches by exact name, alias dictionary (e.g. พิจิตร ยูไนเต็ด -> พิจิตร ยูไนเต็ด 2025), or fuzzy match.
    // Strictly drops any club outside the user's 103 official season clubs.
    let hintLeague: LeagueType = league;
    if (colLeague >= 0 && row[colLeague] && row[colLeague].trim()) {
      hintLeague = normalizeLeague(row[colLeague], rawClub, league);
    } else {
      const isL3Tab = league === 'League 3' || /league\s*3|ไทยลีก\s*3|ลีก\s*3|t3|byd|dolphin/i.test(tabName);
      const isL2Tab = league === 'League 2' || /league\s*2|ไทยลีก\s*2|ลีก\s*2|t2/i.test(tabName);
      const isL1Tab = league === 'League 1' || /league\s*1|ไทยลีก\s*1|ลีก\s*1|t1/i.test(tabName);
      if (isL3Tab) hintLeague = 'League 3';
      else if (isL2Tab) hintLeague = 'League 2';
      else if (isL1Tab) hintLeague = 'League 1';
    }

    const canonical = getCanonicalOfficialClub(rawClub, hintLeague);
    if (!canonical) {
      // Discard outside / hallucinated club per user brief
      continue;
    }

    const finalClubName = canonical.name;
    const targetLeague = canonical.league;

    // Un-blacklist club if previously recorded
    unrecordDeletedClub(undefined, targetLeague, finalClubName);

    entries.push({
      id: `club-${targetLeague.replace(/\s+/g, '')}-${cleanTeamName(finalClubName)}`,
      league: targetLeague,
      clubName: finalClubName,
      stadiumName: rawStadium,
      province: rawProvince,
      boothContact: cleanBooth,
      ticketContact: cleanTicket,
      remark: cleanRemark,
      updatedAt: now,
      updatedBy: `Google Sheet [${tabName}]`,
    });
  }

  return entries;
}

/**
 * Sync Master Club Phonebook from Google Sheet "เบอร์ติดต่อหน้าสนาม"
 * Features:
 * - Direct resolution of Google Sheet tabs (supports single unified sheet or multi-tab L1/L2/L3)
 * - Automatic league recognition per club
 * - Fuzzy club matching to update phonebook entries accurately
 */
export async function syncClubPhonebookFromGoogleSheet(
  customUrl?: string,
  targetLeague: 'all' | LeagueType = 'all'
): Promise<{
  success: boolean;
  count: number;
  syncedTabs: string[];
  leagueCounts: Record<LeagueType, number>;
  message: string;
  error?: string;
}> {
  const url = (
    customUrl || 
    localStorage.getItem('thaileague_stadium_contacts_sheet_url') || 
    localStorage.getItem('thaileague_fixtures_sheet_url_t1t2') || 
    ''
  ).trim();

  if (!url) {
    return {
      success: false,
      count: 0,
      syncedTabs: [],
      leagueCounts: { 'League 1': 0, 'League 2': 0, 'League 3': 0 },
      message: 'กรุณาระบุลิงก์ Google Sheet "เบอร์ติดต่อหน้าสนาม"',
      error: 'กรุณาระบุลิงก์ Google Sheet "เบอร์ติดต่อหน้าสนาม"',
    };
  }

  // Persist sheet url
  try {
    localStorage.setItem('thaileague_stadium_contacts_sheet_url', url);
  } catch {}

  const { sheetId, gid: urlGid } = parseGoogleSheetUrl(url);
  if (!sheetId) {
    return {
      success: false,
      count: 0,
      syncedTabs: [],
      leagueCounts: { 'League 1': 0, 'League 2': 0, 'League 3': 0 },
      message: 'รูปแบบลิงก์ Google Sheet ไม่ถูกต้อง',
      error: 'รูปแบบลิงก์ Google Sheet ไม่ถูกต้อง',
    };
  }

  // 1. Discover tabs via backend proxy
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
    console.warn('Tab discovery warning in syncClubPhonebookFromGoogleSheet:', err);
  }

  const isMatchingLeagueTab = (tabName: string, league: LeagueType): boolean => {
    const clean = tabName.trim().toLowerCase();
    const stripped = clean.replace(/[\s\-_()]/g, '');
    if (league === 'League 1') {
      return (
        clean.includes('league 1') || clean.includes('league1') || clean.includes('l1') ||
        clean.includes('ไทยลีก 1') || clean.includes('ไทยลีก1') || clean.includes('ลีก 1') || clean.includes('ลีก1') ||
        clean === 't1' || clean.startsWith('t1-') || clean.startsWith('t1 ') || clean.startsWith('t1_') ||
        clean.includes('t1-(tha)') || clean.includes('t1-tha') || clean.includes('t1(tha)') ||
        clean.includes('t1 (tha)') || clean.endsWith('t1') || clean.includes(' t1 ') ||
        clean.includes('เบอร์ติดต่อ t1') || clean.includes('เบอร์ออกบูธ t1') || clean.includes('เบอร์รับบัตร t1') ||
        clean.includes('สโมสร t1') ||
        stripped === '1' || stripped === 't1' || stripped === 'league1' || stripped === 'l1' || stripped === 'ไทยลีก1'
      );
    }
    if (league === 'League 2') {
      return (
        clean.includes('league 2') || clean.includes('league2') || clean.includes('l2') ||
        clean.includes('ไทยลีก 2') || clean.includes('ไทยลีก2') || clean.includes('ลีก 2') || clean.includes('ลีก2') ||
        clean === 't2' || clean.startsWith('t2-') || clean.startsWith('t2 ') || clean.startsWith('t2_') ||
        clean.includes('t2-(tha)') || clean.includes('t2-tha') || clean.includes('t2(tha)') ||
        clean.includes('t2 (tha)') || clean.endsWith('t2') || clean.includes(' t2 ') ||
        clean.includes('เบอร์ติดต่อ t2') || clean.includes('เบอร์ออกบูธ t2') || clean.includes('เบอร์รับบัตร t2') ||
        clean.includes('สโมสร t2') ||
        stripped === '2' || stripped === 't2' || stripped === 'league2' || stripped === 'l2' || stripped === 'ไทยลีก2'
      );
    }
    if (league === 'League 3') {
      return (
        clean.includes('league 3') || clean.includes('league3') || clean.includes('l3') ||
        clean.includes('ไทยลีก 3') || clean.includes('ไทยลีก3') || clean.includes('ลีก 3') || clean.includes('ลีก3') ||
        clean === 't3' || clean.startsWith('t3-') || clean.startsWith('t3 ') || clean.startsWith('t3_') ||
        clean.includes('t3-(tha)') || clean.includes('t3-tha') || clean.includes('t3(tha)') ||
        clean.includes('t3 (tha)') || clean.endsWith('t3') || clean.includes(' t3 ') ||
        clean.includes('เบอร์ติดต่อ t3') || clean.includes('เบอร์ออกบูธ t3') || clean.includes('เบอร์รับบัตร t3') ||
        clean.includes('สโมสร t3') ||
        clean.includes('byd') || clean.includes('dolphin') ||
        stripped === '3' || stripped === 't3' || stripped === 'league3' || stripped === 'l3' || stripped === 'ไทยลีก3'
      );
    }
    return false;
  };

  const syncedTabs: string[] = [];
  const allParsedClubs: ClubPhonebookEntry[] = [];
  const errors: string[] = [];

  const l1Tab = discoveredTabs.find(t => isMatchingLeagueTab(t.name, 'League 1'));
  const l2Tab = discoveredTabs.find(t => isMatchingLeagueTab(t.name, 'League 2'));
  const l3Tab = discoveredTabs.find(t => isMatchingLeagueTab(t.name, 'League 3'));
  const hasDistinctLeagueTabs = !!(l1Tab || l2Tab || l3Tab);

  const leaguesToSync: LeagueType[] = targetLeague === 'all' 
    ? ['League 1', 'League 2', 'League 3'] 
    : [targetLeague];

  const candidateTabNames: Record<LeagueType, string[]> = {
    'League 1': ['League 1', 'League1', 'L1', 'ไทยลีก 1', 'ไทยลีก1', 'ลีก 1', 'ลีก1', 'T1', 'T1-(THA)', 'T1-THA', 'T1(THA)', '1', 'Sheet1', 'สโมสรไทยลีก 1', 'เบอร์ติดต่อ T1', 'เบอร์ติดต่อ League 1', 'เบอร์ติดต่อหน้าสนาม', 'เบอร์ติดต่อหน้าสนาม League 1'],
    'League 2': ['League 2', 'League2', 'L2', 'ไทยลีก 2', 'ไทยลีก2', 'ลีก 2', 'ลีก2', 'T2', 'T2-(THA)', 'T2-THA', 'T2(THA)', '2', 'Sheet2', 'สโมสรไทยลีก 2', 'เบอร์ติดต่อ T2', 'เบอร์ติดต่อ League 2', 'เบอร์ติดต่อหน้าสนาม League 2'],
    'League 3': ['League 3', 'League3', 'L3', 'ไทยลีก 3', 'ไทยลีก3', 'ลีก 3', 'ลีก3', 'T3', 'T3-(THA)', 'T3-THA', 'T3(THA)', '3', 'Sheet3', 'BYD DOLPHIN', 'BYD', 'สโมสรไทยลีก 3', 'เบอร์ติดต่อ T3', 'เบอร์ติดต่อ League 3', 'เบอร์ติดต่อหน้าสนาม', 'เบอร์ติดต่อหน้าสนาม League 3', 'League 3 - เบอร์ติดต่อหน้าสนาม', 'League 3 เบอร์ติดต่อหน้าสนาม', 'โซนภาคเหนือ', 'เหนือ', 'North'],
  };

  const leagueIndexMap: Record<LeagueType, number> = {
    'League 1': 0,
    'League 2': 1,
    'League 3': 2,
  };

  // 1. Sync per league
  for (let lIdx = 0; lIdx < leaguesToSync.length; lIdx++) {
    const league = leaguesToSync[lIdx];
    const candidates = candidateTabNames[league];
    const targetIdx = leagueIndexMap[league];
    let tabGid: string | undefined = undefined;
    let selectedTabName: string = candidates[0];
    let foundInDiscovered = false;
    let tabIndexToTry: number | undefined = undefined;

    const match = discoveredTabs.find(t => isMatchingLeagueTab(t.name, league));
    if (match) {
      tabGid = match.gid;
      selectedTabName = match.name;
      foundInDiscovered = true;
      tabIndexToTry = discoveredTabs.indexOf(match);
    } else if (discoveredTabs.length >= 3 && discoveredTabs[targetIdx]) {
      tabGid = discoveredTabs[targetIdx].gid;
      selectedTabName = discoveredTabs[targetIdx].name;
      foundInDiscovered = true;
      tabIndexToTry = targetIdx;
    }

    let csvData: string | null = null;
    let actualTabName = selectedTabName;

    // A. Fetch via discovered tab
    if (foundInDiscovered) {
      csvData = await fetchSingleSheetText(sheetId, { gid: tabGid, sheetName: selectedTabName, tabIndex: tabIndexToTry });
    }

    // B. Fetch via candidate tab names
    if (!csvData) {
      for (const cand of candidates) {
        csvData = await fetchSingleSheetText(sheetId, { sheetName: cand });
        if (csvData && csvData.length > 30) {
          actualTabName = cand;
          break;
        }
      }
    }

    // C. Fetch via URL GID (if specified in sheet URL)
    if (!csvData && urlGid) {
      const urlCsv = await fetchSingleSheetText(sheetId, { gid: urlGid });
      if (urlCsv && urlCsv.length > 30) {
        csvData = urlCsv;
        actualTabName = `gid=${urlGid}`;
      }
    }

    // D. Fetch via tab index directly
    if (!csvData && (discoveredTabs.length > targetIdx || targetIdx < 3)) {
      try {
        const idxCsv = await fetchSingleSheetText(sheetId, { tabIndex: targetIdx });
        if (idxCsv && idxCsv.length > 30) {
          csvData = idxCsv;
          actualTabName = `แท็บลำดับที่ ${targetIdx + 1}`;
        }
      } catch {}
    }

    if (csvData && csvData.length > 30) {
      const parsed = parseClubPhonebookCsv(csvData, league, actualTabName);
      if (parsed.length > 0) {
        allParsedClubs.push(...parsed);
        syncedTabs.push(actualTabName);
      } else {
        errors.push(`แท็บ ${actualTabName} ไม่มีข้อมูลสโมสรที่ถูกต้อง`);
      }
    } else {
      errors.push(`ไม่พบแท็บสำหรับ ${league}`);
    }
  }

  // Strategy C: Comprehensive fallback - scan ALL discovered tabs if any league was missing
  if (allParsedClubs.length === 0 && discoveredTabs.length > 0) {
    for (let i = 0; i < discoveredTabs.length; i++) {
      const t = discoveredTabs[i];
      try {
        const csvData = await fetchSingleSheetText(sheetId, { gid: t.gid, sheetName: t.name, tabIndex: i });
        if (csvData && csvData.length > 30) {
          const parsed = parseClubPhonebookCsv(csvData, targetLeague === 'all' ? 'League 1' : targetLeague, t.name);
          if (parsed.length > 0) {
            allParsedClubs.push(...parsed);
            syncedTabs.push(t.name);
          }
        }
      } catch {}
    }
  }

  // Strategy D: Direct default sheet / urlGid fetch
  if (allParsedClubs.length === 0) {
    try {
      const defaultCsv = await fetchSingleSheetText(sheetId, { gid: urlGid || '0' }) || await fetchSingleSheetText(sheetId);
      if (defaultCsv && defaultCsv.length > 30) {
        const parsed = parseClubPhonebookCsv(defaultCsv, targetLeague === 'all' ? 'League 1' : targetLeague, 'แผ่นงานหลัก (Default Sheet)');
        if (parsed.length > 0) {
          allParsedClubs.push(...parsed);
          syncedTabs.push('แผ่นงานหลัก');
        }
      }
    } catch {}
  }

  if (allParsedClubs.length === 0) {
    const errorDetails = errors.length > 0 ? errors.join(', ') : 'ไม่สามารถดึงข้อมูลจากแท็บได้';
    return {
      success: false,
      count: 0,
      syncedTabs: [],
      leagueCounts: { 'League 1': 0, 'League 2': 0, 'League 3': 0 },
      message: `ไม่สามารถดึงข้อมูลจากชีต "เบอร์ติดต่อหน้าสนาม" ได้ (${errorDetails}) กรุณาตรวจสอบว่า: 1. ตั้งสิทธิ์แชร์ชีตเป็น "ทุกคนที่มีลิงก์ดูได้ (Viewer)" 2. ตรวจสอบว่ามีคอลัมน์ "สโมสรทีมเหย้า", "ชื่อ+เบอร์ติดต่อสำหรับออกบูธ", "ชื่อ+เบอร์ติดต่อสำหรับรับบัตร", "Remark" (ระบบไม่สร้างข้อมูลตัวอย่าง mock data ใดๆ)`,
      error: errorDetails,
    };
  }

  // Merge into Master Club Phonebook with fuzzy team matching
  const current = [...getMasterClubPhonebook()];
  const incomingList = [...allParsedClubs];

  // Update existing clubs (with canonical match and fuzzy match support)
  const updatedClubs: ClubPhonebookEntry[] = current.map(c => {
    // Find matching incoming club
    const matchIdx = incomingList.findIndex(inc => {
      const incCanonical = getCanonicalOfficialClub(inc.clubName, inc.league);
      const cCanonical = getCanonicalOfficialClub(c.clubName, c.league);
      if (incCanonical && cCanonical && incCanonical.name === cCanonical.name) {
        return true;
      }
      return (
        (inc.league === c.league || cleanTeamName(inc.clubName) === cleanTeamName(c.clubName)) &&
        (teamsMatch(c.clubName, inc.clubName) || cleanTeamName(c.clubName) === cleanTeamName(inc.clubName))
      );
    });

    if (matchIdx !== -1) {
      const inc = incomingList[matchIdx];
      incomingList.splice(matchIdx, 1);

      return {
        ...c,
        id: c.id, // Preserve existing ID
        league: c.league, // Preserve official league
        stadiumName: inc.stadiumName || c.stadiumName,
        province: inc.province || c.province,
        boothContact: inc.boothContact !== undefined && inc.boothContact !== '' ? inc.boothContact : c.boothContact,
        ticketContact: inc.ticketContact !== undefined && inc.ticketContact !== '' ? inc.ticketContact : c.ticketContact,
        remark: inc.remark !== undefined && inc.remark !== '' ? inc.remark : c.remark,
        updatedBy: inc.updatedBy || 'Google Sheet',
        updatedAt: new Date().toISOString(),
      };
    }

    return c;
  });

  // Filter strictly to official season clubs (no outside clubs allowed)
  const finalClubs = deduplicateClubs(updatedClubs.filter(c => isOfficialSeasonClub(c.clubName)));
  cachedPhonebook = finalClubs;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(finalClubs));
  } catch (e) {
    console.error('Error saving updated club phonebook:', e);
  }

  // Also convert to LeagueHomeTeamContact format and save to stadiumContactsService
  const leagueHomeContacts: LeagueHomeTeamContact[] = finalClubs.map(c => {
    const bValid = isValidPhoneNumber(c.boothContact);
    const tValid = isValidPhoneNumber(c.ticketContact);
    return {
      id: `lht_${c.league.replace(/\s+/g, '')}_${cleanTeamName(c.clubName)}`,
      league: c.league,
      homeTeam: c.clubName,
      cleanHomeTeam: cleanTeamName(c.clubName),
      cleanHomeCore: cleanTeamCore(c.clubName),
      stadiumName: c.stadiumName || `สนามเหย้าสโมสร ${c.clubName}`,
      boothCoordinatorName: bValid ? 'เจ้าหน้าที่ฝ่ายออกบูธ' : (c.boothContact ? c.boothContact : ''),
      boothCoordinatorPhone: bValid ? formatPhoneNumber(c.boothContact) : '',
      boothRawText: c.boothContact,
      boothSetupLocation: 'ลานกิจกรรมหน้าทางเข้าหลัก',
      ticketCoordinatorName: tValid ? 'เจ้าหน้าที่ฝ่ายรับบัตร' : (c.ticketContact ? c.ticketContact : ''),
      ticketCoordinatorPhone: tValid ? formatPhoneNumber(c.ticketContact) : '',
      ticketRawText: c.ticketContact,
      ticketPickupLocation: 'ซุ้มตั๋วผู้สนับสนุน / จุดรับบัตรหน้าสนาม',
      operatingHours: '14:00 - 19:30 น. (วันแข่งขัน)',
      remark: c.remark,
      note: c.remark,
      sourceTab: c.updatedBy || 'Google Sheet [เบอร์ติดต่อหน้าสนาม]',
      updatedAt: new Date().toISOString(),
    };
  });

  saveLeagueHomeTeamContacts(leagueHomeContacts);
  notifyListeners();

  const counts: Record<LeagueType, number> = {
    'League 1': finalClubs.filter(c => c.league === 'League 1').length,
    'League 2': finalClubs.filter(c => c.league === 'League 2').length,
    'League 3': finalClubs.filter(c => c.league === 'League 3').length,
  };

  return {
    success: true,
    count: allParsedClubs.length,
    syncedTabs,
    leagueCounts: counts,
    message: `ซิงค์ข้อมูลสโมสรและเบอร์ติดต่อจากชีต "เบอร์ติดต่อหน้าสนาม" สำเร็จ! รวม ${allParsedClubs.length} สโมสร (แท็บ: ${syncedTabs.join(', ')}) โดยแยกเป็น League 1 (${counts['League 1']}), League 2 (${counts['League 2']}), League 3 (${counts['League 3']}) เรียบร้อยแล้ว`,
  };
}

/**
 * Direct CSV import for a league (fallback option if Google Sheets link sharing is restricted)
 */
export function importClubsFromCsvText(
  csvText: string,
  league: LeagueType,
  sourceLabel: string = 'CSV Import'
): { success: boolean; count: number; error?: string } {
  try {
    const parsed = parseClubPhonebookCsv(csvText, league, sourceLabel);
    if (parsed.length === 0) {
      return { success: false, count: 0, error: 'ไม่พบข้อมูลสโมสรใน CSV ที่ระบุ' };
    }

    const current = [...getMasterClubPhonebook()];
    const incomingMap = new Map(parsed.map(p => [`${p.league}_${cleanTeamName(p.clubName)}`, p]));

    const updated = current.map(c => {
      const key = `${c.league}_${cleanTeamName(c.clubName)}`;
      if (incomingMap.has(key)) {
        const inc = incomingMap.get(key)!;
        incomingMap.delete(key);
        return {
          ...c,
          ...inc,
          id: c.id,
        };
      }
      return c;
    });

    incomingMap.forEach(inc => updated.push(inc));
    const cleanList = deduplicateClubs(updated);
    cachedPhonebook = cleanList;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanList));
    } catch {}

    const leagueHomeContacts = cleanList.map(c => ({
      id: `lht_${c.league.replace(/\s+/g, '')}_${cleanTeamName(c.clubName)}`,
      league: c.league,
      homeTeam: c.clubName,
      cleanHomeTeam: cleanTeamName(c.clubName),
      cleanHomeCore: cleanTeamCore(c.clubName),
      stadiumName: c.stadiumName || `สนามเหย้าสโมสร ${c.clubName}`,
      boothCoordinatorName: c.boothContact,
      boothCoordinatorPhone: c.boothContact,
      boothRawText: c.boothContact,
      boothSetupLocation: 'ลานกิจกรรมหน้าทางเข้าหลัก',
      ticketCoordinatorName: c.ticketContact,
      ticketCoordinatorPhone: c.ticketContact,
      ticketRawText: c.ticketContact,
      ticketPickupLocation: 'ซุ้มตั๋วผู้สนับสนุน / จุดรับบัตรหน้าสนาม',
      operatingHours: '14:00 - 19:30 น. (วันแข่งขัน)',
      remark: c.remark,
      note: c.remark,
      sourceTab: sourceLabel,
      updatedAt: new Date().toISOString(),
    }));
    saveLeagueHomeTeamContacts(leagueHomeContacts);
    notifyListeners();

    return { success: true, count: parsed.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message };
  }
}
