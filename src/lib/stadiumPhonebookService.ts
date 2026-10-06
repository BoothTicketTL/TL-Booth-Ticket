import { LeagueType } from '../types';
import { INITIAL_STADIUM_CONTACTS } from '../data/stadiumContacts';
import { THAI_LEAGUE_FIXTURES } from '../data/fixtures';
import { initFirebaseService } from './firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

export interface StadiumPhonebookEntry {
  id: string; // Unique ID
  stadiumName: string; // ชื่อสนามแข่งขัน
  homeClub: string; // สโมสรเจ้าบ้าน
  league: LeagueType; // 'League 1' | 'League 2' | 'League 3'
  locationProvince: string; // จังหวัด / ที่ตั้ง

  // 1. เจ้าหน้าที่ดูแลบูธดีลเลอร์
  boothCoordinatorName: string;
  boothCoordinatorPhone: string;
  boothSetupLocation: string;

  // 2. เจ้าหน้าที่ประจำซุ้มตั๋วดูบอล / ประสานงานรับบัตร
  ticketCoordinatorName: string;
  ticketCoordinatorPhone: string;
  ticketPickupLocation: string;

  // 3. เวลาเปิดทำการ & หมายเหตุ
  operatingHours: string;
  note?: string;
  remark?: string;

  // การบันทึก & ประวัติ
  updatedAt: string;
  updatedBy: string;

  // การยืนยันรายสัปดาห์โดย Admin
  confirmedWeekKey?: string; // รหัสสัปดาห์ เช่น "2026-W39"
  confirmedAt?: string; // วันเวลาที่กดยืนยัน
  confirmedBy?: string; // ชื่อหรืออีเมล Admin ที่กดยืนยัน
}

export interface WeekInfo {
  weekKey: string; // "2026-W39"
  weekNumber: number;
  weekLabel: string; // "สัปดาห์ที่ 39"
  weekRangeText: string; // "21 ก.ย. - 27 ก.ย. 2569"
  startDate: string; // "2026-09-21"
  endDate: string; // "2026-09-27"
}

const LOCAL_PHONEBOOK_KEY = 'thaileague_stadium_phonebook_v2';
const FIRESTORE_COLLECTION = 'thaileague_stadium_phonebook';

// Helper to compute week info based on date (defaults to current simulated or real date)
export function getCurrentWeekInfo(customDateStr?: string): WeekInfo {
  let base: Date;
  if (customDateStr && customDateStr.length >= 10) {
    const parts = customDateStr.slice(0, 10).split('-');
    base = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  } else {
    base = new Date();
  }

  // Monday is start of the football week
  const day = base.getDay(); // 0 is Sunday
  const diffToMonday = base.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(base.getFullYear(), base.getMonth(), diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  // Calculate ISO week number
  const target = new Date(monday.valueOf());
  const dayNr = (monday.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNumber = Math.max(1, 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000));

  const pad = (n: number) => String(n).padStart(2, '0');
  const mondayStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
  const sundayStr = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;

  const thaiMonthsShort = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const rangeText = `${monday.getDate()} ${thaiMonthsShort[monday.getMonth()]} - ${sunday.getDate()} ${thaiMonthsShort[sunday.getMonth()]} ${sunday.getFullYear() + 543}`;

  return {
    weekKey: `${monday.getFullYear()}-W${pad(weekNumber)}`,
    weekNumber,
    weekLabel: `สัปดาห์ที่ ${weekNumber}`,
    weekRangeText: rangeText,
    startDate: mondayStr,
    endDate: sundayStr,
  };
}

// Generate unique clean ID from stadium name
function generateStadiumId(stadiumName: string, homeClub: string): string {
  const clean = (stadiumName + '-' + homeClub)
    .replace(/[^\wก-๙]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50);
  return `pb_${clean}`;
}

// Pre-seed all stadiums across Thai League 1, 2, 3
function buildInitialStadiumSeed(): StadiumPhonebookEntry[] {
  const map = new Map<string, StadiumPhonebookEntry>();
  const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');

  // 1. Seed from INITIAL_STADIUM_CONTACTS (includes verified contact numbers)
  INITIAL_STADIUM_CONTACTS.forEach(s => {
    const key = s.stadiumName.trim().toLowerCase();
    const id = generateStadiumId(s.stadiumName, s.homeClub);
    map.set(key, {
      id,
      stadiumName: s.stadiumName.trim(),
      homeClub: s.homeClub.trim(),
      league: s.league,
      locationProvince: s.locationProvince || 'ประจำสนามแข่งขัน',
      boothCoordinatorName: s.boothCoordinatorName || '',
      boothCoordinatorPhone: s.boothCoordinatorPhone || '',
      boothSetupLocation: s.boothSetupLocation || 'ลานกิจกรรมหน้าทางเข้าอัฒจันทร์หลัก',
      ticketCoordinatorName: s.ticketCoordinatorName || '',
      ticketCoordinatorPhone: s.ticketCoordinatorPhone || '',
      ticketPickupLocation: s.ticketPickupLocation || 'ซุ้มตั๋วผู้สนับสนุนและพันธมิตร',
      operatingHours: s.operatingHours || '14:00 - 19:30 น. (วันแข่งขัน)',
      note: s.note || '',
      remark: s.remark || '',
      updatedAt: nowStr,
      updatedBy: 'ระบบสมุดโทรศัพท์เริ่มต้น',
    });
  });

  // 2. Ensure all home clubs and stadiums in THAI_LEAGUE_FIXTURES are present
  THAI_LEAGUE_FIXTURES.forEach(f => {
    if (!f.stadium) return;
    const key = f.stadium.trim().toLowerCase();
    if (!map.has(key)) {
      const id = generateStadiumId(f.stadium, f.homeTeam);
      map.set(key, {
        id,
        stadiumName: f.stadium.trim(),
        homeClub: f.homeTeam?.trim() || '',
        league: f.league,
        locationProvince: 'ประจำสนามแข่งขัน',
        boothCoordinatorName: '',
        boothCoordinatorPhone: '',
        boothSetupLocation: 'ลานกิจกรรมหน้าทางเข้าอัฒจันทร์หลัก',
        ticketCoordinatorName: '',
        ticketCoordinatorPhone: '',
        ticketPickupLocation: 'ซุ้มตั๋วผู้สนับสนุนและพันธมิตร',
        operatingHours: '14:00 - 19:30 น. (วันแข่งขัน)',
        note: '',
        remark: '',
        updatedAt: nowStr,
        updatedBy: 'ระบบสมุดโทรศัพท์เริ่มต้น',
      });
    }
  });

  return Array.from(map.values());
}

// In-memory cache
let phonebookMemory: StadiumPhonebookEntry[] = loadStoredPhonebook();
const phonebookListeners = new Set<(entries: StadiumPhonebookEntry[]) => void>();

function loadStoredPhonebook(): StadiumPhonebookEntry[] {
  const seedList = buildInitialStadiumSeed();
  if (typeof window === 'undefined' || !window.localStorage) {
    return seedList;
  }

  try {
    const raw = localStorage.getItem(LOCAL_PHONEBOOK_KEY);
    if (!raw) {
      localStorage.setItem(LOCAL_PHONEBOOK_KEY, JSON.stringify(seedList));
      return seedList;
    }
    const parsed: StadiumPhonebookEntry[] = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(LOCAL_PHONEBOOK_KEY, JSON.stringify(seedList));
      return seedList;
    }

    // Merge missing stadiums from seed into parsed
    const existingKeys = new Set(parsed.map(p => p.stadiumName.trim().toLowerCase()));
    let hasNew = false;
    seedList.forEach(seed => {
      const key = seed.stadiumName.trim().toLowerCase();
      if (!existingKeys.has(key)) {
        parsed.push(seed);
        hasNew = true;
      }
    });

    if (hasNew) {
      localStorage.setItem(LOCAL_PHONEBOOK_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch (err) {
    console.warn('Error reading stored stadium phonebook:', err);
    return seedList;
  }
}

function persistPhonebook(entries: StadiumPhonebookEntry[]) {
  phonebookMemory = [...entries];
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(LOCAL_PHONEBOOK_KEY, JSON.stringify(entries));
    } catch (e) {
      console.warn('LocalStorage save failed for phonebook:', e);
    }
  }
  notifyPhonebookListeners();
}

function notifyPhonebookListeners() {
  phonebookListeners.forEach(fn => {
    try {
      fn([...phonebookMemory]);
    } catch (e) {
      console.error('Phonebook listener error:', e);
    }
  });
}

// Init Firestore listener
let isFirestoreInitialized = false;
export function initPhonebookFirestoreSync() {
  if (isFirestoreInitialized || typeof window === 'undefined') return;
  isFirestoreInitialized = true;

  try {
    const { db } = initFirebaseService();
    if (!db) return;

    const colRef = collection(db, FIRESTORE_COLLECTION);
    onSnapshot(colRef, (snapshot) => {
      if (snapshot.empty) return;
      const remoteList: StadiumPhonebookEntry[] = [];
      snapshot.forEach(docSnap => {
        remoteList.push({ ...docSnap.data(), id: docSnap.id } as StadiumPhonebookEntry);
      });

      if (remoteList.length > 0) {
        // Merge remote into memory
        const map = new Map<string, StadiumPhonebookEntry>();
        phonebookMemory.forEach(item => map.set(item.id, item));
        remoteList.forEach(remote => map.set(remote.id, { ...(map.get(remote.id) || {}), ...remote }));
        persistPhonebook(Array.from(map.values()));
      }
    }, (err) => {
      console.warn('Firestore phonebook listener skipped:', err);
    });
  } catch (e) {
    console.warn('Firestore sync setup failed for phonebook:', e);
  }
}

// ============================================================================
// Public APIs
// ============================================================================

export function getStadiumPhonebook(): StadiumPhonebookEntry[] {
  if (phonebookMemory.length === 0) {
    phonebookMemory = loadStoredPhonebook();
  }
  return [...phonebookMemory];
}

export function subscribeToStadiumPhonebook(callback: (entries: StadiumPhonebookEntry[]) => void): () => void {
  phonebookListeners.add(callback);
  // Emit current data immediately
  callback([...phonebookMemory]);

  initPhonebookFirestoreSync();

  return () => {
    phonebookListeners.delete(callback);
  };
}

// Save or Update a Stadium Phonebook entry
export async function saveStadiumPhonebookEntry(
  entryData: Partial<StadiumPhonebookEntry> & { stadiumName: string; homeClub?: string; league?: LeagueType }
): Promise<StadiumPhonebookEntry> {
  const nowStr = new Date().toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const stadiumName = entryData.stadiumName.trim();
  const homeClub = (entryData.homeClub || '').trim();
  const id = entryData.id || generateStadiumId(stadiumName, homeClub);

  const existing = phonebookMemory.find(p => p.id === id || p.stadiumName.trim().toLowerCase() === stadiumName.toLowerCase());

  const updatedEntry: StadiumPhonebookEntry = {
    id,
    stadiumName,
    homeClub: homeClub || existing?.homeClub || 'สโมสรเจ้าบ้าน',
    league: entryData.league || existing?.league || 'League 1',
    locationProvince: (entryData.locationProvince || existing?.locationProvince || 'ประจำสนามแข่งขัน').trim(),
    boothCoordinatorName: (entryData.boothCoordinatorName !== undefined ? entryData.boothCoordinatorName : (existing?.boothCoordinatorName || '')).trim(),
    boothCoordinatorPhone: (entryData.boothCoordinatorPhone !== undefined ? entryData.boothCoordinatorPhone : (existing?.boothCoordinatorPhone || '')).trim(),
    boothSetupLocation: (entryData.boothSetupLocation !== undefined ? entryData.boothSetupLocation : (existing?.boothSetupLocation || 'ลานกิจกรรมหน้าทางเข้าหลัก')).trim(),
    ticketCoordinatorName: (entryData.ticketCoordinatorName !== undefined ? entryData.ticketCoordinatorName : (existing?.ticketCoordinatorName || '')).trim(),
    ticketCoordinatorPhone: (entryData.ticketCoordinatorPhone !== undefined ? entryData.ticketCoordinatorPhone : (existing?.ticketCoordinatorPhone || '')).trim(),
    ticketPickupLocation: (entryData.ticketPickupLocation !== undefined ? entryData.ticketPickupLocation : (existing?.ticketPickupLocation || 'ซุ้มตั๋วผู้สนับสนุน')).trim(),
    operatingHours: (entryData.operatingHours || existing?.operatingHours || '14:00 - 19:30 น. (วันแข่งขัน)').trim(),
    note: (entryData.note !== undefined ? entryData.note : (existing?.note || '')).trim(),
    remark: (entryData.remark !== undefined ? entryData.remark : (existing?.remark || '')).trim(),
    updatedAt: nowStr,
    updatedBy: entryData.updatedBy || 'Admin',
    confirmedWeekKey: entryData.confirmedWeekKey !== undefined ? entryData.confirmedWeekKey : existing?.confirmedWeekKey,
    confirmedAt: entryData.confirmedAt !== undefined ? entryData.confirmedAt : existing?.confirmedAt,
    confirmedBy: entryData.confirmedBy !== undefined ? entryData.confirmedBy : existing?.confirmedBy,
  };

  const index = phonebookMemory.findIndex(p => p.id === id);
  if (index !== -1) {
    phonebookMemory[index] = updatedEntry;
  } else {
    phonebookMemory.unshift(updatedEntry);
  }

  persistPhonebook(phonebookMemory);

  // Sync to Firestore in background
  try {
    const { db } = initFirebaseService();
    if (db) {
      const docRef = doc(db, FIRESTORE_COLLECTION, id);
      await setDoc(docRef, updatedEntry, { merge: true });
    }
  } catch (e) {
    console.warn('Firestore phonebook save fallback used:', e);
  }

  return updatedEntry;
}

// Delete a stadium from phonebook
export async function deleteStadiumPhonebookEntry(id: string): Promise<boolean> {
  const filtered = phonebookMemory.filter(p => p.id !== id);
  persistPhonebook(filtered);

  try {
    const { db } = initFirebaseService();
    if (db) {
      const docRef = doc(db, FIRESTORE_COLLECTION, id);
      await deleteDoc(docRef);
    }
  } catch (e) {
    console.warn('Firestore delete fallback:', e);
  }
  return true;
}

// Confirm a specific stadium for the week
export async function confirmStadiumForWeek(
  stadiumId: string,
  weekKey: string,
  adminName: string
): Promise<StadiumPhonebookEntry | null> {
  const target = phonebookMemory.find(p => p.id === stadiumId);
  if (!target) return null;

  const nowStr = new Date().toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return await saveStadiumPhonebookEntry({
    ...target,
    confirmedWeekKey: weekKey,
    confirmedAt: nowStr,
    confirmedBy: adminName,
    updatedAt: nowStr,
    updatedBy: adminName,
  });
}

// Revoke confirmation for a stadium in this week
export async function unconfirmStadiumForWeek(stadiumId: string): Promise<StadiumPhonebookEntry | null> {
  const target = phonebookMemory.find(p => p.id === stadiumId);
  if (!target) return null;

  return await saveStadiumPhonebookEntry({
    ...target,
    confirmedWeekKey: undefined,
    confirmedAt: undefined,
    confirmedBy: undefined,
  });
}

// Bulk confirm all stadiums (or stadiums in a specific league) for the week
export async function confirmAllStadiumsForWeek(
  weekKey: string,
  adminName: string,
  league?: LeagueType | 'all'
): Promise<{ count: number }> {
  const nowStr = new Date().toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  let count = 0;
  phonebookMemory.forEach(entry => {
    if (!league || league === 'all' || entry.league === league) {
      entry.confirmedWeekKey = weekKey;
      entry.confirmedAt = nowStr;
      entry.confirmedBy = adminName;
      entry.updatedAt = nowStr;
      count++;
    }
  });

  persistPhonebook(phonebookMemory);

  // Firestore background batch
  try {
    const { db } = initFirebaseService();
    if (db) {
      phonebookMemory.forEach(async entry => {
        if (!league || league === 'all' || entry.league === league) {
          const docRef = doc(db, FIRESTORE_COLLECTION, entry.id);
          await setDoc(docRef, entry, { merge: true }).catch(() => {});
        }
      });
    }
  } catch (e) {
    console.warn('Bulk confirm firestore fallback:', e);
  }

  return { count };
}

// Helper to check if a stadium is confirmed for a specific week
export function isStadiumConfirmedForWeek(
  entry?: StadiumPhonebookEntry | null,
  weekKey?: string
): boolean {
  if (!entry || !weekKey) return false;
  return entry.confirmedWeekKey === weekKey;
}

// Find a stadium phonebook entry by stadium name, home club, or clean name
export function findStadiumPhonebookEntry(params: {
  stadiumName?: string;
  homeClub?: string;
  league?: LeagueType;
}): StadiumPhonebookEntry | undefined {
  const sName = (params.stadiumName || '').trim().toLowerCase();
  const hClub = (params.homeClub || '').trim().toLowerCase();

  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/สนาม|สเตเดียม|อารีนา|สเตเดี้ยม|เอฟซี|ยูไนเต็ด|สโมสร/g, '')
      .replace(/[\s\-_]/g, '')
      .trim();

  const cleanSName = clean(sName);
  const cleanHClub = clean(hClub);

  // 1. Exact stadium name match
  if (sName) {
    const exact = phonebookMemory.find(p => p.stadiumName.trim().toLowerCase() === sName);
    if (exact) return exact;
  }

  // 2. Exact home club match
  if (hClub) {
    const clubMatch = phonebookMemory.find(p => p.homeClub.trim().toLowerCase() === hClub);
    if (clubMatch) return clubMatch;
  }

  // 3. Clean fuzzy match
  for (const entry of phonebookMemory) {
    const entryS = clean(entry.stadiumName);
    const entryC = clean(entry.homeClub);

    if (cleanSName && (entryS.includes(cleanSName) || cleanSName.includes(entryS))) {
      return entry;
    }
    if (cleanHClub && (entryC.includes(cleanHClub) || cleanHClub.includes(entryC))) {
      return entry;
    }
  }

  return undefined;
}

// Get weekly confirmation stats
export function getWeeklyConfirmationStats(weekKey: string, league?: LeagueType | 'all'): {
  total: number;
  confirmed: number;
  pending: number;
  confirmedPercent: number;
} {
  const filtered = league && league !== 'all' 
    ? phonebookMemory.filter(p => p.league === league)
    : phonebookMemory;

  const total = filtered.length;
  const confirmed = filtered.filter(p => p.confirmedWeekKey === weekKey).length;
  const pending = total - confirmed;
  const confirmedPercent = total > 0 ? Math.round((confirmed / total) * 100) : 0;

  return { total, confirmed, pending, confirmedPercent };
}
