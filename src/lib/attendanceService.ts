import * as XLSX from 'xlsx';
import { LeagueType, StadiumAttendanceRecord, ClubAttendanceRanking, AttendanceImportSummary } from '../types';
import { INITIAL_ATTENDANCE_RECORDS } from '../data/initialAttendanceData';
import { normalizeLeague, normalizeDate, getFixtures } from './fixturesService';
import { parseSheetDate, parseSheetTime } from './sheetFixtureParser';
import { resolveOfficialClubName } from './clubNameResolver';
import { initFirebaseService } from './firebase';
import { doc, setDoc, getDoc, getDocs, collection, onSnapshot } from 'firebase/firestore';

const LOCAL_ATTENDANCE_KEY = 'thaileague_stadium_attendance_data';
const LOCAL_ATTENDANCE_UPDATED_KEY = 'thaileague_stadium_attendance_last_updated';
const FIRESTORE_LEAGUES_COLLECTION = 'thaileague_attendance_leagues';
const FIRESTORE_CONFIG_DOC = 'attendance_config';

type AttendanceListener = (records: StadiumAttendanceRecord[]) => void;
const attendanceListeners: Set<AttendanceListener> = new Set();

let cachedAttendance: StadiumAttendanceRecord[] = loadStoredAttendance();
let isFirestoreListenerInitialized = false;

function sanitizeRecordForFirestore(r: StadiumAttendanceRecord): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(r)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

function fillScoreNumbers(r: StadiumAttendanceRecord): StadiumAttendanceRecord {
  if (r.score && (r.homeScore === undefined || r.awayScore === undefined)) {
    const m = r.score.match(/(\d+)\s*[-:]\s*(\d+)/);
    if (m) {
      return {
        ...r,
        homeScore: r.homeScore !== undefined ? r.homeScore : parseInt(m[1], 10),
        awayScore: r.awayScore !== undefined ? r.awayScore : parseInt(m[2], 10),
      };
    }
  }
  return r;
}

function loadStoredAttendance(): StadiumAttendanceRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_ATTENDANCE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Remove the sample records that older versions seeded (ids like "att-t1-w1-01"); real Excel imports are kept.
        const real = parsed.filter((r: StadiumAttendanceRecord) => !/^att-t\d-w\d+-\d+$/.test(String(r && r.id)));
        return real.map(fillScoreNumbers);
      }
    }
  } catch (e) {
    console.error('Error loading stored attendance records:', e);
  }
  return INITIAL_ATTENDANCE_RECORDS.map(fillScoreNumbers);
}

function notifyAttendanceListeners() {
  attendanceListeners.forEach(listener => {
    try {
      listener([...cachedAttendance]);
    } catch (err) {
      console.error(err);
    }
  });
}

/**
 * Initializes Cloud Firestore real-time listener and background sync for attendance & match results
 * Runs across all connected devices (Admin and User on desktop and mobile)
 */
export function initAttendanceFirestoreSync() {
  if (isFirestoreListenerInitialized || typeof window === 'undefined') return;
  isFirestoreListenerInitialized = true;

  try {
    const { db: firestoreDb } = initFirebaseService();
    if (firestoreDb) {
      // 1. Real-time listener on per-league collection (handles large datasets cleanly)
      const colRef = collection(firestoreDb, FIRESTORE_LEAGUES_COLLECTION);
      onSnapshot(colRef, (snapshot) => {
        if (!snapshot.empty) {
          const remoteRecordsMap = new Map<string, StadiumAttendanceRecord>();
          snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (Array.isArray(data?.records)) {
              data.records.forEach((r: any) => {
                const filled = fillScoreNumbers(r as StadiumAttendanceRecord);
                const key = `${filled.league}_${filled.homeTeam}_${filled.awayTeam}_${filled.matchDate || filled.matchWeek || ''}`.toLowerCase();
                remoteRecordsMap.set(key, filled);
              });
            }
          });

          if (remoteRecordsMap.size > 0) {
            const combined = Array.from(remoteRecordsMap.values());
            combined.sort((a, b) => {
              if (b.matchWeek !== a.matchWeek) return b.matchWeek - a.matchWeek;
              return (b.matchDate || '').localeCompare(a.matchDate || '');
            });

            cachedAttendance = combined;
            try {
              localStorage.setItem(LOCAL_ATTENDANCE_KEY, JSON.stringify(combined));
            } catch (e) {}
            notifyAttendanceListeners();
          }
        }
      }, (err) => {
        console.warn('Firestore attendance leagues listener issue:', err);
      });

      // 2. Real-time listener on config document fallback
      const configRef = doc(firestoreDb, 'thaileague_system_config', FIRESTORE_CONFIG_DOC);
      onSnapshot(configRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (Array.isArray(data?.records) && data.records.length > 0) {
            const remoteList = data.records.map((r: any) => fillScoreNumbers(r as StadiumAttendanceRecord));
            if (remoteList.length > cachedAttendance.length || cachedAttendance.length === 0) {
              cachedAttendance = remoteList;
              try {
                localStorage.setItem(LOCAL_ATTENDANCE_KEY, JSON.stringify(remoteList));
              } catch (e) {}
              notifyAttendanceListeners();
            }
          }
        }
      }, (err) => {
        console.warn('Firestore attendance config listener issue:', err);
      });
    }
  } catch (e) {
    console.warn('Firestore sync setup failed for attendance:', e);
  }

  // Initial immediate fetch from cloud and server API
  syncAttendanceFromCloud().catch(() => {});
}

/**
 * Manually or automatically pulls the latest match results and attendance from Firestore and backend API
 */
export async function syncAttendanceFromCloud(): Promise<{ success: boolean; count: number }> {
  let pulledRecords: StadiumAttendanceRecord[] = [];

  // A. Try fetching from Cloud Firestore
  try {
    const { db: firestoreDb } = initFirebaseService();
    if (firestoreDb) {
      // Check leagues collection
      const snap = await getDocs(collection(firestoreDb, FIRESTORE_LEAGUES_COLLECTION));
      if (!snap.empty) {
        const recordsMap = new Map<string, StadiumAttendanceRecord>();
        snap.forEach(d => {
          const dData = d.data();
          if (Array.isArray(dData?.records)) {
            dData.records.forEach((r: any) => {
              const item = fillScoreNumbers(r as StadiumAttendanceRecord);
              const key = `${item.league}_${item.homeTeam}_${item.awayTeam}_${item.matchDate || item.matchWeek || ''}`.toLowerCase();
              recordsMap.set(key, item);
            });
          }
        });
        if (recordsMap.size > 0) {
          pulledRecords = Array.from(recordsMap.values());
        }
      }

      // Check single doc fallback if leagues collection was empty
      if (pulledRecords.length === 0) {
        const configSnap = await getDoc(doc(firestoreDb, 'thaileague_system_config', FIRESTORE_CONFIG_DOC));
        if (configSnap.exists()) {
          const cData = configSnap.data();
          if (Array.isArray(cData?.records) && cData.records.length > 0) {
            pulledRecords = cData.records.map((r: any) => fillScoreNumbers(r as StadiumAttendanceRecord));
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error fetching attendance from Firestore:', err);
  }

  // B. Try fetching from Server API (/api/attendance) as HTTP fallback
  if (pulledRecords.length === 0 && typeof fetch !== 'undefined') {
    try {
      const res = await fetch('/api/attendance');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.records) && data.records.length > 0) {
          pulledRecords = data.records.map((r: any) => fillScoreNumbers(r as StadiumAttendanceRecord));
        }
      }
    } catch (apiErr) {
      // API fallback silent catch
    }
  }

  if (pulledRecords.length > 0) {
    // Merge or update local cached attendance
    const map = new Map<string, StadiumAttendanceRecord>();
    cachedAttendance.forEach(oldItem => {
      const key = `${oldItem.league}_${oldItem.homeTeam}_${oldItem.awayTeam}_${oldItem.matchDate || oldItem.matchWeek || ''}`.toLowerCase();
      map.set(key, oldItem);
    });

    pulledRecords.forEach(newItem => {
      const key = `${newItem.league}_${newItem.homeTeam}_${newItem.awayTeam}_${newItem.matchDate || newItem.matchWeek || ''}`.toLowerCase();
      map.set(key, newItem);
    });

    const merged = Array.from(map.values());
    merged.sort((a, b) => {
      if (b.matchWeek !== a.matchWeek) return b.matchWeek - a.matchWeek;
      return (b.matchDate || '').localeCompare(a.matchDate || '');
    });

    cachedAttendance = merged;
    try {
      localStorage.setItem(LOCAL_ATTENDANCE_KEY, JSON.stringify(merged));
    } catch (e) {}
    notifyAttendanceListeners();
    return { success: true, count: merged.length };
  }

  return { success: false, count: cachedAttendance.length };
}

export function subscribeToAttendance(cb: AttendanceListener): () => void {
  attendanceListeners.add(cb);
  cb([...cachedAttendance]);

  // Ensure cross-device Firestore real-time synchronization is started
  initAttendanceFirestoreSync();

  return () => {
    attendanceListeners.delete(cb);
  };
}

export function getAttendanceRecords(): StadiumAttendanceRecord[] {
  return [...cachedAttendance];
}

export function getLastUpdatedAttendance(): string {
  return localStorage.getItem(LOCAL_ATTENDANCE_UPDATED_KEY) || 'อัปเดตล่าสุด: สัปดาห์แข่งขันปัจจุบัน';
}

/**
 * Saves attendance records with 'replace' or 'merge' strategy across devices
 */
export async function saveAttendanceRecords(
  records: StadiumAttendanceRecord[],
  mode: 'replace' | 'merge' = 'replace',
  updatedBy: string = 'Admin'
): Promise<void> {
  let finalRecords: StadiumAttendanceRecord[] = [];

  const nowIso = new Date().toISOString();
  const timestampStr = new Date().toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const stamped = records.map(r => ({
    ...r,
    updatedAt: r.updatedAt || nowIso,
    updatedBy: r.updatedBy || updatedBy,
  }));

  if (mode === 'replace') {
    finalRecords = stamped;
  } else {
    // Merge: update matching items or append new ones
    const map = new Map<string, StadiumAttendanceRecord>();
    cachedAttendance.forEach(oldItem => {
      const key = `${oldItem.league}_${oldItem.homeTeam}_${oldItem.awayTeam}_${oldItem.matchDate || oldItem.matchWeek || ''}`.toLowerCase();
      map.set(key, oldItem);
    });

    stamped.forEach(newItem => {
      const key = `${newItem.league}_${newItem.homeTeam}_${newItem.awayTeam}_${newItem.matchDate || newItem.matchWeek || ''}`.toLowerCase();
      map.set(key, newItem);
    });

    finalRecords = Array.from(map.values());
  }

  // Sort by matchWeek descending, then matchDate descending
  finalRecords.sort((a, b) => {
    if (b.matchWeek !== a.matchWeek) {
      return b.matchWeek - a.matchWeek;
    }
    return (b.matchDate || '').localeCompare(a.matchDate || '');
  });

  cachedAttendance = finalRecords;

  try {
    localStorage.setItem(LOCAL_ATTENDANCE_KEY, JSON.stringify(finalRecords));
    localStorage.setItem(LOCAL_ATTENDANCE_UPDATED_KEY, `อัปเดตข้อมูลเมื่อ ${timestampStr}`);
  } catch (e) {
    console.error('Error storing attendance in localStorage:', e);
  }

  // Notify active UI listeners immediately
  notifyAttendanceListeners();

  // Attempt Firestore sync across all leagues
  try {
    const { db: firestoreDb } = initFirebaseService();
    if (firestoreDb) {
      const leagues: LeagueType[] = ['League 1', 'League 2', 'League 3'];
      for (const lg of leagues) {
        const lgRecords = finalRecords.filter(r => r.league === lg);
        if (lgRecords.length > 0) {
          const leagueDocRef = doc(firestoreDb, FIRESTORE_LEAGUES_COLLECTION, lg);
          await setDoc(leagueDocRef, {
            league: lg,
            records: lgRecords.map(sanitizeRecordForFirestore),
            recordCount: lgRecords.length,
            updatedAt: nowIso,
            updatedBy,
          }, { merge: true });
        }
      }

      // Also persist summary config
      const docRef = doc(firestoreDb, 'thaileague_system_config', FIRESTORE_CONFIG_DOC);
      await setDoc(docRef, {
        records: finalRecords.slice(0, 300).map(sanitizeRecordForFirestore), // safety bounded
        updatedAt: nowIso,
        updatedBy,
        recordCount: finalRecords.length,
      }, { merge: true });
    }
  } catch (e) {
    console.warn('Firestore attendance sync fallback:', e);
  }

  // Attempt background server sync via /api/attendance
  if (typeof fetch !== 'undefined') {
    try {
      fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: finalRecords,
          updatedBy,
        }),
      }).catch(() => {});
    } catch (e) {}
  }
}

/**
 * Saves attendance records for a specific league only, preserving all other leagues intact
 */
export async function saveAttendanceRecordsForLeague(
  incomingRecords: StadiumAttendanceRecord[],
  league: LeagueType,
  mode: 'replace' | 'merge' = 'replace',
  updatedBy: string = 'Admin'
): Promise<void> {
  const otherLeagueRecords = cachedAttendance.filter(r => r.league !== league);
  const nowIso = new Date().toISOString();

  const stamped = incomingRecords.map(r => ({
    ...r,
    league, // Ensure assigned to target league
    updatedAt: r.updatedAt || nowIso,
    updatedBy: r.updatedBy || updatedBy,
  }));

  let updatedLeagueRecords: StadiumAttendanceRecord[] = [];

  if (mode === 'replace') {
    updatedLeagueRecords = stamped;
  } else {
    // Merge: update matching date/week + teams, or append
    const existingThisLeague = cachedAttendance.filter(r => r.league === league);
    const map = new Map<string, StadiumAttendanceRecord>();
    existingThisLeague.forEach(item => {
      const key = `${item.homeTeam}_${item.awayTeam}_${item.matchDate || item.matchWeek || ''}`.toLowerCase();
      map.set(key, item);
    });

    stamped.forEach(newItem => {
      const key = `${newItem.homeTeam}_${newItem.awayTeam}_${newItem.matchDate || newItem.matchWeek || ''}`.toLowerCase();
      map.set(key, newItem);
    });

    updatedLeagueRecords = Array.from(map.values());
  }

  const combined = [...otherLeagueRecords, ...updatedLeagueRecords];
  await saveAttendanceRecords(combined, 'replace', updatedBy);
}

/**
 * Resets attendance data back to initial mock records
 */
export async function resetAttendanceToInitial(): Promise<void> {
  await saveAttendanceRecords([...INITIAL_ATTENDANCE_RECORDS], 'replace', 'System Reset');
}

/**
 * Parses numeric spectator count from cell value (e.g. "23,418", "23418 คน", 23418)
 */
function parseNumeric(val: any): number {
  if (typeof val === 'number') return Math.max(0, Math.round(val));
  if (!val) return 0;
  const cleaned = String(val).replace(/,/g, '').replace(/[^0-9]/g, '').trim();
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Splits match team text like "บุรีรัมย์ ยูไนเต็ด vs ลำพูน วอริเออร์"
 */
function splitMatchString(text: string): { home: string; away: string } | null {
  if (!text) return null;
  const separators = [
    /\s+vs\.?\s+/i,
    /\s+v\s+/i,
    /\s+พบกับ\s+/i,
    /\s+พบ\s+/i,
    /\s+–\s+/,
    /\s+—\s+/,
    /\s+-\s+/,
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
}

/**
 * Known stadiums and capacities for automatic lookup if missing in file
 */
export const STADIUM_CAPACITY_LOOKUP: Record<string, { capacity: number; province: string; stadium: string }> = {
  'บุรีรัมย์': { capacity: 32600, province: 'จ.บุรีรัมย์', stadium: 'ช้าง อารีนา (Chang Arena)' },
  'บีจี': { capacity: 10114, province: 'จ.ปทุมธานี', stadium: 'บีจี สเตเดียม (BG Stadium)' },
  'ท่าเรือ': { capacity: 6000, province: 'กรุงเทพฯ', stadium: 'แพท สเตเดียม (PAT Stadium)' },
  'แบงค็อก': { capacity: 19375, province: 'จ.ปทุมธานี', stadium: 'ทรู สเตเดียม (ม.ธรรมศาสตร์ รังสิต)' },
  'เมืองทอง': { capacity: 13000, province: 'จ.นนทบุรี', stadium: 'ธันเดอร์โดม สเตเดียม' },
  'เชียงราย': { capacity: 12000, province: 'จ.เชียงราย', stadium: 'สิงห์ เชียงราย สเตเดียม' },
  'ราชบุรี': { capacity: 10000, province: 'จ.ราชบุรี', stadium: 'ดราก้อน โซลาร์ พาร์ค' },
  'ขอนแก่น': { capacity: 6500, province: 'จ.ขอนแก่น', stadium: 'สนามกีฬา อบจ.ขอนแก่น' },
  'ลำพูน': { capacity: 5000, province: 'จ.ลำพูน', stadium: 'ลำพูน สเตเดียม' },
  'สุโขทัย': { capacity: 8000, province: 'จ.สุโขทัย', stadium: 'ทะเลหลวง สเตเดียม' },
  'นครปฐม': { capacity: 6000, province: 'จ.นครปฐม', stadium: 'สนามกีฬา ร.ร.กีฬาเทศบาลนครนครปฐม' },
  'อุทัยธานี': { capacity: 4477, province: 'จ.อุทัยธานี', stadium: 'สนามกีฬากลาง จ.อุทัยธานี' },
  'ประจวบ': { capacity: 5000, province: 'จ.ประจวบคีรีขันธ์', stadium: 'สามอ่าว สเตเดียม' },
  'ระยอง': { capacity: 7500, province: 'จ.ระยอง', stadium: 'ดับบลิวเอชเอ ระยอง สเตเดียม' },
  'หนองบัว': { capacity: 6000, province: 'จ.หนองบัวลำภู', stadium: 'พิชญ สเตเดียม' },
  'ชลบุรี': { capacity: 8600, province: 'จ.ชลบุรี', stadium: 'ชลบุรี ไดกิ้น สเตเดียม' },

  // League 2
  'นครราชสีมา': { capacity: 25000, province: 'จ.นครราชสีมา', stadium: 'สนามกีฬาเฉลิมพระเกียรติ 80 พรรษา' },
  'เชียงใหม่': { capacity: 25000, province: 'จ.เชียงใหม่', stadium: 'สนามกีฬาสมโภชเชียงใหม่ 700 ปี' },
  'สุพรรณบุรี': { capacity: 15000, province: 'จ.สุพรรณบุรี', stadium: 'สนามกีฬากลาง จ.สุพรรณบุรี' },
  'อยุธยา': { capacity: 6000, province: 'จ.พระนครศรีอยุธยา', stadium: 'สนามกีฬา จ.พระนครศรีอยุธยา' },
  'แพร่': { capacity: 4500, province: 'จ.แพร่', stadium: 'ห้วยม้า สเตเดียม' },
  'นครศรี': { capacity: 5000, province: 'จ.นครศรีธรรมราช', stadium: 'สนามกีฬากลาง จ.นครศรีธรรมราช' },
  'บางกอก': { capacity: 8000, province: 'กรุงเทพฯ', stadium: 'สนามกีฬาเฉลิมพระเกียรติ บางมด' },
  'ศรีสะเกษ': { capacity: 10000, province: 'จ.ศรีสะเกษ', stadium: 'สนามศรีนครลำดวน' },
  'มหาสารคาม': { capacity: 5000, province: 'จ.มหาสารคาม', stadium: 'สนามกีฬากลาง จ.มหาสารคาม' },

  // League 3
  'สงขลา': { capacity: 45000, province: 'จ.สงขลา', stadium: 'สนามกีฬาติณสูลานนท์' },
  'ปัตตานี': { capacity: 12000, province: 'จ.ปัตตานี', stadium: 'เดอะ เรนโบว์ สเตเดียม' },
  'พิษณุโลก': { capacity: 6000, province: 'จ.พิษณุโลก', stadium: 'สนามกีฬา อบจ.พิษณุโลก' },
  'พัทลุง': { capacity: 5000, province: 'จ.พัทลุง', stadium: 'สนามกีฬากลาง จ.พัทลุง' },
  'แม่โจ้': { capacity: 3500, province: 'จ.เชียงใหม่', stadium: 'สนามกีฬาอินทนิล ม.แม่โจ้' },
  'อุดรธานี': { capacity: 5000, province: 'จ.อุดรธานี', stadium: 'สนาม สพล.อุดรธานี' },
  'ร้อยเอ็ด': { capacity: 7000, province: 'จ.ร้อยเอ็ด', stadium: 'สนามกีฬากลาง จ.ร้อยเอ็ด' },
};

/**
 * Intelligent helper to fill capacity & province
 */
function fillStadiumInfo(homeTeam: string, stadiumIn?: string, provinceIn?: string, capacityIn?: number) {
  let stadium = stadiumIn ? stadiumIn.trim() : '';
  let province = provinceIn ? provinceIn.trim() : '';
  let capacity = capacityIn && capacityIn > 0 ? capacityIn : 0;

  for (const [clubKey, info] of Object.entries(STADIUM_CAPACITY_LOOKUP)) {
    if (homeTeam.includes(clubKey) || (stadium && stadium.includes(clubKey))) {
      if (!stadium) stadium = info.stadium;
      if (!province) province = info.province;
      if (!capacity) capacity = info.capacity;
      break;
    }
  }

  if (!stadium) stadium = `สนามเหย้า ${homeTeam}`;
  if (!capacity) capacity = 5000; // default estimated capacity

  return { stadium, province, capacity };
}

/**
 * Reads the attendance Excel / CSV file.
 *
 * Expected columns (found by HEADER NAME, any order):
 *   Date | Time | Home | Home Score | Away Score | Away | Stadium | Audience
 *
 * Strict rules - nothing is invented:
 *   - a missing required column  -> error message (the file is not imported)
 *   - a row that cannot be read  -> listed in `errors` with its row number (never silently dropped, never guessed)
 *   - no default date / time / team / stadium / capacity is ever filled in
 *   - Audience must be a number (e.g. 12345 or "12,345")
 * Rows that have neither scores nor Audience yet (match not played) are skipped and counted in the messages.
 */
const ATT_HEADERS: Record<string, string[]> = {
  date: ['date', 'วันที่', 'วันแข่งขัน', 'วันแข่ง'],
  time: ['time', 'เวลา'],
  home: ['home', 'home team', 'ทีมเหย้า', 'สโมสรทีมเหย้า'],
  homeScore: ['home score', 'homescore', 'คะแนนทีมเหย้า', 'สกอร์ทีมเหย้า'],
  awayScore: ['away score', 'awayscore', 'คะแนนทีมเยือน', 'สกอร์ทีมเยือน'],
  away: ['away', 'away team', 'ทีมเยือน', 'สโมสรทีมเยือน'],
  stadium: ['stadium', 'สนาม', 'สถานที่แข่งขัน', 'สถานที่'],
  audience: ['audience', 'ยอดผู้ชม', 'จำนวนผู้ชม', 'ผู้ชม', 'attendance'],
};
const ATT_REQUIRED_LABEL: Record<string, string> = {
  date: 'Date', time: 'Time', home: 'Home', homeScore: 'Home Score',
  awayScore: 'Away Score', away: 'Away', stadium: 'Stadium', audience: 'Audience',
};

const attNorm = (v: any) => String(v ?? '').replace(/[\u200b\ufeff]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const attCell = (v: any) => String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

function attLeagueFromText(text: string): LeagueType | null {
  const n = (text || '').toLowerCase();
  if (/(league\s*(iii|3)\b|\bt3\b|ลีก\s*3|ล\s*3|dolphin)/.test(n)) return 'League 3';
  if (/(league\s*(ii|2)\b|\bt2\b|ลีก\s*2|ล\s*2)/.test(n)) return 'League 2';
  if (/(league\s*(i|1)\b|\bt1\b|ลีก\s*1|ล\s*1)/.test(n)) return 'League 1';
  return null;
}

/** Excel date cell (serial number) or text date -> YYYY-MM-DD, or null when it is not a real date. */
function attParseDate(v: any): string | null {
  if (typeof v === 'number' && isFinite(v) && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    return null;
  }
  const text = attCell(v);
  if (!text) return null;
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    let y = Number(iso[1]); if (y > 2400) y -= 543;
    const m = Number(iso[2]), d = Number(iso[3]);
    return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  }
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); // day first (Thai format)
  if (dmy) {
    const d = Number(dmy[1]), m = Number(dmy[2]);
    let y = Number(dmy[3]); if (y < 100) y += 2000; if (y > 2400) y -= 543;
    return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  }
  return parseSheetDate(text); // "4 ก.ย. 2569", "19 Sep 26" ...
}

function attParseTime(v: any): string {
  if (typeof v === 'number' && isFinite(v) && v >= 0 && v < 1) {
    const mins = Math.round(v * 24 * 60);
    return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  return parseSheetTime(attCell(v)); // '' when blank / unreadable
}

/** Whole-number parser used for Audience and scores. Returns null when the cell is empty or not a plain number. */
function attParseInt(v: any): number | null | 'invalid' {
  if (typeof v === 'number') return isFinite(v) && v >= 0 && Math.round(v) === v ? v : 'invalid';
  const t = attCell(v);
  if (!t) return null;
  if (!/^\d{1,3}(,\d{3})+$|^\d+$/.test(t)) return 'invalid';
  return parseInt(t.replace(/,/g, ''), 10);
}

const attHash = (str: string) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
};

export async function parseAttendanceExcel(
  fileInput: ArrayBuffer | Uint8Array | Blob,
  targetLeague?: LeagueType
): Promise<AttendanceImportSummary> {
  // Accept a File/Blob directly as well as a raw buffer
  const fileBuffer: ArrayBuffer | Uint8Array =
    typeof (fileInput as Blob).arrayBuffer === 'function' ? await (fileInput as Blob).arrayBuffer() : (fileInput as ArrayBuffer | Uint8Array);

  const workbook = XLSX.read(fileBuffer, { type: 'array' }); // dates stay as Excel serial numbers (no time-zone shift)
  const allParsed: StadiumAttendanceRecord[] = [];
  const rowErrors: string[] = [];
  const sheetProblems: string[] = [];
  const seen = new Set<string>();
  let totalDataRows = 0;
  let skippedNotPlayed = 0;
  const unmatchedFixtures: string[] = [];
  const dateDiffs: string[] = [];
  const unknownClubs = new Set<string>();

  const fixtures = getFixtures();
  const fixtureWeek = new Map<string, number>();
  // Schedule team names are compared by their OFFICIAL club name, so spelling variants in the schedule sheet
  // (e.g. "ลำพูน วอริเออร์", "ชัยนาท ฮอร์นบิล", "สโมสรฟุตบอลราชประชา") still match the Excel row.
  const clubKey = (name: string, lg: LeagueType) =>
    (resolveOfficialClubName(name, lg) || name).replace(/\s+/g, '').toLowerCase();
  const fixtureByPair = new Map<string, any>();
  fixtures.forEach(f => {
    const k = `${f.league}|${clubKey(f.homeTeam, f.league)}|${clubKey(f.awayTeam, f.league)}`;
    fixtureWeek.set(k, f.matchWeek);
    fixtureByPair.set(k, f);
  });

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

    // Header row = first row (of the first 10) that contains both "Home" and "Audience"
    let headerIdx = -1;
    let col: Record<string, number> = {};
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const names = rows[r].map(attNorm);
      const found: Record<string, number> = {};
      for (const [key, aliases] of Object.entries(ATT_HEADERS)) {
        const idx = names.findIndex((n: string) => aliases.includes(n));
        if (idx >= 0) found[key] = idx;
      }
      if (found.home !== undefined && found.audience !== undefined) {
        headerIdx = r;
        col = found;
        break;
      }
    }
    if (headerIdx < 0) {
      sheetProblems.push(`ชีต "${sheetName}": ไม่พบหัวคอลัมน์ Home และ Audience`);
      continue;
    }
    const missing = Object.keys(ATT_HEADERS).filter(k => col[k] === undefined).map(k => ATT_REQUIRED_LABEL[k]);
    if (missing.length > 0) {
      sheetProblems.push(`ชีต "${sheetName}": ไม่พบคอลัมน์ ${missing.join(', ')}`);
      continue;
    }

    // League: from the sheet name or from the title rows above the header (e.g. "BYD SEALION 6 LEAGUE I 2026/27")
    const titleText = rows.slice(0, headerIdx).map(r => r.join(' ')).join(' ');
    const detected: LeagueType | null = attLeagueFromText(sheetName) || attLeagueFromText(titleText);
    if (targetLeague && detected && detected !== targetLeague) {
      sheetProblems.push(`ไฟล์/ชีต "${sheetName}" เป็นของ ${detected} แต่เลือกอัปโหลดให้ ${targetLeague} (ไม่นำเข้าเพื่อกันข้อมูลผิดลีก)`);
      continue;
    }
    const league: LeagueType | null = targetLeague || detected;
    if (!league) {
      sheetProblems.push(`ชีต "${sheetName}": ไม่ทราบว่าเป็นไทยลีกไหน (ตั้งชื่อชีตเป็น Thai League 1/2/3 หรือเลือกลีกก่อนอัปโหลด)`);
      continue;
    }

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((c: any) => attCell(c) === '')) continue;
      totalDataRows++;
      const where = `${sheetName} แถว ${r + 1}`;

      const rawHome = attCell(row[col.home]);
      const rawAway = attCell(row[col.away]);
      if (!rawHome || !rawAway) {
        rowErrors.push(`${where}: ไม่มีชื่อทีม${!rawHome ? 'เหย้า (Home)' : 'เยือน (Away)'}`);
        continue;
      }
      const hs = attParseInt(row[col.homeScore]);
      const as = attParseInt(row[col.awayScore]);
      const aud = attParseInt(row[col.audience]);

      if (hs === 'invalid' || as === 'invalid') {
        rowErrors.push(`${where} (${rawHome} - ${rawAway}): Home Score / Away Score ไม่ใช่ตัวเลข`);
        continue;
      }
      if (aud === 'invalid') {
        rowErrors.push(`${where} (${rawHome} - ${rawAway}): Audience "${attCell(row[col.audience])}" ไม่ใช่ตัวเลข`);
        continue;
      }
      if (aud === null && hs === null && as === null) {
        skippedNotPlayed++; // not played yet: no score and no audience
        continue;
      }
      if (aud === null) {
        rowErrors.push(`${where} (${rawHome} - ${rawAway}): มีผลคะแนนแต่ไม่มียอดผู้ชม (Audience ว่าง)`);
        continue;
      }
      if ((hs === null) !== (as === null)) {
        rowErrors.push(`${where} (${rawHome} - ${rawAway}): มีคะแนนเพียงฝั่งเดียว (Home Score / Away Score)`);
        continue;
      }

      const matchDate = attParseDate(row[col.date]);
      if (!matchDate) {
        rowErrors.push(`${where} (${rawHome} - ${rawAway}): อ่านวันที่ (Date) ไม่ได้ "${attCell(row[col.date])}"`);
        continue;
      }

      // Club names: converted to the official Thai name when known (table in src/data/clubNamesEn.ts);
      // otherwise the name is kept exactly as written in the file and listed as a warning.
      const resolvedHome = resolveOfficialClubName(rawHome, league);
      const resolvedAway = resolveOfficialClubName(rawAway, league);
      if (!resolvedHome) unknownClubs.add(rawHome);
      if (!resolvedAway) unknownClubs.add(rawAway);
      const homeTeam = resolvedHome || rawHome;
      const awayTeam = resolvedAway || rawAway;

      const pairKey = `${league}|${clubKey(homeTeam, league)}|${clubKey(awayTeam, league)}`;
      if (seen.has(pairKey)) {
        rowErrors.push(`${where}: คู่ ${homeTeam} - ${awayTeam} ซ้ำกับแถวก่อนหน้าในไฟล์ (ข้ามแถวนี้)`);
        continue;
      }
      seen.add(pairKey);

      const matchWeek = fixtureWeek.get(pairKey);
      if (matchWeek === undefined) unmatchedFixtures.push(`${homeTeam} - ${awayTeam}`);
      const scheduled = fixtureByPair.get(pairKey);
      if (scheduled && scheduled.matchDate && scheduled.matchDate !== matchDate) {
        dateDiffs.push(`${homeTeam} - ${awayTeam}: ไฟล์ ${matchDate} / ตารางแข่ง ${scheduled.matchDate}`);
      }

      allParsed.push({
        id: `att-${league.replace(/\D/g, '')}-${attHash(pairKey)}`,
        league,
        matchWeek: matchWeek ?? 0,
        matchDate,
        matchTime: attParseTime(row[col.time]),
        homeTeam,
        awayTeam,
        stadium: (scheduled && scheduled.stadium ? String(scheduled.stadium).trim() : '') || attCell(row[col.stadium]),
        attendance: aud,
        score: hs !== null && as !== null ? `${hs} - ${as}` : undefined,
        homeScore: hs ?? undefined,
        awayScore: as ?? undefined,
        season: '2026/27',
      });
    }
  }

  const errors: string[] = [];
  if (allParsed.length === 0) errors.push(...sheetProblems);
  errors.push(...rowErrors);
  if (skippedNotPlayed > 0) errors.push(`ข้อมูล: ข้าม ${skippedNotPlayed} แถวที่ยังไม่มีผลคะแนนและยอดผู้ชม (ยังไม่แข่ง)`);
  if (unmatchedFixtures.length > 0) {
    errors.push(`คำเตือน: ไม่พบ ${unmatchedFixtures.length} คู่นี้ในตารางแข่ง จึงไม่ทราบสัปดาห์ที่แข่ง (ตรวจการสะกดชื่อทีม): ${unmatchedFixtures.slice(0, 5).join(' | ')}${unmatchedFixtures.length > 5 ? ' ...' : ''}`);
  }
  if (unknownClubs.size > 0) {
    errors.push(`คำเตือน: ไม่พบชื่อสโมสรเหล่านี้ในรายชื่อทางการ จึงใช้ชื่อตามไฟล์ (ตรวจการสะกด หรือเพิ่มในไฟล์ src/data/clubNamesEn.ts): ${Array.from(unknownClubs).slice(0, 8).join(' | ')}${unknownClubs.size > 8 ? ' ...' : ''}`);
  }
  if (dateDiffs.length > 0) {
    errors.push(`คำเตือน: ${dateDiffs.length} คู่มีวันที่ในไฟล์ไม่ตรงกับตารางแข่ง (ระบบใช้วันที่ในไฟล์): ${dateDiffs.slice(0, 3).join(' | ')}${dateDiffs.length > 3 ? ' ...' : ''}`);
  }
  if (allParsed.length === 0 && errors.length === 0) {
    errors.push('ไม่พบแถวข้อมูลในไฟล์');
  }

  const leagueCounts: Record<LeagueType, number> = { 'League 1': 0, 'League 2': 0, 'League 3': 0 };
  let minWeek = 999, maxWeek = 0, totalAtt = 0;
  allParsed.forEach(rec => {
    leagueCounts[rec.league]++;
    if (rec.matchWeek > 0 && rec.matchWeek < minWeek) minWeek = rec.matchWeek;
    if (rec.matchWeek > maxWeek) maxWeek = rec.matchWeek;
    totalAtt += rec.attendance;
  });
  if (minWeek === 999) minWeek = 0;

  return {
    totalRows: totalDataRows,
    validRows: allParsed.length,
    leagueCounts,
    weekRange: { min: minWeek, max: maxWeek },
    totalAttendance: totalAtt,
    averageAttendance: allParsed.length > 0 ? Math.round(totalAtt / allParsed.length) : 0,
    parsedRecords: allParsed,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Aggregates club attendance statistics and rankings
 */
export function getClubAttendanceRankings(
  records: StadiumAttendanceRecord[],
  leagueFilter: LeagueType | 'All' = 'All'
): ClubAttendanceRanking[] {
  const filtered = leagueFilter === 'All'
    ? records
    : records.filter(r => r.league === leagueFilter);

  const clubMap = new Map<string, {
    clubName: string;
    league: LeagueType;
    stadium: string;
    province?: string;
    matches: number;
    total: number;
    highest: number;
    capacity: number;
  }>();

  filtered.forEach(r => {
    const key = `${r.league}_${r.homeTeam}`;
    if (!clubMap.has(key)) {
      clubMap.set(key, {
        clubName: r.homeTeam,
        league: r.league,
        stadium: r.stadium,
        province: r.province,
        matches: 1,
        total: r.attendance,
        highest: r.attendance,
        capacity: r.capacity || 0,
      });
    } else {
      const c = clubMap.get(key)!;
      c.matches += 1;
      c.total += r.attendance;
      if (r.attendance > c.highest) c.highest = r.attendance;
      if (r.capacity && r.capacity > c.capacity) c.capacity = r.capacity;
    }
  });

  const rankings: ClubAttendanceRanking[] = Array.from(clubMap.values()).map(c => {
    const avg = c.matches > 0 ? Math.round(c.total / c.matches) : 0;
    const avgOcc = c.capacity > 0 && avg > 0
      ? parseFloat(((avg / c.capacity) * 100).toFixed(1))
      : 0;

    return {
      clubName: c.clubName,
      league: c.league,
      stadium: c.stadium,
      province: c.province,
      matchesPlayed: c.matches,
      totalAttendance: c.total,
      averageAttendance: avg,
      highestAttendance: c.highest,
      capacity: c.capacity,
      averageOccupancy: avgOcc,
    };
  });

  // Sort by average attendance descending
  rankings.sort((a, b) => b.averageAttendance - a.averageAttendance);

  return rankings;
}

/**
 * Generates and downloads a clean Excel template with 3 League tabs ready for weekly updates
 */
/**
 * Generates and downloads a clean Excel template matching the user's columns:
 * 1. วัน เวลา ชื่อทีมเหย้า ชื่อทีมเยือน
 * 2. สถานที่แข่งขัน
 * 3. Home Score, Away Score
 * 4. Audience
 */
export function generateAttendanceExcelTemplate(targetLeague?: LeagueType): void {
  const wb = XLSX.utils.book_new();

  const headers = [
    'สัปดาห์ที่ (Matchweek)',
    'วันที่แข่งขัน (Date)',
    'เวลา (Time)',
    'ชื่อทีมเหย้า (Home Team)',
    'Home Score',
    'Away Score',
    'ชื่อทีมเยือน (Away Team)',
    'สถานที่แข่งขัน (Stadium)',
    'Audience (จำนวนผู้เข้าชม)',
    'ความจุสนาม (Capacity)',
    'หมายเหตุ (Remark)',
  ];

  const t1Data = [
    headers,
    [1, '2026-08-15', '19:00', 'บุรีรัมย์ ยูไนเต็ด', 3, 0, 'ลำพูน วอริเออร์', 'ช้าง อารีนา (Chang Arena)', 23418, 32600, 'นัดเปิดฤดูกาล'],
    [1, '2026-08-15', '18:00', 'บีจี ปทุม ยูไนเต็ด', 2, 1, 'สุโขทัย เอฟซี', 'บีจี สเตเดียม (BG Stadium)', 8752, 10114, ''],
    [1, '2026-08-16', '19:00', 'การท่าเรือ เอฟซี', 3, 1, 'ระยอง เอฟซี', 'แพท สเตเดียม (PAT Stadium)', 5214, 6000, ''],
    [1, '2026-08-16', '18:00', 'ทรู แบงค็อก ยูไนเต็ด', 2, 1, 'พีที ประจวบ เอฟซี', 'ทรู สเตเดียม (ม.ธรรมศาสตร์ รังสิต)', 4180, 19375, ''],
    [1, '2026-08-17', '18:30', 'เมืองทอง ยูไนเต็ด', 1, 1, 'นครปฐม ยูไนเต็ด', 'ธันเดอร์โดม สเตเดียม', 7890, 13000, ''],
  ];

  const t2Data = [
    headers,
    [1, '2026-08-15', '18:00', 'นครราชสีมา มาสด้า เอฟซี', 2, 0, 'เชียงใหม่ ยูไนเต็ด', 'สนามกีฬาเฉลิมพระเกียรติ 80 พรรษา', 11450, 25000, ''],
    [1, '2026-08-15', '17:30', 'ศรีสะเกษ ยูไนเต็ด', 1, 1, 'มหาสารคาม เอสบีที เอฟซี', 'สนามศรีนครลำดวน', 4680, 10000, ''],
    [1, '2026-08-16', '18:00', 'อยุธยา ยูไนเต็ด', 2, 1, 'สุพรรณบุรี เอฟซี', 'สนามกีฬา จ.พระนครศรีอยุธยา', 3410, 6000, ''],
  ];

  const t3Data = [
    headers,
    [1, '2026-08-15', '16:00', 'สงขลา เอฟซี', 2, 1, 'พัทลุง เอฟซี', 'สนามกีฬาติณสูลานนท์', 3450, 45000, 'โซนใต้'],
    [1, '2026-08-15', '16:30', 'ปัตตานี เอฟซี', 3, 0, 'ตรัง เอฟซี', 'เดอะ เรนโบว์ สเตเดียม', 4120, 12000, 'โซนใต้'],
    [1, '2026-08-16', '16:00', 'พิษณุโลก เอฟซี', 1, 1, 'แม่โจ้ ยูไนเต็ด', 'สนามกีฬา อบจ.พิษณุโลก', 2340, 6000, 'โซนเหนือ'],
  ];

  const colWidths = [
    { wch: 22 },
    { wch: 18 },
    { wch: 12 },
    { wch: 28 },
    { wch: 14 },
    { wch: 14 },
    { wch: 28 },
    { wch: 35 },
    { wch: 24 },
    { wch: 20 },
    { wch: 25 },
  ];

  if (targetLeague === 'League 1') {
    const ws = XLSX.utils.aoa_to_sheet(t1Data);
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, 'Thai League 1');
  } else if (targetLeague === 'League 2') {
    const ws = XLSX.utils.aoa_to_sheet(t2Data);
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, 'Thai League 2');
  } else if (targetLeague === 'League 3') {
    const ws = XLSX.utils.aoa_to_sheet(t3Data);
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, 'Thai League 3');
  } else {
    const ws1 = XLSX.utils.aoa_to_sheet(t1Data);
    ws1['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws1, 'Thai League 1');

    const ws2 = XLSX.utils.aoa_to_sheet(t2Data);
    ws2['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws2, 'Thai League 2');

    const ws3 = XLSX.utils.aoa_to_sheet(t3Data);
    ws3['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws3, 'Thai League 3');
  }

  const leagueSuffix = targetLeague ? `_${targetLeague.replace(/\s+/g, '_').toLowerCase()}` : '_all_leagues';
  const filename = `template_attendance${leagueSuffix}.xlsx`;
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports current attendance dataset to an Excel file
 */
export function exportAttendanceToExcel(
  records: StadiumAttendanceRecord[],
  filenamePrefix: string = 'thaileague_stadium_attendance_export'
): void {
  const wb = XLSX.utils.book_new();

  const headers = [
    'ลีก (League)',
    'สัปดาห์ที่ (Matchweek)',
    'วันที่แข่งขัน (Date)',
    'เวลา (Time)',
    'ชื่อทีมเหย้า (Home Team)',
    'Home Score',
    'Away Score',
    'ชื่อทีมเยือน (Away Team)',
    'สถานที่แข่งขัน (Stadium)',
    'Audience (ยอดผู้ชม)',
    'ความจุสนาม (Capacity)',
    'อัตราครองความจุ (%)',
    'ผลการแข่งขัน (Score)',
    'หมายเหตุ (Remark)',
  ];

  const leagues: LeagueType[] = ['League 1', 'League 2', 'League 3'];

  leagues.forEach(league => {
    const leagueRecs = records.filter(r => r.league === league);
    const dataRows = leagueRecs.map(r => [
      r.league,
      r.matchWeek,
      r.matchDate,
      r.matchTime || '18:00',
      r.homeTeam,
      r.homeScore !== undefined ? r.homeScore : (r.score ? r.score.split('-')[0]?.trim() : ''),
      r.awayScore !== undefined ? r.awayScore : (r.score ? r.score.split('-')[1]?.trim() : ''),
      r.awayTeam,
      r.stadium,
      r.attendance,
      r.capacity || '',
      r.occupancyRate ? `${r.occupancyRate}%` : '',
      r.score || '',
      r.note || '',
    ]);

    const aoa = [headers, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 14 },
      { wch: 22 },
      { wch: 16 },
      { wch: 12 },
      { wch: 28 },
      { wch: 14 },
      { wch: 14 },
      { wch: 28 },
      { wch: 35 },
      { wch: 22 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 },
      { wch: 25 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, `Thai ${league}`);
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${dateStr}.xlsx`;
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
